// cli/lib/deliver-utils.js — helpers extracted from deliver.js
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { verifyAllHashes } from "./sealed-hashes.js";

export function wantsJson(options, positional = []) {
  if (options.json) return true;
  if ((options.format || "").toLowerCase() === "json") return true;
  return positional.some((p) => p.toLowerCase() === "json");
}

export function parseTraceIds(traceLine, prefix) {
  return [...new Set(
    [...String(traceLine || "").matchAll(new RegExp(`\\b${prefix}-\\d+\\b`, "g"))]
      .map((match) => match[0])
  )];
}

export function parseTcTraceMap(testsContent) {
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

export function parseSpecFr(specContent) {
  return [...new Set(
    [...String(specContent || "").matchAll(/\bFR-\d+\b/g)]
      .map((match) => match[0])
  )];
}

export function parseSpecAc(specContent) {
  return [...new Set(
    [...String(specContent || "").matchAll(/\bAC-\d+\b/g)]
      .map((match) => match[0])
  )];
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function createReleaseTag(feature, root) {
  const check = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  if (check.status !== 0) return { ok: false, tag: null, reason: "Not inside a git repository." };
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tag = `aitri-release/${feature}-${timestamp}`;
  const result = spawnSync("git", ["tag", tag, "HEAD"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return { ok: false, tag, reason: result.stderr || "git tag failed." };
  return { ok: true, tag, reason: null };
}

// EVO-068: workspace hygiene gate — detect dirty files unrelated to the feature
// EVO-089: dynamic allowlist from manifests + config extraOwnedPaths
export function checkWorkspaceHygiene(root, feature, { extraOwnedPaths = [], manifestPaths = [] } = {}) {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return { ok: true, unrelated: [], featureOwned: [] }; // no git repo — skip
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  const featureOwned = [];
  const unrelated = [];
  const featurePrefixes = [
    ".aitri/",
    `tests/${feature}/`,
    "src/contracts/",
    `docs/implementation/${feature}/`,
    `docs/delivery/`,
    `specs/approved/${feature}.md`,
    `docs/plan/${feature}.md`,
    `docs/verification/${feature}.json`,
    ...extraOwnedPaths,
    ...manifestPaths,
  ];
  for (const line of lines) {
    const status = line.slice(0, 2);
    let filePath = line.slice(3).trim().replace(/^"(.*)"$/, "$1");
    if (status.includes("R") && filePath.includes(" -> ")) {
      filePath = filePath.split(" -> ").pop().trim().replace(/^"(.*)"$/, "$1");
    }
    const isOwned = featurePrefixes.some((p) => filePath.startsWith(p) || filePath === p.replace(/\/$/, ""));
    if (isOwned) featureOwned.push(filePath);
    else unrelated.push(filePath);
  }
  return { ok: unrelated.length === 0, unrelated, featureOwned };
}

export function extractManifestPaths(manifestData) {
  const paths = [];
  for (const key of ["interfaceFiles", "testFiles", "files", "briefFiles", "scaffoldFiles"]) {
    const entries = manifestData?.[key];
    if (Array.isArray(entries)) {
      entries.forEach((f) => {
        const dir = String(f).split("/")[0];
        if (dir && !dir.startsWith(".")) paths.push(`${dir}/`);
      });
    }
  }
  return [...new Set(paths)];
}

export function detectBuildCommand(root) {
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

export function buildMarkdownReport(payload) {
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

// Collect all blocker/warning gates for delivery
export function collectDeliveryGates({ feature, frMatrix, acMatrix, tcCoverage, confidenceScore, threshold, traceMap, testsFile, qaContent, qaOk, proofFile, proofRecord, goTimestamp, coverageResult, status, project }) {
  const blockers = [];
  const warnings = [];

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
    const relTestsPath = path.relative(process.cwd(), testsFile);
    const tcsWithTraces = Object.keys(traceMap).filter((tcId) =>
      (traceMap[tcId]?.frIds?.length > 0 || traceMap[tcId]?.acIds?.length > 0)
    );
    const candidate = tcsWithTraces.length > 0 ? tcsWithTraces[tcsWithTraces.length - 1] : null;
    const exampleAc = uncoveredAc[0];
    const candidateHint = candidate
      ? ` Consider adding to ${candidate}'s Trace: line.`
      : "";
    blockers.push(
      `Uncovered ACs: ${uncoveredAc.join(", ")}. ` +
      `Fix: open ${relTestsPath} and add the AC ID to the Trace: line of the TC that covers this behavior.` +
      candidateHint +
      ` Example: "- Trace: US-1, FR-1, ${exampleAc}"`
    );
  }

  // QA gate
  if (!qaContent) {
    blockers.push(`QA report missing — independent AC verification required. Run: aitri qa --feature ${feature}`);
  } else {
    const qaFails = qaContent.split("\n").filter((l) => /^-\s+AC-\d+:\s+FAIL/i.test(l.trim()));
    const qaDecisionFail = /^Decision:\s+FAIL/im.test(qaContent);
    if (qaFails.length > 0 || qaDecisionFail) {
      blockers.push(`QA report has ${qaFails.length} failing AC(s). Fix and re-run: aitri qa --feature ${feature}`);
    }
  }

  // Contract coverage warning
  if (!coverageResult.ok && coverageResult.total > 0) {
    warnings.push(`Contract coverage: ${coverageResult.covered}/${coverageResult.total} contracts imported. Uncovered: ${coverageResult.uncovered.join(", ")}`);
  }

  // Proof of compliance advisory
  if (!proofRecord) {
    warnings.push("No proof-of-compliance record found. Run: aitri prove --feature " + feature);
  } else if (!proofRecord.ok) {
    warnings.push(`Proof of compliance: ${proofRecord.summary?.proven || 0}/${proofRecord.summary?.total || 0} FRs proven. Re-run: aitri prove --feature ${feature}`);
  }

  // EVO-096: prove freshness
  if (proofRecord && proofRecord.ok && fs.existsSync(proofFile)) {
    const proofMtime = fs.statSync(proofFile).mtimeMs;
    const contractsDir = path.join(process.cwd(), "src", "contracts", feature);
    if (fs.existsSync(contractsDir)) {
      let latestContractMtime = 0;
      try {
        for (const f of fs.readdirSync(contractsDir)) {
          const mtime = fs.statSync(path.join(contractsDir, f)).mtimeMs;
          if (mtime > latestContractMtime) latestContractMtime = mtime;
        }
      } catch { /* ignore read errors */ }
      if (latestContractMtime > proofMtime) {
        warnings.push(`Proof of compliance may be stale — contracts changed after it was generated. Re-run: aitri prove --feature ${feature}`);
      }
    }
  }

  // EVO-095: QA evidence semantic validation
  if (qaOk && qaContent) {
    const thinEvidence = [...qaContent.matchAll(/^-\s+(AC-\d+):\s+PASS\s*[—\-]\s*(.+)/gim)]
      .filter(([, , evidence]) => {
        const e = evidence.trim();
        return e.length < 20 || /^(ok|passed|success|done|yes|true|pass|works|correct)\.?$/i.test(e);
      })
      .map(([, acId]) => acId);
    if (thinEvidence.length > 0) {
      warnings.push(`QA report has thin evidence for ${thinEvidence.join(", ")} — add actual command + response. Example: "PASS — curl /api/health returned 200 {\\"status\\":\\"ok\\"}"`);
    }
  }

  // EVO-093: US implementation completeness
  if (qaOk) {
    const backlogFile = project.paths.backlogFile(feature);
    if (fs.existsSync(backlogFile)) {
      const backlogContent = fs.readFileSync(backlogFile, "utf8");
      const allUs = [...new Set([...backlogContent.matchAll(/\bUS-\d+\b/g)].map((m) => m[0]))];
      if (allUs.length > 0) {
        const usAcMap = {};
        for (const match of backlogContent.matchAll(/###\s+(US-\d+)([\s\S]*?)(?=\n###\s+US-\d+|$)/g)) {
          const usId = match[1];
          usAcMap[usId] = [...new Set([...match[2].matchAll(/\bAC-\d+\b/g)].map((m) => m[0]))];
        }
        for (const [, trace] of Object.entries(traceMap)) {
          for (const usId of (trace.usIds || [])) {
            if (!usAcMap[usId]) usAcMap[usId] = [];
            for (const acId of (trace.acIds || [])) {
              if (!usAcMap[usId].includes(acId)) usAcMap[usId].push(acId);
            }
          }
        }
        const qaPassedAcs = new Set(
          [...qaContent.matchAll(/^-\s+(AC-\d+):\s+PASS/gim)].map((m) => m[1].toUpperCase())
        );
        const usWithoutQa = allUs.filter((usId) => {
          const acs = usAcMap[usId] || [];
          return acs.length === 0 || !acs.some((ac) => qaPassedAcs.has(ac.toUpperCase()));
        });
        if (usWithoutQa.length > 0) {
          blockers.push(`US without QA-verified ACs: ${usWithoutQa.join(", ")}. Each User Story needs at least one AC with PASS in qa-report.md. Re-run: aitri qa --feature ${feature}`);
        }
      }
    }
  }

  // EVO-094: production code evidence
  if (goTimestamp) {
    const aitriOwnedPrefixes = [".aitri/", "tests/", "src/contracts/", "docs/", "specs/", "node_modules/"];
    const gitLog = spawnSync("git", ["log", "--format=", "--name-only", `--since=${goTimestamp}`], { cwd: process.cwd(), encoding: "utf8" });
    const gitDiff = spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd: process.cwd(), encoding: "utf8" });
    const committedFiles = gitLog.status === 0 ? gitLog.stdout.trim().split("\n").filter(Boolean) : [];
    const uncommittedFiles = gitDiff.status === 0 ? gitDiff.stdout.trim().split("\n").filter(Boolean) : [];
    const allChanged = [...new Set([...committedFiles, ...uncommittedFiles])];
    const productionFiles = allChanged.filter((f) => !aitriOwnedPrefixes.some((p) => f.startsWith(p)));
    if (allChanged.length > 0 && productionFiles.length === 0) {
      warnings.push(`No production code changed since go gate — all ${allChanged.length} file(s) are in aitri-owned paths. Verify implementation was written.`);
    }
  }

  // EVO-097: SPEC-SEALED integrity check
  const root = process.cwd();
  const sealedResult = verifyAllHashes(root, feature);
  if (!sealedResult.ok && !sealedResult.missing) {
    const count = (sealedResult.violations || []).length;
    blockers.push(`SPEC-SEALED: ${count} TC block(s) modified. Re-run: aitri build --feature ${feature}`);
  }

  // EVO-097: prove --all gate
  const implDir = project.paths.implementationFeatureDir(feature);
  const proofAllFile = path.join(implDir, "proof-of-compliance-all.json");
  if (!fs.existsSync(proofAllFile)) {
    warnings.push(`proof-of-compliance-all.json missing — run: aitri prove --all --feature ${feature}`);
  } else {
    try {
      const proofAll = JSON.parse(fs.readFileSync(proofAllFile, "utf8"));
      if (!proofAll.ok) warnings.push(`proof-of-compliance-all not passing. Re-run: aitri prove --all --feature ${feature}`);
    } catch { /* ignore parse errors */ }
  }

  // EVO-097: REQUIRES_RE_PROVE check
  const reProveFile = path.join(implDir, "re-prove-required.json");
  if (fs.existsSync(reProveFile)) {
    try {
      const rp = JSON.parse(fs.readFileSync(reProveFile, "utf8"));
      const pending = (rp.entries || []).filter((e) => e.status === "pending");
      if (pending.length > 0) {
        blockers.push(`REQUIRES_RE_PROVE: ${pending.length} story/stories need re-prove after amendment: ${pending.map((e) => e.story).join(", ")}`);
      }
    } catch { /* ignore */ }
  }

  // EVO-090: confidence gate
  if (confidenceScore < threshold) {
    const allFrsCovered = frMatrix.length > 0 && frMatrix.every((r) => r.covered);
    const allAcsCovered = acMatrix.length > 0 && acMatrix.every((r) => r.covered);
    const noFailingTc = Number(tcCoverage.failing || 0) === 0;
    const featureEvidenceComplete = allFrsCovered && allAcsCovered && noFailingTc && qaOk;
    const scoreBreakdown = `spec: ${status.confidence?.components?.specIntegrity ?? "?"}%, runtime: ${status.confidence?.components?.runtimeVerification ?? "?"}%`;
    if (featureEvidenceComplete) {
      warnings.push(`Confidence score ${Math.round(confidenceScore * 100)}% is below threshold ${Math.round(threshold * 100)}% — bypassed: all FRs, ACs, and QA are verified. (${scoreBreakdown})`);
    } else {
      blockers.push(`Confidence score ${Math.round(confidenceScore * 100)}% is below threshold ${Math.round(threshold * 100)}%. (${scoreBreakdown})`);
    }
  }

  return { blockers, warnings };
}
