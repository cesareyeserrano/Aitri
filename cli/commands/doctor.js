import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function globMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function walkDir(dir, root, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, root, results);
    } else {
      results.push(path.relative(root, full).replace(/\\/g, "/"));
    }
  }
  return results;
}

function parsePermittedPatterns(policyContent) {
  const patterns = [];
  const re = /\|\s*`(docs\/[^`]+)`/g;
  let m;
  while ((m = re.exec(policyContent)) !== null) {
    patterns.push(m[1]);
  }
  return patterns;
}

function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]+")
    .replace(/\u0000/g, ".*");
  return new RegExp("^" + escaped + "$");
}

function matchesAnyPattern(filePath, patterns) {
  return patterns.some((p) =>
    p.includes("*") ? patternToRegex(p).test(filePath) : filePath === p
  );
}

function readCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(
      new URL("../../package.json", import.meta.url), "utf8"
    ));
    return pkg.version || null;
  } catch { return null; }
}

function readProjectName(docsRoot) {
  const profile = readJsonSafe(path.join(docsRoot, "project.json"));
  return profile?.name || null;
}

const CHECKS = [
  {
    id: "REQ-SOURCE-STATEMENT",
    since: "0.2.26",
    description: "Approved specs should include '## 10. Requirement Source Statement'",
    severity: "medium",
    check(ctx) {
      const specs = globMd(ctx.paths.specsApprovedDir);
      const missing = specs.filter((f) => {
        const content = fs.readFileSync(f, "utf8");
        return !content.includes("## 10. Requirement Source Statement");
      });
      return missing.length === 0
        ? { ok: true }
        : {
            ok: false,
            files: missing.map((f) => path.relative(ctx.root, f)),
            fix: "aitri upgrade will add this section"
          };
    }
  },
  {
    id: "PROJECT-PROFILE",
    since: "0.2.25",
    description: "Project should have docs/project.json",
    severity: "low",
    check(ctx) {
      const file = path.join(ctx.paths.docsRoot, "project.json");
      return fs.existsSync(file)
        ? { ok: true }
        : { ok: false, fix: "aitri upgrade will create docs/project.json" };
    }
  },
  {
    id: "AITRI-VERSION-STAMP",
    since: "0.2.27",
    description: "Project profile should include aitriVersion field",
    severity: "low",
    check(ctx) {
      const file = path.join(ctx.paths.docsRoot, "project.json");
      if (!fs.existsSync(file)) return { ok: false, fix: "Run aitri upgrade" };
      const data = readJsonSafe(file);
      return data?.aitriVersion
        ? { ok: true }
        : { ok: false, fix: "aitri upgrade will add version stamp" };
    }
  },
  {
    id: "INFERRED-REQ-MARKERS",
    since: "0.2.26",
    description: "Specs should not contain 'Aitri suggestion (auto-applied)' markers",
    severity: "high",
    check(ctx) {
      const specs = [
        ...globMd(ctx.paths.specsDraftsDir),
        ...globMd(ctx.paths.specsApprovedDir)
      ];
      const tainted = specs.filter((f) => {
        const content = fs.readFileSync(f, "utf8");
        return /Aitri suggestion \(auto-applied\)/i.test(content);
      });
      return tainted.length === 0
        ? { ok: true }
        : {
            ok: false,
            files: tainted.map((f) => path.relative(ctx.root, f)),
            fix: "Replace inferred markers with explicit user requirements"
          };
    }
  },
  {
    id: "DOC-POLICY",
    since: "0.5.0",
    description: "docs/ should only contain files listed in docs/DOC_POLICY.md",
    severity: "medium",
    check(ctx) {
      const policyFile = path.join(ctx.paths.docsRoot, "DOC_POLICY.md");
      if (!fs.existsSync(policyFile)) return { ok: true };
      const policyContent = fs.readFileSync(policyFile, "utf8");
      const patterns = parsePermittedPatterns(policyContent);
      if (patterns.length === 0) return { ok: true };
      const allFiles = walkDir(ctx.paths.docsRoot, ctx.root);
      const unlisted = allFiles.filter((f) => !matchesAnyPattern(f, patterns));
      return unlisted.length === 0
        ? { ok: true }
        : {
            ok: false,
            files: unlisted,
            fix: "Remove these files or add them to docs/DOC_POLICY.md"
          };
    }
  },
  {
    id: "SHORT-IDEA-DRAFTS",
    since: "0.2.24",
    description: "Draft specs should not be TBD-heavy (>5 TBDs suggests insufficient user input)",
    severity: "medium",
    check(ctx) {
      const drafts = globMd(ctx.paths.specsDraftsDir);
      const suspicious = drafts.filter((f) => {
        const content = fs.readFileSync(f, "utf8");
        const tbdCount = (content.match(/\bTBD\b/g) || []).length;
        return tbdCount > 5;
      });
      return suspicious.length === 0
        ? { ok: true }
        : {
            ok: false,
            files: suspicious.map((f) => path.relative(ctx.root, f)),
            fix: "Review and complete these drafts with real user requirements"
          };
    }
  }
];

export function runDoctorCommand({
  options,
  getProjectContextOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const aitriVersion = readCurrentVersion();
  const projectName = readProjectName(project.paths.docsRoot);

  const jsonOutput = options.json
    || (options.format || "").toLowerCase() === "json"
    || options.positional.some((p) => p.toLowerCase() === "json");

  const ctx = { paths: project.paths, root };
  const results = CHECKS.map((check) => {
    let result;
    try {
      result = check.check(ctx);
    } catch (err) {
      result = { ok: false, fix: `Check error: ${err.message}` };
    }
    return {
      id: check.id,
      ok: result.ok,
      severity: result.ok ? null : check.severity,
      description: check.description,
      files: result.files || null,
      fix: result.fix || null
    };
  });

  const failed = results.filter((r) => !r.ok);
  const allOk = failed.length === 0;
  const highCount = failed.filter((r) => r.severity === "high").length;
  const mediumCount = failed.filter((r) => r.severity === "medium").length;
  const lowCount = failed.filter((r) => r.severity === "low").length;

  const summary = {
    total: CHECKS.length,
    pass: results.filter((r) => r.ok).length,
    fail: failed.length,
    high: highCount,
    medium: mediumCount,
    low: lowCount
  };

  if (jsonOutput) {
    const payload = {
      ok: allOk,
      aitriVersion,
      project: projectName,
      checks: results,
      summary
    };
    console.log(JSON.stringify(payload, null, 2));
    return allOk ? OK : ERROR;
  }

  // Human-readable output
  console.log("Aitri Doctor — Project Health Check");
  console.log(`Aitri version: ${aitriVersion || "(unknown)"}`);
  console.log(`Project: ${projectName || "(no project.json)"}`);
  console.log("");

  const colW = { id: 30, status: 8, severity: 12 };
  const header = "  " +
    "Check".padEnd(colW.id) +
    "Status".padEnd(colW.status) +
    "Severity".padEnd(colW.severity) +
    "Fix";
  console.log(header);
  console.log("  " + "─".repeat(70));

  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    const severity = r.ok ? "-" : (r.severity || "-");
    const fix = r.ok ? "-" : (r.fix || "-");
    console.log(
      "  " +
      r.id.padEnd(colW.id) +
      status.padEnd(colW.status) +
      severity.padEnd(colW.severity) +
      fix
    );
    if (!r.ok && r.files && r.files.length > 0) {
      r.files.slice(0, 3).forEach((f) => console.log("    ↳ " + f));
      if (r.files.length > 3) console.log(`    ↳ ...and ${r.files.length - 3} more`);
    }
  }

  console.log("");
  if (allOk) {
    console.log("Result: All checks pass. Project is up-to-date.");
  } else {
    const parts = [];
    if (highCount > 0) parts.push(`${highCount} high`);
    if (mediumCount > 0) parts.push(`${mediumCount} medium`);
    if (lowCount > 0) parts.push(`${lowCount} low`);
    console.log(`Result: ${failed.length} gap${failed.length !== 1 ? "s" : ""} found (${parts.join(", ")})`);
    console.log("Run: aitri upgrade to fix auto-fixable gaps.");
  }

  return allOk ? OK : ERROR;
}
