/**
 * Module: Command — reject
 * Purpose: Record rejection with feedback. Prompts re-run with feedback applied.
 */

import { PHASE_DEFS, OPTIONAL_PHASES, PHASE_ALIASES } from '../phases/index.js';
import { loadConfig, saveConfig, appendEvent } from '../state.js';
import { scopeTokens } from '../scope.js';

export function cmdReject({ dir, args, flagValue, err, featureRoot, scopeName }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
  const raw      = args[0];
  const phase    = OPTIONAL_PHASES.includes(raw) ? raw : PHASE_ALIASES[raw] !== undefined ? PHASE_ALIASES[raw] : parseInt(raw);
  const feedback = flagValue('--feedback');
  const p        = PHASE_DEFS[phase];

  if (!p || !feedback) err(`Usage: aitri reject <requirements|architecture|tests|build|deploy|ux|discovery> --feedback "what to change"`);

  const key = p.alias || phase; // human-readable key for output messages
  const config = loadConfig(dir);
  if (!config.rejections) config.rejections = {};
  config.rejections[phase] = { at: new Date().toISOString(), feedback };
  // reject stays advisory by design: it records feedback and points at run-phase
  // (which withdraws approval + cascades). It deliberately does NOT mutate
  // approvedPhases itself — the rerun is where the state transition happens.
  appendEvent(config, 'rejected', phase, { feedback });
  saveConfig(dir, config);

  // Honesty: reject is advisory and never withdraws approval. On an ALREADY-APPROVED phase,
  // the old "rejected → rerun" line lied — status still showed ✅ Approved and the suggested
  // rerun re-printed the briefing without re-opening (idempotent re-read on an unchanged
  // artifact). Say what actually happened and what actually re-opens the phase.
  const isApproved = (config.approvedPhases || []).map(String).includes(String(phase));
  if (isApproved) {
    console.log(`📝 Rejection feedback recorded for Phase ${key} (advisory).`);
    console.log(`\n   Phase ${key} REMAINS approved — 'reject' records feedback, it does not withdraw approval.`);
    console.log(`   To act on it: edit the phase artifact to address the feedback, then re-run:`);
    console.log(`     aitri ${sv}run-phase${sa} ${key} --feedback "${feedback}"`);
    console.log(`   Re-running an UNCHANGED approved phase only re-prints it — the edit is what re-opens it and cascades downstream.`);
  } else {
    console.log(`🔄 Phase ${key} rejected.`);
    console.log(`\nRerun: aitri ${sv}run-phase${sa} ${key} --feedback "${feedback}"`);
  }
}
