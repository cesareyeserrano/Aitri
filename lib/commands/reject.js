/**
 * Module: Command — reject
 * Purpose: Record rejection with feedback. Prompts re-run with feedback applied.
 */

import { PHASE_DEFS } from '../phases/index.js';
import { loadConfig, saveConfig } from '../state.js';

export function cmdReject({ dir, args, flagValue, err }) {
  const phase    = parseInt(args[0]);
  const feedback = flagValue('--feedback');
  const p        = PHASE_DEFS[phase];

  if (!p || !feedback) err(`Usage: aitri reject <1-5> --feedback "what to change"`);

  const config = loadConfig(dir);
  if (!config.rejections) config.rejections = {};
  config.rejections[phase] = { at: new Date().toISOString(), feedback };
  saveConfig(dir, config);

  console.log(`🔄 Phase ${phase} rejected.`);
  console.log(`\nRerun: aitri run-phase ${phase} --feedback "${feedback}"`);
}
