/**
 * Module: Command — complete
 * Purpose: Validate artifact + record phase as complete. Gate before approve.
 */

import fs from 'fs';
import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { loadConfig, saveConfig, artifactPath, appendEvent, clearDriftPhase, hashArtifact } from '../state.js';
import { runReview, printReview } from './review.js';

export function cmdComplete({ dir, args, err }) {
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
    err(`Artifact not found: ${p.artifact}${hint}\nSave the file first, then run: aitri complete ${key}`);
  }

  const content = fs.readFileSync(artPath, 'utf8');

  if (p.validate) {
    try {
      p.validate(content, { dir, config });
    } catch (e) {
      if (checkOnly) {
        console.log(`❌ Validation failed for ${p.artifact}:\n  ${e.message}`);
        process.exit(1);
      }
      err(`Artifact validation failed for ${p.artifact}:\n  ${e.message}\n\nFix the artifact and run: aitri complete ${key}`);
    }
  }

  if (checkOnly) {
    console.log(`✅ ${p.artifact} — validation passed (dry run, state not recorded)`);
    return;
  }

  // Cross-artifact review gate — phase 3: req→TC checks; phase 5: TC→Results checks
  if (phase === 3 || phase === 5) {
    const scope = phase === 3 ? 'phase3' : 'phase5';
    const review = runReview(dir, config, scope);
    if (review.errors.length) {
      printReview(review);
      err(`Cross-artifact errors found — fix and run: aitri complete ${key}`);
    }
    if (review.warnings.length) {
      printReview({ errors: [], warnings: review.warnings });
      if (process.stdin.isTTY) {
        process.stdout.write(`\nWarnings found — acknowledge to continue? (y/N): `);
        const buf = Buffer.alloc(10);
        const bytes = fs.readSync(0, buf, 0, 10, null);
        const answer = buf.subarray(0, bytes).toString().trim().toLowerCase();
        if (answer !== 'y' && answer !== 'yes') {
          process.stderr.write(`\n❌ Complete cancelled — resolve warnings or re-run to acknowledge.\n`);
          process.exit(1);
        }
      }
    }
  }

  config.currentPhase    = phase;
  config.completedPhases = [...new Set([...(config.completedPhases || []), phase])];
  clearDriftPhase(config, phase);
  // Update artifact hash so hasDrift() returns false after complete — artifact is now in accepted state
  config.artifactHashes = { ...(config.artifactHashes || {}), [String(phase)]: hashArtifact(content) };
  appendEvent(config, 'completed', phase);
  saveConfig(dir, config);

  console.log(`✅ Phase ${key} (${p.name}) complete — ${p.artifact}`);
  console.log(`\nReview the output, then:`);
  console.log(`  Approved → aitri approve ${key}`);
  console.log(`  Changes  → aitri reject ${key} --feedback "what to change"`);
}
