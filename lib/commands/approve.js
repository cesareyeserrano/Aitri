/**
 * Module: Command — approve
 * Purpose: Mark phase as approved. Unlocks next phase.
 *          Gate: requires aitri complete <phase> to have passed first.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, saveConfig } from '../state.js';

function askChecklist(phase) {
  if (!process.stdin.isTTY) return; // non-interactive — skip (CI/scripts/tests)
  process.stdout.write(
    `\n⚠️  Human Review required before approving Phase ${phase}.\n` +
    `   Check the "Human Review" checklist at the end of the Phase ${phase} briefing.\n` +
    `   Have you completed every checklist item? (y/N): `
  );
  const buf = Buffer.alloc(10);
  const bytes = fs.readSync(0, buf, 0, 10, null);
  const answer = buf.subarray(0, bytes).toString().trim().toLowerCase();
  if (answer !== 'y' && answer !== 'yes') {
    process.stderr.write(
      `\n❌ Approval cancelled — complete the Human Review checklist first.\n` +
      `   Tip: run 'aitri run-phase ${phase}' to see the checklist.\n`
    );
    process.exit(1);
  }
}

export function cmdApprove({ dir, args, err }) {
  const raw   = args[0];
  const phase = OPTIONAL_PHASES.includes(raw) ? raw : parseInt(raw);
  const p     = PHASE_DEFS[phase];

  if (!p) err(`Usage: aitri approve <1-5|ux|discovery|review>`);
  if (!fs.existsSync(path.join(dir, p.artifact))) {
    err(`Artifact missing. Complete phase ${phase} first.`);
  }

  const config = loadConfig(dir);
  const completed = new Set(config.completedPhases || []);
  if (!completed.has(phase)) {
    err(`Phase ${phase} has not been validated.\nRun: aitri complete ${phase}  (must pass before approving)`);
  }

  askChecklist(phase);

  config.approvedPhases = [...new Set([...(config.approvedPhases || []), phase])];
  saveConfig(dir, config);

  const bar = '─'.repeat(60);

  if (OPTIONAL_PHASES.includes(phase)) {
    console.log(`✅ Phase ${phase} (${p.name}) APPROVED`);
    console.log(`\n→ Continue with optional phases or run: aitri run-phase 1`);
  } else if (phase === 4) {
    console.log(`✅ Phase 4 (${p.name}) APPROVED\n`);
    console.log(bar);
    console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
    console.log(`  aitri verify-run\n`);
    console.log(`Do NOT write code, choose a route, or skip ahead.`);
    console.log(`aitri verify-run executes your test suite — then aitri verify-complete unlocks Phase 5.`);
    console.log(bar);
  } else if (phase < 5) {
    const next = PHASE_DEFS[phase + 1];
    console.log(`✅ Phase ${phase} (${p.name}) APPROVED\n`);
    console.log(bar);
    console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
    console.log(`  aitri run-phase ${phase + 1}\n`);
    console.log(`Do NOT choose a route, skip phases, or implement anything yet.`);
    console.log(`Phase ${phase + 1} (${next.name} — ${next.persona}) must run next.`);
    console.log(`The pipeline decides the route. You execute it.`);
    console.log(bar);
  } else {
    console.log(`🎉 All 5 phases complete and approved!`);
    console.log(`Run: aitri validate`);
  }
}
