/**
 * Module: Command — run-phase
 * Purpose: Print phase briefing to stdout. Agent reads and acts on it.
 */

import { PHASE_DEFS } from '../phases/index.js';
import { loadConfig, saveConfig, readArtifact } from '../state.js';

export function cmdRunPhase({ dir, args, flagValue, err }) {
  const phase    = parseInt(args[0]);
  const feedback = flagValue('--feedback');
  const p        = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri run-phase <1-5> [--feedback "text"]`);

  if (phase === 5) {
    const config = loadConfig(dir);
    if (!config.verifyPassed) {
      err(`Phase 5 requires test verification first.\nRun: aitri verify  →  aitri verify-complete`);
    }
  }

  const inputs = {};
  for (const filename of p.inputs) {
    const raw = readArtifact(dir, filename);
    if (!raw) err(`Missing required file: ${filename}\nRun previous phases first.`);
    const producer = Object.values(PHASE_DEFS).find(x => x.artifact === filename);
    inputs[filename] = producer?.extractContext ? producer.extractContext(raw) : raw;
  }

  const config = loadConfig(dir);
  config.currentPhase   = phase;
  config.approvedPhases = (config.approvedPhases || []).filter(n => n !== phase);
  saveConfig(dir, config);

  console.log(p.buildBriefing({ dir, inputs, feedback }));
}
