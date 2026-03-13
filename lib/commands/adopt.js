/**
 * Module: Command — adopt
 * Purpose: Integrate existing projects into Aitri.
 *   scan      Conventional project (no Aitri): scan codebase → briefing for agent → ADOPTION_PLAN.md
 *   apply     Read ADOPTION_PLAN.md → confirm → init project + mark inferred phases
 *   --upgrade Aitri-aware project (old version): infer completedPhases from existing
 *             artifacts, update aitriVersion. Non-destructive — never removes state.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig, artifactPath } from '../state.js';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { render } from '../prompts/render.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/adopter.js';

const CORE_PHASES = [1, 2, 3, 4, 5];

// Directories to ignore when building the file tree
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output',
  '__pycache__', '.venv', 'venv', 'target', 'vendor', '.next', '.nuxt',
]);

// Files/extensions to focus on when describing test files
const TEST_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /_test\.py$/, /test_.*\.py$/];

export function cmdAdopt({ dir, args, VERSION, rootDir, err }) {
  const sub = args[0];

  if (sub === 'scan')    return adoptScan({ dir, VERSION, rootDir, err });
  if (sub === 'apply')   return adoptApply({ dir, VERSION, rootDir, err });
  if (sub === '--upgrade') return adoptUpgrade({ dir, VERSION });

  err(
    'adopt: unknown subcommand.\n' +
    '  Usage:\n' +
    '    aitri adopt scan         Scan project → briefing for agent → ADOPTION_PLAN.md\n' +
    '    aitri adopt apply        Read ADOPTION_PLAN.md → confirm → initialize\n' +
    '    aitri adopt --upgrade    Sync state from existing Aitri artifacts (non-destructive)'
  );
}

// ── scan ──────────────────────────────────────────────────────────────────────

function buildFileTree(dir, depth = 0, maxDepth = 2) {
  const lines = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return lines; }

  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const prefix = '  '.repeat(depth) + (e.isDirectory() ? '📁 ' : '📄 ');
    lines.push(prefix + e.name);
    if (e.isDirectory() && depth < maxDepth) {
      lines.push(...buildFileTree(path.join(dir, e.name), depth + 1, maxDepth));
    }
  }
  return lines;
}

function readFileSafe(p, maxChars = 3000) {
  try {
    const content = fs.readFileSync(p, 'utf8');
    return content.length > maxChars ? content.slice(0, maxChars) + '\n... (truncated)' : content;
  } catch { return null; }
}

function scanTestFiles(dir) {
  const found = [];
  function walk(d, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      if (e.isDirectory()) { walk(path.join(d, e.name), depth + 1); continue; }
      if (TEST_PATTERNS.some(p => p.test(e.name))) found.push(path.relative(dir, path.join(d, e.name)));
    }
  }
  walk(dir, 0);
  return found;
}

function adoptScan({ dir, VERSION, err }) {
  const fileTree    = buildFileTree(dir).join('\n') || '(empty directory)';
  const pkgPath     = path.join(dir, 'package.json');
  const pkgJson     = readFileSafe(pkgPath, 2000);
  const readme      = readFileSafe(path.join(dir, 'README.md'), 2000)
                   || readFileSafe(path.join(dir, 'README.txt'), 2000)
                   || readFileSafe(path.join(dir, 'readme.md'), 2000);

  const testFiles   = scanTestFiles(dir);
  const testSummary = testFiles.length
    ? `${testFiles.length} test file(s) found:\n${testFiles.slice(0, 20).map(f => '  ' + f).join('\n')}${testFiles.length > 20 ? `\n  ... and ${testFiles.length - 20} more` : ''}`
    : null;

  const briefing = render('adopt/scan', {
    ROLE, CONSTRAINTS, REASONING,
    PROJECT_DIR: dir,
    FILE_TREE:   fileTree,
    PKG_JSON:    pkgJson || '',
    README:      readme  || '',
    TEST_SUMMARY: testSummary || '',
  });

  process.stdout.write(briefing + '\n');
}

// ── apply ─────────────────────────────────────────────────────────────────────

function parsePlan(content) {
  const section = (heading) => {
    const re = new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
    const m  = content.match(re);
    return m ? m[1].trim() : null;
  };

  const summary  = section('Project Summary');
  const decision = (section('Adoption Decision') || '').split('\n')[0].trim().toLowerCase();
  const isReady  = decision.startsWith('ready');
  const isBlocked = decision.startsWith('blocked');

  let completedPhases = [];
  const phasesRaw = section('Completed Phases');
  if (phasesRaw) {
    const jsonMatch = phasesRaw.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try { completedPhases = JSON.parse(jsonMatch[0]); } catch {}
    }
  }

  return { summary, decision, isReady, isBlocked, completedPhases };
}

function adoptApply({ dir, VERSION, rootDir, err }) {
  const planPath = path.join(dir, 'ADOPTION_PLAN.md');
  if (!fs.existsSync(planPath))
    err('ADOPTION_PLAN.md not found.\n  Run: aitri adopt scan  first, then have your agent produce ADOPTION_PLAN.md');

  const planContent = fs.readFileSync(planPath, 'utf8');
  const { summary, decision, isReady, isBlocked, completedPhases } = parsePlan(planContent);

  if (!summary)
    err('ADOPTION_PLAN.md is missing ## Project Summary section — cannot proceed');

  console.log('\n🔄 Aitri Adopt — Apply');
  console.log('─'.repeat(50));
  console.log(`  Project dir:   ${dir}`);
  console.log(`  Decision:      ${decision || '(missing)'}`);
  console.log(`  Phases to mark: ${completedPhases.length ? completedPhases.join(', ') : 'none'}`);
  console.log(`\n  Project Summary preview:`);
  const previewLines = summary.split('\n').slice(0, 4);
  for (const l of previewLines) console.log(`    ${l}`);
  if (summary.split('\n').length > 4) console.log('    ...');
  console.log('─'.repeat(50));

  if (isBlocked)
    err(`Adoption Decision is "blocked" — review ADOPTION_PLAN.md and resolve gaps before applying`);

  // isTTY gate — same pattern as approve
  if (process.stdin.isTTY) {
    console.log('\n  ⚠️  This will:');
    console.log('     1. Initialize Aitri in this directory (creates .aitri, spec/)');
    console.log('     2. Create IDEA.md from the Project Summary in ADOPTION_PLAN.md');
    console.log(`     3. Mark phases [${completedPhases.join(', ')}] as completed (not approved)`);
    console.log('\n  Proceed? (y/N) ');

    const buf = Buffer.alloc(1);
    let answer = '';
    try {
      fs.readSync(0, buf, 0, 1, null);
      answer = buf.toString().trim().toLowerCase();
    } catch {}

    if (answer !== 'y') {
      console.log('  Aborted.');
      process.exit(0);
    }
  }

  // 1. Init project (creates .aitri + spec/ + IDEA.md template)
  const config = loadConfig(dir);
  config.projectName  = config.projectName || path.basename(dir);
  config.createdAt    = config.createdAt   || new Date().toISOString();
  config.aitriVersion = VERSION;
  config.currentPhase = config.currentPhase || 0;
  config.approvedPhases  = config.approvedPhases  || [];
  config.completedPhases = config.completedPhases || [];

  if (config.artifactsDir === undefined) {
    config.artifactsDir = 'spec';
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  }

  // 2. Write IDEA.md from plan's Project Summary
  const ideaPath = path.join(dir, 'IDEA.md');
  if (!fs.existsSync(ideaPath)) {
    fs.writeFileSync(ideaPath, `# Project Idea\n\n${summary}\n`, 'utf8');
    console.log(`\n  📝 IDEA.md created from Project Summary`);
  } else {
    console.log(`\n  📝 IDEA.md already exists — not overwritten`);
  }

  // 3. Mark completedPhases (non-destructive)
  const existingCompleted = new Set(config.completedPhases);
  const existingApproved  = new Set(config.approvedPhases);
  const newlyMarked = [];

  for (const phaseKey of completedPhases) {
    const numKey = isNaN(phaseKey) ? phaseKey : Number(phaseKey);
    if (!existingCompleted.has(numKey) && !existingApproved.has(numKey)) {
      existingCompleted.add(numKey);
      newlyMarked.push(numKey);
    }
  }
  config.completedPhases = [...existingCompleted];

  saveConfig(dir, config);

  console.log(`\n  ✅ Aitri initialized`);
  if (newlyMarked.length) {
    console.log(`  ✅ Phases marked as completed: ${newlyMarked.join(', ')}`);
    console.log(`     Run: aitri approve <phase>  to approve after reviewing each artifact`);
  }
  console.log(`\n  Run: aitri status  to see pipeline state`);
  console.log('─'.repeat(50));
}

// ── upgrade ───────────────────────────────────────────────────────────────────

function adoptUpgrade({ dir, VERSION }) {
  const config    = loadConfig(dir);
  const prevVer   = config.aitriVersion || '(unknown)';
  const completed = new Set(config.completedPhases || []);
  const approved  = new Set(config.approvedPhases  || []);

  const inferred = [];
  const skipped  = [];

  for (const key of [...OPTIONAL_PHASES, ...CORE_PHASES]) {
    const p      = PHASE_DEFS[key];
    const exists = fs.existsSync(artifactPath(dir, config, p.artifact));
    if (!exists) continue;

    if (completed.has(p.num) || approved.has(p.num)) {
      skipped.push({ key, reason: approved.has(p.num) ? 'already approved' : 'already completed' });
    } else {
      completed.add(p.num);
      inferred.push(key);
    }
  }

  config.completedPhases = [...completed];
  config.aitriVersion    = VERSION;
  saveConfig(dir, config);

  console.log(`\n🔄 Aitri Adopt — Upgrade`);
  console.log('─'.repeat(50));
  console.log(`  Project:  ${config.projectName || path.basename(dir)}`);
  console.log(`  Version:  ${prevVer}  →  ${VERSION}`);

  if (inferred.length) {
    console.log(`\n  Phases inferred from artifacts:`);
    for (const key of inferred) {
      const p = PHASE_DEFS[key];
      console.log(`    ✅ ${String(p.num).padEnd(12)} ${p.artifact}`);
    }
    console.log(`\n  These phases are now marked as completed (not approved).`);
    console.log(`  Run: aitri approve <phase>  to approve after reviewing the artifact.`);
  }

  if (skipped.length) {
    console.log(`\n  Already tracked (unchanged):`);
    for (const { key, reason } of skipped) {
      const p = PHASE_DEFS[key];
      console.log(`    ─  ${String(p.num).padEnd(12)} ${reason}`);
    }
  }

  if (!inferred.length && !skipped.length) {
    console.log(`\n  No artifacts found — nothing to infer.`);
    console.log(`  aitriVersion updated to v${VERSION}.`);
  }

  console.log(`\n  Run: aitri status  to see current state`);
  console.log('─'.repeat(50));
}
