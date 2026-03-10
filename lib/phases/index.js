/**
 * Module: Phase Definitions Index
 * Purpose: Assembles PHASE_DEFS map from individual phase modules.
 *          Add new phases here — no other file needs to change.
 */

import phase1 from './phase1.js';
import phase2 from './phase2.js';
import phase3 from './phase3.js';
import phase4 from './phase4.js';
import phase5 from './phase5.js';

export const PHASE_DEFS = { 1: phase1, 2: phase2, 3: phase3, 4: phase4, 5: phase5 };
