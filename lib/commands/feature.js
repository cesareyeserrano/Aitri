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
import { loadConfig, saveConfig, writeLastSession } from '../state.js';
import { cmdRunPhase }  from './run-phase.js';
import { cmdComplete }  from './complete.js';
import { cmdApprove }   from './approve.js';
import { cmdReject }                          from './reject.js';
import { cmdStatus }                          from './status.js';
import { cmdVerifyRun, cmdVerifyComplete }    from './verify.js';
import { cmdRehash }                          from './rehash.js';

const USAGE = `Usage:
  aitri feature init <name>                        Create feature sub-pipeline
  aitri feature list                               List all features
  aitri feature status <name>                      Show feature pipeline state
  aitri feature run-phase <name> <1-5|ux|discovery> Generate feature phase briefing
  aitri feature complete <name> <phase>            Validate and mark phase complete
  aitri feature approve  <name> <phase>            Approve phase output
  aitri feature reject   <name> <phase> --feedback "text"
  aitri feature verify-run <name>                  Run tests in feature context
  aitri feature verify-complete <name>             Gate check before feature Phase 5
  aitri feature rehash <name> <phase>              Rehash phase artifact (legacy bookkeeping only)`;

export function cmdFeature({ dir, args, err, rootDir }) {
  const [sub, ...rest] = args;

  if (!sub || sub === 'help') err(USAGE);

  if (sub === 'list') return featureList(dir);

  const [name, ...subRest] = rest;
  if (!name) err(USAGE);

  const featureDir = path.join(dir, 'features', name);

  if (sub === 'init') return featureInit(featureDir, name, dir, rootDir, err);

  if (!fs.existsSync(featureDir)) {
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
    featureRoot: dir,  // signals run-phase to inject parent project context
  };

  switch (sub) {
    case 'run-phase': {
      // Materialize FEATURE_IDEA.md → IDEA.md so phase 1 can find its seed input.
      // Skip the materialization once Phase 1 has produced 01_REQUIREMENTS.json —
      // that artifact is the SSoT for re-runs (IDEA.md is irrelevant by design,
      // and was archived into original_brief at first approve 1).
      const featureConfig = loadConfig(featureDir);
      const featureArtDir = featureConfig.artifactsDir || '';
      const reqPath       = path.join(featureDir, featureArtDir, '01_REQUIREMENTS.json');
      const hasReqs       = fs.existsSync(reqPath);

      if (!hasReqs) {
        const featureIdeaPath = path.join(featureDir, 'FEATURE_IDEA.md');
        const ideaPath        = path.join(featureDir, 'IDEA.md');
        if (!fs.existsSync(featureIdeaPath)) {
          err(
            `FEATURE_IDEA.md not found in features/${name}/\n` +
            `  Describe what this feature adds or changes before running the pipeline.\n` +
            `  Create: ${featureIdeaPath}`
          );
        }
        fs.writeFileSync(ideaPath, fs.readFileSync(featureIdeaPath, 'utf8'));
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
  const featuresDir = path.join(dir, 'features');
  if (!fs.existsSync(featuresDir)) {
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
