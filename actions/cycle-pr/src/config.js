import YAML from "yaml";

const TOP_LEVEL_KEYS = new Set([
  "version",
  "trunk",
  "sprint",
  "integration",
  "release",
  "extra_labels",
]);
const SPRINT_KEYS = new Set(["prefix"]);
const INTEGRATION_KEYS = new Set(["prefix"]);
const RELEASE_KEYS = new Set([
  "stg",
  "stg01",
  "prd",
  "merge_back",
  "procedure",
]);
const EXTRA_LABEL_KEYS = new Set(["sprint", "promotion"]);

function assertObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}はmappingで指定してください`);
  }
}

function assertKnownKeys(value, knownKeys, path) {
  const unknownKeys = Object.keys(value).filter((key) => !knownKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${path}に未対応の設定があります: ${unknownKeys.join(", ")}`);
  }
}

function optionalString(value, path) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path}は空でない文字列で指定してください`);
  }
  return value.trim();
}

function stringArray(value, path) {
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(`${path}は空でない文字列の配列で指定してください`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

export function parseConfig(source) {
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`設定ファイルを読み取れません: ${document.errors[0].message}`);
  }

  const raw = document.toJS();
  assertObject(raw, "設定");
  assertKnownKeys(raw, TOP_LEVEL_KEYS, "設定");

  if (raw.version !== 1) {
    throw new Error("versionは1を指定してください");
  }

  const trunk = optionalString(raw.trunk, "trunk");
  if (!trunk) {
    throw new Error("trunkを指定してください");
  }

  const sprint = raw.sprint ?? {};
  assertObject(sprint, "sprint");
  assertKnownKeys(sprint, SPRINT_KEYS, "sprint");

  let integration = null;
  if (raw.integration !== undefined) {
    assertObject(raw.integration, "integration");
    assertKnownKeys(raw.integration, INTEGRATION_KEYS, "integration");
    integration = {
      prefix: optionalString(raw.integration.prefix, "integration.prefix"),
    };
    if (!integration.prefix) {
      throw new Error("integration.prefixを指定してください");
    }
  }

  const release = raw.release ?? {};
  assertObject(release, "release");
  assertKnownKeys(release, RELEASE_KEYS, "release");
  if (release.merge_back !== undefined && typeof release.merge_back !== "boolean") {
    throw new Error("release.merge_backはtrueまたはfalseで指定してください");
  }

  const extraLabels = raw.extra_labels ?? {};
  assertObject(extraLabels, "extra_labels");
  assertKnownKeys(extraLabels, EXTRA_LABEL_KEYS, "extra_labels");

  return {
    version: 1,
    trunk,
    sprint: {
      prefix: optionalString(sprint.prefix, "sprint.prefix") ?? "develop_sprint",
    },
    integration,
    release: {
      stg: optionalString(release.stg, "release.stg"),
      stg01: optionalString(release.stg01, "release.stg01"),
      prd: optionalString(release.prd, "release.prd"),
      mergeBack: release.merge_back ?? true,
      procedure: optionalString(release.procedure, "release.procedure"),
    },
    extraLabels: {
      sprint: stringArray(extraLabels.sprint, "extra_labels.sprint"),
      promotion: stringArray(extraLabels.promotion, "extra_labels.promotion"),
    },
  };
}
