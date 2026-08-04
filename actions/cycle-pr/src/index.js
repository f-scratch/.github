import * as core from "@actions/core";
import * as github from "@actions/github";
import { parseConfig } from "./config.js";
import { planPullRequests } from "./planner.js";

function decodeContent(data, path) {
  if (Array.isArray(data) || data.type !== "file" || !data.content) {
    throw new Error(`${path}はファイルとして取得できませんでした`);
  }
  return Buffer.from(data.content, data.encoding ?? "base64").toString("utf8");
}

async function getFileContent(octokit, owner, repo, path, ref) {
  const response = await octokit.rest.repos.getContent({ owner, repo, path, ref });
  return decodeContent(response.data, path);
}

async function listBranches(octokit, owner, repo) {
  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });
  return branches.map(({ name }) => name);
}

async function listLabels(octokit, owner, repo) {
  const labels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  });
  return new Set(labels.map(({ name }) => name));
}

async function findOpenPullRequest(octokit, owner, repo, head, base) {
  const response = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${head}`,
    base,
    per_page: 10,
  });
  return response.data[0] ?? null;
}

async function compareBranches(octokit, owner, repo, head, base) {
  const response = await octokit.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${base}...${head}`,
  });
  return response.data.ahead_by;
}

async function preparePlans({ octokit, owner, repo, defaultBranch, plans, branches, labels }) {
  const prepared = [];
  const branchSet = new Set(branches);

  for (const plan of plans) {
    if (!branchSet.has(plan.head)) {
      throw new Error(`${plan.id}: source branchが存在しません: ${plan.head}`);
    }
    if (!branchSet.has(plan.base)) {
      throw new Error(`${plan.id}: target branchが存在しません: ${plan.base}`);
    }

    const missingLabels = plan.labels.filter((label) => !labels.has(label));
    if (missingLabels.length > 0) {
      throw new Error(`${plan.id}: 必要なラベルがありません: ${missingLabels.join(", ")}`);
    }

    const body = plan.bodyFile
      ? await getFileContent(octokit, owner, repo, plan.bodyFile, defaultBranch)
      : plan.body;
    const existing = await findOpenPullRequest(
      octokit,
      owner,
      repo,
      plan.head,
      plan.base,
    );
    const aheadBy = existing
      ? null
      : await compareBranches(octokit, owner, repo, plan.head, plan.base);

    prepared.push({ ...plan, body, existing, aheadBy });
  }

  return prepared;
}

async function createPullRequest(octokit, owner, repo, plan) {
  try {
    const response = await octokit.rest.pulls.create({
      owner,
      repo,
      head: plan.head,
      base: plan.base,
      title: plan.title,
      body: plan.body,
    });
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: response.data.number,
      labels: plan.labels,
    });
    return response.data;
  } catch (error) {
    if (error.status !== 422) {
      throw error;
    }

    const existing = await findOpenPullRequest(
      octokit,
      owner,
      repo,
      plan.head,
      plan.base,
    );
    if (existing) {
      return existing;
    }

    const aheadBy = await compareBranches(
      octokit,
      owner,
      repo,
      plan.head,
      plan.base,
    );
    if (aheadBy === 0) {
      return null;
    }
    throw error;
  }
}

function resultRow(plan, result, url = "") {
  return [plan.id, plan.head, plan.base, result, url];
}

async function run() {
  const token = core.getInput("token", { required: true });
  const sourceBranch = core.getInput("source-branch", { required: true });
  const { owner, repo } = github.context.repo;
  const octokit = github.getOctokit(token);

  const repository = await octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repository.data.default_branch;
  const configSource = await getFileContent(
    octokit,
    owner,
    repo,
    ".github/cycle-pr.yml",
    defaultBranch,
  );
  const config = parseConfig(configSource);
  const branches = await listBranches(octokit, owner, repo);

  if (!branches.includes(sourceBranch)) {
    throw new Error(`source branchが存在しません: ${sourceBranch}`);
  }

  const plans = planPullRequests({ config, branches, sourceBranch });
  core.setOutput("planned-count", plans.length);

  if (plans.length === 0) {
    await core.summary
      .addHeading("Cycle PR")
      .addRaw(`${sourceBranch}から作成するPRはありません。`)
      .write();
    core.setOutput("created-count", 0);
    return;
  }

  const labels = await listLabels(octokit, owner, repo);
  const prepared = await preparePlans({
    octokit,
    owner,
    repo,
    defaultBranch,
    plans,
    branches,
    labels,
  });
  const rows = [];
  let createdCount = 0;

  for (const plan of prepared) {
    if (plan.existing) {
      rows.push(resultRow(plan, "既存PRあり", plan.existing.html_url));
      continue;
    }
    if (plan.aheadBy === 0) {
      rows.push(resultRow(plan, "差分なし"));
      continue;
    }
    const pullRequest = await createPullRequest(octokit, owner, repo, plan);
    if (pullRequest) {
      createdCount += 1;
      rows.push(resultRow(plan, "作成", pullRequest.html_url));
    } else {
      rows.push(resultRow(plan, "作成時に差分なし"));
    }
  }

  core.setOutput("created-count", createdCount);
  await core.summary
    .addHeading("Cycle PR")
    .addTable([
      [
        { data: "経路", header: true },
        { data: "source", header: true },
        { data: "target", header: true },
        { data: "結果", header: true },
        { data: "PR", header: true },
      ],
      ...rows,
    ])
    .write();
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
