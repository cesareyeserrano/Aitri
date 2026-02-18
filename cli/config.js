import path from "node:path";
import fs from "node:fs";

export const CONFIG_FILE = "aitri.config.json";
export const DEFAULT_PATHS = Object.freeze({
  specs: "specs",
  backlog: "backlog",
  tests: "tests",
  docs: "docs"
});
export const DEFAULT_POLICY = Object.freeze({
  allowDependencyChanges: false,
  goRequireGit: false,
  blockedImports: [],
  blockedPaths: []
});
export const DEFAULT_DELIVERY = Object.freeze({
  confidenceThreshold: 0.85
});

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/g, "").trim();
}

function validateMappedPath(key, value) {
  if (typeof value !== "string" || value.trim() === "") {
    return `paths.${key} must be a non-empty string.`;
  }
  const normalized = normalizePathLike(value);
  if (!normalized || normalized === ".") {
    return `paths.${key} must not be "." or empty.`;
  }
  if (path.isAbsolute(normalized)) {
    return `paths.${key} must be relative, not absolute.`;
  }
  if (normalized.split("/").includes("..")) {
    return `paths.${key} must not contain "..".`;
  }
  if (/[\r\n\t]/.test(normalized)) {
    return `paths.${key} must not contain control characters.`;
  }
  if (/[`$;&|<>]/.test(normalized)) {
    return `paths.${key} contains unsupported characters.`;
  }
  return null;
}

function validateConfig(raw) {
  const issues = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push("Config root must be a JSON object.");
    return issues;
  }

  if (raw.paths !== undefined) {
    if (raw.paths === null || typeof raw.paths !== "object" || Array.isArray(raw.paths)) {
      issues.push("`paths` must be an object when provided.");
    } else {
      const allowed = new Set(["specs", "backlog", "tests", "docs"]);
      Object.keys(raw.paths).forEach((key) => {
        if (!allowed.has(key)) {
          issues.push(`Unsupported key in paths: ${key}. Allowed keys: specs, backlog, tests, docs.`);
          return;
        }
        const issue = validateMappedPath(key, raw.paths[key]);
        if (issue) issues.push(issue);
      });
    }
  }

  if (raw.policy !== undefined) {
    if (raw.policy === null || typeof raw.policy !== "object" || Array.isArray(raw.policy)) {
      issues.push("`policy` must be an object when provided.");
    } else {
      if (raw.policy.allowDependencyChanges !== undefined && typeof raw.policy.allowDependencyChanges !== "boolean") {
        issues.push("policy.allowDependencyChanges must be a boolean.");
      }
      if (raw.policy.goRequireGit !== undefined && typeof raw.policy.goRequireGit !== "boolean") {
        issues.push("policy.goRequireGit must be a boolean.");
      }
      if (raw.policy.blockedImports !== undefined) {
        if (!Array.isArray(raw.policy.blockedImports)) {
          issues.push("policy.blockedImports must be an array of strings.");
        } else if (raw.policy.blockedImports.some((v) => typeof v !== "string" || v.trim() === "")) {
          issues.push("policy.blockedImports must contain only non-empty strings.");
        }
      }
      if (raw.policy.blockedPaths !== undefined) {
        if (!Array.isArray(raw.policy.blockedPaths)) {
          issues.push("policy.blockedPaths must be an array of strings.");
        } else if (raw.policy.blockedPaths.some((v) => typeof v !== "string" || v.trim() === "")) {
          issues.push("policy.blockedPaths must contain only non-empty strings.");
        }
      }
    }
  }

  if (raw.delivery !== undefined) {
    if (raw.delivery === null || typeof raw.delivery !== "object" || Array.isArray(raw.delivery)) {
      issues.push("`delivery` must be an object when provided.");
    } else if (raw.delivery.confidenceThreshold !== undefined) {
      const threshold = raw.delivery.confidenceThreshold;
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        issues.push("delivery.confidenceThreshold must be a number between 0 and 1.");
      }
    }
  }

  return issues;
}

export function loadAitriConfig(root = process.cwd()) {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    return {
      loaded: false,
      file: CONFIG_FILE,
      paths: { ...DEFAULT_PATHS },
      policy: { ...DEFAULT_POLICY },
      delivery: { ...DEFAULT_DELIVERY }
    };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`Invalid ${CONFIG_FILE}: ${message}`);
  }

  const issues = validateConfig(raw);
  if (issues.length > 0) {
    throw new Error(`Invalid ${CONFIG_FILE}:\n- ${issues.join("\n- ")}`);
  }

  const mapped = {
    ...DEFAULT_PATHS,
    ...(raw.paths || {})
  };

  return {
    loaded: true,
    file: CONFIG_FILE,
    paths: mapped,
    policy: {
      ...DEFAULT_POLICY,
      ...(raw.policy || {}),
      blockedImports: [...(raw.policy?.blockedImports || DEFAULT_POLICY.blockedImports)],
      blockedPaths: [...(raw.policy?.blockedPaths || DEFAULT_POLICY.blockedPaths)]
    },
    delivery: {
      ...DEFAULT_DELIVERY,
      ...(raw.delivery || {})
    }
  };
}

export function resolveProjectPaths(root, mappedPaths) {
  const paths = mappedPaths || DEFAULT_PATHS;
  const specsRoot = path.join(root, paths.specs);
  const backlogRoot = path.join(root, paths.backlog);
  const testsRoot = path.join(root, paths.tests);
  const docsRoot = path.join(root, paths.docs);
  const srcRoot = path.join(root, "src");
  const docsImplementationDir = path.join(docsRoot, "implementation");
  const docsDeliveryDir = path.join(docsRoot, "delivery");

  return {
    root,
    mapped: { ...paths },
    specsRoot,
    backlogRoot,
    testsRoot,
    docsRoot,
    srcRoot,
    docsImplementationDir,
    docsDeliveryDir,
    specsDraftsDir: path.join(specsRoot, "drafts"),
    specsApprovedDir: path.join(specsRoot, "approved"),
    docsDiscoveryDir: path.join(docsRoot, "discovery"),
    docsPlanDir: path.join(docsRoot, "plan"),
    docsVerificationDir: path.join(docsRoot, "verification"),
    draftSpecFile(feature) {
      return path.join(specsRoot, "drafts", `${feature}.md`);
    },
    approvedSpecFile(feature) {
      return path.join(specsRoot, "approved", `${feature}.md`);
    },
    discoveryFile(feature) {
      return path.join(docsRoot, "discovery", `${feature}.md`);
    },
    planFile(feature) {
      return path.join(docsRoot, "plan", `${feature}.md`);
    },
    backlogFile(feature) {
      return path.join(backlogRoot, feature, "backlog.md");
    },
    testsFile(feature) {
      return path.join(testsRoot, feature, "tests.md");
    },
    generatedTestsDir(feature) {
      return path.join(testsRoot, feature, "generated");
    },
    implementationFeatureDir(feature) {
      return path.join(docsImplementationDir, feature);
    },
    implementationOrderFile(feature) {
      return path.join(docsImplementationDir, feature, "IMPLEMENTATION_ORDER.md");
    },
    goMarkerFile(feature) {
      return path.join(docsImplementationDir, feature, "go.json");
    },
    deliveryJsonFile(feature) {
      return path.join(docsDeliveryDir, `${feature}.json`);
    },
    deliveryReportFile(feature) {
      return path.join(docsDeliveryDir, `${feature}.md`);
    },
    verificationFile(feature) {
      return path.join(docsRoot, "verification", `${feature}.json`);
    },
    buildManifestFile(feature) {
      return path.join(docsImplementationDir, feature, "build-manifest.json");
    }
  };
}
