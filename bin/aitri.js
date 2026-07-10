#!/usr/bin/env node

/**
 * Aitri CLI — Agent-agnostic SDLC orchestrator
 *
 * Design principles:
 *   - Stateless commands: each invocation reads/writes .aitri config file
 *   - run-phase outputs briefing to stdout — any agent reads and acts on it
 *   - No interactive prompts — fully scriptable
 *   - Compatible with: Claude Code, Codex, Gemini Code, Opencode, CI/CD
 *
 * This file is a thin dispatcher. All command logic lives in lib/commands/.
 * To add a command: create lib/commands/<name>.js and add a case below.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cmdInit }           from '../lib/commands/init.js';
import { cmdRunPhase }       from '../lib/commands/run-phase.js';
import { cmdComplete }       from '../lib/commands/complete.js';
import { cmdApprove }        from '../lib/commands/approve.js';
import { cmdReject }         from '../lib/commands/reject.js';
import { cmdVerify, cmdVerifyRun, cmdVerifyComplete } from '../lib/commands/verify.js';
import { cmdStatus }         from '../lib/commands/status.js';
import { cmdResume }         from '../lib/commands/resume.js';
import { cmdCheckpoint }     from '../lib/commands/checkpoint.js';
import { cmdValidate }       from '../lib/commands/validate.js';
import { cmdFeature }        from '../lib/commands/feature.js';
import { cmdAdopt }          from '../lib/commands/adopt.js';
import { cmdWizard }         from '../lib/commands/wizard.js';
import { cmdHelp }           from '../lib/commands/help.js';
import { cmdBacklog }        from '../lib/commands/backlog.js';
import { cmdReview }        from '../lib/commands/review.js';
import { cmdBug }           from '../lib/commands/bug.js';
import { cmdReconcile }     from '../lib/commands/reconcile.js';
import { cmdAudit }        from '../lib/commands/audit.js';
import { cmdTC }           from '../lib/commands/tc.js';
import { cmdRehash }       from '../lib/commands/rehash.js';
import { cmdExport }       from '../lib/commands/export.js';
import { homedirCaptureNote } from '../lib/state.js';

const VERSION   = '2.0.0-rc.169';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.dirname(__dirname);
const cwd       = process.cwd();
const [,, cmd, ...args] = process.argv;

/**
 * If init is called with a path argument (e.g. "aitri init ./my-project"),
 * use that as the target directory. Prevents init from silently writing to the
 * wrong place when agents pass a path from a different cwd.
 */
function resolveInitDir() {
  const target = args[0];
  if (target && !target.startsWith('-')) return path.resolve(cwd, target);
  return cwd;
}

/**
 * Find the project directory by searching upward for .aitri (like git finds .git).
 * This makes all commands work correctly regardless of which subdirectory the
 * agent or user is in when they invoke aitri — critical for agent workflows
 * where the shell cwd may reset between command invocations.
 */
function findProjectDir(startDir) {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, '.aitri'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir; // filesystem root — fall back to cwd
    current = parent;
  }
}

// init: uses explicit path arg if given, otherwise cwd
// adopt (bare guided start / scan / apply): always use cwd — these target a directory that
//   has no .aitri yet, so an upward search must NOT walk up to a stray parent ~/.aitri
// all other commands: search upward for .aitri (cwd-invariant)
const adoptSub = args[0];
const dir = cmd === 'init'   ? resolveInitDir()
          : cmd === 'adopt' && (adoptSub === 'scan' || adoptSub === 'apply' || !adoptSub) ? cwd
          : findProjectDir(cwd);

// C2: signal when the upward search captured a stray ~/.aitri instead of a
// project here. Skip commands that do not resolve a project: `init` creates one;
// version/help (and all their aliases) are pure info and would only add noise.
const NON_RESOLVING = new Set(['init', '--version', '-v', 'version', 'help', '--help', '-h']);
if (!NON_RESOLVING.has(cmd)) {
  const captureNote = homedirCaptureNote(cwd, dir);
  if (captureNote) console.error(`⚠️  ${captureNote}`);
}

const flagValue = (flag) => {
  const i = args.indexOf(flag);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
};

// Known command names — the single list the unknown-command guard suggests from.
// Kept next to the switch below; a new command must appear in both.
const COMMANDS = [
  'init', 'run-phase', 'complete', 'approve', 'reject', 'verify', 'verify-run',
  'verify-complete', 'status', 'resume', 'checkpoint', 'feature', 'adopt', 'wizard',
  'validate', 'backlog', 'review', 'bug', 'reconcile', 'audit', 'tc', 'rehash',
  'export', 'help', '--version',
];

// Zero-dep Levenshtein for "did you mean" on a typo'd command.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

// Nearest known command, or null when nothing is close enough to be a useful hint.
function nearestCommand(input) {
  let best = null, bestDist = Infinity;
  for (const c of COMMANDS) {
    const d = levenshtein(input, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= Math.max(2, Math.floor(input.length / 3)) ? best : null;
}

const err = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

const ctx = { dir, args, flagValue, err, VERSION, rootDir };

try {
switch (cmd) {
  case 'init':             cmdInit(ctx);            break;
  case 'run-phase':        cmdRunPhase(ctx);        break;
  case 'complete':         cmdComplete(ctx);        break;
  case 'approve':          cmdApprove(ctx);         break;
  case 'reject':           cmdReject(ctx);          break;
  case 'verify':           cmdVerify(ctx);          break;
  case 'verify-run':       cmdVerifyRun(ctx);       break;
  case 'verify-complete':  cmdVerifyComplete(ctx);  break;
  case 'status':           cmdStatus(ctx);          break;
  case 'resume':           cmdResume(ctx);          break;
  case 'checkpoint':       cmdCheckpoint(ctx);      break;
  case 'feature':          cmdFeature(ctx);         break;
  case 'adopt':            cmdAdopt(ctx);           break;
  case 'wizard':           cmdWizard(ctx);          break;
  case 'validate':         cmdValidate(ctx);        break;
  case 'backlog':          cmdBacklog(ctx);         break;
  case 'review':           cmdReview(ctx);          break;
  case 'bug':              cmdBug(ctx);             break;
  case 'reconcile':        cmdReconcile(ctx);       break;
  case 'audit':            cmdAudit(ctx);           break;
  case 'tc':               cmdTC(ctx);              break;
  case 'rehash':           cmdRehash(ctx);          break;
  case 'export':           cmdExport(ctx);          break;
  case 'help':
  case '--help':
  case '-h':               cmdHelp(ctx);            break;
  case '--version':
  case '-v':
  case 'version':          console.log(`Aitri v${VERSION}`); break;
  // No command given: if we're inside an Aitri project, run status;
  // otherwise fall through to help.
  case undefined:
    if (fs.existsSync(path.join(dir, '.aitri'))) cmdStatus(ctx);
    else                                          cmdHelp(ctx);
    break;
  // An unknown command is an error, not a help request: exit non-zero on stderr so a
  // typo'd `aitri verfy-complete` in a script/CI fails loudly instead of silently
  // "passing" (exit 0 + help dump was a scriptability hole in a tool that gates).
  default: {
    const suggestion = nearestCommand(cmd);
    console.error(`❌ Unknown command: "${cmd}"`);
    if (suggestion) console.error(`   Did you mean "${suggestion}"?`);
    console.error(`   Run 'aitri help' for the list of commands.`);
    process.exit(1);
  }
}
} catch (e) {
  // A command run outside an Aitri project (resume/status/validate call
  // buildProjectSnapshot, which throws) used to leak a raw Node stack trace that
  // read like a crash. Catch that one known case and print actionable guidance;
  // every other error re-throws unchanged so real bugs still surface their stack.
  if (/^Not an Aitri project/.test(e?.message || '')) {
    console.error(`❌ This folder isn't an Aitri project yet.`);
    console.error(`   Run 'aitri init' to start a new project, or 'aitri adopt scan' to adopt an existing one.`);
    process.exit(1);
  }
  // An unresolved `.aitri` merge conflict: loadConfig refuses (G-4) rather than silently
  // resetting the shared pipeline. Print the actionable guidance, not a raw stack trace.
  if (/unresolved git merge conflict markers/.test(e?.message || '')) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  // A malformed `.aitri` (any parse failure — B6/ADR-070 extends G-4): same refuse-with-
  // guidance treatment; the message carries the restore instructions.
  if (/\.aitri is not valid JSON/.test(e?.message || '')) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  // A phase briefing that needs a seed/input file it cannot find (e.g. run-phase 1 with
  // no IDEA.md) throws from buildBriefing. The message already carries the fix — print it
  // cleanly instead of leaking the Node stack trace that read like a crash.
  if (/^Missing required file:/.test(e?.message || '')) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  throw e;
}
