/**
 * Module: lib/upgrade/ — reconciliation protocol entry point
 *
 * Implements `aitri adopt --upgrade` per ADR-027.
 *
 * Behaviors composed here, mapped to ADR-027 drift categories:
 *   - BLOCKING       artifactsDir recovery (without it, readers cannot locate
 *                    artifacts; classified BLOCKING per BACKLOG v2.0.0 catalog)
 *   - BLOCKING       per-version migrations via lib/upgrade/migrations/*
 *                    (e.g. TC requirement → requirement_id, NFR shape rewrite)
 *   - STATE-MISSING  phase inference from on-disk artifacts
 *   - CAPABILITY-NEW agent instruction files regeneration
 *   - VALIDATOR-GAP  reported via flagged findings; never auto-migrated
 *
 * ADR-027 Addendum invariants honored in this module:
 *   §1 Ordered writes + aitriVersion written LAST via a single saveConfig at
 *      the end of the run. No transactional atomicity promise. If any step
 *      throws, aitriVersion is not advanced and the user recovers via
 *      `git checkout -- spec/ .aitri/`.
 *   §2 Shape transforms only. Anything semantic (choosing an NFR category
 *      from free-text, splitting a multi-FR TC) is FLAGGED, never inferred.
 *   §3 Single entry point. lib/commands/adopt.js holds only a dispatcher.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig, artifactPath } from '../state.js';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { writeAgentFiles } from '../agent-files.js';
import { migrateAll } from './diagnose.js';

const CORE_PHASES = [1, 2, 3, 4, 5];

/**
 * Run the upgrade protocol end-to-end.
 *
 * @param {object} params
 * @param {string} params.dir      Project root.
 * @param {string} params.VERSION  Target Aitri CLI version (written to aitriVersion last).
 * @param {string} [params.rootDir] Aitri CLI root (for templates). If omitted, agent-files step is skipped.
 * @param {boolean} [params.dryRun=false] When true: run diagnose() across all
 *   modules and report what WOULD happen without writing artifacts, mutating
 *   `.aitri`, appending events, or regenerating agent instruction files. The
 *   in-memory config is still reshaped (artifactsDir recovery, inferred phase
 *   set) so the report reflects the post-upgrade state, but nothing persists.
 */
export function runUpgrade({ dir, VERSION, rootDir, dryRun = false }) {
  const config   = loadConfig(dir);
  const prevVer  = config.aitriVersion || '(unknown)';
  const completed = new Set(config.completedPhases || []);
  const approved  = new Set(config.approvedPhases  || []);

  // BLOCKING — artifactsDir recovery. Runs first because every subsequent
  // artifact read depends on artifactPath(config) pointing at the right dir.
  recoverArtifactsDir(dir, config, dryRun);

  // BLOCKING — per-version schema migrations. Each module is shape-only and
  // idempotent; flagged findings are surfaced in the report for agent action.
  const migrationResult = migrateAll(dir, config, VERSION, { dryRun });

  // STATE-MISSING — infer completedPhases from on-disk artifacts.
  // Approved or already-completed phases are not re-marked.
  const { inferred, skipped } = inferCompletedPhases(dir, config, completed, approved);

  if (!dryRun) {
    // Commit point — aitriVersion is written LAST (ADR-027 Addendum §1).
    config.completedPhases = [...completed];
    config.aitriVersion    = VERSION;
    // A1 (alpha.3): persist the list of unresolved findings so they survive past
    // the upgrade report and can drive a next-action priority. Snapshot model:
    // the whole array is replaced every time runUpgrade() runs, so stale items
    // are cleared automatically when the underlying drift is resolved.
    config.upgradeFindings = (migrationResult.flagged || []).map(f => ({
      target:     f.target,
      transform:  f.transform,
      reason:     f.reason || null,
      module:     f.module || null,
      category:   f.category || null,
      recordedAt: new Date().toISOString(),
    }));
    saveConfig(dir, config);
  }

  // REPORT.
  printReport({ config, prevVer, VERSION, inferred, skipped, dir, migrationResult, dryRun });

  // CAPABILITY-NEW — regenerate missing agent instruction files.
  // Runs after saveConfig because it does not affect the upgrade contract;
  // failure here should not prevent the version bump from persisting.
  // Skipped in dry-run — the preview must not touch disk.
  if (rootDir && !dryRun) {
    const created = writeAgentFiles(dir, rootDir);
    if (created.length) printAgentFilesGuidance(created);
  }
}

// ── STRUCTURE ─────────────────────────────────────────────────────────────────

function recoverArtifactsDir(dir, config, dryRun = false) {
  if (!config.artifactsDir) return;

  const hasAnyInDir = [...OPTIONAL_PHASES, ...CORE_PHASES].some(key =>
    fs.existsSync(artifactPath(dir, config, PHASE_DEFS[key].artifact))
  );
  if (hasAnyInDir) return;

  const hasAnyAtRoot = [...OPTIONAL_PHASES, ...CORE_PHASES].some(key =>
    fs.existsSync(path.join(dir, PHASE_DEFS[key].artifact))
  );
  if (!hasAnyAtRoot) return;

  const prefix = dryRun ? '[aitri] [DRY-RUN] Would correct' : '[aitri] Warning:';
  process.stderr.write(
    `${prefix} artifactsDir='${config.artifactsDir}' but no artifacts found there.\n` +
    `  Artifacts detected at project root — ${dryRun ? 'correction would set' : 'correcting'} artifactsDir to '' (root).\n\n`
  );
  // In-memory mutation. Persistence is gated by the caller; in dry-run
  // runUpgrade skips saveConfig, so this change never reaches disk.
  config.artifactsDir = '';
}

// ── STATE-MISSING ─────────────────────────────────────────────────────────────

function inferCompletedPhases(dir, config, completed, approved) {
  const inferred = [];
  const skipped  = [];

  for (const key of [...OPTIONAL_PHASES, ...CORE_PHASES]) {
    const p      = PHASE_DEFS[key];
    const exists = fs.existsSync(artifactPath(dir, config, p.artifact));
    if (!exists) continue;

    if (completed.has(p.num) || approved.has(p.num)) {
      skipped.push({ key, reason: approved.has(p.num) ? 'already approved' : 'already completed' });
    } else {
      completed.add(p.num);
      inferred.push(key);
    }
  }

  return { inferred, skipped };
}

// ── REPORT ────────────────────────────────────────────────────────────────────

function printReport({ config, prevVer, VERSION, inferred, skipped, dir, migrationResult, dryRun = false }) {
  const migrated = migrationResult?.migrated || [];
  const flagged  = migrationResult?.flagged  || [];

  const noOp = migrated.length === 0 && flagged.length === 0 && inferred.length === 0;
  const versionBumped = prevVer !== VERSION && prevVer !== '(unknown)';

  console.log(`\n🔄 Aitri Adopt — Upgrade${dryRun ? ' (DRY-RUN — no changes written)' : ''}`);
  console.log('─'.repeat(50));
  console.log(`  Project:  ${config.projectName || path.basename(dir)}`);

  // Version line: only show the arrow when the version actually changed.
  // Avoids the misleading "0.1.90 → 0.1.90" on re-runs (FEEDBACK H2).
  if (versionBumped) {
    const arrow = dryRun ? 'would bump' : '→';
    console.log(`  Version:  ${prevVer}  ${arrow}  ${VERSION}`);
  } else {
    console.log(`  Version:  ${VERSION} (already current)`);
  }

  // Clean-project short-circuit: when nothing to migrate, flag, or infer,
  // lead with an explicit no-op confirmation. Preserves the header for
  // traceability but skips the "Already tracked" list (redundant with
  // `aitri status`). FEEDBACK H1.
  if (noOp && skipped.length > 0) {
    // A3: distinguish "schema already canonical, version will bump" from
    // "nothing to do at all". "Already current" was ambiguous when combined
    // with a version bump above, because the version IS changing.
    if (versionBumped) {
      console.log(`\n  ✅ Schema already on canonical shape — only the version string ${dryRun ? 'would change' : 'will change'}.`);
    } else {
      console.log(`\n  ✅ Project is already current — nothing to migrate.`);
    }
    if (dryRun) console.log(`  (dry-run: re-running without --dry-run would be a no-op.)`);
    console.log(`\n  Run: aitri status  to see current state`);
    console.log('─'.repeat(50));
    return;
  }

  if (migrated.length) {
    const header = dryRun ? 'Schema migrations that WOULD apply:' : 'Schema migrations applied:';
    console.log(`\n  ${header}`);
    for (const f of migrated) {
      const mark = dryRun ? '◻️ ' : '✅';
      console.log(`    ${mark} [${f.module}] ${f.target}`);
      console.log(`       ${f.transform}`);
    }
  }

  if (flagged.length) {
    console.log(`\n  Flagged for agent review (shape-only migrator cannot auto-fix):`);
    for (const f of flagged) {
      console.log(`    ⚠️  [${f.module}] ${f.target}`);
      console.log(`       ${f.transform}`);
      if (f.reason) console.log(`       Reason: ${f.reason}`);
    }
  }

  if (inferred.length) {
    const header = dryRun ? 'Phases that WOULD be inferred from artifacts:' : 'Phases inferred from artifacts:';
    console.log(`\n  ${header}`);
    for (const key of inferred) {
      const p = PHASE_DEFS[key];
      const mark = dryRun ? '◻️ ' : '✅';
      console.log(`    ${mark} ${String(p.num).padEnd(12)} ${p.artifact}`);
    }
    if (dryRun) {
      console.log(`\n  Running without --dry-run would mark these as completed (not approved).`);
    } else {
      console.log(`\n  These phases are now marked as completed (not approved).`);
      console.log(`  Run: aitri approve <phase>  to approve after reviewing the artifact.`);
    }
  }

  if (skipped.length) {
    console.log(`\n  Already tracked (unchanged):`);
    for (const { key, reason } of skipped) {
      const p = PHASE_DEFS[key];
      console.log(`    ─  ${String(p.num).padEnd(12)} ${reason}`);
    }
  }

  if (!inferred.length && !skipped.length) {
    console.log(`\n  No artifacts found — nothing to infer.`);
    if (!dryRun) console.log(`  aitriVersion updated to v${VERSION}.`);
  }

  if (dryRun) {
    console.log(`\n  To apply these changes: aitri adopt --upgrade`);
  } else {
    console.log(`\n  Run: aitri status  to see current state`);
  }
  console.log('─'.repeat(50));
}

function printAgentFilesGuidance(created) {
  console.log(`\n  Agent instruction files written: ${created.join(', ')}`);
  console.log(`  These are meant to be committed — they bootstrap any agent (Claude, Gemini,`);
  console.log(`  Codex, …) operating on the project. If your team standardizes on one agent,`);
  console.log(`  it is safe to delete the others; Aitri will only regenerate missing files.`);
}
