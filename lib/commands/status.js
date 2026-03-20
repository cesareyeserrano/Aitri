/**
 * Module: Command — status
 * Purpose: Display pipeline status with ASCII UI + rejection history.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, artifactPath, hasDrift } from '../state.js';
import { openBacklogCount } from './backlog.js';
import { openBugCount } from './bug.js';

const CORE_PHASES = [1, 2, 3, 4, 5];

export function cmdStatus({ dir, VERSION, args = [] }) {
  if (args.includes('--json')) return cmdStatusJson({ dir, VERSION });

  const config    = loadConfig(dir);
  const approved  = new Set(config.approvedPhases  || []);
  const completed = new Set(config.completedPhases || []);

  console.log(`\n📊 Aitri — ${config.projectName || path.basename(dir)}`);
  console.log('─'.repeat(50));

  if (VERSION && config.aitriVersion && config.aitriVersion !== VERSION) {
    console.log(`  ⚠️  Project initialized with v${config.aitriVersion} — CLI is v${VERSION}`);
    console.log(`     Run: aitri adopt --upgrade  to sync state and version (non-destructive)`);
    console.log(`     Run: aitri resume            for full session briefing`);
  } else if (VERSION && !config.aitriVersion) {
    console.log(`  ⚠️  Project missing aitriVersion — run: aitri adopt --upgrade  to sync`);
  }

  // Optional phases — only show if artifact exists
  for (const key of OPTIONAL_PHASES) {
    const p      = PHASE_DEFS[key];
    const exists = fs.existsSync(artifactPath(dir, config, p.artifact));
    if (!exists) continue;
    const isApproved  = approved.has(p.num);
    const isCompleted = completed.has(p.num);
    let icon, label;
    if      (isApproved)  { icon = '✅'; label = 'Approved'; }
    else if (isCompleted) { icon = '⏳'; label = 'Awaiting approval'; }
    else                  { icon = '🔄'; label = `Run: aitri complete ${key}`; }
    const drift = isApproved && hasDrift(dir, config, p.num, p.artifact);
    if (drift) label += '  ⚠️  DRIFT: artifact modified after approval';
    console.log(`  ${icon} ${String(key).padEnd(14)} ${p.name.padEnd(22)} ${label}`);
  }

  // Core phases
  for (const num of CORE_PHASES) {
    const p           = PHASE_DEFS[num];
    const pKey        = p.alias || num;
    const exists      = fs.existsSync(artifactPath(dir, config, p.artifact));
    const isApproved  = approved.has(p.num);
    const isCompleted = completed.has(p.num);
    let icon, label;
    if      (isApproved)         { icon = '✅'; label = 'Approved'; }
    else if (isCompleted)        { icon = '⏳'; label = 'Awaiting approval'; }
    else if (exists)             { icon = '🔄'; label = `Run: aitri complete ${pKey}`; }
    else                         { icon = '⬜'; label = 'Not started'; }
    const drift = isApproved && hasDrift(dir, config, p.num, p.artifact);
    if (drift) label += '  ⚠️  DRIFT: artifact modified after approval';
    console.log(`  ${icon} ${String(pKey).padEnd(14)} ${p.name.padEnd(22)} ${label}`);

    // Show verify row when Phase 4 is approved OR verify has already passed
    if (num === 4 && (isApproved || config.verifyPassed)) {
      const vPassed = config.verifyPassed;
      const vIcon   = vPassed ? '✅' : '⬜';
      const vLabel  = vPassed
        ? `Passed (${config.verifySummary?.passed}/${config.verifySummary?.total})`
        : 'Not run — required before deploy';
      console.log(`  ${vIcon} ${'verify'.padEnd(14)} ${'Tests'.padEnd(22)} ${vLabel}`);
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

  const driftReapprovals = (config.events || []).filter(e => e.event === 'approved' && e.afterDrift);
  if (driftReapprovals.length) {
    console.log('\n  ⚠️  Re-approved after drift (verify content is correct):');
    for (const e of driftReapprovals) {
      const d = new Date(e.at).toLocaleDateString();
      console.log(`    Phase ${e.phase} — re-approved on ${d}`);
    }
  }

  console.log('─'.repeat(50));

  // Determine next action
  const approvedCore    = CORE_PHASES.filter(n => approved.has(n));
  const allCoreApproved = approvedCore.length === CORE_PHASES.length;

  if (allCoreApproved) {
    console.log(`\n→ All phases complete! Run: aitri validate`);
  } else if (approvedCore.length === 4 && !config.verifyPassed) {
    console.log(`\n→ Next: aitri verify-run  (then aitri verify-complete)`);
  } else {
    const nextCore = CORE_PHASES.find(n => !approved.has(n)) || 1;
    const nextKey  = PHASE_DEFS[nextCore]?.alias || nextCore;
    if (completed.has(nextCore)) {
      console.log(`\n→ Next: aitri approve ${nextKey}`);
    } else {
      console.log(`\n→ Next: aitri run-phase ${nextKey}`);
    }
  }

  // Show open backlog count if BACKLOG.json exists
  const openItems = openBacklogCount(dir, config);
  if (openItems !== null) {
    const label = openItems === 0 ? 'no open items' : `${openItems} open item${openItems > 1 ? 's' : ''}`;
    console.log(`\n  backlog: ${label} — run: aitri backlog`);
  }

  // Show open bug count if BUGS.json exists
  const openBugs = openBugCount(dir, config);
  if (openBugs !== null) {
    const label = openBugs === 0 ? 'no active bugs' : `⚠ ${openBugs} active bug${openBugs > 1 ? 's' : ''} (open/in-fix)`;
    console.log(`  bugs:    ${label} — run: aitri bug list`);
  }

  // Show Hub monitoring line if project is registered — silent on any error
  try {
    const hubProjectsPath = path.join(os.homedir(), '.aitri-hub', 'projects.json');
    if (fs.existsSync(hubProjectsPath)) {
      const hubData = JSON.parse(fs.readFileSync(hubProjectsPath, 'utf8'));
      if ((hubData.projects || []).some(p => p.location === dir)) {
        console.log(`\n  Monitored by Aitri Hub — run: aitri-hub monitor`);
      }
    }
  } catch { /* Hub not installed — skip silently */ }
}

// ── JSON output ───────────────────────────────────────────────────────────────

function cmdStatusJson({ dir, VERSION }) {
  const config    = loadConfig(dir);
  const approved  = new Set(config.approvedPhases  || []);
  const completed = new Set(config.completedPhases || []);

  const phases = [];

  // Optional phases — include only if artifact exists or tracked
  for (const key of OPTIONAL_PHASES) {
    const p       = PHASE_DEFS[key];
    const exists  = fs.existsSync(artifactPath(dir, config, p.artifact));
    const isApp   = approved.has(p.num);
    const isComp  = completed.has(p.num);
    if (!exists && !isApp && !isComp) continue;
    const drift   = isApp && hasDrift(dir, config, p.num, p.artifact);
    const status  = isApp ? 'approved' : isComp ? 'completed' : exists ? 'in_progress' : 'not_started';
    phases.push({ key, name: p.name, artifact: p.artifact, optional: true, exists, status, drift });
  }

  // Core phases
  for (const num of CORE_PHASES) {
    const p       = PHASE_DEFS[num];
    const exists  = fs.existsSync(artifactPath(dir, config, p.artifact));
    const isApp   = approved.has(p.num);
    const isComp  = completed.has(p.num);
    const drift   = isApp && hasDrift(dir, config, p.num, p.artifact);
    const status  = isApp ? 'approved' : isComp ? 'completed' : exists ? 'in_progress' : 'not_started';
    phases.push({ key: num, name: p.name, artifact: p.artifact, optional: false, exists, status, drift });

    if (num === 4 && (isApp || config.verifyPassed)) {
      const vPhase = {
        key: 'verify', name: 'Tests', artifact: '04_TEST_RESULTS.json',
        optional: false, exists: !!config.verifyPassed,
        status: config.verifyPassed ? 'passed' : 'not_run', drift: false,
      };
      if (config.verifySummary) vPhase.verifySummary = config.verifySummary;
      phases.push(vPhase);
    }
  }

  const approvedCore    = CORE_PHASES.filter(n => approved.has(n));
  const allCoreApproved = approvedCore.length === CORE_PHASES.length;
  let nextAction;
  if      (allCoreApproved)                               nextAction = 'aitri validate';
  else if (approvedCore.length === 4 && !config.verifyPassed) nextAction = 'aitri verify-run';
  else { const next = CORE_PHASES.find(n => !approved.has(n)) || 1; const nk = PHASE_DEFS[next]?.alias || next; nextAction = completed.has(next) ? `aitri approve ${nk}` : `aitri run-phase ${nk}`; }

  let inHub = false;
  try {
    const hubPath = path.join(os.homedir(), '.aitri-hub', 'projects.json');
    if (fs.existsSync(hubPath)) {
      const hubData = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
      inHub = (hubData.projects || []).some(p => p.location === dir);
    }
  } catch { /* skip */ }

  const driftPhases = phases.filter(p => p.drift).map(p => p.key);

  process.stdout.write(JSON.stringify({
    project:        config.projectName || path.basename(dir),
    dir,
    aitriVersion:   config.aitriVersion  || null,
    cliVersion:     VERSION,
    versionMismatch: !!(config.aitriVersion && config.aitriVersion !== VERSION),
    phases,
    driftPhases,
    nextAction,
    allComplete:    allCoreApproved,
    inHub,
    rejections:     config.rejections || {},
  }, null, 2) + '\n');
}
