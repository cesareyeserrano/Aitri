import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getStatusReport } from "./status.js";
import { resolveFeature } from "../lib.js";
import { parseApprovedSpec } from "./spec-parser.js";
import { checkContractCoverage } from "./verify-coverage.js";

function wantsJson(options, positional = []) {
  if (options.json) return true;
  if ((options.format || "").toLowerCase() === "json") return true;
  return positional.some((p) => p.toLowerCase() === "json");
}

function parseTraceIds(traceLine, prefix) {
  return [...new Set(
    [...String(traceLine || "").matchAll(new RegExp(`\\b${prefix}-\\d+\\b`, "g"))]
      .map((match) => match[0])
  )];
}

function parseTcTraceMap(testsContent) {
  const blocks = [...String(testsContent || "").matchAll(/###\s*(TC-\d+)([\s\S]*?)(?=\n###\s*TC-\d+|$)/g)];
  const map = {};
  blocks.forEach((match) => {
    const tcId = match[1];
    const body = match[2];
    const traceLine = (body.match(/-\s*Trace:\s*([^\n]+)/i) || [null, ""])[1];
    map[tcId] = {
      frIds: parseTraceIds(traceLine, "FR"),
      usIds: parseTraceIds(traceLine, "US"),
      acIds: parseTraceIds(traceLine, "AC")
    };
  });
  return map;
}

function parseSpecFr(specContent) {
  return [...new Set(
    [...String(specContent || "").matchAll(/\bFR-\d+\b/g)]
      .map((match) => match[0])
  )];
}

function parseSpecAc(specContent) {
  return [...new Set(
    [...String(specContent || "").matchAll(/\bAC-\d+\b/g)]
      .map((match) => match[0])
  )];
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function createReleaseTag(feature, root) {
  const check = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  if (check.status !== 0) return { ok: false, tag: null, reason: "Not inside a git repository." };
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tag = `aitri-release/${feature}-${timestamp}`;
  const result = spawnSync("git", ["tag", tag, "HEAD"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return { ok: false, tag, reason: result.stderr || "git tag failed." };
  return { ok: true, tag, reason: null };
}

function detectBuildCommand(root) {
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.scripts?.build) return "npm run build";
    } catch { /* ignore */ }
  }
  if (fs.existsSync(path.join(root, "Makefile"))) {
    const content = fs.readFileSync(path.join(root, "Makefile"), "utf8");
    if (/^build\s*:/m.test(content)) return "make build";
  }
  return null;
}

function buildMarkdownReport(payload) {
  const blockedLines = payload.blockers.length > 0
    ? payload.blockers.map((line) => `- ${line}`).join("\n")
    : "- None";
  const frRows = payload.frMatrix.map((row) => `- ${row.frId}: passingTC=${row.passingTc.join(", ") || "none"} | uncovered=${row.covered ? "no" : "yes"}`).join("\n");
  const acRows = (payload.acMatrix || []).map((row) => `- ${row.acId}: passingTC=${row.passingTc.join(", ") || "none"} | uncovered=${row.covered ? "no" : "yes"}`).join("\n");
  const uiRefRows = (payload.uiRefValidation || []).map((ref) => `- ${ref.id}: ${ref.path} | exists=${ref.fileExists ? "yes" : "no"} | ACs=${ref.acIds.join(", ") || "none"}`).join("\n");
  const uiRefSection = uiRefRows
    ? `\n## UI Reference Validation\n${uiRefRows}\n`
    : "";

  return `# Delivery Report: ${payload.feature}

Decision: ${payload.decision}
Generated at: ${payload.generatedAt}

## Confidence
- Score: ${Math.round(payload.confidence.score * 100)}%
- Threshold: ${Math.round(payload.confidence.threshold * 100)}%
- Pass: ${payload.confidence.pass ? "yes" : "no"}

## TC Summary
- Declared: ${payload.tcSummary.declared}
- Executable: ${payload.tcSummary.executable}
- Passing: ${payload.tcSummary.passing}
- Failing: ${payload.tcSummary.failing}
- Missing: ${payload.tcSummary.missing}

## FR Coverage Matrix
${frRows || "- No FR data available."}

## AC Coverage Matrix
${acRows || "- No AC data available."}
${uiRefSection}
## Timeline
- go: ${payload.timeline.go || "missing"}
- scaffold: ${payload.timeline.scaffold || "missing"}
- implement: ${payload.timeline.implement || "missing"}
- verify: ${payload.timeline.verify || "missing"}
- deliver: ${payload.generatedAt}

## Blockers
${blockedLines}
`;
}

export async function runDeliverCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const jsonOutput = wantsJson(options, options.positional);
  const project = getProjectContextOrExit();

  let feature;
  try {
    feature = resolveFeature(options, getStatusReportOrExit);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feature resolution failed.";
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature: null, issues: [message] }, null, 2));
    } else {
      console.log(message);
    }
    return ERROR;
  }

  const goMarkerFile = project.paths.goMarkerFile(feature);
  const scaffoldManifestFile = path.join(project.paths.implementationFeatureDir(feature), "scaffold-manifest.json");
  const implementManifestFile = path.join(project.paths.implementationFeatureDir(feature), "implement-manifest.json");
  const verifyFile = project.paths.verificationFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const specFile = project.paths.approvedSpecFile(feature);

  const requiredFiles = [goMarkerFile, scaffoldManifestFile, implementManifestFile, verifyFile, testsFile, specFile];
  const missing = requiredFiles.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    const issues = missing.map((file) => `Missing required artifact: ${path.relative(process.cwd(), file)}`);
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature, issues }, null, 2));
    } else {
      console.log("DELIVER BLOCKED: required artifacts are missing.");
      issues.forEach((issue) => console.log(`- ${issue}`));
    }
    return ERROR;
  }

  const verifyPayload = readJson(verifyFile);
  if (!verifyPayload) {
    const issue = "Verification evidence is invalid JSON.";
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature, issues: [issue] }, null, 2));
    } else {
      console.log(`DELIVER BLOCKED: ${issue}`);
    }
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const testsContent = fs.readFileSync(testsFile, "utf8");
  const traceMap = parseTcTraceMap(testsContent);
  const specFr = parseSpecFr(specContent);
  const specAc = parseSpecAc(specContent);
  const tcCoverage = verifyPayload.tcCoverage || {
    declared: 0,
    executable: 0,
    passing: 0,
    failing: 0,
    missing: 0
  };
  const passingTc = tcCoverage.mode === "scaffold"
    ? Object.entries(tcCoverage.mapped || {})
      .filter(([, value]) => value && value.found && verifyPayload.ok === true)
      .map(([tcId]) => tcId)
    : [];

  const frMatrix = specFr.map((frId) => {
    const relatedTc = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.frIds || []).includes(frId));
    const passingForFr = relatedTc.filter((tcId) => passingTc.includes(tcId));
    return {
      frId,
      tc: relatedTc,
      passingTc: passingForFr,
      covered: passingForFr.length > 0
    };
  });

  const acMatrix = specAc.map((acId) => {
    const relatedTc = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.acIds || []).includes(acId));
    const passingForAc = relatedTc.filter((tcId) => passingTc.includes(tcId));
    return {
      acId,
      tc: relatedTc,
      passingTc: passingForAc,
      covered: passingForAc.length > 0
    };
  });

  const parsedSpec = parseApprovedSpec(specContent, { feature });
  const uiRefValidation = (parsedSpec.uiStructure?.refs || []).map((ref) => ({
    id: ref.id,
    path: ref.path,
    fileExists: fs.existsSync(path.join(process.cwd(), ref.path)),
    acIds: ref.acIds
  }));

  const status = getStatusReport({
    root: process.cwd(),
    feature
  });
  const threshold = Number(project.config.delivery?.confidenceThreshold ?? 0.85);
  const confidenceScore = Number(status.confidence?.score ?? 0) / 100;
  const blockers = [];
  if (tcCoverage.mode !== "scaffold") {
    blockers.push("Verification must include scaffold tcCoverage mapping.");
  }
  if (Number(tcCoverage.missing || 0) > 0) {
    blockers.push(`There are ${tcCoverage.missing} TC entries without executable test stubs.`);
  }
  if (Number(tcCoverage.failing || 0) > 0) {
    blockers.push(`There are ${tcCoverage.failing} failing executable TCs.`);
  }
  const uncoveredFr = frMatrix.filter((row) => !row.covered).map((row) => row.frId);
  if (uncoveredFr.length > 0) {
    blockers.push(`Uncovered FRs: ${uncoveredFr.join(", ")}`);
  }
  const uncoveredAc = acMatrix.filter((row) => !row.covered).map((row) => row.acId);
  if (uncoveredAc.length > 0) {
    blockers.push(`Uncovered ACs: ${uncoveredAc.join(", ")}`);
  }
  uiRefValidation.filter((ref) => !ref.fileExists).forEach((ref) => {
    blockers.push(`UI-REF ${ref.id} references missing file: ${ref.path}`);
  });
  if (confidenceScore < threshold) {
    blockers.push(`Confidence score ${Math.round(confidenceScore * 100)}% is below threshold ${Math.round(threshold * 100)}%.`);
  }

  // EVO-012: contract coverage warning (non-blocking)
  const scaffoldManifestData = readJson(scaffoldManifestFile) || {};
  const coverageResult = checkContractCoverage({ root: process.cwd(), manifest: scaffoldManifestData });
  const warnings = coverageResult.ok || coverageResult.total === 0 ? [] : [
    `Contract coverage: ${coverageResult.covered}/${coverageResult.total} contracts imported. Uncovered: ${coverageResult.uncovered.join(", ")}`
  ];

  // EVO-013: proof of compliance advisory (non-blocking)
  const proofFile = path.join(project.paths.implementationFeatureDir(feature), "proof-of-compliance.json");
  const proofRecord = readJson(proofFile);
  if (!proofRecord) {
    warnings.push("No proof-of-compliance record found. Run: aitri prove --feature " + feature);
  } else if (!proofRecord.ok) {
    warnings.push(`Proof of compliance: ${proofRecord.summary?.proven || 0}/${proofRecord.summary?.total || 0} FRs proven. Re-run: aitri prove --feature ${feature}`);
  }

  const decision = blockers.length === 0 ? "SHIP" : "BLOCKED";
  const generatedAt = new Date().toISOString();
  const goMarker = readJson(goMarkerFile) || {};
  const scaffoldManifest = scaffoldManifestData;
  const implementManifest = readJson(implementManifestFile) || {};
  const payload = {
    schemaVersion: 1,
    ok: decision === "SHIP",
    feature,
    decision,
    generatedAt,
    confidence: {
      score: confidenceScore,
      threshold,
      pass: confidenceScore >= threshold
    },
    tcSummary: {
      declared: Number(tcCoverage.declared || 0),
      executable: Number(tcCoverage.executable || 0),
      passing: Number(tcCoverage.passing || 0),
      failing: Number(tcCoverage.failing || 0),
      missing: Number(tcCoverage.missing || 0)
    },
    frMatrix,
    acMatrix,
    uiRefValidation,
    blockers,
    warnings,
    timeline: {
      go: goMarker.decidedAt || null,
      scaffold: scaffoldManifest.generatedAt || null,
      implement: implementManifest.generatedAt || null,
      verify: verifyPayload.finishedAt || null
    },
    evidence: {
      verification: path.relative(process.cwd(), verifyFile),
      scaffold: path.relative(process.cwd(), scaffoldManifestFile),
      implement: path.relative(process.cwd(), implementManifestFile),
      go: path.relative(process.cwd(), goMarkerFile)
    }
  };

  const reportJsonFile = project.paths.deliveryJsonFile(feature);
  const reportMdFile = project.paths.deliveryReportFile(feature);
  if (!jsonOutput) {
    console.log("PLAN:");
    console.log("- Read: " + path.relative(process.cwd(), verifyFile));
    console.log("- Read: " + path.relative(process.cwd(), testsFile));
    console.log("- Read: " + path.relative(process.cwd(), specFile));
    console.log("- Write: " + path.relative(process.cwd(), reportJsonFile));
    console.log("- Write: " + path.relative(process.cwd(), reportMdFile));
  }

  if (decision === "SHIP") {
    const tagResult = createReleaseTag(feature, process.cwd());
    payload.releaseTag = tagResult.ok ? tagResult.tag : null;
    payload.releaseTagError = tagResult.ok ? null : tagResult.reason;

    const buildCmd = detectBuildCommand(process.cwd());
    if (buildCmd && !options.noBuild) {
      const parts = buildCmd.split(/\s+/);
      const buildResult = spawnSync(parts[0], parts.slice(1), { cwd: process.cwd(), encoding: "utf8" });
      payload.buildExitCode = buildResult.status;
    }
  }

  fs.mkdirSync(path.dirname(reportJsonFile), { recursive: true });
  fs.writeFileSync(reportJsonFile, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(reportMdFile, buildMarkdownReport(payload), "utf8");

  if (jsonOutput) {
    console.log(JSON.stringify({
      ...payload,
      reportJson: path.relative(process.cwd(), reportJsonFile),
      reportMarkdown: path.relative(process.cwd(), reportMdFile)
    }, null, 2));
  } else {
    console.log(`Delivery decision: ${decision}`);
    console.log(`- Feature: ${feature}`);
    console.log(`- JSON report: ${path.relative(process.cwd(), reportJsonFile)}`);
    console.log(`- Markdown report: ${path.relative(process.cwd(), reportMdFile)}`);
    if (payload.releaseTag) {
      console.log(`- Release tag: ${payload.releaseTag}`);
    }
    if (blockers.length > 0) {
      blockers.forEach((line) => console.log(`- Blocker: ${line}`));
    }
  }

  return decision === "SHIP" ? OK : ERROR;
}
