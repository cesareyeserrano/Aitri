/**
 * Module: Phase Definitions Index
 * Purpose: Assembles PHASE_DEFS map from individual phase modules.
 *          Add new phases here — no other file needs to change.
 */

import phase1         from './phase1.js';
import phase2         from './phase2.js';
import phase3         from './phase3.js';
import phase4         from './phase4.js';
import phase5         from './phase5.js';
import phaseUX        from './phaseUX.js';
import phaseDiscovery from './phaseDiscovery.js';
import phaseReview    from './phaseReview.js';

export const PHASE_DEFS = {
  discovery: phaseDiscovery,
  1: phase1, 2: phase2, 3: phase3, 4: phase4, 5: phase5,
  ux: phaseUX,
  review: phaseReview,
};

export const OPTIONAL_PHASES = ['discovery', 'ux', 'review'];

/** Maps human-readable aliases to core phase numbers. e.g. 'requirements' → 1 */
export const PHASE_ALIASES = Object.fromEntries(
  Object.values(PHASE_DEFS)
    .filter(p => p.alias)
    .map(p => [p.alias, p.num])
);
