/**
 * Module: Command — checkpoint
 * Purpose: Write a session checkpoint — records what's in progress so the next
 *          session/agent can pick up exactly where this one left off.
 *
 *          aitri checkpoint --context "implementing FR-003, JWT done, pending error handling"
 *          aitri checkpoint --list
 *          aitri checkpoint --name "pre-refactor"  (saves resume snapshot to checkpoints/)
 *
 *          The --context value is stored in .aitri lastSession alongside auto-detected
 *          agent, files_touched (git diff), and timestamp. aitri resume reads it.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig, writeLastSession } from '../state.js';
import { cmdResume } from './resume.js';

export function cmdCheckpoint({ dir, args, flagValue, err }) {
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

  // Always update lastSession in .aitri
  writeLastSession(config, dir, 'checkpoint', context || undefined);
  saveConfig(dir, config);

  if (context) {
    console.log(`✅ Session context saved to .aitri`);
  }

  // If --name is provided, also save a resume snapshot to checkpoints/
  if (name) {
    let content = '';
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { content += chunk; return true; };
    try {
      cmdResume({ dir });
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
    console.log(`✅ Checkpoint saved to .aitri (agent: ${config.lastSession?.agent || 'unknown'})`);
  }
}
