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

/**
 * `config.rejections` carries an entry the operator wrote with `aitri reject`.
 * Auto-completing the phase would orphan the rejection record and corrupt
 * operator intent, so we skip — symmetric with how §3 preserves approvals.
 *
 * Keys are written by `reject.js` either as numeric phases (1-5) or the
 * optional-phase string ('ux'/'discovery'/'review'); JSON normalises numeric
 * keys to strings on round-trip. Comparing via String() covers both.
 */
function isRejected(rejections, phaseNum) {
  if (!rejections) return false;
  return Object.prototype.hasOwnProperty.call(rejections, String(phaseNum));
}

/**
 * "in_progress" = the operator ran `aitri run-phase` (artifact exists,
 * `started` event present) but never ran `aitri complete` for that phase.
 * Auto-marking it `completed` bypasses validate(), so we skip — the operator
 * must close the phase deliberately.
 *
 * `events[]` is capped, so an old, evicted `completed` may not be visible.
 * The conservative read: a phase is "in progress" only if there is positive
 * evidence (a `started` event) without a matching `completed` afterwards.
 * Absence of both = legacy upgrade with nothing in the buffer; fall through
 * to the existing inference (treat as completed) so old projects still work.
 */
function isInProgress(events, phaseNum) {
  if (!Array.isArray(events) || events.length === 0) return false;
  const target = String(phaseNum);
  let started = false;
  let completedSinceStart = false;
  for (const e of events) {
    if (String(e.phase) !== target) continue;
    if (e.event === 'started')   { started = true;  completedSinceStart = false; }
    if (e.event === 'completed') { completedSinceStart = true; }
    if (e.event === 'approved')  { completedSinceStart = true; }
  }
  return started && !completedSinceStart;
}

/**
 * Third edge case the alpha.10 fix did not cover (Ultron canary 2026-04-29).
 *
 * If `events[]` is non-empty and the phase has NO events at all (not started,
 * not completed, not approved, not rejected), the artifact on disk is most
 * likely STALE — typically a leftover from a prior build that was wiped from
 * `completedPhases` by `cascadeInvalidate` when the operator re-approved a
 * lower phase. Inferring it as completed in that case bypasses validate() on
 * out-of-date content and silently re-introduces a phase the cascade
 * deliberately removed.
 *
 * Conservative read:
 *   - events[] empty             → legacy upgrade (events buffer not yet
 *                                   in use) → fall through to legacy
 *                                   artifact-based inference.
 *   - events[] non-empty + phase has at least one event → trust the
 *     other helpers (isInProgress / completed.has / approved.has /
 *     isRejected) to make the call.
 *   - events[] non-empty + phase has NO events → preserve, do NOT infer.
 */
function hasNoEventHistory(events, phaseNum) {
  if (!Array.isArray(events) || events.length === 0) return false;
  const target = String(phaseNum);
  return !events.some(e => String(e.phase) === target);
}

function inferCompletedPhases(dir, config, completed, approved) {
  const inferred = [];
  const skipped  = [];
  const events     = config.events     || [];
  const rejections = config.rejections || {};

  for (const key of [...OPTIONAL_PHASES, ...CORE_PHASES]) {
    const p      = PHASE_DEFS[key];
    const exists = fs.existsSync(artifactPath(dir, config, p.artifact));
    if (!exists) continue;

    if (completed.has(p.num) || approved.has(p.num)) {
      skipped.push({ key, reason: approved.has(p.num) ? 'already approved' : 'already completed' });
      continue;
    }

    if (isRejected(rejections, p.num)) {
      skipped.push({ key, reason: 'rejected, not auto-completed' });
      continue;
    }

    if (isInProgress(events, p.num)) {
      skipped.push({ key, reason: 'in progress, not auto-completed' });
      continue;
    }

    if (hasNoEventHistory(events, p.num)) {
      skipped.push({ key, reason: 'no event history, possibly stale (not auto-completed)' });
      continue;
    }

    completed.add(p.num);
    inferred.push(key);
  }

  return { inferred, skipped };
}

// ── REPORT ────────────────────────────────────────────────────────────────────

function printReport({ config, prevVer, VERSION, inferred, skipped, dir, migrationResult, dryRun = false }) {
  const migrated = migrationResult?.migrated || [];
  const flagged  = migrationResult?.flagged  || [];

  // Two separate skip groups so the report is readable:
  //   - trackedSkipped   : already approved/completed — informational only.
  //   - preservedSkipped : the operator's intent forced us to leave the phase
  //                        as-is (rejected, in-progress, or no event history).
  //                        Must be surfaced even on otherwise no-op runs so
  //                        the operator can act.
  const PRESERVED_REASONS = new Set([
    'rejected, not auto-completed',
    'in progress, not auto-completed',
    'no event history, possibly stale (not auto-completed)',
  ]);
  const trackedSkipped   = skipped.filter(s => !PRESERVED_REASONS.has(s.reason));
  const preservedSkipped = skipped.filter(s =>  PRESERVED_REASONS.has(s.reason));

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
  // `aitri status`). FEEDBACK H1. Preserved skips (rejected / in-progress)
  // still print — the operator must see them to act.
  if (noOp && trackedSkipped.length > 0 && preservedSkipped.length === 0) {
    // A3: distinguish "schema already canonical, version will bump" from
    // "nothing to do at all". "Already current" was ambiguous when combined
    // with a version bump above, because the version IS changing.
    if (versionBumped) {
      console.log(`\n  ✅ Schema already on canonical shape — only the version string ${dryRun ? 'would change' : 'will change'}.`);
    } else {
      console.log(`\n  ✅ Project is already current — nothing to migrate.`);
    }
    // Only claim "no-op" when there is genuinely nothing to write. A version
    // bump IS a write — a user who reads "no-op" and skips the upgrade leaves
    // the project pinned to the old version and `health.deployable` blocked.
    if (dryRun && !versionBumped) {
      console.log(`  (dry-run: re-running without --dry-run would be a no-op.)`);
    }
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

    // Z2 backfill caveat — surface the silent assumption that current on-disk
    // state IS the approved baseline. If the operator modified an artifact
    // post-approval but pre-upgrade, the backfill locks that change in as
    // approved, and `aitri status` will show no drift. There is no prior
    // baseline to compare against — the lock-in is correct given missing
    // information, but the operator should know.
    const hasArtifactHashesBackfill = migrated.some(f =>
      typeof f.target === 'string' && f.target.startsWith('.aitri#artifactHashes')
    );
    if (hasArtifactHashesBackfill) {
      const verb = dryRun ? 'would be stamped' : 'were stamped';
      console.log(`\n  ⚠️  Note: artifactHashes ${verb} from current on-disk state.`);
      console.log(`     If you modified an artifact after approval but before this upgrade, that change`);
      console.log(`     is now the approved baseline (no drift visible). Compare git history if unsure.`);
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

  if (trackedSkipped.length) {
    console.log(`\n  Already tracked (unchanged):`);
    for (const { key, reason } of trackedSkipped) {
      const p = PHASE_DEFS[key];
      console.log(`    ─  ${String(p.num).padEnd(12)} ${reason}`);
    }
  }

  if (preservedSkipped.length) {
    console.log(`\n  Preserved (operator action required):`);
    for (const { key, reason } of preservedSkipped) {
      const p = PHASE_DEFS[key];
      console.log(`    ⚠️  ${String(p.num).padEnd(12)} ${reason}`);
    }
    console.log(`\n  These phases were NOT auto-completed. Operator intent (rejection,`);
    console.log(`  in-progress work, or no recorded activity) takes precedence — re-run`);
    console.log(`  the phase or run  aitri complete <phase>  /  aitri approve <phase>`);
    console.log(`  deliberately. If the artifact on disk is stale (e.g. a leftover from a`);
    console.log(`  prior cascade-invalidated build), delete it before next upgrade.`);
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
