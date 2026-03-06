import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveFeature } from "../lib.js";
import { parseApprovedSpec } from "./spec-parser.js";
import { checkContractCoverage } from "./verify-coverage.js";
import {
  wantsJson, parseTcTraceMap, parseSpecFr, parseSpecAc, readJson,
  createReleaseTag, checkWorkspaceHygiene, extractManifestPaths,
  detectBuildCommand, buildMarkdownReport, collectDeliveryGates
} from "../lib/deliver-utils.js";

// Re-export for tests that import from deliver.js directly
export { checkWorkspaceHygiene, extractManifestPaths, readJson, parseTcTraceMap, parseSpecFr, parseSpecAc };

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

  // EVO-068+089: workspace hygiene gate
  const _scaffoldManifestFileEarly = path.join(project.paths.implementationFeatureDir(feature), "scaffold-manifest.json");
  const _implementManifestFileEarly = path.join(project.paths.implementationFeatureDir(feature), "implement-manifest.json");
  const _scaffoldDataEarly = readJson(_scaffoldManifestFileEarly) || {};
  const _implementDataEarly = readJson(_implementManifestFileEarly) || {};
  const _manifestPaths = [...extractManifestPaths(_scaffoldDataEarly), ...extractManifestPaths(_implementDataEarly)];
  const _extraOwnedPaths = (project.config.delivery?.extraOwnedPaths || []).map((p) => p.endsWith("/") ? p : `${p}/`);
  const hygiene = checkWorkspaceHygiene(process.cwd(), feature, { extraOwnedPaths: _extraOwnedPaths, manifestPaths: _manifestPaths });
  if (!hygiene.ok) {
    const canProceed = options.yes || options.nonInteractive;
    if (!canProceed) {
      const msg = [
        `DELIVER BLOCKED: Unrelated dirty files in workspace (${hygiene.unrelated.length}):`,
        ...hygiene.unrelated.map((f) => `  - ${f}`),
        "Stage feature-only changes and stash the rest before delivery.",
      ];
      if (jsonOutput) {
        console.log(JSON.stringify({ ok: false, feature, issues: msg }, null, 2));
      } else {
        msg.forEach((l) => console.log(l));
      }
      return ERROR;
    }
    if (!jsonOutput) {
      console.log(`WARN: ${hygiene.unrelated.length} unrelated dirty file(s) in workspace — proceeding (--yes).`);
      hygiene.unrelated.forEach((f) => console.log(`  - ${f}`));
    }
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
  const tcCoverage = verifyPayload.tcCoverage || { declared: 0, executable: 0, passing: 0, failing: 0, missing: 0 };
  const passingTc = tcCoverage.mode === "scaffold"
    ? Object.entries(tcCoverage.mapped || {})
      .filter(([, value]) => value && value.found && verifyPayload.ok === true)
      .map(([tcId]) => tcId)
    : [];

  const frMatrix = specFr.map((frId) => {
    const relatedTc = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.frIds || []).includes(frId));
    const passingForFr = relatedTc.filter((tcId) => passingTc.includes(tcId));
    return { frId, tc: relatedTc, passingTc: passingForFr, covered: passingForFr.length > 0 };
  });

  const acMatrix = specAc.map((acId) => {
    const relatedTc = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.acIds || []).includes(acId));
    const passingForAc = relatedTc.filter((tcId) => passingTc.includes(tcId));
    return { acId, tc: relatedTc, passingTc: passingForAc, covered: passingForAc.length > 0 };
  });

  const parsedSpec = parseApprovedSpec(specContent, { feature });
  const uiRefValidation = (parsedSpec.uiStructure?.refs || []).map((ref) => ({
    id: ref.id, path: ref.path, fileExists: fs.existsSync(path.join(process.cwd(), ref.path)), acIds: ref.acIds
  }));
  uiRefValidation.filter((ref) => !ref.fileExists).forEach((ref) => {
    // UI-REF blockers are collected by gates below
  });

  const status = getStatusReportOrExit({ root: process.cwd(), feature });
  const threshold = Number(project.config.delivery?.confidenceThreshold ?? 0.85);
  const confidenceScore = Number(status.confidence?.score ?? 0) / 100;

  const qaReportPath = path.join(process.cwd(), ".aitri/qa-report.md");
  const qaContent = fs.existsSync(qaReportPath) ? fs.readFileSync(qaReportPath, "utf8") : null;
  let qaOk = false;
  if (qaContent) {
    const qaFails = qaContent.split("\n").filter((l) => /^-\s+AC-\d+:\s+FAIL/i.test(l.trim()));
    const qaDecisionFail = /^Decision:\s+FAIL/im.test(qaContent);
    qaOk = qaFails.length === 0 && !qaDecisionFail;
  }

  const scaffoldManifestData = readJson(scaffoldManifestFile) || {};
  const coverageResult = checkContractCoverage({ root: process.cwd(), manifest: scaffoldManifestData });
  const proofFile = path.join(project.paths.implementationFeatureDir(feature), "proof-of-compliance.json");
  const proofRecord = readJson(proofFile);
  const goMarkerData = readJson(goMarkerFile) || {};
  const goTimestamp = goMarkerData.decidedAt || goMarkerData.generatedAt || null;

  const gates = collectDeliveryGates({
    feature, frMatrix, acMatrix, tcCoverage, confidenceScore, threshold,
    traceMap, testsFile, qaContent, qaOk, proofFile, proofRecord,
    goTimestamp, coverageResult, status, project
  });
  const blockers = gates.blockers;
  const warnings = gates.warnings;

  // UI-REF blockers
  uiRefValidation.filter((ref) => !ref.fileExists).forEach((ref) => {
    blockers.push(`UI-REF ${ref.id} references missing file: ${ref.path}`);
  });

  const decision = blockers.length === 0 ? "SHIP" : "BLOCKED";
  const generatedAt = new Date().toISOString();
  const implementManifest = readJson(implementManifestFile) || {};
  const payload = {
    schemaVersion: 1,
    ok: decision === "SHIP",
    feature, decision, generatedAt,
    confidence: { score: confidenceScore, threshold, pass: confidenceScore >= threshold },
    tcSummary: {
      declared: Number(tcCoverage.declared || 0), executable: Number(tcCoverage.executable || 0),
      passing: Number(tcCoverage.passing || 0), failing: Number(tcCoverage.failing || 0),
      missing: Number(tcCoverage.missing || 0)
    },
    frMatrix, acMatrix, uiRefValidation, blockers, warnings,
    timeline: {
      go: goMarkerData.decidedAt || null, scaffold: scaffoldManifestData.generatedAt || null,
      implement: implementManifest.generatedAt || null, verify: verifyPayload.finishedAt || null
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
    const buildCmd = detectBuildCommand(process.cwd());
    if (buildCmd && !options.noBuild) {
      const parts = buildCmd.split(/\s+/);
      const buildResult = spawnSync(parts[0], parts.slice(1), { cwd: process.cwd(), encoding: "utf8" });
      payload.buildExitCode = buildResult.status;
    }
    const tagResult = createReleaseTag(feature, process.cwd());
    payload.releaseTag = tagResult.ok ? tagResult.tag : null;
    payload.releaseTagError = tagResult.ok ? null : tagResult.reason;
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
    if (payload.releaseTag) console.log(`- Release tag: ${payload.releaseTag}`);
    if (blockers.length > 0) blockers.forEach((line) => console.log(`- Blocker: ${line}`));
  }

  return decision === "SHIP" ? OK : ERROR;
}
