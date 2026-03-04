// cli/commands/close.js
// EVO-070: closure report for a delivered feature — read-only, no side effects
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveFeature } from "../lib.js";

function exists(p) { return fs.existsSync(p); }
function readJsonSafe(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function safeStatMs(f) { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }

function gate(label, ok, hint = "") {
  return { label, ok, hint };
}

function recentCommits(root, feature) {
  const result = spawnSync("git", [
    "log", "--oneline", "-20",
    "--",
    `specs/approved/${feature}.md`,
    `tests/${feature}`,
    `src/contracts`,
    `docs/implementation/${feature}`
  ], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.trim().split("\n").filter(Boolean);
}

function openAuditFindings(root) {
  const findingsFile = path.join(root, "docs", "audit", "audit-findings.json");
  if (!exists(findingsFile)) return [];
  const findings = readJsonSafe(findingsFile) || [];
  return findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
}

export function runCloseCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const { paths } = project;
  const jsonMode = !!(options.json);

  let feature;
  try {
    feature = resolveFeature(options, () => { throw new Error("no_status"); });
  } catch {
    console.log("Feature name is required. Use --feature <name>.");
    return ERROR;
  }

  // ── Gate checks ──────────────────────────────────────────────────────────────
  const specFile        = paths.approvedSpecFile(feature);
  const goMarkerFile    = paths.goMarkerFile(feature);
  const implDir         = paths.implementationFeatureDir(feature);
  const proofFile       = path.join(implDir, "proof-of-compliance.json");
  const verifyFile      = paths.verificationFile(feature);
  const deliveryFile    = paths.deliveryJsonFile(feature);

  const proof  = exists(proofFile)   ? readJsonSafe(proofFile)   : null;
  const verify = exists(verifyFile)  ? readJsonSafe(verifyFile)  : null;
  const delivery = exists(deliveryFile) ? readJsonSafe(deliveryFile) : null;

  const specMtime    = safeStatMs(specFile);
  const proofMtime   = safeStatMs(proofFile);
  const proofStale   = proof && specMtime > proofMtime;

  const gates = [
    gate("Spec approved",        exists(specFile),    `aitri approve --feature ${feature}`),
    gate("Go gate passed",       exists(goMarkerFile), `aitri go --feature ${feature}`),
    gate("Build complete",       exists(path.join(implDir, "scaffold-manifest.json")), `aitri build --feature ${feature}`),
    gate("Proof of compliance",  !!proof && !proofStale, proofStale ? `aitri prove --feature ${feature}  (stale — spec updated after last run)` : `aitri prove --feature ${feature}`),
    gate("Verification complete", !!verify && verify.ok === true, `aitri verify-intent --feature ${feature}`),
    gate("Delivered",            !!delivery, `aitri deliver --feature ${feature}`),
  ];

  const allPassed = gates.every((g) => g.ok);
  const openFindings = openAuditFindings(root);
  const commits = recentCommits(root, feature);

  // ── JSON output ───────────────────────────────────────────────────────────────
  if (jsonMode) {
    console.log(JSON.stringify({
      feature,
      closed: allPassed && openFindings.length === 0,
      gates: gates.map(({ label, ok, hint }) => ({ label, ok, hint: ok ? null : hint })),
      proof: proof ? { passing: proof.summary?.proven, failing: proof.summary?.unproven, total: proof.summary?.total } : null,
      openAuditFindings: openFindings.length,
      recentCommits: commits,
    }, null, 2));
    return allPassed ? OK : ERROR;
  }

  // ── Human output ─────────────────────────────────────────────────────────────
  const hr = "─".repeat(60);
  console.log(`\n${hr}`);
  console.log(` Aitri Close  |  feature: ${feature}`);
  console.log(hr);

  console.log("\n  Pipeline Gates:");
  gates.forEach((g) => {
    const icon = g.ok ? "✓" : "✗";
    const hint = !g.ok ? `  → ${g.hint}` : "";
    console.log(`    ${icon}  ${g.label}${hint}`);
  });

  if (proof) {
    console.log(`\n  Proof: ${proof.summary?.proven ?? "?"}/${proof.summary?.total ?? "?"} passing` +
      (proofStale ? "  ⚠ stale" : ""));
  }

  if (openFindings.length > 0) {
    console.log(`\n  ⚠  Open audit findings (CRITICAL/HIGH): ${openFindings.length}`);
    openFindings.slice(0, 5).forEach((f) => console.log(`    - [${f.severity}] ${f.message}`));
    if (openFindings.length > 5) console.log(`    ... and ${openFindings.length - 5} more`);
  } else {
    console.log("\n  No open CRITICAL/HIGH audit findings.");
  }

  if (commits.length > 0) {
    console.log(`\n  Recent commits (${commits.length}):`);
    commits.slice(0, 10).forEach((c) => console.log(`    ${c}`));
  }

  console.log(`\n${hr}`);
  if (allPassed && openFindings.length === 0) {
    console.log(` Status: CLOSED — all gates passed, no open findings.`);
  } else {
    const blocked = gates.filter((g) => !g.ok);
    console.log(` Status: INCOMPLETE — ${blocked.length} gate(s) pending, ${openFindings.length} open finding(s).`);
  }
  console.log(hr + "\n");

  return allPassed ? OK : ERROR;
}
