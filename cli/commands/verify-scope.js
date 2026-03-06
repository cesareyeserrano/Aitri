// cli/commands/verify-scope.js
// EVO-097: Ghost Code AST + SPEC-SEALED scope check per story
import fs from "node:fs";
import path from "node:path";
import { resolveFeature } from "../lib.js";
import { readDependencyGraph } from "../lib/dependency-graph.js";
import { verifyAllHashes } from "../lib/sealed-hashes.js";

const EXPORT_PATTERN = /export\s+(?:const|function|class|async function)\s+(\w+)/g;

function scanGhostExports(root, declaredInterfaces) {
  const srcDir = path.join(root, "src");
  if (!fs.existsSync(srcDir)) return [];
  const declared = new Set(
    declaredInterfaces.flatMap((file) => {
      try {
        const content = fs.readFileSync(path.join(root, file), "utf8");
        return [...content.matchAll(EXPORT_PATTERN)].map((m) => m[1]);
      } catch { return []; }
    })
  );
  const ghosts = [];
  scanDir(srcDir, root, 8, (absFile) => {
    const ext = path.extname(absFile).toLowerCase();
    if (![".js", ".ts", ".mjs", ".go", ".py"].includes(ext)) return;
    try {
      const content = fs.readFileSync(absFile, "utf8");
      for (const m of content.matchAll(new RegExp(EXPORT_PATTERN.source, "g"))) {
        if (!declared.has(m[1])) {
          ghosts.push({ name: m[1], file: path.relative(root, absFile) });
        }
      }
    } catch { /* skip unreadable */ }
  });
  return ghosts;
}

function scanDir(dir, root, maxDepth, cb, depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanDir(full, root, maxDepth, cb, depth + 1);
    else cb(full);
  }
}

export async function runVerifyScopeCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  let feature;
  try {
    feature = resolveFeature(options, getStatusReportOrExit);
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Feature resolution failed.");
    return ERROR;
  }

  const storyId = options.story ? String(options.story).toUpperCase().trim() : null;
  if (!storyId || !/^US-\d+$/.test(storyId)) {
    console.log("verify-scope requires --story US-N (e.g. --story US-1)");
    return ERROR;
  }

  // Read dependency graph for FR scope
  const depGraphResult = readDependencyGraph(root);
  let storyFrs = [];
  let declaredInterfaces = [];
  if (depGraphResult.ok) {
    const node = (depGraphResult.data.nodes || []).find((n) => n.id === storyId);
    if (!node) {
      console.log(`Story ${storyId} not found in dependency graph.`);
      return ERROR;
    }
    storyFrs = node.fr || [];

    // Collect declared interfaces from scaffold manifest
    const project = getProjectContextOrExit();
    const manifestPath = path.join(project.paths.implementationFeatureDir(feature), "scaffold-manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        declaredInterfaces = manifest.interfaceFiles || [];
      } catch { /* ignore */ }
    }
  } else {
    console.log("verify-scope: no dependency graph — ghost code check limited.");
  }

  console.log(`\nVerify Scope: ${storyId} | feature: ${feature}`);

  // Ghost Code AST check
  const ghostExports = scanGhostExports(root, declaredInterfaces);
  if (ghostExports.length > 0) {
    console.log(`\nGHOST CODE detected: ${ghostExports.length} undeclared export(s):`);
    ghostExports.slice(0, 20).forEach((g) => console.log(`  ${g.name} (${g.file})`));
  } else {
    console.log("Ghost code check: CLEAN (no undeclared exports)");
  }

  // SPEC-SEALED hash check
  const sealedResult = verifyAllHashes(root, feature);
  const sealedViolations = sealedResult.ok ? [] : (sealedResult.violations || []);
  if (sealedViolations.length > 0) {
    console.log(`\nSPEC-SEALED VIOLATIONS: ${sealedViolations.length} TC block(s) modified:`);
    sealedViolations.forEach((v) => console.log(`  ${v.tcId}: ${v.file}`));
  } else if (!sealedResult.missing) {
    console.log("SPEC-SEALED check: CLEAN");
  } else {
    console.log("SPEC-SEALED check: no hash file found (run aitri build to generate)");
  }

  const blockers = [
    ...ghostExports.map((g) => ({ type: "ghost_export", detail: `${g.name} in ${g.file}` })),
    ...sealedViolations.map((v) => ({ type: "sealed_violation", detail: `${v.tcId}: ${v.file}` }))
  ];
  const ok = blockers.length === 0;

  // Write result
  const implDir = path.join(root, "docs", "implementation", feature);
  const outFile = path.join(implDir, `verify-scope-${storyId}.json`);
  fs.mkdirSync(implDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({
    schemaVersion: 1, ok, story: storyId, feature,
    checkedAt: new Date().toISOString(),
    storyFrs,
    ghostExports,
    sealedViolations,
    blockers
  }, null, 2), "utf8");

  console.log(`\nResult: ${ok ? "PASS" : "BLOCKED"} — ${path.relative(root, outFile)}`);
  if (!ok) {
    console.log(`Blockers: ${blockers.length}`);
    console.log("Fix ghost exports and sealed violations before proving compliance.");
  } else {
    console.log(`→ Next: aitri prove --story ${storyId} --feature ${feature}`);
  }
  return ok ? OK : ERROR;
}
