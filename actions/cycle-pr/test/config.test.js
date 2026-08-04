import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config.js";

test("最小設定に標準値を補う", () => {
  const config = parseConfig(`
version: 1
trunk: main
`);

  assert.equal(config.trunk, "main");
  assert.equal(config.sprint.prefix, "develop_sprint");
  assert.equal(config.integration, null);
  assert.deepEqual(config.release, {
    stg: undefined,
    stg01: undefined,
    prd: undefined,
    mergeBack: true,
    procedure: undefined,
  });
});

test("integrationとreleaseを読み取る", () => {
  const config = parseConfig(`
version: 1
trunk: develop
integration:
  prefix: integration/sprint
release:
  stg: release-stg
  stg01: release-stg01
  prd: release-prd
  procedure: .github/release_procedure.md
extra_labels:
  sprint: [Sprint開発]
  promotion: [deploy]
`);

  assert.equal(config.integration.prefix, "integration/sprint");
  assert.equal(config.release.stg01, "release-stg01");
  assert.deepEqual(config.extraLabels.sprint, ["Sprint開発"]);
});

test("未知の設定項目を拒否する", () => {
  assert.throws(
    () => parseConfig("version: 1\ntrunk: develop\nrelese: {}\n"),
    /未対応の設定/,
  );
});
