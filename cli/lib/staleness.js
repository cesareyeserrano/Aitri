// cli/lib/staleness.js
// EVO-044: Detect when pre-planning artifacts are newer than downstream artifacts
import fs from "node:fs";
import path from "node:path";

/**
 * Returns relative paths of sourceFiles that are newer than downstreamFile.
 * Returns [] when downstreamFile doesn't exist (fresh run — not stale).
 */
export function checkStaleness(sourceFiles, downstreamFile, cwd = process.cwd()) {
  if (!fs.existsSync(downstreamFile)) return [];
  const downstreamMtime = fs.statSync(downstreamFile).mtimeMs;
  return sourceFiles
    .filter(src => fs.existsSync(src) && fs.statSync(src).mtimeMs > downstreamMtime)
    .map(src => path.relative(cwd, src));
}

/**
 * Prints a staleness warning if any pre-planning artifacts are newer than downstreamFile.
 * Returns true if stale (warning printed), false if fresh.
 */
export function warnIfStale({ sourceFiles, downstreamFile, downstreamLabel, forceFlag, cwd }) {
  const stale = checkStaleness(sourceFiles, downstreamFile, cwd);
  if (stale.length === 0) return false;
  console.log(`\nWARN: Stale context detected.`);
  console.log(`  ${downstreamLabel} was generated before these artifacts were updated:`);
  stale.forEach(f => console.log(`    - ${f}`));
  console.log(`  ${forceFlag}`);
  console.log("");
  return true;
}
