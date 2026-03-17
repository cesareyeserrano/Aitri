/**
 * Module: Command — status
 * Purpose: Display pipeline status with ASCII UI + rejection history.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, hashArtifact, artifactPath } from '../state.js';

const CORE_PHASES = [1, 2, 3, 4, 5];

function hasDrift(dir, config, phaseKey, artifactFile) {
  // Fast path: if run-phase explicitly flagged this phase as drifted, trust it
  if (Array.isArray(config.driftPhases) &&
      config.driftPhases.map(String).includes(String(phaseKey))) {
    return true;
  }
  // Dynamic hash check — always runs; catches direct file modifications outside run-phase
  const stored = (config.artifactHashes || {})[String(phaseKey)];
  if (!stored) return false;
  try {
    const content = fs.readFileSync(artifactPath(dir, config, artifactFile), 'utf8');
    return hashArtifact(content) !== stored;
  } catch { return false; }
}

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
    console.log(`  ${icon} ${String(p.num).padEnd(10)} ${p.name.padEnd(22)} ${label}`);
  }

  // Core phases
  for (const num of CORE_PHASES) {
    const p           = PHASE_DEFS[num];
    const exists      = fs.existsSync(artifactPath(dir, config, p.artifact));
    const isApproved  = approved.has(p.num);
    const isCompleted = completed.has(p.num);
    let icon, label;
    if      (isApproved)         { icon = '✅'; label = 'Approved'; }
    else if (isCompleted)        { icon = '⏳'; label = 'Awaiting approval'; }
    else if (exists)             { icon = '🔄'; label = `Run: aitri complete ${num}`; }
    else                         { icon = '⬜'; label = 'Not started'; }
    const drift = isApproved && hasDrift(dir, config, p.num, p.artifact);
    if (drift) label += '  ⚠️  DRIFT: artifact modified after approval';
    console.log(`  ${icon} ${String(p.num).padEnd(10)} ${p.name.padEnd(22)} ${label}`);

    // Show verify row when Phase 4 is approved OR verify has already passed
    if (num === 4 && (isApproved || config.verifyPassed)) {
      const vPassed = config.verifyPassed;
      const vIcon   = vPassed ? '✅' : '⬜';
      const vLabel  = vPassed
        ? `Passed (${config.verifySummary?.passed}/${config.verifySummary?.total})`
        : 'Not run — required before Phase 5';
      console.log(`  ${vIcon} ${'verify'.padEnd(10)} ${'Tests'.padEnd(22)} ${vLabel}`);
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
    if (completed.has(nextCore)) {
      console.log(`\n→ Next: aitri approve ${nextCore}`);
    } else {
      console.log(`\n→ Next: aitri run-phase ${nextCore}`);
    }
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
  else { const next = CORE_PHASES.find(n => !approved.has(n)) || 1; nextAction = completed.has(next) ? `aitri approve ${next}` : `aitri run-phase ${next}`; }

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
