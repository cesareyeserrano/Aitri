/**
 * EVO-023: Mutation testing engine for aitri prove --mutate
 *
 * For each proven TC stub, applies simple code mutations to its contract
 * file(s) one at a time, re-runs the stub, and records whether the mutation
 * was caught. A test that fails when the contract is broken has a higher
 * mutation score and is therefore more trustworthy.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Operator mutations applied to contract source code
const MUTATIONS = [
  { id: "true→false",      pattern: /\btrue\b/,        replacement: "false" },
  { id: "false→true",      pattern: /\bfalse\b/,       replacement: "true" },
  { id: "===→!==",         pattern: / === /,            replacement: " !== " },
  { id: "!==→===",         pattern: / !== /,            replacement: " === " },
  { id: ">→<",             pattern: / > /,              replacement: " < " },
  { id: "<→>",             pattern: / < /,              replacement: " > " },
  { id: "&&→||",           pattern: / && /,             replacement: " || " },
  { id: "null→undefined",  pattern: /\breturn null\b/,  replacement: "return undefined" },
  { id: "+→-",             pattern: /(\w) \+ (\w)/,    replacement: "$1 - $2" },
];

function extractContractPaths(stubContent, stubFile) {
  const re = /^import\s*\{[^}]+\}\s*from\s*["']([^"']+)["']/gm;
  const paths = [];
  for (const m of String(stubContent).matchAll(re)) {
    const rel = m[1];
    if (!rel.includes("/contracts/")) continue;
    const abs = path.resolve(path.dirname(stubFile), rel);
    if (fs.existsSync(abs)) paths.push(abs);
  }
  return paths;
}

function runStub(absFile) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const ext = path.extname(absFile).toLowerCase();
  let res;
  if (ext === ".py") {
    res = spawnSync("python3", ["-m", "pytest", absFile, "-q", "--tb=no"], { encoding: "utf8", timeout: 15000, env });
  } else if (ext === ".go") {
    res = spawnSync("go", ["test", absFile], { encoding: "utf8", timeout: 15000, env });
  } else {
    res = spawnSync(process.execPath, ["--test", absFile], { encoding: "utf8", timeout: 15000, env });
  }
  return res.status === 0;
}

/**
 * Run mutation analysis for a single TC stub.
 * Returns null when no contracts are available to mutate.
 * Returns { total, detected, score, results[] } otherwise.
 */
export function runMutationAnalysis({ absStubFile, stubContent }) {
  const contractPaths = extractContractPaths(stubContent, absStubFile);
  if (contractPaths.length === 0) return null;

  const results = [];

  for (const contractPath of contractPaths) {
    const original = fs.readFileSync(contractPath, "utf8");

    for (const mut of MUTATIONS) {
      if (!mut.pattern.test(original)) continue;
      const mutated = original.replace(mut.pattern, mut.replacement);
      if (mutated === original) continue;

      try {
        fs.writeFileSync(contractPath, mutated, "utf8");
        const stillPasses = runStub(absStubFile);
        results.push({
          id: mut.id,
          contract: path.basename(contractPath),
          detected: !stillPasses   // detected = stub caught the mutation (FAILED)
        });
      } finally {
        fs.writeFileSync(contractPath, original, "utf8");
      }
    }
  }

  if (results.length === 0) return null;
  const detected = results.filter((r) => r.detected).length;
  return { total: results.length, detected, score: detected / results.length, results };
}
