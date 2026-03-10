/**
 * Module: Command — approve
 * Purpose: Mark phase as approved. Unlocks next phase.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS } from '../phases/index.js';
import { loadConfig, saveConfig } from '../state.js';

const OPTIONAL_PHASES = ['discovery', 'ux'];

export function cmdApprove({ dir, args, err }) {
  const raw   = args[0];
  const phase = OPTIONAL_PHASES.includes(raw) ? raw : parseInt(raw);
  const p     = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri approve <1-5|ux|discovery>`);
  if (!fs.existsSync(path.join(dir, p.artifact))) {
    err(`Artifact missing. Complete phase ${phase} first.`);
  }

  const config = loadConfig(dir);
  config.approvedPhases = [...new Set([...(config.approvedPhases || []), phase])];
  saveConfig(dir, config);

  if (OPTIONAL_PHASES.includes(phase)) {
    console.log(`✅ Phase ${phase} (${p.name}) APPROVED`);
    console.log(`\n→ Continue with optional phases or run: aitri run-phase 1`);
  } else if (phase === 4) {
    console.log(`✅ Phase ${phase} APPROVED`);
    console.log(`\n→ Next: aitri verify  (run tests — required before Phase 5)`);
  } else if (phase < 5) {
    const next = PHASE_DEFS[phase + 1];
    console.log(`✅ Phase ${phase} APPROVED`);
    console.log(`\n→ Next: aitri run-phase ${phase + 1}  (${next.name} — ${next.persona})`);
  } else {
    console.log(`🎉 All 5 phases complete and approved!`);
    console.log(`Run: aitri validate`);
  }
}
