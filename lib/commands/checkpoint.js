/**
 * Module: Command — checkpoint
 * Purpose: Write a session checkpoint — records what's in progress so the next
 *          session/agent can pick up exactly where this one left off.
 *
 *          aitri checkpoint --context "implementing FR-003, JWT done, pending error handling"
 *          aitri checkpoint --list
 *          aitri checkpoint --name "pre-refactor"  (saves resume snapshot to checkpoints/)
 *
 *          The --context value is stored in .aitri.local lastSession alongside auto-detected
 *          agent, files_touched (git diff), and timestamp. aitri resume reads it.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig, writeLastSession, writeSessionContext } from '../state.js';
import { buildProjectSnapshot } from '../snapshot.js';
import { cmdResume } from './resume.js';

// The mechanical counts the narrative is written against (BUG-STATE-VISIBLE-0909). A
// narrative that says "9 bugs fixed, 2 open, BL-040 pending" is true for exactly one
// state; stamping that state lets `resume` flag the text when bugs/backlog move — by
// CONTENT, not by clock. Snapshot failure degrades to "no stamp" (pre-rc.14 behavior).
function stateAtSaveFor(dir) {
  try {
    const snap = buildProjectSnapshot(dir);
    return {
      activeBugs:  snap.bugs.active,
      fixedBugs:   snap.bugs.fixed,
      openBacklog: snap.backlog.open,
    };
  } catch { return undefined; }
}

export function cmdCheckpoint({ dir, args, flagValue, err, VERSION, featureRoot }) {
  const config = loadConfig(dir);
  const projectName = config.projectName || path.basename(dir);

  // --list: print all checkpoints with dates
  if (args.includes('--list')) {
    const cpDir = path.join(dir, 'checkpoints');
    if (!fs.existsSync(cpDir)) {
      console.log('No checkpoints found.');
      return;
    }
    const files = fs.readdirSync(cpDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse(); // newest first
    if (!files.length) {
      console.log('No checkpoints found.');
      return;
    }
    console.log(`\nCheckpoints for ${projectName}:\n`);
    for (const f of files) {
      const stat = fs.statSync(path.join(cpDir, f));
      const size = `${Math.ceil(stat.size / 1024)}KB`;
      console.log(`  ${f}  (${size})`);
    }
    console.log('');
    return;
  }

  const context = flagValue('--context');
  const name    = flagValue('--name');

  // Always update lastSession — a per-machine field, so it lands in .aitri.local
  // (ADR-045); the shared .aitri is left untouched.
  writeLastSession(config, dir, 'checkpoint', context || undefined);
  // Also persist the narrative in sessionContext, which SURVIVES later transitions
  // (lastSession.context is wiped by the next approve/complete). TPA-5 / A9.
  // Root scope only: nothing reads a feature's narrative back (feature status/resume do not
  // render sessionContext), so a feature-scope stamp would cost a snapshot and claim a
  // flag that never fires.
  const stateAtSave = context && !featureRoot ? stateAtSaveFor(dir) : undefined;
  if (context) writeSessionContext(config, context, stateAtSave);
  saveConfig(dir, config);

  if (context) {
    console.log(`✅ Session context saved to .aitri.local (persists across pipeline actions)`);
    if (stateAtSave) {
      console.log(
        `   State at save: ${stateAtSave.activeBugs} open bug(s) · ${stateAtSave.fixedBugs} fixed awaiting verify · ` +
        `${stateAtSave.openBacklog} open backlog item(s) — resume flags this narrative when they move.`
      );
    }
    console.log(
      `   Open items, hypotheses and pending decisions go to \`aitri bug add\` / \`aitri backlog add\` — they get an id\n` +
      `   and a lifecycle; this narrative has neither, so anything parked only here is re-read as open forever.`
    );
  }

  // If --name is provided, also save a resume snapshot to checkpoints/
  if (name) {
    let content = '';
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { content += chunk; return true; };
    try {
      cmdResume({ dir, VERSION });   // thread VERSION so the snapshot's version-mismatch banner is not dropped (R3-26)
    } finally {
      process.stdout.write = orig;
    }

    const date  = new Date().toISOString().slice(0, 10);
    const slug  = name.replace(/[^a-zA-Z0-9_-]/g, '-');
    const fname = `${date}-${slug}.md`;

    const cpDir = path.join(dir, 'checkpoints');
    fs.mkdirSync(cpDir, { recursive: true });

    const dest = path.join(cpDir, fname);
    fs.writeFileSync(dest, content, 'utf8');

    console.log(`📋 Snapshot saved: checkpoints/${fname}`);
  }

  if (!context && !name) {
    // Bare checkpoint — still useful, records agent + files_touched + timestamp
    console.log(`✅ Checkpoint saved to .aitri.local (agent: ${config.lastSession?.agent || 'unknown'})`);
  }
}
