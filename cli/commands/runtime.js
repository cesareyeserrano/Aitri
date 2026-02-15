import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { getStatusReport } from "./status.js";

function normalizeFeatureName(value) {
  return (value || "").replace(/\s+/g, "-").trim();
}

function shellEscapeSingle(value) {
  return String(value).replace(/'/g, "'\\''");
}

function tailLines(content, maxLines = 40) {
  const lines = String(content || "").split("\n");
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n").trim();
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function globPatternToRegex(pattern) {
  const normalized = toPosixPath(pattern).trim();
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function wildcardToRegex(pattern) {
  const escaped = String(pattern || "")
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function runGit(cmd, cwd) {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return { ok: true, out };
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    return { ok: false, out: "", err: stderr || "git command failed" };
  }
}

function runGitRaw(cmd, cwd) {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, out };
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    return { ok: false, out: "", err: stderr || "git command failed" };
  }
}

function parseGitChangedFiles(root) {
  const inside = runGit("git rev-parse --is-inside-work-tree", root);
  if (!inside.ok || inside.out !== "true") return { git: false, files: [] };

  const status = runGitRaw("git status --porcelain", root);
  if (!status.ok) return { git: true, files: [] };

  const files = String(status.out)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const body = line.length > 3 ? line.slice(3).trim() : "";
      if (!body) return "";
      if (body.includes(" -> ")) {
        return body.split(" -> ").pop();
      }
      return body;
    })
    .map((value) => toPosixPath(value))
    .filter(Boolean);

  return { git: true, files: [...new Set(files)] };
}

function extractImports(content) {
  const imports = new Set();
  const text = String(content || "");

  const jsImport = /\bimport\s+(?:[^'"]+from\s+)?["']([^"']+)["']/g;
  const jsRequire = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  const pyImport = /^\s*import\s+([a-zA-Z0-9_\.]+)/gm;
  const pyFrom = /^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+/gm;
  const goImport = /^\s*"([^"]+)"/gm;

  for (const regex of [jsImport, jsRequire, pyImport, pyFrom, goImport]) {
    let match = regex.exec(text);
    while (match) {
      imports.add(match[1]);
      match = regex.exec(text);
    }
  }
  return [...imports];
}

function isSourceFile(file) {
  return /\.(js|mjs|cjs|ts|tsx|jsx|py|go|java|kt|rb)$/i.test(file);
}

function isDependencyManifest(file) {
  const base = path.basename(file);
  if (/^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(base)) return true;
  if (/^(requirements(\..+)?\.txt|pyproject\.toml|poetry\.lock|Pipfile|Pipfile\.lock)$/i.test(base)) return true;
  if (/^(go\.mod|go\.sum|Cargo\.toml|Cargo\.lock)$/i.test(base)) return true;
  return false;
}

function detectPackageRunner(pkg) {
  const raw = String(pkg?.packageManager || "").toLowerCase();
  if (raw.startsWith("pnpm@")) return "pnpm";
  if (raw.startsWith("yarn@")) return "yarn";
  if (raw.startsWith("bun@")) return "bun";
  return "npm";
}

function scriptCommand(runner, scriptName) {
  if (scriptName === "test") {
    if (runner === "yarn") return "yarn test";
    if (runner === "pnpm") return "pnpm test";
    if (runner === "bun") return "bun run test";
    return "npm test";
  }
  if (runner === "yarn") return `yarn ${scriptName}`;
  if (runner === "bun") return `bun run ${scriptName}`;
  return `${runner} run ${scriptName}`;
}

function findNodeTestFiles(root) {
  const MAX_SCAN = 200;
  const roots = ["tests", "test", "__tests__"]
    .map((dir) => path.join(root, dir))
    .filter((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());

  if (roots.length === 0) return [];

  const files = [];
  const stack = [...roots];
  while (stack.length > 0 && files.length < MAX_SCAN) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.forEach((entry) => {
      if (entry.name.startsWith(".")) return;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        return;
      }
      if (!entry.isFile()) return;
      if (!/\.(test|spec)\.(mjs|cjs|js)$/i.test(entry.name)) return;
      files.push(toPosixPath(path.relative(root, abs)));
    });
  }

  return [...new Set(files)].sort();
}

function pickNodeVerifyCommand(root) {
  const files = findNodeTestFiles(root);
  if (files.length === 0) return null;
  const ranked = [...files].sort((a, b) => {
    const score = (value) => {
      if (/smoke/i.test(value)) return 0;
      if (/e2e/i.test(value)) return 1;
      return 2;
    };
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
  const file = ranked[0];
  return {
    command: `node --test '${shellEscapeSingle(file)}'`,
    source: "node:test:file"
  };
}

function detectVerificationCommand(root) {
  const packageJson = path.join(root, "package.json");
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
      const scripts = pkg && pkg.scripts ? pkg.scripts : {};
      const runner = detectPackageRunner(pkg);
      const priorities = ["test:aitri", "test:smoke", "test:ci", "test:unit", "test"];
      const selected = priorities.find((name) => typeof scripts[name] === "string" && scripts[name].trim() !== "");
      if (selected) {
        return {
          command: scriptCommand(runner, selected),
          source: `package.json:scripts.${selected}`
        };
      }
    } catch {
      return {
        command: null,
        source: "package.json:invalid",
        suggestions: [
          "Fix package.json JSON syntax.",
          "Add script `test:aitri` and rerun `aitri verify`.",
          "Or pass an explicit command: aitri verify --verify-cmd \"<command>\"."
        ]
      };
    }
  }

  const nodeFallback = pickNodeVerifyCommand(root);
  if (nodeFallback) {
    return nodeFallback;
  }

  if (fs.existsSync(path.join(root, "pytest.ini")) || fs.existsSync(path.join(root, "pyproject.toml"))) {
    return { command: "pytest -q", source: "python:pytest" };
  }
  if (fs.existsSync(path.join(root, "go.mod"))) {
    return { command: "go test ./...", source: "go:test" };
  }
  return {
    command: null,
    source: "none",
    suggestions: [
      "Add package.json script `test:aitri` (recommended).",
      "Or pass an explicit command: aitri verify --verify-cmd \"<command>\"."
    ]
  };
}

export function resolveVerifyFeature(options, root) {
  const fromArgs = normalizeFeatureName(options.feature || options.positional[0]);
  if (fromArgs) return fromArgs;
  const report = getStatusReport({ root });
  return report.approvedSpec.feature || null;
}

export function runVerification({ root, feature, verifyCmd }) {
  const detected = detectVerificationCommand(root);
  const command = verifyCmd || detected.command;
  const source = verifyCmd ? "flag:verify-cmd" : detected.source;
  const startedAt = new Date();
  const startMs = Date.now();

  if (!command) {
    const suggestions = Array.isArray(detected.suggestions) ? detected.suggestions : [];
    return {
      ok: false,
      feature,
      command: null,
      commandSource: source,
      exitCode: 1,
      durationMs: Date.now() - startMs,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      stdoutTail: "",
      stderrTail: "No runtime test command detected. Configure package scripts or pass --verify-cmd.",
      reason: "no_test_command",
      suggestions
    };
  }

  const run = spawnSync(command, {
    cwd: root,
    encoding: "utf8",
    shell: true
  });

  return {
    ok: run.status === 0,
    feature,
    command,
    commandSource: source,
    exitCode: run.status == null ? 1 : run.status,
    durationMs: Date.now() - startMs,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    stdoutTail: tailLines(run.stdout || ""),
    stderrTail: tailLines(run.stderr || ""),
    reason: run.status === 0 ? "passed" : "verification_failed"
  };
}

export function evaluatePolicyChecks({ root, feature, project }) {
  const changed = parseGitChangedFiles(root);
  const policy = project.config.policy || {
    allowDependencyChanges: false,
    blockedImports: [],
    blockedPaths: []
  };
  const blockedPathRegex = (policy.blockedPaths || []).map((pattern) => ({
    pattern,
    regex: globPatternToRegex(pattern)
  }));
  const blockedImportRegex = (policy.blockedImports || []).map((pattern) => ({
    pattern,
    regex: wildcardToRegex(pattern)
  }));

  const issues = [];
  const gaps = {
    dependency_drift: [],
    forbidden_path: [],
    forbidden_import: []
  };
  const warnings = [];
  const changedFiles = changed.files;

  if (!changed.git) {
    warnings.push("Policy checks are limited outside git repositories (dependency drift and changed-file scope unavailable).");
  }

  const dependencyChanges = changedFiles.filter((file) => isDependencyManifest(file));
  if (!policy.allowDependencyChanges && dependencyChanges.length > 0) {
    dependencyChanges.forEach((file) => {
      const msg = `Dependency drift: ${file} changed while dependency changes are blocked by policy.`;
      gaps.dependency_drift.push(msg);
      issues.push(msg);
    });
  }

  if (blockedPathRegex.length > 0) {
    changedFiles.forEach((file) => {
      const matched = blockedPathRegex.find((entry) => entry.regex.test(file));
      if (matched) {
        const msg = `Forbidden path: ${file} matches blocked path rule '${matched.pattern}'.`;
        gaps.forbidden_path.push(msg);
        issues.push(msg);
      }
    });
  }

  if (blockedImportRegex.length > 0) {
    changedFiles.filter((file) => isSourceFile(file)).forEach((file) => {
      const abs = path.join(root, file);
      if (!fs.existsSync(abs)) return;
      const imports = extractImports(fs.readFileSync(abs, "utf8"));
      imports.forEach((imp) => {
        const matched = blockedImportRegex.find((entry) => entry.regex.test(imp));
        if (matched) {
          const msg = `Forbidden import: ${imp} in ${file} matches blocked import rule '${matched.pattern}'.`;
          gaps.forbidden_import.push(msg);
          issues.push(msg);
        }
      });
    });
  }

  const evidenceDir = path.join(project.paths.docsRoot, "policy");
  const evidenceFile = path.join(evidenceDir, `${feature}.json`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const payload = {
    ok: issues.length === 0,
    feature,
    evaluatedAt: new Date().toISOString(),
    policy: {
      allowDependencyChanges: policy.allowDependencyChanges,
      blockedImports: [...(policy.blockedImports || [])],
      blockedPaths: [...(policy.blockedPaths || [])]
    },
    files: {
      changed: changedFiles,
      dependencyChanged: dependencyChanges
    },
    gaps,
    gapSummary: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, v.length])),
    issues,
    warnings,
    evidenceFile: path.relative(root, evidenceFile)
  };

  fs.writeFileSync(evidenceFile, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}
