/**
 * Module: Command — status
 * Purpose: Display pipeline status with ASCII UI + rejection history.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS } from '../phases/index.js';
import { loadConfig } from '../state.js';

export function cmdStatus({ dir }) {
  const config   = loadConfig(dir);
  const approved = new Set(config.approvedPhases || []);

  console.log(`\n📊 Aitri — ${config.projectName || path.basename(dir)}`);
  console.log('─'.repeat(50));

  for (const p of Object.values(PHASE_DEFS)) {
    const exists     = fs.existsSync(path.join(dir, p.artifact));
    const isApproved = approved.has(p.num);
    const icon  = isApproved ? '✅' : exists ? '⏳' : '⬜';
    const label = isApproved ? 'Approved' : exists ? 'Awaiting approval' : 'Not started';
    console.log(`  ${icon} ${p.num}. ${p.name.padEnd(22)} ${label}`);
    if (p.num === 4 && isApproved) {
      const vPassed = config.verifyPassed;
      const vIcon   = vPassed ? '✅' : '⬜';
      const vLabel  = vPassed
        ? `Passed (${config.verifySummary?.passed}/${config.verifySummary?.total})`
        : 'Not run — required before Phase 5';
      console.log(`  ${vIcon}    Verify (tests)         ${vLabel}`);
    }
  }

  const rejections = config.rejections || {};
  const rejectedPhases = Object.keys(rejections);
  if (rejectedPhases.length) {
    console.log('\n  Rejection history:');
    for (const n of rejectedPhases) {
      const r = rejections[n];
      const d = new Date(r.at).toLocaleDateString();
      console.log(`    Phase ${n} (${d}): "${r.feedback}"`);
    }
  }

  const next = approved.size < 5 ? Math.max(0, ...approved) + 1 : null;
  console.log('─'.repeat(50));
  if (next) {
    console.log(`\n→ Next: aitri run-phase ${next}`);
  } else {
    console.log(`\n→ All phases complete! Run: aitri validate`);
  }
}
