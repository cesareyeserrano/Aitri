/**
 * Module: Command — complete
 * Purpose: Validate artifact + record phase as complete. Gate before approve.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, saveConfig } from '../state.js';

export function cmdComplete({ dir, args, err }) {
  const raw       = args[0];
  const checkOnly = args.includes('--check');
  const phase     = OPTIONAL_PHASES.includes(raw) ? raw : parseInt(raw);
  const p         = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri complete <1-5|ux|discovery> [--check]`);

  const artifactPath = path.join(dir, p.artifact);
  if (!fs.existsSync(artifactPath)) {
    err(`Artifact not found: ${p.artifact}\nSave the file first, then run: aitri complete ${phase}`);
  }

  if (p.validate) {
    const content = fs.readFileSync(artifactPath, 'utf8');
    try {
      p.validate(content);
    } catch (e) {
      if (checkOnly) {
        console.log(`❌ Validation failed for ${p.artifact}:\n  ${e.message}`);
        process.exit(1);
      }
      err(`Artifact validation failed for ${p.artifact}:\n  ${e.message}\n\nFix the artifact and run: aitri complete ${phase}`);
    }
  }

  if (checkOnly) {
    console.log(`✅ ${p.artifact} — validation passed (dry run, state not recorded)`);
    return;
  }

  const config = loadConfig(dir);
  config.currentPhase    = phase;
  config.completedPhases = [...new Set([...(config.completedPhases || []), phase])];
  saveConfig(dir, config);

  console.log(`✅ Phase ${phase} (${p.name}) complete — ${p.artifact}`);
  console.log(`\nReview the output, then:`);
  console.log(`  Approved → aitri approve ${phase}`);
  console.log(`  Changes  → aitri reject ${phase} --feedback "what to change"`);
}
