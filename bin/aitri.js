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
import { cmdHelp }           from '../lib/commands/help.js';

const VERSION   = '0.1.35';
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
// all other commands: search upward for .aitri (cwd-invariant)
const dir = cmd === 'init' ? resolveInitDir() : findProjectDir(cwd);

const flagValue = (flag) => {
  const i = args.indexOf(flag);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
};

const err = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

const ctx = { dir, args, flagValue, err, VERSION, rootDir };

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
  case 'validate':         cmdValidate(ctx);        break;
  case '--version':        console.log(`Aitri v${VERSION}`); break;
  default:                 cmdHelp(ctx);            break;
}
