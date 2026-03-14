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
  const stored = (config.artifactHashes || {})[String(phaseKey)];
  if (!stored) return false;
  try {
    const content = fs.readFileSync(artifactPath(dir, config, artifactFile), 'utf8');
    return hashArtifact(content) !== stored;
  } catch { return false; }
}

export function cmdStatus({ dir, VERSION }) {
  const config    = loadConfig(dir);
  const approved  = new Set(config.approvedPhases  || []);
  const completed = new Set(config.completedPhases || []);

  console.log(`\n📊 Aitri — ${config.projectName || path.basename(dir)}`);
  console.log('─'.repeat(50));

  if (VERSION && config.aitriVersion && config.aitriVersion !== VERSION) {
    console.log(`  ⚠️  Project initialized with v${config.aitriVersion} — CLI is v${VERSION}`);
    console.log(`     Run: aitri init  to update (non-destructive)`);
  } else if (VERSION && !config.aitriVersion) {
    console.log(`  ⚠️  Project missing aitriVersion — run: aitri init  to sync`);
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
    console.log(`\n→ Next: aitri run-phase ${nextCore}`);
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
