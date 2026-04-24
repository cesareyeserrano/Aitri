/**
 * Module: Command — status
 * Purpose: Display current project state.
 *          Thin projection over `buildProjectSnapshot()` — no traversal logic
 *          lives here. Text view is short (phase grid + next action); `--json`
 *          emits the legacy schema (for backward compat) plus snapshot-derived
 *          fields (features, bugs, audit, health, nextActions).
 *
 * Contract preserved for backward compat:
 *   phases[], driftPhases[], nextAction (single string), allComplete,
 *   rejections, inHub, project, dir, aitriVersion, cliVersion, versionMismatch.
 * Added fields:
 *   snapshotVersion, features[], bugs, audit, health, nextActions[].
 */

import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { PHASE_DEFS }         from '../phases/index.js';
import { hasDrift }           from '../state.js';
import { buildProjectSnapshot } from '../snapshot.js';

export function cmdStatus({ dir, VERSION, args = [] }) {
  const snapshot = buildProjectSnapshot(dir, { cliVersion: VERSION });
  if (args.includes('--json')) return emitJson(snapshot);
  return emitText(snapshot);
}

// ── Text output ──────────────────────────────────────────────────────────────

function emitText(snapshot) {
  const { project, pipelines, bugs, backlog, nextActions, health, normalize, tests } = snapshot;
  const root = pipelines.find(p => p.scopeType === 'root');

  console.log(`\n📊 Aitri — ${project.name}`);
  console.log('─'.repeat(50));

  if (project.versionMismatch) {
    console.log(`  ⚠️  Project initialized with v${project.aitriVersion} — CLI is v${project.cliVersion}`);
    console.log(`     Run: aitri adopt --upgrade  to sync state and version (non-destructive)`);
    console.log(`     Run: aitri resume            for full session briefing`);
  } else if (project.versionMissing) {
    console.log(`  ⚠️  Project missing aitriVersion — run: aitri adopt --upgrade  to sync`);
  }

  for (const ph of root.phases) {
    const label = phaseLabel(ph);
    console.log(`  ${phaseIcon(ph)} ${phaseKeyDisplay(ph).padEnd(14)} ${ph.name.padEnd(22)} ${label}`);
    if (ph.key === 4 && (ph.status === 'approved' || root.verify.passed)) {
      const vPassed = root.verify.passed;
      const vIcon   = vPassed ? '✅' : '⬜';
      const vLabel  = vPassed
        ? `Passed (${root.verify.summary?.passed}/${root.verify.summary?.total})`
        : 'Not run — required before deploy';
      console.log(`  ${vIcon} ${'verify'.padEnd(14)} ${'Tests'.padEnd(22)} ${vLabel}`);

      const featureVerifyCount = pipelines
        .filter(p => p.scopeType === 'feature' && p.verify.summary)
        .length;
      if (featureVerifyCount > 0 && tests?.totals?.total > 0) {
        const t = tests.totals;
        console.log(`  Σ  ${'all pipelines'.padEnd(14)} ${'Aggregated'.padEnd(22)} Passed (${t.passed}/${t.total})`);
      }
    }
  }

  const rejectedPhases = Object.keys(root.rejections);
  if (rejectedPhases.length) {
    console.log('\n  Rejection history:');
    for (const n of rejectedPhases) {
      const r = root.rejections[n];
      const d = new Date(r.at).toLocaleDateString();
      console.log(`    Phase ${n} (${d}): "${r.feedback}"`);
    }
  }

  if (root.driftReapprovals.length) {
    console.log('\n  ⚠️  Re-approved after drift (verify content is correct):');
    for (const e of root.driftReapprovals) {
      const d = new Date(e.at).toLocaleDateString();
      console.log(`    Phase ${PHASE_DEFS[e.phase]?.alias || e.phase} — re-approved on ${d}`);
    }
  }

  // Features section — only shown when features exist (backward compat for projects without any)
  const features = pipelines.filter(p => p.scopeType === 'feature');
  if (features.length) {
    // Surface what needs attention: failures first, then not-run / incomplete, then passed.
    const sortRank = f => {
      if (f.allCoreApproved && f.verify.ran && !f.verify.passed) return 0; // has failures
      if (!f.allCoreApproved || !f.verify.ran) return 1;                    // incomplete / not run
      return 2;                                                              // passed
    };
    const sorted = [...features].sort((a, b) => sortRank(a) - sortRank(b));

    console.log('\n  Features:');
    for (const f of sorted) {
      const approvedCount = f.phases.filter(p => !p.optional && p.status === 'approved').length;
      const drift = f.phases.some(p => p.drift) ? ' ⚠️  drift' : '';
      const vs = f.verify.summary;
      const counts = vs && vs.total != null
        ? ` (${vs.passed ?? 0}/${vs.total})`
        : '';
      let verify = '';
      if (f.allCoreApproved) {
        if (f.verify.passed)      verify = ` verify ✅${counts}`;
        else if (f.verify.ran)    verify = ` verify ❌${counts}`;
        else                      verify = ' verify ⬜';
      }
      console.log(`    ${f.scopeName.padEnd(20)} phases ${approvedCount}/5${verify}${drift}`);
    }
  }

  console.log('─'.repeat(50));

  const top = nextActions[0];
  if (top) console.log(`\n→ Next: ${top.command}`);
  else     console.log(`\n→ Next: (nothing — project is idle)`);

  if (nextActions.length > 1) {
    console.log('  (more):');
    for (const a of nextActions.slice(1, 4)) {
      console.log(`    ${a.command}   ${a.reason ? `— ${a.reason}` : ''}`);
    }
  }

  if (root.normalizeState === 'pending') {
    console.log(`\n  ⚠️  Code changes outside pipeline — run: aitri normalize`);
  } else if (normalize && normalize.uncountedFiles > 0) {
    const n = normalize.uncountedFiles;
    console.log(`\n  ⚠️  ${n} file${n > 1 ? 's' : ''} changed outside pipeline since last build approval — run: aitri normalize`);
  }

  if (backlog.open != null) {
    // Only show when any pipeline has a BACKLOG.json — `backlog.open` is 0 when
    // files exist but are empty. Suppress only when no BACKLOG.json exists anywhere.
    const anyBacklog = Object.values(backlog.byPipeline).some(v => v !== 0) || backlogHasFiles(snapshot);
    if (anyBacklog) {
      const label = backlog.open === 0 ? 'no open items' : `${backlog.open} open item${backlog.open > 1 ? 's' : ''}`;
      console.log(`\n  backlog: ${label} — run: aitri backlog`);
    }
  }

  if (bugs.total > 0 || bugsFilesExist(snapshot)) {
    const activeBugs = bugs.open;
    const label = activeBugs === 0 ? 'no active bugs' : `⚠ ${activeBugs} active bug${activeBugs > 1 ? 's' : ''} (open/in-fix)`;
    console.log(`  bugs:    ${label} — run: aitri bug list`);
  }

  if (health.staleAudit) {
    console.log(`  audit:   stale (${snapshot.audit.stalenessDays} days) — run: aitri audit`);
  }

  // A1 (alpha.3): surface unresolved upgrade findings inline. Count only —
  // details live in `aitri resume` so the short status view stays compact.
  for (const pl of pipelines) {
    const findings = pl.upgradeFindings || [];
    if (findings.length === 0) continue;
    const label = pl.scopeType === 'root' ? '' : ` [${pl.scopeName}]`;
    console.log(`  ⚠️  upgrade: ${findings.length} unresolved finding${findings.length > 1 ? 's' : ''}${label} — run: aitri resume`);
  }

  // Hub monitoring line — silent on any error
  try {
    const hubProjectsPath = path.join(os.homedir(), '.aitri-hub', 'projects.json');
    if (fs.existsSync(hubProjectsPath)) {
      const hubData = JSON.parse(fs.readFileSync(hubProjectsPath, 'utf8'));
      if ((hubData.projects || []).some(p => p.location === snapshot.project.dir)) {
        console.log(`\n  Monitored by Aitri Hub — run: aitri-hub monitor`);
      }
    }
  } catch { /* Hub not installed — skip silently */ }
}

function backlogHasFiles(snapshot) {
  for (const pl of snapshot.pipelines) {
    const p = path.join(pl.path, pl.artifactsDir || '', 'BACKLOG.json');
    if (fs.existsSync(p)) return true;
  }
  return false;
}

function bugsFilesExist(snapshot) {
  for (const pl of snapshot.pipelines) {
    const p = path.join(pl.path, pl.artifactsDir || '', 'BUGS.json');
    if (fs.existsSync(p)) return true;
  }
  return false;
}

function phaseIcon(ph) {
  if (ph.drift)                     return '✅';
  if (ph.status === 'approved')     return '✅';
  if (ph.status === 'completed')    return '⏳';
  if (ph.status === 'in_progress')  return '🔄';
  return '⬜';
}

function phaseLabel(ph) {
  let label;
  if      (ph.status === 'approved')    label = 'Approved';
  else if (ph.status === 'completed')   label = 'Awaiting approval';
  else if (ph.status === 'in_progress') label = `Run: aitri complete ${phaseKeyDisplay(ph)}`;
  else                                  label = 'Not started';
  if (ph.drift) label += '  ⚠️  DRIFT: artifact modified after approval';
  return label;
}

function phaseKeyDisplay(ph) {
  if (ph.optional) return String(ph.key);
  return ph.alias || String(ph.key);
}

// ── JSON output (legacy schema + snapshot additions) ─────────────────────────

function emitJson(snapshot) {
  const { project, pipelines, bugs, audit, health, nextActions, snapshotVersion, backlog, normalize, tests } = snapshot;
  const root = pipelines.find(p => p.scopeType === 'root');

  // Legacy phases[] — root pipeline only, with verify pseudo-phase injected
  // after phase 4 when appropriate. Shape preserved exactly for Hub / external
  // consumers that may already parse this array.
  const phases = [];
  for (const ph of root.phases) {
    phases.push({
      key:      ph.key,
      name:     ph.name,
      artifact: ph.artifact,
      optional: ph.optional,
      exists:   ph.exists,
      status:   ph.status,
      drift:    ph.drift,
    });
    if (ph.key === 4 && (ph.status === 'approved' || root.verify.passed)) {
      const vPhase = {
        key:      'verify',
        name:     'Tests',
        artifact: '04_TEST_RESULTS.json',
        optional: false,
        exists:   !!root.verify.passed,
        status:   root.verify.passed ? 'passed' : 'not_run',
        drift:    false,
      };
      if (root.verify.summary) vPhase.verifySummary = root.verify.summary;
      phases.push(vPhase);
    }
  }

  // driftPhases[] — root pipeline only. Key types preserved as emitted by snapshot.
  const driftPhases = root.phases.filter(p => p.drift).map(p => p.key);

  // inHub — preserve legacy registry check
  let inHub = false;
  try {
    const hubPath = path.join(os.homedir(), '.aitri-hub', 'projects.json');
    if (fs.existsSync(hubPath)) {
      const hubData = JSON.parse(fs.readFileSync(hubPath, 'utf8'));
      inHub = (hubData.projects || []).some(p => p.location === project.dir);
    }
  } catch { /* skip */ }

  // Feature summaries — compact shape for consumers
  const featureSummaries = pipelines.filter(p => p.scopeType === 'feature').map(f => {
    const coreApproved = f.phases.filter(p => !p.optional && p.status === 'approved').length;
    return {
      name:             f.scopeName,
      path:             f.path,
      aitriVersion:     f.aitriVersion,
      approvedCount:    coreApproved,
      allCoreApproved:  f.allCoreApproved,
      verifyPassed:     f.verify.passed,
      driftPresent:     f.phases.some(p => p.drift),
      nextPhase:        (f.phases.find(p => !p.optional && p.status !== 'approved') || {}).key || null,
    };
  });

  const payload = {
    // Legacy — do not remove or rename
    project:        project.name,
    dir:            project.dir,
    aitriVersion:   project.aitriVersion,
    cliVersion:     project.cliVersion,
    versionMismatch: project.versionMismatch,
    phases,
    driftPhases,
    nextAction:     nextActions[0]?.command || null,
    allComplete:    root.allCoreApproved,
    inHub,
    rejections:     root.rejections,

    // Snapshot-derived extensions
    snapshotVersion,
    features:       featureSummaries,
    bugs:           { total: bugs.total, open: bugs.open, blocking: bugs.blocking },
    backlog:        { open: backlog.open },
    audit:          { exists: audit.exists, stalenessDays: audit.stalenessDays },
    tests: {
      totals:        tests.totals,
      perPipeline:   tests.perPipeline,
      stalenessDays: tests.stalenessDays,
    },
    normalize:      {
      state:          normalize.state,
      method:         normalize.method,
      baseRef:        normalize.baseRef,
      uncountedFiles: normalize.uncountedFiles,
    },
    health: {
      deployable:        health.deployable,
      deployableReasons: health.deployableReasons,
      staleAudit:        health.staleAudit,
      blockedByBugs:     health.blockedByBugs,
      activeFeatures:    health.activeFeatures,
      versionMismatch:   health.versionMismatch,
    },
    nextActions,
  };

  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

// Re-export hasDrift so tooling that imported from status.js still works.
// (No known external consumers; defensive.)
export { hasDrift };
