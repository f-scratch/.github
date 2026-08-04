import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config.js";
import { planPullRequests } from "../src/planner.js";

const fullConfig = parseConfig(`
version: 1
trunk: develop
integration:
  prefix: integration/sprint
release:
  stg: release-stg
  stg01: release-stg01
  prd: release-prd
  procedure: .github/release_procedure.md
`);

const branches = [
  "develop",
  "develop_sprint19",
  "develop_sprint19.0",
  "develop_sprint19.1",
  "integration/sprint19",
  "integration/sprint19.1",
  "integration/sprint20",
  "release-stg",
  "release-stg01",
  "release-prd",
];

test("dx-kpieeのブランチ構成で全経路を計画する", () => {
  const dxKpieeBranches = [
    "develop",
    "develop_sprint19.0",
    "develop_sprint19.1",
    "integration/sprint19",
    "integration/sprint20",
    "release-stg",
    "release-stg01",
    "release-prd",
  ];
  const cases = [
    [
      "develop_sprint19.0",
      [
        [
          "sprint-forward",
          "develop_sprint19.0",
          "develop_sprint19.1",
          ["IT", "cycle"],
          null,
        ],
        [
          "previous-sprint-to-stg01",
          "develop_sprint19.0",
          "release-stg01",
          ["UT", "cycle"],
          null,
        ],
      ],
    ],
    [
      "develop_sprint19.1",
      [
        [
          "latest-sprint-to-release",
          "develop_sprint19.1",
          "release-stg",
          ["STG", "cycle"],
          null,
        ],
        [
          "latest-sprint-to-trunk",
          "develop_sprint19.1",
          "develop",
          ["IT", "cycle"],
          null,
        ],
      ],
    ],
    [
      "develop",
      [
        [
          "trunk-to-latest-integration",
          "develop",
          "integration/sprint20",
          ["integration"],
          null,
        ],
      ],
    ],
    [
      "integration/sprint19",
      [
        [
          "integration-forward",
          "integration/sprint19",
          "integration/sprint20",
          ["integration"],
          null,
        ],
      ],
    ],
    ["integration/sprint20", []],
    [
      "release-stg",
      [
        [
          "stg-to-stg01",
          "release-stg",
          "release-stg01",
          ["UT", "cycle"],
          ".github/release_procedure.md",
        ],
      ],
    ],
    [
      "release-stg01",
      [
        [
          "stg01-to-prd",
          "release-stg01",
          "release-prd",
          ["PRD", "cycle"],
          null,
        ],
      ],
    ],
    [
      "release-prd",
      [
        [
          "prd-to-trunk",
          "release-prd",
          "develop",
          ["dev", "cycle"],
          null,
        ],
      ],
    ],
  ];

  for (const [sourceBranch, expected] of cases) {
    const actual = planPullRequests({
      config: fullConfig,
      branches: dxKpieeBranches,
      sourceBranch,
    }).map(({ id, head, base, labels, bodyFile }) => [
      id,
      head,
      base,
      labels,
      bodyFile ?? null,
    ]);

    assert.deepEqual(actual, expected, sourceBranch);
  }
});

test("前のSprintから次のSprintとstg01を計画する", () => {
  const plans = planPullRequests({
    config: fullConfig,
    branches,
    sourceBranch: "develop_sprint19.0",
  });

  assert.deepEqual(
    plans.map(({ id, head, base }) => ({ id, head, base })),
    [
      {
        id: "sprint-forward",
        head: "develop_sprint19.0",
        base: "develop_sprint19.1",
      },
      {
        id: "previous-sprint-to-stg01",
        head: "develop_sprint19.0",
        base: "release-stg01",
      },
    ],
  );
});

test("最新Sprintからreleaseの先頭とtrunkを計画する", () => {
  const plans = planPullRequests({
    config: fullConfig,
    branches,
    sourceBranch: "develop_sprint19.1",
  });

  assert.deepEqual(
    plans.map(({ id, base }) => ({ id, base })),
    [
      { id: "latest-sprint-to-release", base: "release-stg" },
      { id: "latest-sprint-to-trunk", base: "develop" },
    ],
  );
});

test("存在するrelease段階だけをつなぐ", () => {
  const config = parseConfig(`
version: 1
trunk: main
release:
  stg: release-stg
  prd: release-prd
`);

  const stgPlans = planPullRequests({
    config,
    branches: ["main", "release-stg", "release-prd"],
    sourceBranch: "release-stg",
  });
  const prdPlans = planPullRequests({
    config,
    branches: ["main", "release-stg", "release-prd"],
    sourceBranch: "release-prd",
  });

  assert.equal(stgPlans[0].base, "release-prd");
  assert.equal(prdPlans[0].base, "main");
});

test("merge_backを無効にした場合は最後のreleaseからtrunkへ戻さない", () => {
  const config = parseConfig(`
version: 1
trunk: main
release:
  prd: release-prd
  merge_back: false
`);

  const plans = planPullRequests({
    config,
    branches: ["main", "release-prd"],
    sourceBranch: "release-prd",
  });

  assert.deepEqual(plans, []);
});

test("経路ごとの標準ラベルに追加ラベルを足す", () => {
  const config = parseConfig(`
version: 1
trunk: develop
release:
  stg: release-stg
extra_labels:
  sprint: [Sprint開発]
  promotion: [deploy]
`);

  const sprintPlans = planPullRequests({
    config,
    branches: ["develop", "develop_sprint19.1", "release-stg"],
    sourceBranch: "develop_sprint19.1",
  });
  const releasePlans = planPullRequests({
    config,
    branches: ["develop", "develop_sprint19.1", "release-stg"],
    sourceBranch: "release-stg",
  });

  assert.deepEqual(sprintPlans[0].labels, ["STG", "cycle", "deploy"]);
  assert.deepEqual(sprintPlans[1].labels, ["IT", "cycle", "Sprint開発"]);
  assert.deepEqual(releasePlans[0].labels, ["dev", "cycle", "deploy"]);
});

test("trunkから最新integrationだけを計画する", () => {
  const plans = planPullRequests({
    config: fullConfig,
    branches,
    sourceBranch: "develop",
  });

  assert.deepEqual(
    plans.map(({ id, base }) => ({ id, base })),
    [
      {
        id: "trunk-to-latest-integration",
        base: "integration/sprint20",
      },
    ],
  );
});

test("古いintegrationから次のintegrationだけを計画する", () => {
  const plans = planPullRequests({
    config: fullConfig,
    branches,
    sourceBranch: "integration/sprint19.1",
  });

  assert.deepEqual(
    plans.map(({ id, base }) => ({ id, base })),
    [
      {
        id: "integration-forward",
        base: "integration/sprint20",
      },
    ],
  );
});

test("最新integrationからtrunkへのPRは計画しない", () => {
  const plans = planPullRequests({
    config: fullConfig,
    branches,
    sourceBranch: "integration/sprint20",
  });

  assert.deepEqual(plans, []);
});

test("releaseもintegrationもないリポジトリを扱う", () => {
  const config = parseConfig("version: 1\ntrunk: main\n");
  const plans = planPullRequests({
    config,
    branches: ["main", "develop_sprint19", "develop_sprint19.1"],
    sourceBranch: "develop_sprint19.1",
  });

  assert.deepEqual(
    plans.map(({ id, base }) => ({ id, base })),
    [{ id: "latest-sprint-to-trunk", base: "main" }],
  );
});
