import assert from "node:assert/strict";
import test from "node:test";
import {
  listVersionedBranches,
  parseVersionedBranch,
} from "../src/versioned-branches.js";

test("Sprint番号をバージョン順に並べる", () => {
  const branches = [
    "develop_sprint20",
    "develop_sprint19.10",
    "develop_sprint19.2",
    "develop_sprint19.1",
    "develop_sprint19.0",
    "develop_sprint19",
    "develop_sprint18",
  ];

  assert.deepEqual(listVersionedBranches(branches, "develop_sprint"), [
    "develop_sprint18",
    "develop_sprint19",
    "develop_sprint19.0",
    "develop_sprint19.1",
    "develop_sprint19.2",
    "develop_sprint19.10",
    "develop_sprint20",
  ]);
});

test("prefixとSprint番号だけで構成されたブランチを対象にする", () => {
  assert.ok(parseVersionedBranch("integration/sprint19.1", "integration/sprint"));
  assert.equal(
    parseVersionedBranch("integration/sprint19-test", "integration/sprint"),
    null,
  );
  assert.equal(
    parseVersionedBranch("test/integration/sprint19", "integration/sprint"),
    null,
  );
});

test("同じ番号を表すブランチが複数ある場合は失敗する", () => {
  assert.throws(
    () =>
      listVersionedBranches(
        ["develop_sprint09", "develop_sprint9"],
        "develop_sprint",
      ),
    /同じSprint番号/,
  );
});
