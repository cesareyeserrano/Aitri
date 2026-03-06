import fs from "node:fs";
import path from "node:path";
import { resolveFeature } from "../lib.js";
import { scanTcMarkers } from "./tc-scanner.js";
import { runMutationAnalysis } from "./mutate.js";
import {
  parseTcTraceMap, parseSpecFrIds,
  runTcStub, analyzeStubQuality, checkContractCompleteness,
  buildProofRecord, printProofReport
} from "../lib/prove-utils.js";
import { readDependencyGraph, getAffectedNodes } from "../lib/dependency-graph.js";
import { verifyAllHashes } from "../lib/sealed-hashes.js";

function runTcs({ foundTcs, traceMap, mutateMode, jsonOutput, tcResults = {}, filterUsId = null }) {
  for (const [tcId, entry] of foundTcs) {
    if (filterUsId) {
      const usIds = traceMap[tcId]?.usIds || [];
      if (!usIds.includes(filterUsId)) continue;
    }
    const absFile = path.resolve(process.cwd(), entry.file);
    if (!jsonOutput) process.stdout.write(`  Running ${tcId}... `);
    const passed = runTcStub(absFile);
    const stubContent = fs.existsSync(absFile) ? fs.readFileSync(absFile, "utf8") : "";
    const quality = analyzeStubQuality(stubContent);
    const trivial = passed && quality.trivial;
    const contractIssues = passed && !trivial ? checkContractCompleteness(stubContent, absFile) : [];
    const contractUnimplemented = contractIssues.some((i) => i.reason === "placeholder");
    const contractTrivial = contractIssues.some((i) => i.reason === "trivial_contract");
    tcResults[tcId] = { passed, file: entry.file, trivial, contractUnimplemented, contractTrivial, contractIssues, mutation: null };
    if (!jsonOutput) {
      if (trivial) console.log("PASS (trivial — contract imported but not invoked)");
      else if (contractTrivial) console.log("PASS (trivial contract — returns ok:true without reading input)");
      else if (contractUnimplemented) console.log("PASS (blocked — contract is still a placeholder)");
      else console.log(passed ? "PASS" : "FAIL");
    }
    if (mutateMode && passed && !trivial && !contractUnimplemented) {
      if (!jsonOutput) process.stdout.write(`  Mutating ${tcId}... `);
      const mutation = runMutationAnalysis({ absStubFile: absFile, stubContent });
      tcResults[tcId].mutation = mutation;
      if (!jsonOutput && mutation) {
        const pct = Math.round(mutation.detected / mutation.total * 100);
        console.log(`${mutation.detected}/${mutation.total} mutations detected (${pct}%)`);
      } else if (!jsonOutput) console.log("no contract mutations applicable");
    }
  }
  return tcResults;
}

async function proveForStory({ storyId, feature, project, scan, frIds, traceMap, mutateMode, jsonOutput, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const root = process.cwd();
  const outDir = project.paths.implementationFeatureDir(feature);
  const tcEntries = Object.entries(scan.map);
  const foundTcs = tcEntries.filter(([, v]) => v.found);
  const missingTcs = tcEntries.filter(([, v]) => !v.found).map(([id]) => id);

  // Filter FRs and TCs to those tracing to this story
  const storyTcIds = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.usIds || []).includes(storyId));
  const storyFrIds = [...new Set(storyTcIds.flatMap((tcId) => traceMap[tcId]?.frIds || []))].filter((fr) => frIds.includes(fr));
  const activeFrIds = storyFrIds.length > 0 ? storyFrIds : frIds;

  if (!jsonOutput) {
    console.log(`\nProving story: ${storyId} | feature: ${feature}`);
    console.log(`Story TCs: ${storyTcIds.join(", ") || "none traced"}`);
  }

  // EVO-097: SPEC-SEALED integrity check
  const sealedResult = verifyAllHashes(root, feature);
  const sealedViolations = sealedResult.ok ? [] : (sealedResult.violations || []);
  if (sealedViolations.length > 0 && !jsonOutput) {
    console.log(`\nSPEC-SEALED VIOLATION: ${sealedViolations.length} TC block(s) modified.`);
    sealedViolations.forEach((v) => console.log(`  ${v.tcId}: ${v.file}`));
    console.log("BLOCKED: re-run scaffold to restore sealed hashes.");
  }

  const tcResults = {};
  missingTcs.forEach((tcId) => { tcResults[tcId] = { passed: false, file: null, trivial: false, contractUnimplemented: false, contractIssues: [] }; });
  runTcs({ foundTcs, traceMap, mutateMode, jsonOutput, tcResults, filterUsId: storyId });

  const record = {
    ...buildProofRecord({ feature, frIds: activeFrIds, traceMap, tcResults, story: storyId }),
    requiresReProve: sealedViolations.length > 0,
    sealedViolations
  };

  const proofFile = path.join(outDir, `proof-of-compliance-${storyId}.json`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(proofFile, JSON.stringify(record, null, 2), "utf8");

  if (jsonOutput) {
    console.log(JSON.stringify({ ...record, proofFile: path.relative(root, proofFile) }, null, 2));
  } else {
    printProofReport(record);
    console.log(`\nProof record: ${path.relative(root, proofFile)}`);
    if (record.requiresReProve) console.log("REQUIRES_RE_PROVE: sealed hash violation detected.");
    else if (record.ok) console.log(`Next: aitri prove --affected --feature ${feature}  or  aitri prove --all --feature ${feature}`);
    else console.log(`Fix failing tests and re-run: aitri prove --story ${storyId} --feature ${feature}`);
  }
  return record.ok && !record.requiresReProve ? OK : ERROR;
}

export async function runProveCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const jsonOutput = !!(options.json || (options.format || "").toLowerCase() === "json");
  const mutateMode = !!(options.mutate);
  const project = getProjectContextOrExit();

  let feature;
  try {
    feature = resolveFeature(options, getStatusReportOrExit);
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Feature resolution failed.");
    return ERROR;
  }

  const specFile = project.paths.approvedSpecFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const generatedDir = project.paths.generatedTestsDir(feature);
  const outDir = project.paths.implementationFeatureDir(feature);
  const root = process.cwd();

  if (!fs.existsSync(specFile)) {
    const msg = { ok: false, feature, error: "approved_spec_not_found" };
    jsonOutput ? console.log(JSON.stringify(msg, null, 2)) : console.log(`Approved spec not found. Run: aitri approve --feature ${feature}`);
    return ERROR;
  }
  if (!fs.existsSync(testsFile)) {
    const msg = { ok: false, feature, error: "tests_file_not_found" };
    jsonOutput ? console.log(JSON.stringify(msg, null, 2)) : console.log(`Tests file not found. Run: aitri plan --feature ${feature}`);
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const testsContent = fs.readFileSync(testsFile, "utf8");
  const frIds = parseSpecFrIds(specContent);
  const traceMap = parseTcTraceMap(testsContent);

  if (frIds.length === 0) {
    const msg = { ok: false, feature, error: "no_fr_ids_in_spec" };
    jsonOutput ? console.log(JSON.stringify(msg, null, 2)) : console.log("No FR-N identifiers found in approved spec.");
    return ERROR;
  }

  const scan = scanTcMarkers({ root, feature, testsFile, generatedDir });
  if (!scan.available) {
    const errCode = scan.mode === "missing_tests_file" ? "tests_file_missing" : "no_tc_stubs";
    if (jsonOutput) { console.log(JSON.stringify({ ok: false, feature, error: errCode }, null, 2)); }
    else if (scan.mode === "missing_tests_file") { console.log(`Tests file missing. Run: aitri plan --feature ${feature}`); }
    else { console.log(`No generated test stubs found. Run: aitri build --feature ${feature}`); }
    return ERROR;
  }

  const tcEntries = Object.entries(scan.map);
  const foundTcs = tcEntries.filter(([, v]) => v.found);
  const missingTcs = tcEntries.filter(([, v]) => !v.found).map(([id]) => id);
  if (foundTcs.length === 0) {
    const msg = { ok: false, feature, error: "no_tc_stubs" };
    jsonOutput ? console.log(JSON.stringify(msg, null, 2)) : console.log(`No TC stub files found. Run: aitri build --feature ${feature}`);
    return ERROR;
  }

  const storyArgs = { feature, project, scan, frIds, traceMap, mutateMode, jsonOutput, exitCodes };

  // EVO-097: --story US-N mode
  if (options.story) {
    const storyId = String(options.story).toUpperCase().trim();
    if (!/^US-\d+$/.test(storyId)) { console.log(`Invalid story ID: "${storyId}". Expected: US-N`); return ERROR; }
    return proveForStory({ storyId, ...storyArgs });
  }

  // EVO-097: --affected mode — use dep-graph to find affected stories, run prove per story
  if (options.affected) {
    const depGraphData = readDependencyGraph(root);
    if (!depGraphData) { console.log("--affected requires .aitri/dependency-graph.json. Run: aitri spec-from-design"); return ERROR; }
    const targetId = String(options.affected === true ? "" : options.affected).toUpperCase().trim();
    const baseId = /^US-\d+$/.test(targetId) ? targetId : null;
    const affected = baseId ? getAffectedNodes(depGraphData, baseId) : (depGraphData.nodes || []).map((n) => n.id);
    if (!jsonOutput) console.log(`Affected stories: ${affected.join(", ") || "none"}`);
    let allOk = true;
    for (const sid of affected) {
      const code = await proveForStory({ storyId: sid, ...storyArgs });
      if (code !== OK) allOk = false;
    }
    return allOk ? OK : ERROR;
  }

  // EVO-097: --all mode — run all TCs, write proof-of-compliance-all.json
  if (options.all) {
    if (!jsonOutput) { console.log(`Proving all: ${feature}`); console.log(`FRs: ${frIds.join(", ")}`); }
    const tcResults = {};
    missingTcs.forEach((tcId) => { tcResults[tcId] = { passed: false, file: null, trivial: false, contractUnimplemented: false, contractIssues: [] }; });
    runTcs({ foundTcs, traceMap, mutateMode, jsonOutput, tcResults });
    const record = buildProofRecord({ feature, frIds, traceMap, tcResults });
    const allFile = path.join(outDir, "proof-of-compliance-all.json");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(allFile, JSON.stringify(record, null, 2), "utf8");
    if (jsonOutput) { console.log(JSON.stringify({ ...record, proofFile: path.relative(root, allFile) }, null, 2)); }
    else { printProofReport(record); console.log(`\nProof record (all): ${path.relative(root, allFile)}`); }
    return record.ok ? OK : ERROR;
  }

  // Default mode — run all TCs, write proof-of-compliance.json
  const proofFile = path.join(outDir, "proof-of-compliance.json");
  if (!jsonOutput) {
    console.log(`Proving compliance for: ${feature}`);
    console.log(`FRs to prove: ${frIds.join(", ")}`);
    console.log(`TC stubs found: ${foundTcs.length}/${tcEntries.length}`);
    if (missingTcs.length > 0) console.log(`Missing TC stubs: ${missingTcs.join(", ")}`);
    console.log("");
  }

  const tcResults = {};
  missingTcs.forEach((tcId) => { tcResults[tcId] = { passed: false, file: null, trivial: false, contractUnimplemented: false, contractIssues: [] }; });
  runTcs({ foundTcs, traceMap, mutateMode, jsonOutput, tcResults });

  const record = buildProofRecord({ feature, frIds, traceMap, tcResults });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(proofFile, JSON.stringify(record, null, 2), "utf8");

  if (jsonOutput) {
    console.log(JSON.stringify({ ...record, proofFile: path.relative(root, proofFile) }, null, 2));
  } else {
    printProofReport(record);
    console.log(`\nProof record: ${path.relative(root, proofFile)}`);
    if (record.ok) console.log("Next recommended command: aitri deliver --feature " + feature);
    else console.log("Fix failing tests and re-run: aitri prove --feature " + feature);
  }
  return record.ok ? OK : ERROR;
}
