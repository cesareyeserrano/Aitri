/**
 * Module: Command — rehash
 * Purpose: Update `artifactHashes[phase]` to match the current artifact
 *          content, WITHOUT touching approval/completion state. A narrow
 *          escape hatch for legacy projects where a past Aitri version
 *          stored a hash that no longer matches current content even though
 *          the artifact was not changed from its reviewed state (e.g. the
 *          artifact was overwritten by a commit that updated the file but
 *          did not go through `aitri approve`).
 *
 * Why this exists (A5, v2.0.0-alpha.3+):
 *   Re-approving a phase to fix a stale hash cascades invalidation to every
 *   downstream phase. On a project where the content is actually already
 *   reviewed (git log shows the artifact was last modified in a commit the
 *   operator vouches for), that cascade is pure re-work. `rehash` resolves
 *   the bookkeeping without the cascade.
 *
 * Guardrails:
 *   - Refuses if the phase has no stored hash (nothing to rehash).
 *   - Refuses if current and stored hash already match (no drift).
 *   - Refuses if `git diff HEAD -- <artifact>` reports uncommitted changes —
 *     in that case the drift reflects real content change; the operator must
 *     either stash the change or re-approve (deliberate cascade).
 *   - Refuses if git is not available (cannot verify cleanness).
 *   - isTTY-gated: a human must confirm the rehash. Agent-safe by design:
 *     running non-interactive prints a helpful error and exits 1.
 *
 * Invariants preserved:
 *   - state.js single point of write for `.aitri` (uses saveConfig).
 *   - One-phase-one-persona unaffected (rehash is meta, not a phase).
 *   - Cascade NOT triggered (that is the whole point).
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig, saveConfig, hashArtifact, artifactPath, appendEvent, clearDriftPhase, writeLastSession } from '../state.js';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { readStdinSync } from '../read-stdin.js';

function resolvePhase(raw) {
  if (OPTIONAL_PHASES.includes(raw)) return raw;
  if (PHASE_ALIASES[raw] !== undefined) return PHASE_ALIASES[raw];
  const n = parseInt(raw);
  return Number.isNaN(n) ? null : n;
}

function gitFileIsClean(dir, artifactRelPath) {
  try {
    const out = execSync(
      `git diff HEAD -- ${JSON.stringify(artifactRelPath)}`,
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
    ).trim();
    return { ok: true, clean: out.length === 0 };
  } catch {
    // git not available, not a repo, or file never tracked — refuse to rehash
    // because we cannot verify cleanness. Operator should re-approve instead.
    return { ok: false, clean: false };
  }
}

export function cmdRehash({ dir, args, err }) {
  const raw = args[0];
  if (!raw) {
    err(
      'Usage: aitri rehash <phase>\n' +
      '  Update the stored artifact hash to match the current artifact content\n' +
      '  without touching approval state. Use when `aitri status` reports drift\n' +
      '  on a phase whose artifact has no uncommitted changes (legacy bookkeeping).\n' +
      '  Phases: requirements|architecture|tests|build|deploy|ux|discovery'
    );
  }

  const phase = resolvePhase(raw);
  const p     = PHASE_DEFS[phase];
  if (!p) err(`Unknown phase: ${raw}`);

  const key    = p.alias || phase;
  const config = loadConfig(dir);
  const artFile = p.artifact;
  const artAbs  = artifactPath(dir, config, artFile);
  const artRel  = path.relative(dir, artAbs);

  if (!fs.existsSync(artAbs)) {
    err(`Artifact missing: ${artFile}. Nothing to rehash.`);
  }

  const stored = (config.artifactHashes || {})[String(phase)];
  if (!stored) {
    err(
      `Phase ${key} has no stored hash — nothing to rehash.\n` +
      `  Rehash only fixes a stale hash on a phase that was previously approved.\n` +
      `  If you want to approve for the first time, run: aitri approve ${key}`
    );
  }

  const current = hashArtifact(fs.readFileSync(artAbs, 'utf8'));
  if (current === stored) {
    console.log(`✅ Phase ${key} hash already matches — no rehash needed.`);
    return;
  }

  // Clean-git gate: if the artifact has uncommitted changes, rehash is the
  // wrong tool. The operator must either stash the change, or re-approve
  // (and accept the cascade because downstream may genuinely need review).
  const gitCheck = gitFileIsClean(dir, artRel);
  if (!gitCheck.ok) {
    err(
      `Cannot verify clean git state for ${artRel} (git not available or file not tracked).\n` +
      `  rehash requires git to guarantee you are not silently accepting un-reviewed changes.\n` +
      `  If the artifact really is reviewed and committed, run: aitri approve ${key}`
    );
  }
  if (!gitCheck.clean) {
    err(
      `${artRel} has uncommitted changes — rehash refuses to bookkeep over real drift.\n` +
      `  Option 1: stash or commit the change, then re-run rehash.\n` +
      `  Option 2: if the changes are the new reviewed state, run: aitri approve ${key}\n` +
      `            (this will re-approve and cascade downstream phases per Aitri's normal model).`
    );
  }

  if (!process.stdin.isTTY) {
    process.stderr.write(
      `\n❌ Phase ${key} rehash requires human confirmation.\n` +
      `   git shows no uncommitted changes to ${artRel}, but an agent cannot\n` +
      `   unilaterally update the approved-content baseline.\n` +
      `   Run 'aitri rehash ${key}' manually in your terminal.\n`
    );
    process.exit(1);
  }

  console.log(`\n🔄 Aitri — Rehash Phase ${key}`);
  console.log('─'.repeat(50));
  console.log(`  Artifact:     ${artFile}`);
  console.log(`  Stored hash:  ${stored}`);
  console.log(`  Current hash: ${current}`);
  console.log(`  Git state:    clean (no uncommitted changes)`);
  console.log(`\n  Rehash will update the stored baseline to the current content.`);
  console.log(`  Approval state is preserved. Downstream phases are NOT invalidated.`);
  console.log(`  Use this only when the drift reflects legacy bookkeeping (hash algo`);
  console.log(`  drift, commit that updated the artifact without going through approve).`);
  process.stdout.write(`\n  Proceed? (y/N): `);
  const ans = readStdinSync(10).trim().toLowerCase();
  if (ans !== 'y' && ans !== 'yes') {
    process.stderr.write(`\n❌ Rehash cancelled.\n`);
    process.exit(1);
  }

  config.artifactHashes = { ...(config.artifactHashes || {}), [String(phase)]: current };
  clearDriftPhase(config, phase);
  appendEvent(config, 'rehash', String(phase), {
    artifact:    artFile,
    before_hash: stored,
    after_hash:  current,
  });
  writeLastSession(config, dir, `rehash ${key}`);
  saveConfig(dir, config);

  console.log(`\n✅ Phase ${key} rehashed. Drift cleared without cascade.`);
  console.log(`   Run: aitri status  to verify.`);
  console.log('─'.repeat(50));
}
