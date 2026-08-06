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
import { buildProjectSnapshot, scopeProvenance } from '../snapshot.js';
import { formatVerifyCounts }   from '../verify-display.js';

export function cmdStatus({ dir, VERSION, args = [] }) {
  const snapshot = buildProjectSnapshot(dir, { cliVersion: VERSION });
  if (args.includes('--json')) return emitJson(snapshot);
  return emitText(snapshot);
}

// ── Text output ──────────────────────────────────────────────────────────────

function emitText(snapshot) {
  const { project, pipelines, bugs, backlog, nextActions, health, reconcile, tests } = snapshot;
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
    // PLAN-ARTIFACT-0715 S3: advisory epic progress while the build is in flight —
    // partial deliveries visible between sessions. Display-only (agent-maintained plan).
    if (String(ph.key) === '4' && root.buildPlan) {
      console.log(`     📦 ${'epics'.padEnd(11)} ${''.padEnd(22)} ${root.buildPlan.summary}`);
    }
    if (ph.key === 4 && (ph.status === 'approved' || root.verify.passed)) {
      const vPassed = root.verify.passed;
      const vIcon   = vPassed ? '✅' : '⬜';
      let vLabel  = vPassed
        ? formatVerifyCounts(root.verify.summary).trimStart()
        : 'Not run — required before deploy';
      // M1 (ADR-085): a passed verdict whose code binding no longer holds must not
      // render as a clean pass — name the state and the exit inline.
      if (vPassed && root.verify.refState === 'stale')
        vLabel += '  ⚠️  STALE — code changed since this run (re-run verify-run)';
      else if (vPassed && root.verify.refState === 'unreachable')
        vLabel += '  ⚠️  UNREACHABLE — certified commit not in this history (re-run verify-run)';
      else if (vPassed && root.verify.refState === 'dirty')
        vLabel += '  ⚠️  non-portable — ran over uncommitted code';
      console.log(`  ${vIcon} ${'verify'.padEnd(14)} ${'Tests'.padEnd(22)} ${vLabel}`);

      const featureVerifyCount = pipelines
        .filter(p => p.scopeType === 'feature' && p.verify.summary)
        .length;
      if (featureVerifyCount > 0 && tests?.totals?.total > 0) {
        console.log(`  Σ  ${'all pipelines'.padEnd(14)} ${'Aggregated'.padEnd(22)}${formatVerifyCounts(tests.totals)}`);
      }
    }
  }

  // Surface health.deployable next to the phase table so a row of ✅ is not
  // misread as "ready to ship". Phase 5 status ("deploy Approved") is pipeline
  // approval; deployable is the composite gate (version, drift, reconcile,
  // verify, bugs). They are distinct concepts (STATUS_JSON.md) and were
  // previously only surfaced via the warning at the top + the nextAction at
  // the bottom — easy to miss when scanning the phase rows.
  const _hasProgress = root.phases.some(p => !p.optional && p.status !== 'not_started');
  if (_hasProgress) {
    if (health.deployable) {
      console.log(`  ✅ ${'deployable'.padEnd(14)} ${'Deploy readiness'.padEnd(22)} Ready`);
    } else {
      const n = (health.deployableReasons || []).length;
      const label = n === 1 ? '1 blocker' : `${n} blockers`;
      console.log(`  ❌ ${'deployable'.padEnd(14)} ${'Deploy readiness'.padEnd(22)} Not ready — ${label} (run: aitri resume)`);
    }
  }

  // RELEASE-VERSION-0722 (rc.9): the sealed release identity — first consumer of the
  // previously write-only 05_TRACEABILITY.json#version. An "assumed" source is flagged:
  // the version was never confirmed with the team.
  if (root.release) {
    const src = root.release.version_source;
    // Version AS-IS (team schemes may be dates/tags); "undeclared" claims only what the
    // code can know — omission is legal on any artifact, not a version marker.
    const srcLabel = src === 'assumed' ? '⚠ source: assumed — not confirmed by the team'
                   : src               ? `source: ${src}`
                   : 'source: undeclared';
    console.log(`  🏷️  ${'release'.padEnd(14)} ${'Sealed version'.padEnd(22)} ${root.release.version} (${srcLabel})`);
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
    // FEATURE-ORDER-0729: the creation ordinal (#N) is identity-of-sequence, derived at
    // render from createdAt — nothing stored, nothing to renumber. Features without a
    // createdAt (pre-createdAt projects) get no ordinal. The SORT is presentation and
    // stays attention-first (failures → incomplete → passed); within a rank, creation
    // order (undated last, alphabetical among themselves).
    // Type guard (batch-adversarial find): .aitri is hand-editable committed JSON — a
    // numeric/garbage createdAt must degrade to "undated", never crash the sort or leak
    // a non-ISO value into --json. Tie-break by name so ordinals are deterministic
    // across filesystems (readdir order is not).
    const hasDate = f => typeof f.createdAt === 'string' && f.createdAt.length > 0;
    const dated = features.filter(hasDate).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.scopeName.localeCompare(b.scopeName));
    const ordinals = new Map(dated.map((f, i) => [f.scopeName, i + 1]));

    // Surface what needs attention: failures first, then not-run / incomplete, then passed.
    const sortRank = f => {
      if (f.allCoreApproved && f.verify.ran && !f.verify.passed) return 0; // has failures
      if (!f.allCoreApproved || !f.verify.ran) return 1;                    // incomplete / not run
      return 2;                                                              // passed
    };
    const createdRank = f => (hasDate(f) ? `0${f.createdAt}` : `1${f.scopeName}`);
    // scopeName tiebreak (rc.5 adversarial find): equal createdAt (scripted same-second
    // inits) previously fell to directory order here while the ordinal map above and the
    // ladder's proposalOrder (lib/snapshot.js) both break by name — #2 could render
    // above #1. Same rule everywhere: created asc, then name.
    const sorted = [...features].sort((a, b) =>
      (sortRank(a) - sortRank(b)) || createdRank(a).localeCompare(createdRank(b)) ||
      a.scopeName.localeCompare(b.scopeName));

    const shortDate = iso => (typeof iso === 'string' ? iso.slice(5, 10) : '');
    console.log('\n  Features:');
    for (const f of sorted) {
      const approvedCount = f.phases.filter(p => !p.optional && p.status === 'approved').length;
      const drift = f.phases.some(p => p.drift) ? ' ⚠️  drift' : '';
      const counts = formatVerifyCounts(f.verify.summary);
      let verify = '';
      if (f.allCoreApproved) {
        if (f.verify.passed)      verify = ` verify ✅${counts}`;
        else if (f.verify.ran)    verify = ` verify ❌${counts}`;
        else                      verify = ' verify ⬜';
      }
      // Implementation-order proxy: the last verify run date (durable, survives event
      // eviction). Shown only when a verify actually ran — creation and implementation
      // are different dimensions and both were invisible before.
      const verifiedAt = f.verify.ran && f.verify.ranAt ? ` · verified ${shortDate(f.verify.ranAt)}` : '';
      const ord = ordinals.has(f.scopeName) ? `#${ordinals.get(f.scopeName)} ` : '';
      const created = hasDate(f) ? ` · created ${shortDate(f.createdAt)}` : '';
      console.log(`    ${(ord + f.scopeName).padEnd(24)} phases ${approvedCount}/5${verify}${created}${verifiedAt}${drift}`);
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

  if (root.reconcileState === 'pending') {
    console.log(`\n  ⚠️  Off-pipeline changes detected — close with: aitri reconcile --resolve (or route fr-changes through the pipeline)`);
  } else if (reconcile && reconcile.uncountedFiles > 0) {
    const n = reconcile.uncountedFiles;
    console.log(`\n  ⚠️  ${n} file${n > 1 ? 's' : ''} changed outside pipeline since last build approval — run: aitri reconcile`);
  }

  if (backlog.open != null) {
    // Only show when any pipeline has a BACKLOG.json — `backlog.open` is 0 when
    // files exist but are empty. Suppress only when no BACKLOG.json exists anywhere.
    const anyBacklog = Object.values(backlog.byPipeline).some(v => v !== 0) || backlogHasFiles(snapshot);
    if (anyBacklog) {
      const label = backlog.open === 0 ? 'no open items' : `${backlog.open} open item${backlog.open > 1 ? 's' : ''}`;
      const { detail, run } = scopeProvenance(backlog.byPipeline, 'aitri backlog', 'aitri feature backlog <name>');
      console.log(`\n  backlog: ${label}${detail} — run: ${run}`);
    }
  }

  // Suppress the "no active bugs" label when a parse error is being reported below —
  // "no active bugs" + "unreadable" side by side reads as a contradiction (the zero is
  // an artifact of the corruption, not a fact).
  if ((bugs.total > 0 || bugsFilesExist(snapshot)) && !(bugs.open === 0 && bugs.parseErrors.length > 0)) {
    const activeBugs = bugs.open;
    const label = activeBugs === 0 ? 'no active bugs' : `⚠️  ${activeBugs} active bug${activeBugs > 1 ? 's' : ''} (open/in-fix)`;
    const { detail, run } = scopeProvenance(bugs.openByPipeline, 'aitri bug list', 'aitri feature bug <name> list');
    console.log(`  bugs:    ${label}${detail} — run: ${run}`);
  }
  if (bugs.parseErrors.length > 0) {
    // Degrade VISIBLY (rc.158): a corrupt BUGS.json hides its bugs from every counter above
    // while the gates (verify-complete, reconcile --resolve, validate --ci) refuse on it.
    console.log(`  bugs:    ❌ BUGS.json unreadable [${bugs.parseErrors.join(', ')}] — its bugs are NOT counted; fix or git-restore the file`);
  }

  if (health.staleAudit) {
    console.log(`  audit:   stale (${snapshot.audit.stalenessDays} days) — run: aitri audit`);
  }

  // Stale verify (rc.3): surface alongside staleAudit. P7 emits one verify-run
  // action per stale pipeline, so this line summarizes the count without
  // re-listing what the ladder already enumerates.
  if (health.staleVerify && health.staleVerify.length > 0) {
    const sv = health.staleVerify;
    const oldest = Math.max(...sv.map(s => s.days));
    const n = sv.length;
    console.log(`  verify:  stale on ${n} pipeline${n > 1 ? 's' : ''} (oldest ${oldest} days) — run: aitri verify-run`);
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
  const { project, pipelines, bugs, audit, health, nextActions, snapshotVersion, backlog, reconcile, tests } = snapshot;
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
      // Run-binding (UPLAN-0703 B3): the results file is not in artifactHashes, so its `drift`
      // was hardcoded false here — a post-run rewrite went unreported while `status:"passed"`
      // stayed sticky. Derive drift from the binding computed in the snapshot SSoT so this
      // matches validate --json. `status` keeps its documented "passed"|"not_run" enum (an
      // approved phase can carry drift:true too); `resultsBinding` is the additive precise state.
      const vBound = root.verify.resultsBinding;
      const vPhase = {
        key:      'verify',
        name:     'Tests',
        artifact: '04_TEST_RESULTS.json',
        optional: false,
        exists:   !!root.verify.passed,
        status:   root.verify.passed ? 'passed' : 'not_run',
        drift:    vBound === 'mismatch',
        resultsBinding: vBound,
        // M1 (ADR-085), additive: the verdict's binding to the code tree it certified
        // ('fresh' | 'stale' | 'dirty' | 'unreachable' | 'unbound').
        refState: root.verify.refState,
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
      // FEATURE-ORDER-0729 (additive): creation timestamp — lets consumers (Hub) render
      // a real feature timeline. null on pre-createdAt projects. Type-guarded: the
      // contract says "ISO string | null" — a hand-edited numeric value must not leak.
      createdAt:        typeof f.createdAt === 'string' && f.createdAt ? f.createdAt : null,
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
    // Additive (rc.161, HUB-CATCHUP-0705): the root pipeline's last session
    // marker ({at, agent, event, files_touched?, context?} — null when absent).
    // lastSession lives in per-machine .aitri.local; exposing it here lets a
    // same-machine consumer (Hub) retire its direct .aitri.local read, which
    // SCHEMA.md discourages. status --json runs on the same machine by nature.
    // Shape-guarded: .aitri.local is read leniently, so a hand-corrupted
    // non-object value must degrade to null, not leak into the contract.
    lastSession:    (root.lastSession && typeof root.lastSession === 'object' && !Array.isArray(root.lastSession))
                      ? root.lastSession : null,
    // Additive (rc.9, RELEASE-VERSION-0722): sealed release identity from
    // 05_TRACEABILITY.json — {version, version_source} or null. version_source is
    // "manifest" | "team" | "assumed" (null on pre-rc.9 artifacts). Display-informational.
    release:        root.release || null,
    features:       featureSummaries,
    // Additive (2.1.0-rc.2, PLAN-ARTIFACT-0715 S3): advisory epic progress from the root
    // BUILD_PLAN.md while Phase 4 is in flight. null otherwise (absent/legacy/malformed
    // plan, or build not in flight). DISPLAY-ONLY — the plan is an agent-maintained
    // working file (ARTIFACTS.md working-files class); never treat this as a gate input.
    buildPlan:      root.buildPlan,
    bugs:           {
      total:      bugs.total,
      open:       bugs.open,
      blocking:   bugs.blocking,
      bySeverity: bugs.bySeverity,
      openIds:    bugs.openIds,
      // Additive (rc.158, INTEG-0704 #2): scopes whose BUGS.json EXISTS but failed to parse.
      // Their bugs are invisible to the counters above (degrading display, rc.149) while the
      // gates refuse — without this flag a machine consumer (Hub) cannot tell "no bugs" from
      // "corrupt bug file" on a project whose health may read deployable.
      parseErrors: bugs.parseErrors,
    },
    backlog:        { open: backlog.open },
    audit:          { exists: audit.exists, stalenessDays: audit.stalenessDays },
    tests: {
      totals:        tests.totals,
      perPipeline:   tests.perPipeline,
      stalenessDays: tests.stalenessDays,
    },
    reconcile:      {
      state:          reconcile.state,
      method:         reconcile.method,
      baseRef:        reconcile.baseRef,
      uncountedFiles: reconcile.uncountedFiles,
    },
    health: {
      deployable:        health.deployable,
      deployableReasons: health.deployableReasons,
      staleAudit:        health.staleAudit,
      blockedByBugs:     health.blockedByBugs,
      activeFeatures:    health.activeFeatures,
      versionMismatch:   health.versionMismatch,
      // driftPresent + staleVerify have been part of the documented health
      // contract (STATUS_JSON.md) since v0.1.77 but were never emitted here —
      // a consumer reading them got undefined. Now honored (additive). Data is
      // already computed by computeHealth in snapshot.js.
      driftPresent:      health.driftPresent,
      staleVerify:       health.staleVerify,
    },
    nextActions,
  };

  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

// Re-export hasDrift so tooling that imported from status.js still works.
// (No known external consumers; defensive.)
export { hasDrift };
