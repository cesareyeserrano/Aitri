import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveFeature } from "../lib.js";
import { scanTcMarkers } from "./tc-scanner.js";

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

function parseSpecFrIds(specContent) {
  return [...new Set(
    [...String(specContent || "").matchAll(/\bFR-\d+\b/g)]
      .map((match) => match[0])
  )];
}

function detectRunner(absFile) {
  const ext = path.extname(absFile).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  return "node";
}

function runTcStub(absFile) {
  const env = { ...process.env };
  // Strip NODE_TEST_CONTEXT so the stub runs as an independent test process
  delete env.NODE_TEST_CONTEXT;
  const runner = detectRunner(absFile);
  let result;
  if (runner === "python") {
    result = spawnSync("python3", ["-m", "pytest", absFile, "-q", "--tb=no"], { encoding: "utf8", timeout: 30000, env });
    if (result.error) {
      result = spawnSync("python", ["-m", "pytest", absFile, "-q", "--tb=no"], { encoding: "utf8", timeout: 30000, env });
    }
  } else if (runner === "go") {
    result = spawnSync("go", ["test", absFile], { encoding: "utf8", timeout: 30000, env });
  } else {
    result = spawnSync(process.execPath, ["--test", absFile], { encoding: "utf8", timeout: 30000, env });
  }
  return result.status === 0;
}

function buildProofRecord({ feature, frIds, traceMap, tcResults }) {
  const frProof = {};
  frIds.forEach((frId) => {
    const tracingTcs = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.frIds || []).includes(frId));
    const provenTcs = tracingTcs.filter((tcId) => tcResults[tcId]?.passed);
    const evidence = provenTcs.map((tcId) => tcResults[tcId].file).filter(Boolean);
    frProof[frId] = {
      proven: provenTcs.length > 0,
      via: provenTcs,
      tracingTcs,
      evidence
    };
  });

  const provenCount = Object.values(frProof).filter((v) => v.proven).length;
  return {
    schemaVersion: 1,
    ok: provenCount === frIds.length && frIds.length > 0,
    feature,
    provenAt: new Date().toISOString(),
    summary: {
      total: frIds.length,
      proven: provenCount,
      unproven: frIds.length - provenCount
    },
    frProof,
    tcResults
  };
}

function printProofReport(record) {
  const { summary, frProof } = record;
  console.log(`\nProof of Compliance: ${record.feature}`);
  console.log(`FRs proven: ${summary.proven}/${summary.total}`);
  Object.entries(frProof).forEach(([frId, proof]) => {
    const status = proof.proven ? "PROVEN" : "UNPROVEN";
    const via = proof.via.length > 0 ? ` via ${proof.via.join(", ")}` : " (no passing TCs)";
    console.log(`  ${frId}: ${status}${via}`);
  });
  if (!record.ok) {
    const unproven = Object.entries(frProof)
      .filter(([, v]) => !v.proven)
      .map(([frId]) => frId);
    console.log(`\nUNPROVEN requirements: ${unproven.join(", ")}`);
  } else {
    console.log("\nAll functional requirements proven.");
  }
}

export async function runProveCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const jsonOutput = !!(options.json || (options.format || "").toLowerCase() === "json");
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
  const proofFile = path.join(outDir, "proof-of-compliance.json");
  const root = process.cwd();

  if (!fs.existsSync(specFile)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature, error: "approved_spec_not_found" }, null, 2));
    } else {
      console.log(`Approved spec not found: ${path.relative(root, specFile)}`);
      console.log("Run: aitri approve --feature " + feature);
    }
    return ERROR;
  }
  if (!fs.existsSync(testsFile)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature, error: "tests_file_not_found" }, null, 2));
    } else {
      console.log(`Tests file not found: ${path.relative(root, testsFile)}`);
      console.log("Run: aitri plan --feature " + feature);
    }
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const testsContent = fs.readFileSync(testsFile, "utf8");
  const frIds = parseSpecFrIds(specContent);
  const traceMap = parseTcTraceMap(testsContent);

  if (frIds.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature, error: "no_fr_ids_in_spec" }, null, 2));
    } else {
      console.log("No FR-N identifiers found in approved spec. Nothing to prove.");
    }
    return ERROR;
  }

  const scan = scanTcMarkers({ root, feature, testsFile, generatedDir });

  if (!scan.available) {
    const errCode = scan.mode === "missing_tests_file" ? "tests_file_missing" : "no_tc_stubs";
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature, error: errCode }, null, 2));
    } else if (scan.mode === "missing_tests_file") {
      console.log(`Tests file missing. Run: aitri plan --feature ${feature}`);
    } else {
      console.log(`No generated test stubs found. Run: aitri scaffold --feature ${feature}`);
      console.log(`Expected directory: ${path.relative(root, generatedDir)}`);
    }
    return ERROR;
  }

  const tcEntries = Object.entries(scan.map);
  const foundTcs = tcEntries.filter(([, v]) => v.found);
  const missingTcs = tcEntries.filter(([, v]) => !v.found).map(([id]) => id);

  if (foundTcs.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature, error: "no_tc_stubs" }, null, 2));
    } else {
      console.log("No TC stub files found in generated directory.");
      console.log(`Run: aitri scaffold --feature ${feature}`);
    }
    return ERROR;
  }

  if (!jsonOutput) {
    console.log(`Proving compliance for: ${feature}`);
    console.log(`FRs to prove: ${frIds.join(", ")}`);
    console.log(`TC stubs found: ${foundTcs.length}/${tcEntries.length}`);
    if (missingTcs.length > 0) {
      console.log(`Missing TC stubs: ${missingTcs.join(", ")}`);
    }
    console.log("");
  }

  const tcResults = {};
  for (const [tcId, entry] of foundTcs) {
    const absFile = path.join(root, entry.file);
    if (!jsonOutput) process.stdout.write(`  Running ${tcId}... `);
    const passed = runTcStub(absFile);
    tcResults[tcId] = { passed, file: entry.file };
    if (!jsonOutput) console.log(passed ? "PASS" : "FAIL");
  }
  missingTcs.forEach((tcId) => {
    tcResults[tcId] = { passed: false, file: null };
  });

  const record = buildProofRecord({ feature, frIds, traceMap, tcResults });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(proofFile, JSON.stringify(record, null, 2), "utf8");

  if (jsonOutput) {
    console.log(JSON.stringify({ ...record, proofFile: path.relative(root, proofFile) }, null, 2));
  } else {
    printProofReport(record);
    console.log(`\nProof record: ${path.relative(root, proofFile)}`);
    if (record.ok) {
      console.log("Next recommended command: aitri deliver --feature " + feature);
    } else {
      console.log("Fix failing tests and re-run: aitri prove --feature " + feature);
    }
  }

  return record.ok ? OK : ERROR;
}
