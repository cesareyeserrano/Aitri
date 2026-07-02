/**
 * Module: Command — feature
 * Purpose: Manage feature sub-pipelines within an existing Aitri project.
 *
 * Usage:
 *   aitri feature init <name>
 *   aitri feature list
 *   aitri feature status <name>
 *   aitri feature run-phase <name> <1-5|ux|discovery>
 *   aitri feature complete <name> <phase>
 *   aitri feature approve  <name> <phase>
 *   aitri feature reject   <name> <phase> --feedback "text"
 *
 * Feature dirs: <project>/features/<name>/
 * Feature state: <project>/features/<name>/.aitri  (same format as root .aitri)
 * Feature artifacts: <project>/features/<name>/spec/
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig, writeLastSession, featuresDir as resolveFeaturesDir, readArtifact } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
import { cmdRunPhase }  from './run-phase.js';
import { cmdComplete }  from './complete.js';
import { cmdApprove }   from './approve.js';
import { cmdReject }                          from './reject.js';
import { cmdStatus }                          from './status.js';
import { cmdVerifyRun, cmdVerifyComplete }    from './verify.js';
import { cmdAudit }                           from './audit.js';
import { cmdRehash }                          from './rehash.js';
import { cmdTC }                              from './tc.js';
import { cmdBug }                             from './bug.js';
import { cmdBacklog }                         from './backlog.js';
import { cmdCheckpoint }                      from './checkpoint.js';

const USAGE = `Usage:
  aitri feature init <name>                        Create feature sub-pipeline
  aitri feature list                               List all features
  aitri feature status <name>                      Show feature pipeline state
  aitri feature run-phase <name> <1-5|ux|discovery> Generate feature phase briefing
  aitri feature complete <name> <phase>            Validate and mark phase complete
  aitri feature approve  <name> <phase>            Approve phase output
  aitri feature reject   <name> <phase> --feedback "text"
  aitri feature verify-run <name> [--cmd "..."]    Run tests in feature context (--cmd overrides manifest.test_runner)
  aitri feature verify-complete <name>             Gate check before feature Phase 5
  aitri feature tc <name> verify [<TC-ID> --result pass|fail --notes "..."]   Verify the feature's manual TC(s) (bare = guided)
  aitri feature tc <name> mark-manual <TC-ID> [--reason "..."]                Mark a feature TC as manual
  aitri feature bug <name> <add|fix|verify|close|list> ...                    Triage the feature's own bugs
  aitri feature backlog <name> <add|list|show|done> ...                       The feature's own backlog
  aitri feature audit <name> requirements                                     Audit feature intent → FR coverage (gaps the feature decided but dropped)
  aitri feature checkpoint <name> [--context "..."] [--name "snap"] [--list]   Save the feature's session note
  aitri feature rehash <name> <phase>              Rehash phase artifact (legacy bookkeeping only)
  aitri feature discard <name>                     Retire a cancelled feature (deletes its dir; surfaces code it built)`;

export function cmdFeature({ dir, args, err, rootDir }) {
  const [sub, ...rest] = args;

  if (!sub || sub === 'help') err(USAGE);

  if (sub === 'list') return featureList(dir);

  const [name, ...subRest] = rest;
  if (!name) err(USAGE);

  // AUDIT-0629-C: path-traversal guard at the SHARED resolution point. featureDir is
  // path.join(featuresDir, name); a name like ".." or "../sibling" normalizes OUTSIDE the
  // features collection (".." → the project root itself), the existsSync check below would PASS
  // because that path exists, and every subcommand (init/approve/complete/reject/tc/bug/...) would
  // then read and WRITE the WRONG committed `.aitri` — corrupting the root or a sibling pipeline,
  // exactly the shared state the multi-team git handoff depends on. The discard path already had
  // this guard (it DELETES the dir); lifting it here covers every state-mutating subcommand too.
  // Require a single safe path segment.
  if (name !== path.basename(name) || name === '.' || name === '..')
    err(`Invalid feature name "${name}" — a feature name must be a single path segment (no "/" or "..").`);

  // Resolve the features collection through the project config BEFORE building
  // the feature path (LAYOUT-1): contained projects keep features under
  // `aitri/features/`. loadConfig on a non-project dir returns defaults
  // (layoutRoot absent → flat), so the existing not-found guidance below is
  // unchanged for wrong-cwd invocations.
  const rootConfig = loadConfig(dir);
  const featureDir = path.join(resolveFeaturesDir(dir, rootConfig), name);

  if (sub === 'init') return featureInit(featureDir, name, dir, rootDir, err);

  if (!fs.existsSync(featureDir)) {
    // Features resolve relative to cwd. The most common cause of "not found" is
    // running from outside the project root (e.g. ~), not a genuinely missing
    // feature — the v2.0.0-rc canary saw an agent advised to `init` a feature
    // that already existed because the operator was in the wrong directory.
    const cwdIsProjectRoot = fs.existsSync(path.join(dir, '.aitri'));
    if (!cwdIsProjectRoot) {
      const ancestor = findAncestorProjectRoot(dir);
      const retry = `aitri feature ${sub} ${name}${subRest.length ? ' ' + subRest.join(' ') : ''}`;
      if (ancestor) {
        err(
          `Feature "${name}" not found — features resolve relative to the current directory, ` +
          `and this is not the project root.\n` +
          `Project root: ${ancestor}\n` +
          `Run from there:  cd ${ancestor} && ${retry}`
        );
      }
      err(
        `Feature "${name}" not found — features resolve relative to the current directory, ` +
        `and this is not an Aitri project (no .aitri here).\n` +
        `cd into the project root and retry. If "${name}" is genuinely new, run: aitri feature init ${name}`
      );
    }
    err(`Feature "${name}" not found.\nRun: aitri feature init ${name}`);
  }

  // Rebuild flagValue bound to the sub-command's args (not the full feature args)
  const featureFlagValue = (flag) => {
    const i = subRest.indexOf(flag);
    if (i === -1 || i + 1 >= subRest.length) return null;
    return subRest[i + 1];
  };

  const featureCtx = {
    dir:        featureDir,
    args:       subRest,
    flagValue:  featureFlagValue,
    err,
    rootDir,
    featureRoot: dir,    // signals run-phase to inject parent project context
    scopeName:   name,   // used by lib/scope.js::commandPrefix() to emit `feature <name> ` in instructions
  };

  switch (sub) {
    case 'run-phase': {
      // Seed guard only (the IDEA.md materialized COPY is gone since rc.80,
      // ADR-050 — phases read FEATURE_IDEA.md directly in feature scope).
      // Skip once Phase 1 has produced 01_REQUIREMENTS.json — that artifact is
      // the SSoT for re-runs, and the seed was archived at first approve 1.
      const featureConfig = loadConfig(featureDir);
      const featureArtDir = featureConfig.artifactsDir || '';
      const reqPath       = path.join(featureDir, featureArtDir, '01_REQUIREMENTS.json');
      const hasReqs       = fs.existsSync(reqPath);

      if (!hasReqs) {
        const featureIdeaPath = path.join(featureDir, 'FEATURE_IDEA.md');
        if (!fs.existsSync(featureIdeaPath)) {
          err(
            `FEATURE_IDEA.md not found in ${path.relative(dir, featureDir)}/\n` +
            `  Describe what this feature adds or changes before running the pipeline.\n` +
            `  Create: ${featureIdeaPath}`
          );
        }
      }
      cmdRunPhase(featureCtx);
      break;
    }
    case 'complete':         cmdComplete(featureCtx);      break;
    case 'approve':          cmdApprove(featureCtx);       break;
    case 'reject':           cmdReject(featureCtx);        break;
    case 'status':           cmdStatus(featureCtx);        break;
    case 'verify-run':       cmdVerifyRun(featureCtx);     break;
    case 'verify-complete':  cmdVerifyComplete(featureCtx); break;
    case 'rehash':           cmdRehash(featureCtx);        break;
    // tc / bug / backlog operate on the FEATURE's own data (03_TEST_CASES.json,
    // 04_TEST_RESULTS.json, BUGS.json, BACKLOG.json). featureCtx.args is already the
    // post-name remainder (e.g. ['verify','TC-001',…] / ['add','--title',…]) and
    // featureCtx.dir is the feature dir, so each resolves the feature's files
    // (FEAT-PARITY-0620). featureRoot/scopeName thread through for scope-aware hints.
    case 'tc':               cmdTC(featureCtx);            break;
    case 'bug':              cmdBug(featureCtx);           break;
    case 'backlog':          cmdBacklog(featureCtx);       break;
    // checkpoint writes the FEATURE's own session note (.aitri.local) so a long
    // feature build can be paused/resumed with its own narrative — surfaced by
    // status/resume per-feature (FEAT-PARITY-0620 part 3). Ledger feedback asked for it.
    case 'checkpoint':       cmdCheckpoint(featureCtx);    break;
    // audit at feature scope: ONLY `coverage` (AUDIT-COV-FEAT-0625 fork 2) — compares
    // the feature's own intent (FEATURE_IDEA.md / absorbed original_brief) against the
    // feature's FRs, so a need decided in the feature's ideation is not silently dropped.
    // The default code audit / plan / security run at the project ROOT (whole-codebase
    // scope), not per-feature — keep the surface bounded to the evidenced need.
    case 'audit': {
      // `requirements` is canonical; `coverage` is the deprecated alias (cmdAudit emits
      // the rename note). Only the requirements/coverage audit is feature-scoped — the
      // code audit / plan / security run at the project root (whole-codebase scope).
      const auditSub = subRest[0];
      if (auditSub !== 'requirements' && auditSub !== 'coverage') {
        err(
          `At feature scope only \`audit requirements\` is supported (got "${auditSub || '(none)'}").\n` +
          `Run \`aitri audit\`, \`audit plan\`, or \`audit security\` at the project root.`
        );
      }
      cmdAudit(featureCtx);
      break;
    }
    // discard retires a cancelled/descoped feature. Destructive + state-committing
    // → isTTY-gated (invariant 7, like approve/rehash/reconcile --resolve). The
    // not-found guard above already handled a missing feature with the standard
    // message before we get here (FEAT-DISCARD-0624).
    case 'discard':          featureDiscard(featureDir, name, dir, err); break;
    default: err(`Unknown feature sub-command: "${sub}"\n\n${USAGE}`);
  }
}

// ── feature init ─────────────────────────────────────────────────────────────

function featureInit(featureDir, name, projectDir, rootDir, err) {
  if (fs.existsSync(featureDir)) {
    err(`Feature "${name}" already exists: ${featureDir}`);
  }

  if (!fs.existsSync(path.join(projectDir, '.aitri'))) {
    err(`No Aitri project found in ${projectDir}.\nRun: aitri init`);
  }

  fs.mkdirSync(path.join(featureDir, 'spec'), { recursive: true });

  // Feature-scoped context folder (pairs with FEATURE_IDEA.md, mirrors the root's
  // idea_context/). run-phase scans feature_context/ in a feature sub-pipeline.
  const featureCtxDir = path.join(featureDir, 'feature_context');
  if (!fs.existsSync(featureCtxDir)) {
    fs.mkdirSync(featureCtxDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureCtxDir, 'README.md'),
      '# feature_context/ — provided definitions for this feature\n\nDrop the material specific to THIS feature here: a spec, business rules, mockups, PDFs, screenshots, sample code.\nAt the requirements/design phases Aitri injects the full text of the readable files here into the briefing, and flags what it cannot read (images, oversized files) to be opened — so provided definitions reach the agent, not just their filenames.\n\nNotes:\n- This is the feature\'s own context. The root project has its own `idea_context/` (surfaced to the feature as a read-only pointer).\n- Keep it curated: remove material that becomes obsolete as the feature evolves.\n'
    );
  }

  // Feature state: independent .aitri scoped to this feature
  // Create FEATURE_IDEA.md from template BEFORE writing .aitri. saveConfig (the .aitri
  // "initialized" marker) is written LAST so a crash mid-init leaves an ignorable orphan dir
  // (no .aitri — feature discovery skips it) rather than a registered-but-broken feature
  // missing its seed (R3-14; mirrors init.js durable ordering).
  const tplPath  = path.join(rootDir, 'templates', 'FEATURE_IDEA.md');
  const ideaPath = path.join(featureDir, 'FEATURE_IDEA.md');
  fs.writeFileSync(ideaPath, fs.readFileSync(tplPath, 'utf8'));

  saveConfig(featureDir, {
    projectName:    name,
    createdAt:      new Date().toISOString(),
    currentPhase:   0,
    approvedPhases: [],
    artifactsDir:   'spec',
  });

  // Record on parent project that a feature was started
  const parentConfig = loadConfig(projectDir);
  writeLastSession(parentConfig, projectDir, `feature init ${name}`);
  saveConfig(projectDir, parentConfig);

  console.log(`✅ Feature "${name}" initialized`);
  console.log(`   Location: ${featureDir}`);
  console.log(`   Artifacts: ${featureDir}/spec/`);
  console.log(`
What is a feature sub-pipeline?
  A feature runs its own full Aitri pipeline (phases 1–5) scoped to a single
  increment. It inherits context from the parent project's approved requirements,
  so the agent adds only new FRs — no duplication.

What to do now:
  1. Edit FEATURE_IDEA.md — describe what this feature adds or changes
     ${ideaPath}

  2. Run the feature pipeline:
     aitri feature run-phase ${name} 1           PM briefing (injects parent FRs)
     aitri feature complete  ${name} 1
     aitri feature approve   ${name} 1
     aitri feature run-phase ${name} 2           Architecture
     ... repeat through phases 3, 4, 5

  Other commands:
     aitri feature status    ${name}             Pipeline state
     aitri feature list                          All features in this project
     aitri feature reject    ${name} 1 --feedback "..."  Re-run with feedback`);
}

// ── feature list ─────────────────────────────────────────────────────────────

function featureList(dir) {
  const featuresDir = resolveFeaturesDir(dir, loadConfig(dir));
  if (!fs.existsSync(featuresDir)) {
    // cwd has no features/ directory. If an ancestor is an Aitri project root
    // (carries its own .aitri), name it explicitly — silent "no features yet"
    // misled the Ultron canary 2026-04-27 agent into believing features were lost.
    const projectRoot = findAncestorProjectRoot(dir);
    if (projectRoot && projectRoot !== dir) {
      console.log(`No features in current directory (cwd is not the project root).`);
      console.log(`Project root: ${projectRoot}`);
      console.log(`Run from there:  cd ${projectRoot} && aitri feature list`);
      return;
    }
    console.log('No features yet. Run: aitri feature init <name>');
    return;
  }

  const entries = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  if (!entries.length) {
    console.log('No features yet. Run: aitri feature init <name>');
    return;
  }

  console.log('Features:');
  for (const e of entries) {
    const fDir = path.join(featuresDir, e.name);
    try {
      const config   = loadConfig(fDir);
      const approved = (config.approvedPhases || []).length;
      const current  = config.currentPhase || 0;
      console.log(`  ${e.name}  (current phase: ${current}, phases approved: ${approved})`);
    } catch {
      console.log(`  ${e.name}  (no state)`);
    }
  }
}

// ── feature discard ───────────────────────────────────────────────────────────

// Retire a cancelled/descoped feature (FEAT-DISCARD-0624). Feature discovery is
// purely directory-based (featureList above; snapshot.js), and a feature writes
// nothing persistent to the parent, so deleting the dir cleanly removes it from
// list/status/resume/validate. The DANGEROUS blind spot the command exists to
// close: if the feature reached Phase 4 it contributed code to the SHARED
// codebase (lib/, tests/ outside the feature dir — reconcile.js), and deleting
// the feature dir does NOT revert that code. Aitri does not auto-revert (that is
// git's job, not Aitri's — principle 1); it SURFACES the files so the operator
// can review/revert them via git. That surface is the entire justification for
// the command over a bare `rm -rf` — without it, do not ship.
// Surface the shared code a feature contributed to the codebase — the core value
// of discard (FEAT-DISCARD-0624). Pure + exported so the surface logic is tested
// directly without the interactive path. Returns { created, modified, tests } when
// the build report names ≥1 file, else null. Guards every failure mode: features
// below Phase 4 have no report, and a malformed one must never crash discard.
export function collectBuiltFiles(featureDir, artifactsDir = '') {
  try {
    const raw = readArtifact(featureDir, '04_BUILD_REPORT.json', artifactsDir);
    if (!raw) return null;
    const report   = JSON.parse(raw);
    const created  = Array.isArray(report.files_created)  ? report.files_created  : [];
    const modified = Array.isArray(report.files_modified) ? report.files_modified : [];
    const tests    = Array.isArray(report.test_files)     ? report.test_files     : [];
    if (created.length || modified.length || tests.length) return { created, modified, tests };
    return null;
  } catch {
    return null;
  }
}

export function featureDiscard(featureDir, name, projectDir, err, readConfirm = readStdinSync) {
  // Path-traversal guard (load-bearing — discard is the first feature command that
  // DELETES featureDir). featureDir is path.join(featuresDir, name); a name like
  // ".." or "a/b" resolves OUTSIDE the features collection (".." → the project
  // root itself), and the existence check upstream would PASS because that path
  // exists, so rmSync could wipe the project. Require a single safe path segment.
  if (name !== path.basename(name) || name === '.' || name === '..') {
    err(`Invalid feature name "${name}" — a feature name must be a single path segment (no "/" or "..").`);
    return;
  }

  // Destructive + state-committing → isTTY-gated (invariant 7). An agent cannot
  // unilaterally delete a feature; mirror the rehash/reconcile --resolve gate.
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `\n❌ Discarding feature "${name}" requires human confirmation.\n` +
      `   This permanently deletes ${path.relative(projectDir, featureDir)}/ and cannot be undone by Aitri.\n` +
      `   Run 'aitri feature discard ${name}' manually in your terminal.\n`
    );
    process.exit(1);
  }

  const fConfig = loadConfig(featureDir);
  const built = collectBuiltFiles(featureDir, fConfig.artifactsDir || '');

  console.log(`\n🗑  Aitri — Discard feature "${name}"`);
  console.log('─'.repeat(50));
  console.log(`  Location: ${path.relative(projectDir, featureDir)}/`);
  console.log(`  This deletes the feature sub-pipeline directory (spec, .aitri, FEATURE_IDEA.md,`);
  console.log(`  feature_context, and any feature-scoped BUGS/BACKLOG/checkpoints).`);

  if (built) {
    const all = [
      ...built.created.map(f  => ['created',  f]),
      ...built.modified.map(f => ['modified', f]),
      ...built.tests.map(f    => ['test',     f]),
    ];
    console.log(`\n  ⚠  This feature reached the build phase and reported ${all.length} shared file(s).`);
    console.log(`     These files are NOT removed by discard — review/revert via git if needed:`);
    for (const [kind, f] of all) console.log(`       (${kind}) ${f}`);
  }

  process.stdout.write(`\n  Permanently delete feature "${name}"? (y/N): `);
  const ans = readConfirm(10).trim().toLowerCase();
  if (ans !== 'y' && ans !== 'yes') {
    process.stderr.write(`\n❌ Discard cancelled. Nothing was deleted.\n`);
    process.exit(1);
  }

  fs.rmSync(featureDir, { recursive: true, force: true });

  // Record on the parent project that a feature was discarded (mirrors init).
  const parentConfig = loadConfig(projectDir);
  writeLastSession(parentConfig, projectDir, `feature discard ${name}`);
  saveConfig(projectDir, parentConfig);

  console.log(`\n✅ Feature "${name}" discarded.`);
  if (built) console.log(`   Remember: the shared files listed above are still in the codebase — revert via git if the feature is truly cancelled.`);
  console.log(`   Run: aitri feature list  to verify.`);
  console.log('─'.repeat(50));
}

function findAncestorProjectRoot(startDir) {
  let cur = path.resolve(startDir);
  const root = path.parse(cur).root;
  while (cur !== root) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    if (fs.existsSync(path.join(parent, '.aitri'))) return parent;
    cur = parent;
  }
  return null;
}
