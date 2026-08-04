import { listVersionedBranches } from "./versioned-branches.js";

const STAGE_ORDER = ["stg", "stg01", "prd"];
const STAGE_LABELS = {
  stg: "STG",
  stg01: "UT",
  prd: "PRD",
};

function uniqueLabels(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function route(id, head, base, labels, body, bodyFile) {
  return {
    id,
    head,
    base,
    title: `${head} to ${base}`,
    labels,
    body: body ?? "",
    bodyFile,
  };
}

function configuredStages(release) {
  return STAGE_ORDER.flatMap((stage) =>
    release[stage] ? [{ stage, branch: release[stage] }] : [],
  );
}

export function planPullRequests({ config, branches, sourceBranch }) {
  const plans = [];
  const sprintBranches = listVersionedBranches(
    branches,
    config.sprint.prefix,
  );
  const sprintIndex = sprintBranches.indexOf(sourceBranch);
  const releaseStages = configuredStages(config.release);

  if (sprintIndex !== -1) {
    const nextSprint = sprintBranches[sprintIndex + 1];
    if (nextSprint) {
      plans.push(
        route(
          "sprint-forward",
          sourceBranch,
          nextSprint,
          uniqueLabels(["IT", "cycle"], config.extraLabels.sprint),
        ),
      );

      if (config.release.stg01) {
        plans.push(
          route(
            "previous-sprint-to-stg01",
            sourceBranch,
            config.release.stg01,
            ["UT", "cycle"],
          ),
        );
      }
    } else {
      const firstStage = releaseStages[0];
      if (firstStage) {
        plans.push(
          route(
            "latest-sprint-to-release",
            sourceBranch,
            firstStage.branch,
            uniqueLabels(
              [STAGE_LABELS[firstStage.stage], "cycle"],
              config.extraLabels.promotion,
            ),
          ),
        );
      }

      if (sourceBranch !== config.trunk) {
        plans.push(
          route(
            "latest-sprint-to-trunk",
            sourceBranch,
            config.trunk,
            uniqueLabels(["IT", "cycle"], config.extraLabels.sprint),
          ),
        );
      }
    }
  }

  const releaseIndex = releaseStages.findIndex(
    ({ branch }) => branch === sourceBranch,
  );
  if (releaseIndex !== -1) {
    const nextStage = releaseStages[releaseIndex + 1];
    if (nextStage) {
      plans.push(
        route(
          `${releaseStages[releaseIndex].stage}-to-${nextStage.stage}`,
          sourceBranch,
          nextStage.branch,
          uniqueLabels(
            [STAGE_LABELS[nextStage.stage], "cycle"],
            config.extraLabels.promotion,
          ),
          "",
          releaseStages[releaseIndex].stage === "stg"
            ? config.release.procedure
            : undefined,
        ),
      );
    } else if (config.release.mergeBack && sourceBranch !== config.trunk) {
      plans.push(
        route(
          `${releaseStages[releaseIndex].stage}-to-trunk`,
          sourceBranch,
          config.trunk,
          uniqueLabels(["dev", "cycle"], config.extraLabels.promotion),
        ),
      );
    }
  }

  if (config.integration) {
    const integrationBranches = listVersionedBranches(
      branches,
      config.integration.prefix,
    );
    if (sourceBranch === config.trunk && integrationBranches.length > 0) {
      const latestIntegration = integrationBranches.at(-1);
      plans.push(
        route(
          "trunk-to-latest-integration",
          sourceBranch,
          latestIntegration,
          ["integration"],
          "基準ブランチの変更を最新のintegrationブランチへ取り込むため、自動作成されたPull Requestです。",
        ),
      );
    }

    const integrationIndex = integrationBranches.indexOf(sourceBranch);
    const nextIntegration = integrationBranches[integrationIndex + 1];
    if (integrationIndex !== -1 && nextIntegration) {
      plans.push(
        route(
          "integration-forward",
          sourceBranch,
          nextIntegration,
          ["integration"],
          "前のintegrationブランチの変更を次へ引き継ぐため、自動作成されたPull Requestです。",
        ),
      );
    }
  }

  return plans;
}
