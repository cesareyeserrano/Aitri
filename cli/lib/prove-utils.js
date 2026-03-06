// cli/lib/prove-utils.js
// Shared utilities for prove.js and verify-scope.js (EVO-097)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

export function parseSpecFrIds(specContent) {
  return [...new Set(
    [...String(specContent || "").matchAll(/\bFR-\d+\b/g)]
      .map((match) => match[0])
  )];
}

export function detectRunner(absFile) {
  const ext = path.extname(absFile).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  return "node";
}

export function runTcStub(absFile) {
  const env = { ...process.env };
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
export function isContractPlaceholder(content) {
  const s = String(content);
  if (s.includes('throw new Error("Not implemented:')) return true;
  if (s.includes('raise NotImplementedError("Not implemented:')) return true;
  if (s.includes("return nil, nil") && s.includes("_ = input")) return true;
  return false;
}

// EVO-062: detect contracts that always return ok:true without reading input properties
export function isTrivialContract(content) {
  const s = String(content);
  if (!s.includes("return { ok: true")) return false;
  if (/\binput\s*\??\./.test(s)) return false;
  return true;
}

export function checkContractCompleteness(stubContent, absFile) {
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
    } else if (isTrivialContract(contractContent)) {
      issues.push({ file: relPath, reason: "trivial_contract" });
    }
  }
  return issues;
}

// EVO-020: detect stubs that import a contract but never invoke it
export function analyzeStubQuality(content) {
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

export function buildProofRecord({ feature, frIds, traceMap, tcResults, story = null }) {
  const frProof = {};
  frIds.forEach((frId) => {
    const tracingTcs = Object.keys(traceMap).filter((tcId) => (traceMap[tcId]?.frIds || []).includes(frId));
    const provenTcs = tracingTcs.filter((tcId) =>
      tcResults[tcId]?.passed &&
      !tcResults[tcId]?.trivial &&
      !tcResults[tcId]?.contractUnimplemented &&
      !tcResults[tcId]?.contractTrivial
    );
    const evidence = provenTcs.map((tcId) => tcResults[tcId].file).filter(Boolean);
    const mutations = provenTcs.map((tcId) => tcResults[tcId]?.mutation).filter(Boolean);
    const mutationScore = mutations.length > 0
      ? { detected: mutations.reduce((s, m) => s + m.detected, 0), total: mutations.reduce((s, m) => s + m.total, 0) }
      : null;
    frProof[frId] = { proven: provenTcs.length > 0, via: provenTcs, tracingTcs, evidence, mutationScore };
  });

  const trivialTcs = Object.entries(tcResults).filter(([, v]) => v.trivial).map(([id]) => id);
  const trivialContractTcs = Object.entries(tcResults).filter(([, v]) => v.contractTrivial).map(([id]) => id);
  const unimplementedContractTcs = Object.entries(tcResults).filter(([, v]) => v.contractUnimplemented).map(([id]) => id);
  const provenCount = Object.values(frProof).filter((v) => v.proven).length;
  const allMutations = Object.values(tcResults).map((v) => v.mutation).filter(Boolean);
  const overallMutation = allMutations.length > 0
    ? { detected: allMutations.reduce((s, m) => s + m.detected, 0), total: allMutations.reduce((s, m) => s + m.total, 0) }
    : null;

  return {
    schemaVersion: 1,
    ok: provenCount === frIds.length && frIds.length > 0 && trivialTcs.length === 0 && trivialContractTcs.length === 0 && unimplementedContractTcs.length === 0,
    feature,
    ...(story ? { story } : {}),
    provenAt: new Date().toISOString(),
    summary: { total: frIds.length, proven: provenCount, unproven: frIds.length - provenCount, trivialTcs, trivialContractTcs, unimplementedContractTcs, mutation: overallMutation },
    frProof,
    tcResults
  };
}

export function printProofReport(record) {
  const { summary, frProof } = record;
  const label = record.story ? `${record.feature} / ${record.story}` : record.feature;
  console.log(`\nProof of Compliance: ${label}`);
  console.log(`FRs proven: ${summary.proven}/${summary.total}`);
  Object.entries(frProof).forEach(([frId, proof]) => {
    const status = proof.proven ? "PROVEN" : "UNPROVEN";
    const via = proof.via.length > 0 ? ` via ${proof.via.join(", ")}` : " (no passing TCs)";
    const mut = proof.mutationScore
      ? ` [mutation: ${proof.mutationScore.detected}/${proof.mutationScore.total} = ${Math.round(proof.mutationScore.detected / proof.mutationScore.total * 100)}%]`
      : "";
    console.log(`  ${frId}: ${status}${via}${mut}`);
  });
  if (summary.trivialTcs?.length > 0) {
    console.log(`\nTRIVIAL stubs (contract imported but not invoked): ${summary.trivialTcs.join(", ")}`);
    console.log("These tests pass but do not verify behavioral compliance.");
    console.log("Invoke the contract function inside the test to make it meaningful.");
  }
  if (summary.trivialContractTcs?.length > 0) {
    console.log(`\n[TRIVIAL CONTRACT] TCs backed by contracts that return ok:true without reading input: ${summary.trivialContractTcs.join(", ")}`);
    console.log("These contracts verify nothing real — proof is structurally invalid.");
    console.log("Run: aitri contractgen --feature " + record.feature + "  (regenerate with --force)");
  }
  if (summary.unimplementedContractTcs?.length > 0) {
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
