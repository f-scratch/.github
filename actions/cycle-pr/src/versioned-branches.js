function normalizeNumber(value) {
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

function compareNumberStrings(left, right) {
  if (left.length !== right.length) {
    return left.length - right.length;
  }
  return left.localeCompare(right);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseVersionedBranch(branch, prefix) {
  const match = branch.match(
    new RegExp(`^${escapeRegExp(prefix)}([0-9]+)(?:\\.([0-9]+))?$`),
  );
  if (!match) {
    return null;
  }

  return {
    branch,
    major: normalizeNumber(match[1]),
    hasMinor: match[2] !== undefined,
    minor: match[2] === undefined ? null : normalizeNumber(match[2]),
  };
}

export function compareVersionedBranches(left, right) {
  const majorComparison = compareNumberStrings(left.major, right.major);
  if (majorComparison !== 0) {
    return majorComparison;
  }

  if (left.hasMinor !== right.hasMinor) {
    return left.hasMinor ? 1 : -1;
  }

  if (left.hasMinor) {
    const minorComparison = compareNumberStrings(left.minor, right.minor);
    if (minorComparison !== 0) {
      return minorComparison;
    }
  }

  return left.branch.localeCompare(right.branch);
}

export function listVersionedBranches(branches, prefix) {
  const parsed = branches
    .map((branch) => parseVersionedBranch(branch, prefix))
    .filter(Boolean);

  const seenVersions = new Map();
  for (const item of parsed) {
    const version = item.hasMinor
      ? `${item.major}.${item.minor}`
      : item.major;
    const existing = seenVersions.get(version);
    if (existing) {
      throw new Error(
        `同じSprint番号を表すブランチが複数あります: ${existing}, ${item.branch}`,
      );
    }
    seenVersions.set(version, item.branch);
  }

  return parsed.sort(compareVersionedBranches).map((item) => item.branch);
}
