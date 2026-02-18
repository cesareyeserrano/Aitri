import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { loadAitriConfig, resolveProjectPaths } from "../config.js";
import { normalizeFeatureName } from "../lib.js";
import { collectPersonaValidationIssues, hasMeaningfulContent as hasMeaningfulContentFn } from "./persona-validation.js";
import { scanAllFeatures } from "./features.js";

function exists(p) {
  return fs.existsSync(p);
}

function listMd(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
}

function collectValidationIssues(spec, backlog, tests, discovery = "", plan = "") {
  const issues = [];

  if (!/###\s+US-\d+/m.test(backlog)) {
    issues.push("Backlog must include at least one user story with an ID like `### US-1`.");
  }
  if (backlog.includes("FR-?")) {
    issues.push("Backlog contains placeholder `FR-?`.");
  }
  if (backlog.includes("AC-?")) {
    issues.push("Backlog contains placeholder `AC-?`.");
  }

  if (!/###\s+TC-\d+/m.test(tests)) {
    issues.push("Tests must include at least one test case with an ID like `### TC-1`.");
  }
  if (tests.includes("US-?")) {
    issues.push("Tests contain placeholder `US-?`.");
  }
  if (tests.includes("FR-?")) {
    issues.push("Tests contain placeholder `FR-?`.");
  }
  if (tests.includes("AC-?")) {
    issues.push("Tests contain placeholder `AC-?`.");
  }

  const specFRs = [...new Set([...spec.matchAll(/\bFR-\d+\b/g)].map((m) => m[0]))];
  const backlogFRs = new Set([...backlog.matchAll(/\bFR-\d+\b/g)].map((m) => m[0]));
  const testsFRs = new Set([...tests.matchAll(/\bFR-\d+\b/g)].map((m) => m[0]));

  const backlogUS = [...new Set([...backlog.matchAll(/\bUS-\d+\b/g)].map((m) => m[0]))];
  const testsUS = new Set([...tests.matchAll(/\bUS-\d+\b/g)].map((m) => m[0]));

  for (const fr of specFRs) {
    if (!backlogFRs.has(fr)) {
      issues.push(`Coverage: ${fr} is defined in spec but not referenced in backlog user stories.`);
    }
    if (!testsFRs.has(fr)) {
      issues.push(`Coverage: ${fr} is defined in spec but not referenced in tests.`);
    }
  }

  for (const us of backlogUS) {
    if (!testsUS.has(us)) {
      issues.push(`Coverage: ${us} exists in backlog but is not referenced in tests.`);
    }
  }

  if (discovery || plan) {
    collectPersonaValidationIssues({ discoveryContent: discovery, planContent: plan, specContent: spec }).forEach((issue) => issues.push(issue));
  }

  return issues;
}

function hasPostGoVerificationReady(verification) {
  if (!verification || verification.ok !== true) return false;
  const tcCoverage = verification.tcCoverage;
  if (!tcCoverage || tcCoverage.mode !== "scaffold") return false;
  if (typeof tcCoverage.declared !== "number" || tcCoverage.declared <= 0) return false;
  return tcCoverage.passing === tcCoverage.declared;
}

function computeNextStep({
  missingDirs,
  approvedSpecFound,
  discoveryExists,
  planExists,
  validateOk,
  verifyOk,
  goCompleted,
  scaffoldReady,
  implementReady,
  buildReady,
  deliveryReady,
  verification
}) {
  if (goCompleted) {
    const hasLegacy = scaffoldReady && implementReady;
    const hasBuild = buildReady;
    if (!hasLegacy && !hasBuild) return "build_pending";
    if (!hasPostGoVerificationReady(verification)) return "verify_pending";
    if (!deliveryReady) return "deliver_pending";
    return "delivery_complete";
  }
  if (missingDirs.length > 0) return "aitri init";
  if (!approvedSpecFound) return "aitri draft";
  if (!discoveryExists) return "aitri plan";
  if (!planExists) return "aitri plan";
  if (!verifyOk) return "aitri verify";
  return "ready_for_human_approval";
}

function resolveFeatureSelection({ requestedFeature, hasFeatureFilter, approvedFeatures, draftFeatures }) {
  let selectedFeature = null;
  let selectedContext = null;
  let selectionIssue = null;

  if (requestedFeature) {
    if (approvedFeatures.includes(requestedFeature)) {
      selectedFeature = requestedFeature;
      selectedContext = "approved";
    } else if (draftFeatures.includes(requestedFeature)) {
      selectedFeature = requestedFeature;
      selectedContext = "draft";
    } else {
      selectionIssue = {
        code: "feature_not_found",
        message: `Feature not found in approved or draft specs: ${requestedFeature}.`,
        requestedFeature
      };
    }
  } else if (hasFeatureFilter) {
    selectionIssue = {
      code: "invalid_feature_name",
      message: "Invalid feature name. Use kebab-case (example: user-login).",
      requestedFeature: String(requestedFeature || "").trim()
    };
  } else if (approvedFeatures.length > 1) {
    selectionIssue = {
      code: "feature_required",
      message: "Multiple approved specs found. Use --feature <name> to select context.",
      requestedFeature: null
    };
  } else if (approvedFeatures.length === 1) {
    selectedFeature = approvedFeatures[0];
    selectedContext = "approved";
  } else if (draftFeatures.length > 1) {
    selectionIssue = {
      code: "feature_required_draft",
      message: "Multiple draft specs found. Use --feature <name> to select context.",
      requestedFeature: null
    };
  } else if (draftFeatures.length === 1) {
    selectedFeature = draftFeatures[0];
    selectedContext = "draft";
  }

  return {
    selectedFeature,
    selectedContext,
    selectionIssue
  };
}

function toRecommendedCommand(nextStep) {
  if (!nextStep) return null;
  if (nextStep === "ready_for_human_approval") return "aitri go";
  if (nextStep === "scaffold_pending") return "aitri build";
  if (nextStep === "implement_pending") return "aitri build";
  if (nextStep === "build_pending") return "aitri build";
  if (nextStep === "verify_pending") return "aitri verify";
  if (nextStep === "deliver_pending") return "aitri deliver";
  if (nextStep === "delivery_complete") return "aitri feedback";
  return nextStep;
}

function nextStepMessage(nextStep) {
  if (!nextStep) return "No next step detected.";
  if (nextStep === "ready_for_human_approval") {
    return "SDLC artifacts are complete. Human go/no-go approval is required.";
  }
  if (nextStep === "build_pending") {
    return "Post-go execution started. Run build to scaffold and generate briefs per story.";
  }
  if (nextStep === "scaffold_pending") {
    return "Post-go execution started. Generate scaffold artifacts next.";
  }
  if (nextStep === "implement_pending") {
    return "Scaffold is ready. Generate ordered implementation briefs.";
  }
  if (nextStep === "verify_pending") {
    return "Implementation artifacts changed. Re-run verify until all TC coverage passes.";
  }
  if (nextStep === "deliver_pending") {
    return "Verification coverage is green. Run deliver gate for final readiness.";
  }
  if (nextStep === "delivery_complete") {
    return "Delivery gate is complete with a SHIP decision. Optional: review local dashboard output.";
  }
  return `Continue SDLC flow with ${nextStep}.`;
}

function countTrue(values) {
  return values.filter(Boolean).length;
}

function computeSpecIntegrity(report) {
  const artifactSignals = [
    report.approvedSpec.found,
    report.artifacts.discovery,
    report.artifacts.plan,
    report.artifacts.backlog,
    report.artifacts.tests
  ];
  const artifactCoverage = Math.round((countTrue(artifactSignals) / artifactSignals.length) * 100);

  if (!report.approvedSpec.found) {
    return {
      score: 0,
      details: {
        artifactCoverage,
        traceabilityScore: 0,
        validationIssueCount: report.validation.issues.length
      },
      reason: "No approved spec context available yet."
    };
  }

  const traceabilityScore = report.validation.ok
    ? 100
    : Math.max(0, 50 - (Math.max(1, report.validation.issues.length) - 1) * 10);

  const score = Math.round((artifactCoverage * 0.4) + (traceabilityScore * 0.6));
  return {
    score,
    details: {
      artifactCoverage,
      traceabilityScore,
      validationIssueCount: report.validation.issues.length
    },
    reason: report.validation.ok
      ? "Artifacts and traceability validation are consistent."
      : "Traceability or persona gates are unresolved."
  };
}

function computeRuntimeVerificationScore(verification) {
  if (!verification || verification.required === false) {
    return { score: 100, reason: "Runtime verification is not required.", notes: [] };
  }

  if (verification.ok) {
    let score = 100;
    const notes = [];
    const command = String(verification.command || "").toLowerCase();
    const source = String(verification.commandSource || "").toLowerCase();

    if (/\bsmoke\b/.test(command)) {
      score -= 25;
      notes.push("Smoke-only runtime verification detected.");
    }
    if (source === "flag:verify-cmd") {
      score -= 15;
      notes.push("Verification command was provided manually with --verify-cmd.");
    }
    if (
      verification.tcCoverage &&
      verification.tcCoverage.mode === "scaffold" &&
      typeof verification.tcCoverage.declared === "number" &&
      verification.tcCoverage.declared > 0
    ) {
      const passing = Number(verification.tcCoverage.passing || 0);
      const declared = Number(verification.tcCoverage.declared || 0);
      const tcScore = Math.max(0, Math.min(100, Math.round((passing / declared) * 100)));
      score = Math.min(score, tcScore);
      if (tcScore < 100) {
        notes.push(`TC coverage ratio is below 100% (${passing}/${declared}).`);
      }
    }

    score = Math.max(60, score);
    return {
      score,
      reason: score === 100
        ? "Runtime verification passed with current evidence."
        : "Runtime verification passed with limited scope evidence.",
      notes
    };
  }

  switch (verification.status) {
    case "stale":
      return { score: 55, reason: "Runtime evidence is stale and must be re-verified.", notes: [] };
    case "failed":
      return { score: 25, reason: "Runtime verification failed.", notes: [] };
    case "invalid":
      return { score: 10, reason: "Runtime evidence is invalid or unreadable.", notes: [] };
    case "missing":
    default:
      return { score: 0, reason: "Runtime verification evidence is missing.", notes: [] };
  }
}

function confidenceLevel(score) {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function buildConfidenceReport(report) {
  const spec = computeSpecIntegrity(report);
  const runtime = computeRuntimeVerificationScore(report.verification);
  const score = Math.round((spec.score * 0.4) + (runtime.score * 0.6));
  const level = confidenceLevel(score);
  return {
    model: "v1-weighted-spec-runtime",
    score,
    level,
    weights: {
      specIntegrity: 0.4,
      runtimeVerification: 0.6
    },
    components: {
      specIntegrity: spec.score,
      runtimeVerification: runtime.score
    },
    details: {
      specIntegrity: spec.details,
      runtimeVerification: {
        status: report.verification.status,
        command: report.verification.command || null,
        commandSource: report.verification.commandSource || null,
        notes: runtime.notes || []
      }
    },
    releaseReady: report.nextStep === "ready_for_human_approval" && score >= 85,
    reasons: {
      specIntegrity: spec.reason,
      runtimeVerification: runtime.reason
    }
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function levelColor(level) {
  if (level === "high") return "#0f766e";
  if (level === "medium") return "#b45309";
  return "#b91c1c";
}

function renderStatusInsightHtml(report, generatedAtIso) {
  const issues = report.validation.issues.slice(0, 20);
  const nextRun = report.recommendedCommand || report.nextStep || "aitri status";
  const confidenceColor = levelColor(report.confidence.level);
  const confidenceLabel = `${report.confidence.score}% (${report.confidence.level})`;
  const structureState = report.structure.ok ? "ok" : `missing: ${report.structure.missingDirs.join(", ")}`;
  const approved = report.approvedSpec.found ? report.approvedSpec.feature : "none";
  const verification = report.verification.status || "unknown";
  const releaseReady = report.confidence.releaseReady ? "yes" : "no";
  const issueRows = issues.length > 0
    ? issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")
    : "<li>No validation issues detected.</li>";
  const runtimeNotes = (report.confidence.details.runtimeVerification.notes || []);
  const runtimeNoteRows = runtimeNotes.length > 0
    ? runtimeNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")
    : "<li>No scope-reduction notes for runtime verification.</li>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aitri Insight</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: #f3f4f6; color: #0f172a; }
    .wrap { max-width: 980px; margin: 24px auto; padding: 0 16px; }
    .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; margin-bottom: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .title { font-size: 24px; margin: 0 0 6px 0; }
    .muted { color: #475569; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .metric { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; background: #f8fafc; }
    .metric h3 { margin: 0; font-size: 12px; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; }
    .metric p { margin: 6px 0 0 0; font-size: 18px; font-weight: 700; }
    .pill { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; background: #e2e8f0; color: #0f172a; }
    .next { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #111827; color: #f9fafb; padding: 10px; border-radius: 8px; }
    ul { margin: 8px 0 0 18px; padding: 0; }
    code { background: #f1f5f9; border-radius: 6px; padding: 2px 6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1 class="title">Aitri Insight</h1>
      <p class="muted">Generated: ${escapeHtml(generatedAtIso)} | Root: <code>${escapeHtml(report.root)}</code></p>
      <p class="pill" style="background:${confidenceColor}20;color:${confidenceColor};border:1px solid ${confidenceColor};">Confidence ${escapeHtml(confidenceLabel)}</p>
    </section>
    <section class="card">
      <div class="grid">
        <div class="metric"><h3>Structure</h3><p>${escapeHtml(structureState)}</p></div>
        <div class="metric"><h3>Approved Spec</h3><p>${escapeHtml(approved)}</p></div>
        <div class="metric"><h3>Validation</h3><p>${report.validation.ok ? "passed" : "blocked"}</p></div>
        <div class="metric"><h3>Verification</h3><p>${escapeHtml(verification)}</p></div>
        <div class="metric"><h3>Release Ready</h3><p>${escapeHtml(releaseReady)}</p></div>
      </div>
    </section>
    <section class="card">
      <h2 class="title" style="font-size:18px;">Next Action</h2>
      <p class="muted">${escapeHtml(report.nextStepMessage || "Follow recommended command.")}</p>
      <div class="next">${escapeHtml(nextRun)}</div>
    </section>
    <section class="card">
      <h2 class="title" style="font-size:18px;">Confidence Breakdown</h2>
      <ul>
        <li>Spec integrity: ${report.confidence.components.specIntegrity}%</li>
        <li>Runtime verification: ${report.confidence.components.runtimeVerification}%</li>
        <li>Weights: spec ${report.confidence.weights.specIntegrity}, runtime ${report.confidence.weights.runtimeVerification}</li>
      </ul>
      <p class="muted">Spec reason: ${escapeHtml(report.confidence.reasons.specIntegrity)}</p>
      <p class="muted">Runtime reason: ${escapeHtml(report.confidence.reasons.runtimeVerification)}</p>
      <ul>${runtimeNoteRows}</ul>
    </section>
    <section class="card">
      <h2 class="title" style="font-size:18px;">Validation Issues</h2>
      <ul>${issueRows}</ul>
    </section>
  </div>
</body>
</html>`;
}

function writeStatusInsight(report) {
  const docsRoot = path.join(report.root, report.config.paths.docs);
  const outDir = path.join(docsRoot, "insight");
  const outFile = path.join(outDir, "status.html");
  fs.mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  fs.writeFileSync(outFile, renderStatusInsightHtml(report, generatedAt), "utf8");
  return {
    file: path.relative(report.root, outFile),
    generatedAt
  };
}

function openStatusInsight(root, relativeFile) {
  const absolute = path.join(root, relativeFile);
  let run;
  if (process.platform === "darwin") {
    run = spawnSync("open", [absolute], { stdio: "ignore" });
  } else if (process.platform === "win32") {
    run = spawnSync("cmd", ["/c", "start", "", absolute], { stdio: "ignore", shell: true });
  } else {
    run = spawnSync("xdg-open", [absolute], { stdio: "ignore" });
  }
  return run.status === 0;
}

function readGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function detectCheckpointState(root) {
  const insideWorkTree = readGit("git rev-parse --is-inside-work-tree", root) === "true";
  if (!insideWorkTree) {
    return {
      git: false,
      detected: false,
      latestCommit: null,
      latestStash: null,
      resumeDecision: "no_checkpoint_detected",
      prompt: "No checkpoint was detected."
    };
  }

  const latestCommitRaw = readGit("git log --grep='^checkpoint:' --pretty=format:'%h|%cI|%s' -n 1", root);
  const latestCommit = latestCommitRaw
    ? (() => {
      const [hash, timestamp, message] = latestCommitRaw.split("|");
      return { hash, timestamp, message };
    })()
    : null;

  const stashLines = readGit("git stash list --format='%gd|%gs'", root)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\|checkpoint:/i.test(line));
  const latestStash = stashLines[0]
    ? (() => {
      const [ref, message] = stashLines[0].split("|");
      return { ref, message };
    })()
    : null;

  const detected = !!latestCommit || !!latestStash;
  const managedTagsRaw = readGit("git tag --list 'aitri-checkpoint/*' --sort=-creatordate", root);
  const managedTags = managedTagsRaw
    ? managedTagsRaw.split("\n").map((line) => line.trim()).filter(Boolean)
    : [];
  return {
    git: true,
    detected,
    mode: "git_commit+tag",
    maxRetained: 10,
    managedCount: managedTags.length,
    latestManaged: managedTags.slice(0, 3),
    latestCommit,
    latestStash,
    resumeDecision: detected ? "ask_user_resume_from_checkpoint" : "no_checkpoint_detected",
    prompt: detected
      ? "Checkpoint detected. Ask user whether to continue from this checkpoint before any write action."
      : "No checkpoint was detected."
  };
}

function safeStatMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    return pkg.version || null;
  } catch { return null; }
}

function detectVerificationState(root, paths, feature) {
  const verificationFile = paths.verificationFile(feature);
  if (!exists(verificationFile)) {
    return {
      required: true,
      found: false,
      ok: false,
      stale: false,
      status: "missing",
      file: path.relative(root, verificationFile),
      reason: "no_verification_evidence"
    };
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(verificationFile, "utf8"));
  } catch {
    return {
      required: true,
      found: true,
      ok: false,
      stale: false,
      status: "invalid",
      file: path.relative(root, verificationFile),
      reason: "invalid_verification_evidence"
    };
  }

  const inputs = [
    paths.approvedSpecFile(feature),
    paths.discoveryFile(feature),
    paths.planFile(feature),
    paths.backlogFile(feature),
    paths.testsFile(feature)
  ];
  const latestInputMs = Math.max(0, ...inputs.map((file) => safeStatMs(file)));
  const verifiedAtMs = Number.isFinite(Date.parse(payload.finishedAt || ""))
    ? Date.parse(payload.finishedAt)
    : safeStatMs(verificationFile);
  const stale = latestInputMs > verifiedAtMs;
  const ok = payload.ok === true && !stale;

  return {
    required: true,
    found: true,
    ok,
    stale,
    status: stale ? "stale" : (payload.ok ? "passed" : "failed"),
    file: path.relative(root, verificationFile),
    command: payload.command || null,
    commandSource: payload.commandSource || null,
    exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
    finishedAt: payload.finishedAt || null,
    reason: stale ? "verification_stale" : (payload.reason || null),
    tcCoverage: payload.tcCoverage || null,
    frCoverage: payload.frCoverage || null,
    usCoverage: payload.usCoverage || null,
    coverageConfidence: payload.coverageConfidence || null
  };
}

export function getStatusReport(options = {}) {
  const { root = process.cwd() } = options;
  const rawFeature = String(options.feature || "").trim();
  const requestedFeature = normalizeFeatureName(rawFeature);
  const config = loadAitriConfig(root);
  const paths = resolveProjectPaths(root, config.paths);

  const requiredDirs = [
    { key: "specs", rel: config.paths.specs, abs: paths.specsRoot },
    { key: "backlog", rel: config.paths.backlog, abs: paths.backlogRoot },
    { key: "tests", rel: config.paths.tests, abs: paths.testsRoot },
    { key: "docs", rel: config.paths.docs, abs: paths.docsRoot }
  ];
  const missingDirs = requiredDirs.filter((d) => !exists(d.abs)).map((d) => d.rel);

  const approvedDir = paths.specsApprovedDir;
  const approvedSpecs = listMd(approvedDir);
  const approvedFeatures = approvedSpecs.map((name) => name.replace(/\.md$/i, ""));
  const draftDir = paths.specsDraftsDir;
  const draftSpecs = listMd(draftDir);
  const draftFeatures = draftSpecs.map((name) => name.replace(/\.md$/i, ""));
  const hasFeatureFilter = rawFeature !== "";
  const {
    selectedFeature,
    selectedContext,
    selectionIssue
  } = resolveFeatureSelection({
    requestedFeature,
    hasFeatureFilter,
    approvedFeatures,
    draftFeatures
  });
  const approvedSpecFile = selectedContext === "approved" && selectedFeature ? `${selectedFeature}.md` : null;
  const draftSpecFile = selectedContext === "draft" && selectedFeature ? `${selectedFeature}.md` : null;

  const report = {
    root,
    config: {
      loaded: config.loaded,
      file: config.file,
      paths: { ...config.paths }
    },
    structure: {
      ok: missingDirs.length === 0,
      missingDirs
    },
    approvedSpec: {
      found: !!approvedSpecFile,
      feature: approvedSpecFile ? selectedFeature : null,
      file: approvedSpecFile ? path.relative(root, path.join(approvedDir, approvedSpecFile)) : null
    },
    draftSpec: {
      found: !!draftSpecFile,
      feature: draftSpecFile ? selectedFeature : null,
      file: draftSpecFile ? path.relative(root, path.join(draftDir, draftSpecFile)) : null
    },
    selection: {
      issue: selectionIssue ? selectionIssue.code : null,
      message: selectionIssue ? selectionIssue.message : null,
      requestedFeature: selectionIssue ? selectionIssue.requestedFeature : (requestedFeature || null),
      availableFeatures: approvedFeatures,
      availableDraftFeatures: draftFeatures
    },
    artifacts: {
      discovery: false,
      plan: false,
      backlog: false,
      tests: false
    },
    validation: {
      ok: false,
      issues: []
    },
    verification: {
      required: true,
      found: false,
      ok: false,
      stale: false,
      status: "missing",
      file: null,
      reason: "no_feature_context"
    },
    checkpoint: {
      recommended: true,
      command: "git add -A && git commit -m \"checkpoint: <feature-or-stage>\"",
      fallback: "git stash push -m \"checkpoint: <feature-or-stage>\"",
      state: detectCheckpointState(root)
    },
    resume: {
      command: "aitri resume",
      rule: "Run resume first, then follow recommendedCommand (or nextStep in JSON mode)."
    },
    handoff: {
      required: false,
      state: "in_progress",
      message: "Continue with nextStep.",
      nextActions: []
    },
    factory: {
      goCompleted: false,
      scaffoldReady: false,
      implementReady: false,
      deliveryReady: false,
      goMarker: null,
      scaffoldManifest: null,
      implementManifest: null,
      deliveryReport: null,
      deliveryDecision: null
    },
    amendment: null,
    feedback: null,
    features: null,
    projectVersion: null,
    nextStep: null,
    recommendedCommand: null,
    nextStepMessage: null,
    confidence: {
      model: "v1-weighted-spec-runtime",
      score: 0,
      level: "low",
      weights: {
        specIntegrity: 0.4,
        runtimeVerification: 0.6
      },
      components: {
        specIntegrity: 0,
        runtimeVerification: 0
      },
      details: {
        specIntegrity: {
          artifactCoverage: 0,
          traceabilityScore: 0,
          validationIssueCount: 0
        }
      },
      releaseReady: false,
      reasons: {
        specIntegrity: "No approved spec context available yet.",
        runtimeVerification: "Runtime verification evidence is missing."
      }
    }
  };

  if (selectionIssue) {
    report.validation.ok = false;
    report.validation.issues.push(selectionIssue.message);
    report.nextStep = "aitri status --feature <name>";
    report.recommendedCommand = "aitri status --feature <name>";
    report.nextStepMessage = selectionIssue.message;
    report.handoff = {
      required: false,
      state: "selection_required",
      message: selectionIssue.message,
      nextActions: ["Select feature context with --feature <name>."]
    };
    report.confidence = buildConfidenceReport(report);
    return report;
  }

  if (selectedContext === "approved" && approvedSpecFile) {
    const feature = report.approvedSpec.feature;
    const discoveryFile = paths.discoveryFile(feature);
    const planFile = paths.planFile(feature);
    const backlogFile = paths.backlogFile(feature);
    const testsFile = paths.testsFile(feature);
    const specFile = paths.approvedSpecFile(feature);

    report.artifacts.discovery = exists(discoveryFile);
    report.artifacts.plan = exists(planFile);
    report.artifacts.backlog = exists(backlogFile);
    report.artifacts.tests = exists(testsFile);

    if (exists(specFile) && exists(backlogFile) && exists(testsFile)) {
      const spec = fs.readFileSync(specFile, "utf8");
      const backlog = fs.readFileSync(backlogFile, "utf8");
      const tests = fs.readFileSync(testsFile, "utf8");
      const discovery = exists(discoveryFile) ? fs.readFileSync(discoveryFile, "utf8") : "";
      const plan = exists(planFile) ? fs.readFileSync(planFile, "utf8") : "";

      report.validation.issues = collectValidationIssues(spec, backlog, tests, discovery, plan);
      report.validation.ok = report.validation.issues.length === 0;
    } else {
      if (!exists(specFile)) report.validation.issues.push(`Missing approved spec: ${path.relative(root, specFile)}`);
      if (!exists(backlogFile)) report.validation.issues.push(`Missing backlog: ${path.relative(root, backlogFile)}`);
      if (!exists(testsFile)) report.validation.issues.push(`Missing tests: ${path.relative(root, testsFile)}`);
      report.validation.ok = false;
    }

    report.verification = detectVerificationState(root, paths, feature);

    const goMarkerFile = paths.goMarkerFile(feature);
    const scaffoldManifestFile = path.join(paths.implementationFeatureDir(feature), "scaffold-manifest.json");
    const implementManifestFile = path.join(paths.implementationFeatureDir(feature), "implement-manifest.json");
    const buildManifestFile = paths.buildManifestFile(feature);
    const deliveryReportFile = paths.deliveryJsonFile(feature);
    const deliveryPayload = exists(deliveryReportFile) ? readJsonSafe(deliveryReportFile) : null;
    report.factory = {
      goCompleted: exists(goMarkerFile),
      scaffoldReady: exists(scaffoldManifestFile),
      implementReady: exists(implementManifestFile),
      buildReady: exists(buildManifestFile),
      deliveryReady: deliveryPayload?.decision === "SHIP",
      goMarker: exists(goMarkerFile) ? path.relative(root, goMarkerFile) : null,
      scaffoldManifest: exists(scaffoldManifestFile) ? path.relative(root, scaffoldManifestFile) : null,
      implementManifest: exists(implementManifestFile) ? path.relative(root, implementManifestFile) : null,
      buildManifest: exists(buildManifestFile) ? path.relative(root, buildManifestFile) : null,
      deliveryReport: exists(deliveryReportFile) ? path.relative(root, deliveryReportFile) : null,
      deliveryDecision: deliveryPayload?.decision || null
    };

    // Amendment state (Phase I.2)
    const staleFile = paths.staleMarkerFile(feature);
    report.amendment = exists(staleFile) ? (readJsonSafe(staleFile) || { feature, stale: true }) : null;

    // Feedback summary (Phase I.3)
    const fbFile = paths.feedbackFile(feature);
    const fbEntries = readJsonSafe(fbFile)?.entries || [];
    report.feedback = {
      total: fbEntries.length,
      open: fbEntries.filter((e) => e.resolution === null).length,
      resolved: fbEntries.filter((e) => e.resolution !== null).length
    };

    report.nextStep = computeNextStep({
      missingDirs,
      approvedSpecFound: true,
      discoveryExists: report.artifacts.discovery,
      planExists: report.artifacts.plan,
      validateOk: report.validation.ok,
      verifyOk: report.verification.ok,
      goCompleted: report.factory.goCompleted,
      scaffoldReady: report.factory.scaffoldReady,
      implementReady: report.factory.implementReady,
      buildReady: report.factory.buildReady,
      deliveryReady: report.factory.deliveryReady,
      verification: report.verification
    });
  } else if (selectedContext === "draft" && selectedFeature) {
    report.nextStep = "aitri approve";
    report.recommendedCommand = `aitri approve --feature ${selectedFeature}`;
    report.nextStepMessage = "A draft spec is available. Run approve to pass gates and move it to approved specs.";
  } else {
    report.nextStep = computeNextStep({
      missingDirs,
      approvedSpecFound: false,
      discoveryExists: false,
      planExists: false,
      validateOk: false,
      verifyOk: false,
      goCompleted: false,
      scaffoldReady: false,
      implementReady: false,
      buildReady: false,
      deliveryReady: false,
      verification: null
    });
  }

  if (report.nextStep === "ready_for_human_approval") {
    report.handoff = {
      required: true,
      state: "awaiting_human_approval",
      message: "SDLC artifact flow is complete. Human approval is required before implementation.",
      nextActions: [
        "Review approved spec, discovery, plan, backlog, and tests.",
        "Decide go/no-go for implementation.",
        "Create a checkpoint commit before starting implementation."
      ]
    };
  } else {
    report.handoff = {
      required: false,
      state: "in_progress",
      message: "Continue with nextStep.",
      nextActions: [report.nextStep]
    };
  }

  report.recommendedCommand = report.recommendedCommand || toRecommendedCommand(report.nextStep);
  report.nextStepMessage = report.nextStepMessage || nextStepMessage(report.nextStep);
  report.confidence = buildConfidenceReport(report);

  // Project-wide features summary (Phase I.1)
  const allFeatures = scanAllFeatures(paths);
  report.features = {
    total: allFeatures.length,
    delivered: allFeatures.filter((f) => f.state === "delivered").length,
    inProgress: allFeatures.filter((f) => !["delivered", "draft"].includes(f.state)).length,
    draft: allFeatures.filter((f) => f.state === "draft").length,
    list: allFeatures.map((f) => ({ name: f.name, state: f.state }))
  };

  // Project version info (Phase K)
  const projectJsonFile = path.join(paths.docsRoot, "project.json");
  const projectData = exists(projectJsonFile) ? readJsonSafe(projectJsonFile) : null;
  const installedVersion = readCurrentVersion();
  report.projectVersion = {
    aitriVersion: installedVersion,
    currentVersion: projectData?.aitriVersion || null,
    upgradeAvailable: !!(installedVersion && projectData?.aitriVersion && installedVersion !== projectData.aitriVersion)
  };

  return report;
}

export function runStatus(options = {}) {
  const { json = false, ui = false, openUi = true, root = process.cwd(), feature = null } = options;
  const report = getStatusReport({ root, feature });
  const ok = !report.selection.issue;

  if (ui) {
    const uiInfo = writeStatusInsight(report);
    if (json) {
      console.log(JSON.stringify({
        ok,
        ...report,
        ui: {
          enabled: true,
          file: uiInfo.file,
          generatedAt: uiInfo.generatedAt
        }
      }, null, 2));
      return ok;
    }
    console.log("Aitri Status UI generated ✅");
    console.log(`- File: ${uiInfo.file}`);
    console.log(`- Generated at: ${uiInfo.generatedAt}`);
    console.log(`- Open: ${uiInfo.file}`);
    if (openUi) {
      const opened = openStatusInsight(root, uiInfo.file);
      if (!opened) {
        console.log("- Browser auto-open failed. Open the file manually from the path above.");
      }
    }
    if (!ok) {
      console.log(`- Status blocked: ${report.selection.message}`);
      if (report.selection.availableFeatures.length > 0) {
        console.log(`- Available features: ${report.selection.availableFeatures.join(", ")}`);
      }
    }
    return ok;
  }

  if (json) {
    console.log(JSON.stringify({ ok, ...report }, null, 2));
    return ok;
  }

  console.log("Aitri Project Status ⚒️\n");
  if (report.config.loaded) {
    console.log(`✔ Config loaded: ${report.config.file}`);
    console.log(
      `  paths specs=${report.config.paths.specs} backlog=${report.config.paths.backlog} tests=${report.config.paths.tests} docs=${report.config.paths.docs}`
    );
  }

  if (report.structure.ok) {
    console.log("✔ Structure initialized");
  } else {
    console.log("✖ Missing structure:", report.structure.missingDirs.join(", "));
  }

  if (!report.approvedSpec.found) {
    if (report.selection.issue) {
      console.log(`✖ ${report.selection.message}`);
      if (report.selection.availableFeatures.length > 0) {
        console.log(`- Available features: ${report.selection.availableFeatures.join(", ")}`);
      }
      if (report.selection.availableDraftFeatures.length > 0) {
        console.log(`- Available draft features: ${report.selection.availableDraftFeatures.join(", ")}`);
      }
      return false;
    }
    if (report.draftSpec.found) {
      console.log(`⚠ Draft spec found (not approved): ${report.draftSpec.feature}`);
    } else {
      console.log("✖ No approved specs found");
    }
    console.log("\nNext recommended step:");
    console.log(`- State: ${report.nextStep}`);
    console.log(`- Run: ${report.recommendedCommand}`);
    console.log(`- Why: ${report.nextStepMessage}`);
    return ok;
  }

  console.log(`✔ Approved spec found: ${report.approvedSpec.feature}`);
  console.log(report.artifacts.discovery ? "✔ Discovery exists" : "✖ Discovery not generated");
  console.log(report.artifacts.plan ? "✔ Plan exists" : "✖ Plan not generated");

  if (report.validation.ok) {
    console.log("✔ Validation likely passed");
  } else {
    console.log("✖ Validation not passed");
  }

  if (report.verification.ok) {
    console.log("✔ Runtime verification passed");
  } else if (report.verification.status === "stale") {
    console.log("✖ Runtime verification is stale");
  } else if (report.verification.status === "failed") {
    console.log("✖ Runtime verification failed");
  } else {
    console.log("✖ Runtime verification missing");
  }

  console.log("\nConfidence score:");
  console.log(`- Score: ${report.confidence.score}% (${report.confidence.level})`);
  console.log(`- Spec integrity: ${report.confidence.components.specIntegrity}%`);
  console.log(`- Runtime verification: ${report.confidence.components.runtimeVerification}%`);

  console.log("\nNext recommended step:");
  if (report.nextStep === "ready_for_human_approval") {
    console.log("✅ Ready for human approval");
    console.log(`- Run: ${report.recommendedCommand}`);
    console.log("- Why: SDLC artifact flow is complete and waiting for explicit human decision.");
  } else {
    console.log(`- State: ${report.nextStep}`);
    console.log(`- Run: ${report.recommendedCommand}`);
    console.log(`- Why: ${report.nextStepMessage}`);
  }

  console.log("\nCheckpoint recommendation:");
  console.log(`- Commit: ${report.checkpoint.command}`);
  console.log(`- Fallback: ${report.checkpoint.fallback}`);
  if (report.checkpoint.state.git) {
    if (report.checkpoint.state.detected) {
      console.log("- Checkpoint detected:");
      if (report.checkpoint.state.latestCommit) {
        console.log(
          `  commit ${report.checkpoint.state.latestCommit.hash} ${report.checkpoint.state.latestCommit.message}`
        );
      }
      if (report.checkpoint.state.latestStash) {
        console.log(
          `  stash ${report.checkpoint.state.latestStash.ref} ${report.checkpoint.state.latestStash.message}`
        );
      }
      console.log("- Resume decision required: ask user to continue from checkpoint (yes/no).");
    } else {
      console.log("- No existing checkpoint detected in git history/stash.");
    }
  }

  return ok;
}
