/**
 * Module: Command — reject
 * Purpose: Record rejection with feedback. Prompts re-run with feedback applied.
 */

import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, saveConfig, appendEvent } from '../state.js';

export function cmdReject({ dir, args, flagValue, err }) {
  const raw      = args[0];
  const phase    = OPTIONAL_PHASES.includes(raw) ? raw : parseInt(raw);
  const feedback = flagValue('--feedback');
  const p        = PHASE_DEFS[phase];

  if (!p || !feedback) err(`Usage: aitri reject <1-5|ux|discovery> --feedback "what to change"`);

  const config = loadConfig(dir);
  if (!config.rejections) config.rejections = {};
  config.rejections[phase] = { at: new Date().toISOString(), feedback };
  appendEvent(config, 'rejected', phase, { feedback });
  saveConfig(dir, config);

  console.log(`🔄 Phase ${phase} rejected.`);
  console.log(`\nRerun: aitri run-phase ${phase} --feedback "${feedback}"`);
}
