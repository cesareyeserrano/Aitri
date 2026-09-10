/**
 * Module: Command — validate
 * Purpose: Deploy-gate verification. Checks all pipeline artifacts are present,
 *          approved, and not drifted, then reports deployment readiness.
 *
 *          Thin projection over `buildProjectSnapshot()` — phase state comes
 *          from the snapshot; validate-specific concerns (IDEA.md, deploy
 *          files, setup commands) live here.
 *
 * Flags:
 *   --json       Emit legacy JSON shape (artifacts[], allValid, deployFiles, setupCommands).
 *                Schema preserved for Hub and external consumers.
 *   --explain    Expanded text mode — enumerates deployable reasons from
 *                `snapshot.health.deployableReasons` so the user can see why
 *                the deploy gate is (or isn't) open.
 *   --ci         Opt-in CI gate (ADV-0622-27). By default validate is a REPORTING command
 *                and always exits 0 — so a CI step running it silently passes even when the
 *                project is not deployable. With --ci, a not-deployable verdict exits non-zero
 *                so CI can gate on it. Output is unchanged; only the exit code differs.
 */

import fs   from 'node:fs';
import path from 'node:path';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { readArtifact, ideaPath as resolveIdeaPath, loadConfig } from '../state.js';
import { buildProjectSnapshot, scopeProvenance } from '../snapshot.js';
import { formatVerifyCounts }           from '../verify-display.js';
import { assertBugsReadable }           from './bug.js';
import { requirementsAuditState }       from './audit.js';
import { readHostCiStatus, formatHostCiLines } from '../host-ci.js';

const CORE_PHASE_NUMS = [1, 2, 3, 4, 5];

/**
 * Brief presence check — IDEA.md gate accepts either path post-alpha.17:
 *   (a) `IDEA.md` exists at project root (pre-absorption state); OR
 *   (b) `01_REQUIREMENTS.json#original_brief` is populated (post-absorption,
 *       i.e. the alpha.17 orphan-IDEA migration ran and consumed the file).
 *
 * Returns `{ ok, absorbed }`. `ok` is true when either path is satisfied;
 * `absorbed` is true only when the brief is in `original_brief` (the file
 * itself is gone). `absorbed` flows into the JSON output as an additive
 * field for subproducts that want to render the absorption path explicitly.
 *
 * Closes the contract violation introduced in alpha.17: the migration
 * unlinks `IDEA.md` after absorbing it, but `validate` continued to gate
 * on the file's filesystem presence and falsely reported it missing.
 * Surfaced 2026-05-02 PM by `aitri validate` on Ultron post-upgrade.
 */
function ideaBriefStatus(project, root) {
  const onDisk = fs.existsSync(resolveIdeaPath(project.dir, root));
  if (onDisk) return { ok: true, absorbed: false };
  try {
    const raw = readArtifact(project.dir, '01_REQUIREMENTS.json', root.artifactsDir || '');
    if (raw) {
      const reqs  = JSON.parse(raw);
      const brief = typeof reqs.original_brief === 'string' ? reqs.original_brief.trim() : '';
      if (brief.length > 0) return { ok: true, absorbed: true };
    }
  } catch { /* malformed JSON or unreadable artifact — fall through to ok=false */ }
  return { ok: false, absorbed: false };
}

export function cmdValidate({ dir, VERSION, args = [], _hostCi }) {
  const snapshot = buildProjectSnapshot(dir, { cliVersion: VERSION });
  const json = args.includes('--json');
  if (json) emitJson(snapshot);
  else emitText(snapshot, {
    explain: args.includes('--explain'),
    dir,
    _hostCi,
    // F1 (rc.9 adversarial BLOCKER): --ci must suppress the probe even in text mode —
    // checking CI from inside CI is circular latency, and the flag is the machine signal.
    probeHostCi: !args.includes('--ci'),
  });
  // ADV-0622-27: opt-in CI gate. Default exit stays 0 (validate is a reporting command);
  // --ci makes a not-deployable verdict exit non-zero so a CI step can fail on it. Set
  // process.exitCode (not process.exit) so the printed report still flushes. In --json mode
  // the JSON already carries `deployable`, so the human notice goes to stderr to keep stdout
  // pure JSON for `JSON.parse`.
  if (args.includes('--ci')) {
    // B8: --ci is a GATE (exit code consumed by CI), so it must not report green over an
    // unreadable BUGS.json — a parse failure empties the blocking-bug count in the snapshot's
    // aggregate. Checked for EVERY pipeline (root + features): the aggregate reads them all,
    // so a corrupt feature file silently drops that feature's blocking bugs too
    // (adversarial-pass fix — the first cut checked only the root). Default validate stays a
    // reporting command and degrades like the other display surfaces.
    for (const pl of snapshot.pipelines) {
      assertBugsReadable(pl.path, { artifactsDir: pl.artifactsDir || '' }, (m) => {
        process.stderr.write(`\n❌ [${pl.scope}] ${m}\n`);
        process.exitCode = 1;
      });
    }
  }
  if (args.includes('--ci') && process.exitCode !== 1 && !snapshot.health.deployable) {
    process.exitCode = 1;
    const notice = '[aitri] --ci: deploy gate is NOT open — exiting non-zero.\n';
    if (json) process.stderr.write(notice);
    else console.log(`\n${notice.trimEnd()}`);
  }
}

// ── Text output ──────────────────────────────────────────────────────────────

function emitText(snapshot, { explain, dir, _hostCi, probeHostCi = true }) {
  const { project, pipelines, health, bugs, tests } = snapshot;
  const root = pipelines.find(p => p.scopeType === 'root');

  console.log(`\n🔍 Validating — ${path.basename(project.dir)}`);
  console.log('─'.repeat(50));

  let allGood = true;

  // IDEA.md — validate-specific, not part of snapshot. Two valid paths after
  // alpha.17: file on disk OR brief absorbed into 01_REQUIREMENTS.json.original_brief.
  const idea = ideaBriefStatus(project, root);
  const ideaIcon  = idea.ok ? '✅' : '❌';
  const ideaLabel = idea.absorbed ? 'IDEA.md (absorbed → 01_REQUIREMENTS.json#original_brief)' : 'IDEA.md';
  console.log(`${ideaIcon} ${ideaLabel}`);
  if (!idea.ok) allGood = false;

  // Optional phases — informational, never block
  for (const key of OPTIONAL_PHASES) {
    const ph = root.phases.find(p => p.key === key);
    if (!ph || !ph.exists) continue;
    const icon = ph.status === 'approved' ? '✅' : '⏳';
    const note = ph.status === 'approved' ? '' : ' (not approved — optional)';
    console.log(`${icon} ${ph.artifact}${note}`);
  }

  // Core phases
  for (const num of CORE_PHASE_NUMS) {
    const ph = root.phases.find(p => p.key === num);
    if (!ph) continue;
    const isApproved = ph.status === 'approved';
    let icon, note;
    if (ph.exists && isApproved)   { icon = '✅'; note = ''; }
    else if (ph.exists)            { icon = '⏳'; note = ' (not approved)'; allGood = false; }
    else                           { icon = '❌'; note = ' (MISSING)';      allGood = false; }
    if (ph.drift) {
      const ref = ph.alias || ph.key;
      note += `  ⚠️  DRIFT: artifact modified after approval — human must review and re-approve (run: aitri approve ${ref} in your terminal)`;
      allGood = false;
    }
    console.log(`${icon} ${ph.artifact}${note}`);
  }

  // Verify (04_TEST_RESULTS.json)
  const verifyArtifact = path.join(project.dir, root.artifactsDir || '', '04_TEST_RESULTS.json');
  const verifyExists   = fs.existsSync(verifyArtifact);
  if      (verifyExists && root.verify.passed && root.verify.resultsBinding === 'mismatch')
                                                { console.log(`⚠️  04_TEST_RESULTS.json (edited after verify-run — results-hash mismatch)`); allGood = false; }
  else if (verifyExists && root.verify.passed)  console.log(`✅ 04_TEST_RESULTS.json`);
  else if (verifyExists)                        { console.log(`⏳ 04_TEST_RESULTS.json (verify-complete not run)`); allGood = false; }
  else                                          { console.log(`❌ 04_TEST_RESULTS.json (MISSING)`);                 allGood = false; }

  // Open bug warning (non-blocking info). Provenance-aware (FB-SCOPE-BLIND-0724):
  // the count aggregates every pipeline — the pointer must reach the scope(s) that
  // actually hold the bugs, or the warning sends the operator to an empty list.
  if (bugs.open > 0) {
    const { detail, run } = scopeProvenance(bugs.openByPipeline, 'aitri bug list', 'aitri feature bug <name> list');
    // BUG-STATE-VISIBLE-0909: the count includes `fixed` (awaiting verification) — say so,
    // or 9 fixed + 2 open reads as "11 open bugs" and the fixed ones get re-triaged.
    const breakdown = bugs.fixed > 0
      ? ` (${bugs.active} open/in-progress + ${bugs.fixed} fixed awaiting \`bug verify\`)`
      : '';
    console.log(`  ⚠️  ${bugs.open} unresolved bug(s)${breakdown}${detail} — critical/high severity in open/in-progress will block verify-complete. Run: ${run}`);
  }

  // Host-CI advisory (CI-VISIBILITY-0906, ADR-087): read-only, pull-based readout of
  // the platform's workflow runs via the project's own `gh` — ONLY in this plain human
  // mode. Deliberately NOT in --ci (checking CI from inside CI is circular latency) and
  // NOT in --json (Hub polls it in cycles — a network call per cycle is the documented
  // battery-leak class; and no consumer asked for the field). Advisory, never blocks:
  // a red run does not mechanically mean a broken build (the evidenced case was a
  // scheduled dependency-audit job) — the blocking path is a declared quality_gate.
  if (probeHostCi) {
    const hostCi = (_hostCi || readHostCiStatus)(dir);
    for (const line of formatHostCiLines(hostCi)) console.log(line);
  }

  console.log('─'.repeat(50));

  if (!allGood) {
    console.log('⚠️  Some artifacts missing or not approved.');
    if (explain) emitExplain(snapshot);
    return;
  }

  // All required artifacts present — report deployment readiness
  console.log('✅ All artifacts present and approved!\n');

  // Deploy-gate verdict — moved up from previous position. This is validate's
  // primary signal; operational deploy info (candidates, setup commands) is
  // gated behind --explain post-rc.1 to avoid duplicating status's content
  // on every run. See BACKLOG.md "Pre-promotion findings" P3 (validate trim).
  if (health.deployable) {
    console.log('✅ Pipeline complete. Deployment artifacts are ready — run your deploy commands to ship.');
    // D5 follow-up (rc.156): last-chance intent-coverage visibility at the deploy verdict.
    // The mechanical spine (fr_coverage) proves FR→test; it structurally CANNOT catch a
    // client need that never became an FR — that blind spot is exactly what the
    // requirements coverage audit covers, and validate already surfaces the general code
    // audit's staleness at this same decision point (emitExplain). Advisory, never a gate
    // (the audit is agent-performed — ADR-072's presence-theater reasoning applies).
    // Same requirementsAuditState SSoT as complete 1 / approve 1 / resume (rc.154).
    const auditState = requirementsAuditState(project.dir, loadConfig(project.dir));
    if (auditState.hasRequirements && !auditState.fresh) {
      console.log('  ℹ️  Intent-coverage audit not fresh for this version of the requirements — a silently');
      console.log('      dropped client need would NOT appear in fr_coverage. Before shipping, consider:');
      console.log('      aitri audit requirements   (best from a fresh session)');
    }
  } else {
    console.log('⚠️  Core artifacts present, but deploy is blocked:');
    for (const r of health.deployableReasons) console.log(`  - ${r.message}`);
  }

  // Features section — default text shows it ONLY when at least one feature is
  // not in the all-green state (failed verify OR incomplete approvals). When
  // every feature is green, the section is redundant with the deployable line.
  // --explain always shows it (full audit context).
  const features = pipelines.filter(p => p.scopeType === 'feature');
  const sortRank = f => {
    if (f.allCoreApproved && f.verify.ran && !f.verify.passed) return 0; // failed verify
    if (!f.allCoreApproved || !f.verify.ran)                    return 1; // incomplete
    return 2;                                                              // all green
  };
  const hasBlockers   = features.some(f => sortRank(f) < 2);
  const showFeatures  = explain || hasBlockers;

  if (showFeatures && features.length) {
    const sorted = [...features].sort((a, b) => sortRank(a) - sortRank(b));
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
      console.log(`    ${f.scopeName.padEnd(20)} phases ${approvedCount}/5${verify}${drift}`);
    }

    const featureVerifyCount = features.filter(f => f.verify.summary).length;
    if (featureVerifyCount > 0 && tests?.totals?.total > 0) {
      console.log(`  Σ all pipelines:${formatVerifyCounts(tests.totals)}`);
    }
  }

  // --explain only: gate-reasons enumeration + operational deploy info.
  // The operational info (deploy candidates, setup commands, DEPLOYMENT.md hint)
  // duplicates content that lives in the manifest + project root files. It is
  // useful as a pre-deploy checklist but noise on repeated validate runs.
  if (explain) {
    emitExplain(snapshot);
    emitOperationalDeploy(snapshot);
  }
}

function emitOperationalDeploy(snapshot) {
  const { project, pipelines } = snapshot;
  const root = pipelines.find(p => p.scopeType === 'root');

  // Deploy files — informational. Aitri is deploy-target-agnostic:
  // Dockerfile/compose are one choice among many (systemd, lambda, Pi, serverless, …),
  // so missing Docker files is NOT a defect. See FEEDBACK.md A5.
  const deployCandidates = ['Dockerfile', 'docker-compose.yml', 'DEPLOYMENT.md', '.env.example'];
  const foundDeploy      = deployCandidates.filter(f => fs.existsSync(path.join(project.dir, f)));

  if (foundDeploy.length) {
    console.log('\n📦 Deployment files detected:');
    for (const f of foundDeploy) console.log(`  ✅ ${f}`);
  } else {
    console.log('\n📦 No standard deployment files detected at project root.');
    console.log('   (This is fine for non-containerized targets — systemd, lambda, Pi, etc.)');
  }

  // Setup commands from manifest
  const manifestRaw = readArtifact(project.dir, '04_BUILD_REPORT.json', root.artifactsDir);
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw);
      const cmds = manifest.setup_commands || [];
      if (cmds.length) {
        console.log('\n🚀 Setup commands (from 04_BUILD_REPORT.json):');
        for (const cmd of cmds) console.log(`  ${cmd}`);
      }
    } catch { /* malformed manifest — skip */ }
  }

  if (fs.existsSync(path.join(project.dir, 'DEPLOYMENT.md'))) {
    console.log(`\n📖 Full deploy instructions: ${path.join(project.dir, 'DEPLOYMENT.md')}`);
  }
}

function emitExplain(snapshot) {
  const { health, audit } = snapshot;
  console.log('\n🔎 Deploy-gate explanation:');
  if (health.deployable) {
    console.log('  ✅ All gates passed:');
    console.log('     - All core phases approved');
    console.log('     - verify-complete passed');
    console.log('     - No drift on approved artifacts');
    console.log('     - No critical/high open bugs');
    console.log('     - CLI and project versions match');
    if (!audit.exists)       console.log('  ℹ️  No audit on record — consider running `aitri audit` before shipping.');
    else if (health.staleAudit) console.log(`  ℹ️  Last audit ${audit.stalenessDays} days ago — consider refreshing.`);
  } else {
    console.log('  Blocking reasons:');
    for (const r of health.deployableReasons) console.log(`  - [${r.type}] ${r.message}`);
  }
}

// ── JSON output (legacy schema preserved) ────────────────────────────────────

function emitJson(snapshot) {
  const { project, pipelines, health, bugs } = snapshot;
  const root = pipelines.find(p => p.scopeType === 'root');

  const artifacts = [];

  // IDEA.md — validate-specific. `exists` stays literal (file on disk).
  // `approved=true` when either path satisfies (file OR absorbed). The
  // additive `absorbed` field lets subproducts (Hub) render the absorption
  // explicitly — old readers ignore it and rely on `approved` as before.
  const idea       = ideaBriefStatus(project, root);
  const ideaOnDisk = fs.existsSync(resolveIdeaPath(project.dir, root));
  artifacts.push({
    name:     'IDEA.md',
    exists:   ideaOnDisk,
    approved: idea.ok,
    drift:    false,
    required: true,
    ...(idea.absorbed ? { absorbed: true } : {}),
  });

  // Optional phases — only included when artifact exists (parity with text mode)
  for (const key of OPTIONAL_PHASES) {
    const ph = root.phases.find(p => p.key === key);
    if (!ph || !ph.exists) continue;
    artifacts.push({
      name:     ph.artifact,
      exists:   true,
      approved: ph.status === 'approved',
      drift:    ph.drift,
      required: false,
      optional: true,
    });
  }

  for (const num of CORE_PHASE_NUMS) {
    const ph = root.phases.find(p => p.key === num);
    if (!ph) continue;
    artifacts.push({
      name:     ph.artifact,
      exists:   ph.exists,
      approved: ph.status === 'approved',
      drift:    ph.drift,
      required: true,
    });
  }

  // Verify entry. `drift` is no longer hardcoded false (UPLAN-0703 B3): the results file is
  // not tracked in artifactHashes, so `hasDrift` never covered it and a post-run rewrite went
  // unreported here while `verifyPassed` stayed sticky-true. Derive drift from the run-binding
  // computed in the snapshot SSoT: a 'mismatch' IS drift on the results file. The additive
  // `resultsBinding` field lets subproducts read the precise state.
  const verifyArtifact = path.join(project.dir, root.artifactsDir || '', '04_TEST_RESULTS.json');
  const verifyExists   = fs.existsSync(verifyArtifact);
  const resultsBinding = root.verify.resultsBinding;
  artifacts.push({
    name:           '04_TEST_RESULTS.json',
    exists:         verifyExists,
    approved:       !!(verifyExists && root.verify.passed && resultsBinding !== 'mismatch'),
    drift:          resultsBinding === 'mismatch',
    required:       true,
    verifyPassed:   !!root.verify.passed,
    resultsBinding,
  });

  // An absorbed brief counts as satisfied (E2E-PIPELINE-0706): IDEA.md is
  // absorbed into 01_REQUIREMENTS.json#original_brief and ARCHIVED at approve 1
  // by design, so `exists && …` alone made allValid a permanent false-negative
  // for every project past approve 1 — a documented-but-useless boolean that a
  // shipped consumer misread. `exists` stays literal (contract untouched);
  // the derivation honors the already-documented `absorbed` field.
  const allValid = artifacts
    .filter(a => a.required)
    .every(a => (a.exists || a.absorbed === true) && a.approved && !a.drift);

  const deployFiles = Object.fromEntries(
    ['Dockerfile', 'docker-compose.yml', 'DEPLOYMENT.md', '.env.example']
      .map(f => [f, fs.existsSync(path.join(project.dir, f))])
  );

  let setupCommands = [];
  try {
    const raw = readArtifact(project.dir, '04_BUILD_REPORT.json', root.artifactsDir);
    if (raw) setupCommands = JSON.parse(raw).setup_commands || [];
  } catch { /* non-fatal */ }

  process.stdout.write(JSON.stringify({
    project:  project.name,
    dir:      project.dir,
    allValid,
    artifacts,
    deployFiles,
    setupCommands,
    // Snapshot-derived extensions
    deployable:        health.deployable,
    deployableReasons: health.deployableReasons,
    openBugs:          bugs.open,
    blockingBugs:      bugs.blocking,
  }, null, 2) + '\n');
}
