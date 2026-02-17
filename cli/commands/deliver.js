import fs from "node:fs";
import path from "node:path";
import { getStatusReport } from "./status.js";
import { resolveFeature } from "../lib.js";

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

function buildMarkdownReport(payload) {
  const blockedLines = payload.blockers.length > 0
    ? payload.blockers.map((line) => `- ${line}`).join("\n")
    : "- None";
  const frRows = payload.frMatrix.map((row) => `- ${row.frId}: passingTC=${row.passingTc.join(", ") || "none"} | uncovered=${row.covered ? "no" : "yes"}`).join("\n");
  const acRows = (payload.acMatrix || []).map((row) => `- ${row.acId}: passingTC=${row.passingTc.join(", ") || "none"} | uncovered=${row.covered ? "no" : "yes"}`).join("\n");
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
  confirmProceed,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
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
  if (confidenceScore < threshold) {
    blockers.push(`Confidence score ${Math.round(confidenceScore * 100)}% is below threshold ${Math.round(threshold * 100)}%.`);
  }

  const decision = blockers.length === 0 ? "SHIP" : "BLOCKED";
  const generatedAt = new Date().toISOString();
  const goMarker = readJson(goMarkerFile) || {};
  const scaffoldManifest = readJson(scaffoldManifestFile) || {};
  const implementManifest = readJson(implementManifestFile) || {};
  const payload = {
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
    blockers,
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

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
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
    if (blockers.length > 0) {
      blockers.forEach((line) => console.log(`- Blocker: ${line}`));
    }
  }

  return decision === "SHIP" ? OK : ERROR;
}
