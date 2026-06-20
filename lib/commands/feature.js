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
import { loadConfig, saveConfig, writeLastSession, featuresDir as resolveFeaturesDir } from '../state.js';
import { cmdRunPhase }  from './run-phase.js';
import { cmdComplete }  from './complete.js';
import { cmdApprove }   from './approve.js';
import { cmdReject }                          from './reject.js';
import { cmdStatus }                          from './status.js';
import { cmdVerifyRun, cmdVerifyComplete }    from './verify.js';
import { cmdRehash }                          from './rehash.js';
import { cmdTC }                              from './tc.js';
import { cmdBug }                             from './bug.js';
import { cmdBacklog }                         from './backlog.js';

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
  aitri feature rehash <name> <phase>              Rehash phase artifact (legacy bookkeeping only)`;

export function cmdFeature({ dir, args, err, rootDir }) {
  const [sub, ...rest] = args;

  if (!sub || sub === 'help') err(USAGE);

  if (sub === 'list') return featureList(dir);

  const [name, ...subRest] = rest;
  if (!name) err(USAGE);

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
      '# feature_context/ — supporting assets for this feature\n\nDrop reference material specific to THIS feature here: mockups, PDFs, screenshots, reference docs.\nAitri lists these files in every phase briefing of this feature so your agent can reference them.\n\nNotes:\n- This is the feature\'s own context. The root project has its own `idea_context/`.\n- Keep it curated: remove material that becomes obsolete as the feature evolves.\n'
    );
  }

  // Feature state: independent .aitri scoped to this feature
  saveConfig(featureDir, {
    projectName:    name,
    createdAt:      new Date().toISOString(),
    currentPhase:   0,
    approvedPhases: [],
    artifactsDir:   'spec',
  });

  // Create FEATURE_IDEA.md from template
  const tplPath  = path.join(rootDir, 'templates', 'FEATURE_IDEA.md');
  const ideaPath = path.join(featureDir, 'FEATURE_IDEA.md');
  fs.writeFileSync(ideaPath, fs.readFileSync(tplPath, 'utf8'));

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
