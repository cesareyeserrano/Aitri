import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveFeature } from "../lib.js";
import { scanTcMarkers } from "./tc-scanner.js";
import { runMutationAnalysis } from "./mutate.js";

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

// EVO-022: detect contract files that are still scaffold placeholders
function isContractPlaceholder(content) {
  const s = String(content);
  // Node: throw new Error("Not implemented: FR-N")
  if (s.includes('throw new Error("Not implemented:')) return true;
  // Python: raise NotImplementedError("Not implemented: FR-N")
  if (s.includes('raise NotImplementedError("Not implemented:')) return true;
  // Go scaffold template: body is only _ = input + return nil, nil
  if (s.includes("return nil, nil") && s.includes("_ = input")) return true;
  return false;
}

function checkContractCompleteness(stubContent, absFile) {
  const contractImportRe = /^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/gm;
  const issues = [];
  for (const m of String(stubContent).matchAll(contractImportRe)) {
    const relPath = m[2];
    if (!relPath.includes("/contracts/")) continue;
    const absContract = path.resolve(path.dirname(absFile), relPath);
    if (!fs.existsSync(absContract)) {
      issues.push({ file: relPath, reason: "missing" });
      continue;
    }
    const contractContent = fs.readFileSync(absContract, "utf8");
    if (isContractPlaceholder(contractContent)) {
      issues.push({ file: relPath, reason: "placeholder" });
    }
  }
  return issues;
}

// EVO-020: detect stubs that import a contract but never invoke it
function analyzeStubQuality(content) {
  const contractImportRe = /^import\s*\{([^}]+)\}\s*from\s*["'][^"']*\/contracts\/[^"']*["']/gm;
  const matches = [...String(content).matchAll(contractImportRe)];
  if (matches.length === 0) return { hasContractImport: false, trivial: false };
  const importedNames = matches.flatMap((m) =>
    m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)
  );
  const body = String(content).replace(/^import\b[^\n]*\n?/gm, "");
  const contractInvoked = importedNames.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(body));
  return { hasContractImport: true, importedNames, contractInvoked, trivial: !contractInvoked };
}

function buildProofRecord({ feature, frIds, traceMap, tcResults }) {
  const frProof = {};
  frIds.forEach((frId) => {
    const tracingTcs = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.frIds || []).includes(frId));
    const provenTcs = tracingTcs.filter((tcId) =>
      tcResults[tcId]?.passed &&
      !tcResults[tcId]?.trivial &&
      !tcResults[tcId]?.contractUnimplemented
    );
    const evidence = provenTcs.map((tcId) => tcResults[tcId].file).filter(Boolean);
    // EVO-023: aggregate mutation score across proven TCs
    const mutations = provenTcs
      .map((tcId) => tcResults[tcId]?.mutation)
      .filter(Boolean);
    const mutationScore = mutations.length > 0
      ? { detected: mutations.reduce((s, m) => s + m.detected, 0), total: mutations.reduce((s, m) => s + m.total, 0) }
      : null;
    frProof[frId] = {
      proven: provenTcs.length > 0,
      via: provenTcs,
      tracingTcs,
      evidence,
      mutationScore
    };
  });

  const trivialTcs = Object.entries(tcResults).filter(([, v]) => v.trivial).map(([id]) => id);
  const unimplementedContractTcs = Object.entries(tcResults).filter(([, v]) => v.contractUnimplemented).map(([id]) => id);
  const provenCount = Object.values(frProof).filter((v) => v.proven).length;

  // Overall mutation summary (advisory — does not affect ok)
  const allMutations = Object.values(tcResults).map((v) => v.mutation).filter(Boolean);
  const overallMutation = allMutations.length > 0
    ? { detected: allMutations.reduce((s, m) => s + m.detected, 0), total: allMutations.reduce((s, m) => s + m.total, 0) }
    : null;

  return {
    schemaVersion: 1,
    ok: provenCount === frIds.length && frIds.length > 0 && trivialTcs.length === 0 && unimplementedContractTcs.length === 0,
    feature,
    provenAt: new Date().toISOString(),
    summary: {
      total: frIds.length,
      proven: provenCount,
      unproven: frIds.length - provenCount,
      trivialTcs,
      unimplementedContractTcs,
      mutation: overallMutation
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
    const mut = proof.mutationScore
      ? ` [mutation: ${proof.mutationScore.detected}/${proof.mutationScore.total} = ${Math.round(proof.mutationScore.detected / proof.mutationScore.total * 100)}%]`
      : "";
    console.log(`  ${frId}: ${status}${via}${mut}`);
  });
  if (summary.trivialTcs && summary.trivialTcs.length > 0) {
    console.log(`\nTRIVIAL stubs (contract imported but not invoked): ${summary.trivialTcs.join(", ")}`);
    console.log("These tests pass but do not verify behavioral compliance.");
    console.log("Invoke the contract function inside the test to make it meaningful.");
  }
  if (summary.unimplementedContractTcs && summary.unimplementedContractTcs.length > 0) {
    console.log(`\nUNIMPLEMENTED contracts (stub passes but contract is still a scaffold placeholder): ${summary.unimplementedContractTcs.join(", ")}`);
    console.log("Implement the contract functions before proving compliance.");
    console.log("Run: aitri testgen --feature " + record.feature + "  (then implement the contracts)");
  }
  if (summary.mutation) {
    const pct = Math.round(summary.mutation.detected / summary.mutation.total * 100);
    console.log(`\nMutation analysis: ${summary.mutation.detected}/${summary.mutation.total} mutations detected (${pct}% confidence)`);
    if (pct < 50) console.log("  Low mutation score — consider strengthening test assertions.");
  }
  if (!record.ok) {
    const unproven = Object.entries(frProof).filter(([, v]) => !v.proven).map(([frId]) => frId);
    if (unproven.length > 0) console.log(`\nUNPROVEN requirements: ${unproven.join(", ")}`);
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
    const stubContent = fs.existsSync(absFile) ? fs.readFileSync(absFile, "utf8") : "";
    const quality = analyzeStubQuality(stubContent);
    const trivial = passed && quality.trivial;
    const contractIssues = passed && !trivial ? checkContractCompleteness(stubContent, absFile) : [];
    const contractUnimplemented = contractIssues.length > 0;
    tcResults[tcId] = { passed, file: entry.file, trivial, contractUnimplemented, contractIssues, mutation: null };
    if (!jsonOutput) {
      if (trivial) console.log("PASS (trivial — contract imported but not invoked)");
      else if (contractUnimplemented) console.log("PASS (blocked — contract is still a placeholder)");
      else console.log(passed ? "PASS" : "FAIL");
    }
    // EVO-023: mutation analysis — runs after PASS/FAIL line, only for clean passing TCs
    if (mutateMode && passed && !trivial && !contractUnimplemented) {
      if (!jsonOutput) process.stdout.write(`  Mutating ${tcId}... `);
      const mutation = runMutationAnalysis({ absStubFile: absFile, stubContent });
      tcResults[tcId].mutation = mutation;
      if (!jsonOutput) {
        if (mutation) {
          const pct = Math.round(mutation.detected / mutation.total * 100);
          console.log(`${mutation.detected}/${mutation.total} mutations detected (${pct}%)`);
        } else {
          console.log("no contract mutations applicable");
        }
      }
    }
  }
  missingTcs.forEach((tcId) => {
    tcResults[tcId] = { passed: false, file: null, trivial: false, contractUnimplemented: false, contractIssues: [] };
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
