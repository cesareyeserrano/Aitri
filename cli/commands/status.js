import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadAitriConfig, resolveProjectPaths } from "../config.js";

function exists(p) {
  return fs.existsSync(p);
}

function listMd(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
}

function firstOrNull(arr) {
  return arr.length > 0 ? arr[0] : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSection(content, heading) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n##\\s+\\d+\\.|$)`, "i");
  const match = content.match(pattern);
  return match ? match[1] : "";
}

function getSubsection(content, heading) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n###\\s+|$)`, "i");
  const match = content.match(pattern);
  return match ? match[1] : "";
}

function hasMeaningfulContent(content) {
  const lines = String(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.some((line) => {
    if (/^###\s+/.test(line)) return false;
    const cleaned = line
      .replace(/^[-*]\s*/, "")
      .replace(/^\d+\)\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();
    if (!cleaned || cleaned === "-") return false;
    if (cleaned.length < 6) return false;
    if (/^<.*>$/.test(cleaned)) return false;
    if (/\b(TBD|Not specified|pending|to be refined|to be confirmed)\b/i.test(cleaned)) return false;
    return true;
  });
}

function collectPersonaIssues(discovery, plan) {
  const issues = [];

  if (discovery) {
    const discoveryInterview = getSection(discovery, "## 2. Discovery Interview Summary (Discovery Persona)");
    if (!discoveryInterview) {
      issues.push("Persona gate: Discovery section is missing `## 2. Discovery Interview Summary (Discovery Persona)`.");
    } else if (!hasMeaningfulContent(discoveryInterview)) {
      issues.push("Persona gate: Discovery interview summary is unresolved.");
    }

    const discoveryConfidence = getSection(discovery, "## 9. Discovery Confidence");
    if (!discoveryConfidence) {
      issues.push("Persona gate: Discovery section is missing `## 9. Discovery Confidence`.");
    } else if (/- Confidence:\s*\n-\s*Low\b/i.test(discoveryConfidence)) {
      issues.push("Persona gate: Discovery confidence is Low. Resolve evidence gaps before handoff.");
    }
  }

  if (plan) {
    const product = getSection(plan, "## 4. Product Review (Product Persona)");
    if (!product) {
      issues.push("Persona gate: Plan is missing `## 4. Product Review (Product Persona)`.");
    } else {
      const businessValue = getSubsection(product, "### Business value");
      const successMetric = getSubsection(product, "### Success metric");
      const assumptions = getSubsection(product, "### Assumptions to validate");
      if (!hasMeaningfulContent(businessValue)) issues.push("Persona gate: Product `Business value` is unresolved.");
      if (!hasMeaningfulContent(successMetric)) issues.push("Persona gate: Product `Success metric` is unresolved.");
      if (!hasMeaningfulContent(assumptions)) issues.push("Persona gate: Product `Assumptions to validate` is unresolved.");
    }

    const architecture = getSection(plan, "## 5. Architecture (Architect Persona)");
    if (!architecture) {
      issues.push("Persona gate: Plan is missing `## 5. Architecture (Architect Persona)`.");
    } else {
      const components = getSubsection(architecture, "### Components");
      const dataFlow = getSubsection(architecture, "### Data flow");
      const keyDecisions = getSubsection(architecture, "### Key decisions");
      const risks = getSubsection(architecture, "### Risks & mitigations");
      const observability = getSubsection(architecture, "### Observability (logs/metrics/tracing)");
      if (!hasMeaningfulContent(components)) issues.push("Persona gate: Architect `Components` is unresolved.");
      if (!hasMeaningfulContent(dataFlow)) issues.push("Persona gate: Architect `Data flow` is unresolved.");
      if (!hasMeaningfulContent(keyDecisions)) issues.push("Persona gate: Architect `Key decisions` is unresolved.");
      if (!hasMeaningfulContent(risks)) issues.push("Persona gate: Architect `Risks & mitigations` is unresolved.");
      if (!hasMeaningfulContent(observability)) issues.push("Persona gate: Architect `Observability` is unresolved.");
    }
  }

  return issues;
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
    collectPersonaIssues(discovery, plan).forEach((issue) => issues.push(issue));
  }

  return issues;
}

function computeNextStep({ missingDirs, approvedSpecFound, discoveryExists, planExists, validateOk, verifyOk }) {
  if (missingDirs.length > 0) return "aitri init";
  if (!approvedSpecFound) return "aitri draft";
  if (!discoveryExists) return "aitri discover";
  if (!planExists) return "aitri plan";
  if (!validateOk) return "aitri validate";
  if (!verifyOk) return "aitri verify";
  return "ready_for_human_approval";
}

function toRecommendedCommand(nextStep) {
  if (!nextStep) return null;
  if (nextStep === "ready_for_human_approval") return "aitri handoff";
  return nextStep;
}

function nextStepMessage(nextStep) {
  if (!nextStep) return "No next step detected.";
  if (nextStep === "ready_for_human_approval") {
    return "SDLC artifacts are complete. Human go/no-go approval is required.";
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
    return { score: 100, reason: "Runtime verification is not required." };
  }

  if (verification.ok) {
    return { score: 100, reason: "Runtime verification passed with current evidence." };
  }

  switch (verification.status) {
    case "stale":
      return { score: 55, reason: "Runtime evidence is stale and must be re-verified." };
    case "failed":
      return { score: 25, reason: "Runtime verification failed." };
    case "invalid":
      return { score: 10, reason: "Runtime evidence is invalid or unreadable." };
    case "missing":
    default:
      return { score: 0, reason: "Runtime verification evidence is missing." };
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
      specIntegrity: spec.details
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
    exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
    finishedAt: payload.finishedAt || null,
    reason: stale ? "verification_stale" : (payload.reason || null)
  };
}

export function getStatusReport(options = {}) {
  const { root = process.cwd() } = options;
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
  const approvedSpecFile = firstOrNull(approvedSpecs);

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
      feature: approvedSpecFile ? approvedSpecFile.replace(".md", "") : null,
      file: approvedSpecFile ? path.relative(root, path.join(approvedDir, approvedSpecFile)) : null
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

  if (approvedSpecFile) {
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

    report.nextStep = computeNextStep({
      missingDirs,
      approvedSpecFound: true,
      discoveryExists: report.artifacts.discovery,
      planExists: report.artifacts.plan,
      validateOk: report.validation.ok,
      verifyOk: report.verification.ok
    });
  } else {
    report.nextStep = computeNextStep({
      missingDirs,
      approvedSpecFound: false,
      discoveryExists: false,
      planExists: false,
      validateOk: false,
      verifyOk: false
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

  report.recommendedCommand = toRecommendedCommand(report.nextStep);
  report.nextStepMessage = nextStepMessage(report.nextStep);
  report.confidence = buildConfidenceReport(report);

  return report;
}

export function runStatus(options = {}) {
  const { json = false, ui = false, root = process.cwd() } = options;
  const report = getStatusReport({ root });

  if (ui) {
    const uiInfo = writeStatusInsight(report);
    if (json) {
      console.log(JSON.stringify({
        ...report,
        ui: {
          enabled: true,
          file: uiInfo.file,
          generatedAt: uiInfo.generatedAt
        }
      }, null, 2));
      return;
    }
    console.log("Aitri Status UI generated ✅");
    console.log(`- File: ${uiInfo.file}`);
    console.log(`- Generated at: ${uiInfo.generatedAt}`);
    console.log(`- Open: ${uiInfo.file}`);
    return;
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
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
    console.log("✖ No approved specs found");
    console.log("\nNext recommended step:");
    console.log(`- State: ${report.nextStep}`);
    console.log(`- Run: ${report.recommendedCommand}`);
    console.log(`- Why: ${report.nextStepMessage}`);
    return;
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
}
