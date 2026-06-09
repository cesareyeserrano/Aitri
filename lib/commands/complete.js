/**
 * Module: Command — complete
 * Purpose: Validate artifact + record phase as complete. Gate before approve.
 */

import fs from 'fs';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES, upstreamProducers } from '../phases/index.js';
import { loadConfig, saveConfig, artifactPath, appendEvent, clearDriftPhase, hashArtifact, writeLastSession, cascadeInvalidate, clearCascadePending } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
import { runReview, printReview } from './review.js';
import { scopeTokens } from '../scope.js';

export function cmdComplete({ dir, args, err, featureRoot, scopeName }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
  const raw       = args[0];
  const checkOnly = args.includes('--check');
  const phase     = OPTIONAL_PHASES.includes(raw) ? raw : PHASE_ALIASES[raw] !== undefined ? PHASE_ALIASES[raw] : parseInt(raw);
  const p         = PHASE_DEFS[phase];
  const key       = p?.alias || phase; // human-readable key for output messages

  if (!p) err(`Usage: aitri complete <requirements|architecture|tests|build|deploy|ux|discovery> [--check]`);

  const config   = loadConfig(dir);
  const artPath  = artifactPath(dir, config, p.artifact);

  if (!fs.existsSync(artPath)) {
    const hint = config.artifactsDir ? ` (looking in ${config.artifactsDir}/${p.artifact})` : '';
    err(`Artifact not found: ${p.artifact}${hint}\nSave the file first, then run: aitri ${sv}complete${sa} ${key}`);
  }

  // Ordering gate (§3.1, rc.64 adopter): a phase cannot be completed on top of an
  // upstream phase that was never validated. Without this, a silently-failed
  // `complete requirements` still lets architecture→…→deploy be completed/approved
  // over a Phase 1 with no stored state, and the pipeline reports "5/5 complete".
  // Each required input must come from a phase that is itself completed.
  const completedSet = new Set((config.completedPhases || []).map(String));
  const unmet = upstreamProducers(phase).filter(u => !completedSet.has(String(u.phase)));
  if (unmet.length) {
    err(
      `Cannot complete ${key} — upstream phase(s) not yet completed: ${unmet.map(u => `${u.alias} (${u.artifact})`).join(', ')}.\n` +
      `  A phase must not be built on an unvalidated upstream. Complete them first:\n` +
      `    ${unmet.map(u => `aitri ${sv}complete${sa} ${u.alias}`).join('\n    ')}`
    );
  }

  const content = fs.readFileSync(artPath, 'utf8');

  if (p.validate) {
    try {
      p.validate(content, { dir, config, featureRoot });
    } catch (e) {
      if (checkOnly) {
        console.log(`❌ Validation failed for ${p.artifact}:\n  ${e.message}`);
        process.exit(1);
      }
      err(`Artifact validation failed for ${p.artifact}:\n  ${e.message}\n\nFix the artifact and run: aitri ${sv}complete${sa} ${key}`);
    }
  }

  if (checkOnly) {
    console.log(`✅ ${p.artifact} — validation passed (dry run, state not recorded)`);
    return;
  }

  // Cross-artifact review gate — phase 1: source-capture audit (advisory, no errors);
  // phase 3: req→TC checks; phase 5: TC→Results checks
  if (phase === 1 || phase === 3 || phase === 5) {
    const scope = phase === 1 ? 'phase1' : phase === 3 ? 'phase3' : 'phase5';
    const review = runReview(dir, config, scope);
    if (review.errors.length) {
      printReview(review);
      err(`Cross-artifact errors found — fix and run: aitri ${sv}complete${sa} ${key}`);
    }
    if (review.warnings.length) {
      printReview({ errors: [], warnings: review.warnings });
      if (process.stdin.isTTY) {
        process.stdout.write(`\nWarnings found — acknowledge to continue? (y/N): `);
        const answer = readStdinSync(10).trim().toLowerCase();
        if (answer !== 'y' && answer !== 'yes') {
          process.stderr.write(`\n❌ Complete cancelled — resolve warnings or re-run to acknowledge.\n`);
          process.exit(1);
        }
      }
    }
  }

  config.currentPhase    = phase;
  config.completedPhases = [...new Set([...(config.completedPhases || []), phase])];

  // Re-opening an APPROVED phase whose content changed. The normal flow
  // (run-phase → complete → approve) is safe because run-phase removes the phase
  // from approvedPhases first. But `complete <phase>` run directly on a phase
  // that is still approved AND whose artifact was edited on disk would otherwise
  // re-stamp the hash (laundering the drift) while leaving downstream phases
  // approved against the old content — bypassing the cascade that `approve`-
  // after-drift and `run-phase` perform. Detect it (stored hash present and
  // differs) and re-open: withdraw approval + cascade-invalidate downstream.
  const newHash        = hashArtifact(content);
  const storedHash     = (config.artifactHashes || {})[String(phase)];
  const wasApproved    = (config.approvedPhases || []).some(x => String(x) === String(phase));
  const contentChanged = !!storedHash && newHash !== storedHash;
  let cascaded = [];
  if (wasApproved && contentChanged) {
    config.approvedPhases = (config.approvedPhases || []).filter(x => String(x) !== String(phase));
    cascaded = cascadeInvalidate(config, phase);
  }

  clearDriftPhase(config, phase);
  clearCascadePending(config, phase);   // C5b: this phase has been re-derived
  // Update artifact hash so hasDrift() returns false after complete — artifact is now in accepted state
  config.artifactHashes = { ...(config.artifactHashes || {}), [String(phase)]: newHash };
  appendEvent(config, 'completed', phase);
  writeLastSession(config, dir, `complete ${key}`);
  saveConfig(dir, config);

  console.log(`✅ Phase ${key} (${p.name}) complete — ${p.artifact}`);
  if (wasApproved && contentChanged) {
    console.log(`\n⚠ Phase ${key} was approved and its content changed — approval withdrawn; it needs re-approval.`);
    if (cascaded.length)
      console.log(`  Downstream invalidated (re-validate after re-approval): ${cascaded.join(', ')}`);
  }
  console.log(`\nReview the output, then:`);
  console.log(`  Approved → aitri ${sv}approve${sa} ${key}`);
  console.log(`  Changes  → aitri ${sv}reject${sa} ${key} --feedback "what to change"`);
}
