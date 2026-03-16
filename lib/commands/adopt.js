/**
 * Module: Command — adopt
 * Purpose: Integrate existing projects into Aitri.
 *   scan      Conventional project (no Aitri): scan codebase → briefing for agent → ADOPTION_PLAN.md
 *   apply     Read ADOPTION_PLAN.md → confirm → init project + mark inferred phases
 *   --upgrade Aitri-aware project (old version): infer completedPhases from existing
 *             artifacts, update aitriVersion. Non-destructive — never removes state.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
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
const TEST_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /_test\.py$/, /test_.*\.py$/, /_test\.go$/, /test_.*\.rb$/];

// Source file extensions to scan for code quality signals
const SOURCE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rb', '.java', '.kt', '.rs', '.c', '.cpp', '.h',
  '.cs', '.php', '.swift', '.scala',
]);

// Common .gitignore patterns to verify by language/stack
const COMMON_GITIGNORE_PATTERNS = [
  { pattern: 'node_modules', label: 'node_modules/' },
  { pattern: '.env',         label: '.env files' },
  { pattern: 'dist',         label: 'dist/' },
  { pattern: 'build',        label: 'build/' },
  { pattern: 'coverage',     label: 'coverage/' },
  { pattern: '.DS_Store',    label: '.DS_Store' },
  { pattern: '*.log',        label: '*.log files' },
  { pattern: '.nyc_output',  label: '.nyc_output/' },
  { pattern: '__pycache__',  label: '__pycache__/' },
  { pattern: '.venv',        label: '.venv/' },
  { pattern: 'target',       label: 'target/ (Go/Rust/Java)' },
  { pattern: 'vendor',       label: 'vendor/' },
  { pattern: '.cache',       label: '.cache/' },
];

// Hard limits for file-walking scanners to prevent hangs on large repos
const MAX_FILES_PER_SCANNER = 300;
const MAX_FILE_READ_BYTES   = 50_000; // 50KB per file

// Secret/credential patterns to flag in source files (heuristic only)
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}/i,
  /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}/i,
  /(?:token|auth[_-]?token)\s*[:=]\s*['"][^'"]{8,}/i,
  /(?:aws[_-]?access[_-]?key|aws[_-]?secret)\s*[:=]\s*['"][^'"]{8,}/i,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

export function cmdAdopt({ dir, args, VERSION, rootDir, err }) {
  const sub = args[0];

  if (sub === 'scan')    return adoptScan({ dir, VERSION, rootDir, err });
  if (sub === '--upgrade') return adoptUpgrade({ dir, VERSION });
  if (sub === 'apply') {
    const fromIdx  = args.findIndex(a => a === '--from');
    const fromPhase = fromIdx !== -1 ? parseInt(args[fromIdx + 1], 10) : null;
    return adoptApply({ dir, VERSION, err, fromPhase });
  }

  err(
    'adopt: unknown subcommand.\n' +
    '  Usage:\n' +
    '    aitri adopt scan              Scan project → briefing for agent → ADOPTION_PLAN.md\n' +
    '    aitri adopt apply             Read ADOPTION_PLAN.md → confirm → initialize\n' +
    '    aitri adopt apply --from <N>  Initialize and enter pipeline at Phase N (1-5)\n' +
    '    aitri adopt --upgrade         Sync state from existing Aitri artifacts (non-destructive)'
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

// ── technical health scanners ─────────────────────────────────────────────────

/** Walk source files and count TODO/FIXME/HACK markers. Returns top offending files. */
function scanCodeQuality(dir) {
  const counts = {};
  const TODO_RE = /\b(TODO|FIXME|HACK|XXX|TEMP|DEPRECATED|NOCOMMIT)\b/gi;
  let fileCount = 0;

  function walk(d, depth) {
    if (depth > 4 || fileCount >= MAX_FILES_PER_SCANNER) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (fileCount >= MAX_FILES_PER_SCANNER) return;
      if (IGNORE_DIRS.has(e.name)) continue;
      if (e.isDirectory()) { walk(path.join(d, e.name), depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) continue;
      const fullPath = path.join(d, e.name);
      fileCount++;
      try {
        const buf = Buffer.alloc(MAX_FILE_READ_BYTES);
        const fd  = fs.openSync(fullPath, 'r');
        const n   = fs.readSync(fd, buf, 0, MAX_FILE_READ_BYTES, 0);
        fs.closeSync(fd);
        const content = buf.subarray(0, n).toString('utf8');
        const matches = content.match(TODO_RE);
        if (matches && matches.length) counts[path.relative(dir, fullPath)] = matches.length;
      } catch {}
    }
  }
  walk(dir, 0);

  const total   = Object.values(counts).reduce((a, b) => a + b, 0);
  const topFiles = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([f, n]) => `  ${f}: ${n}`);

  return total > 0
    ? `Total: ${total} markers across ${Object.keys(counts).length} files\nTop files:\n${topFiles.join('\n')}`
    : 'None found.';
}

/** Scan .gitignore and report missing common patterns. */
function scanGitignore(dir) {
  const ignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignorePath)) return 'MISSING — .gitignore does not exist.';

  const content = fs.readFileSync(ignorePath, 'utf8').toLowerCase();
  const missing = COMMON_GITIGNORE_PATTERNS
    .filter(({ pattern }) => !content.includes(pattern.toLowerCase()))
    .map(({ label }) => `  - ${label} not covered`);

  return missing.length
    ? `Present but incomplete. Missing patterns:\n${missing.join('\n')}`
    : 'Present and covers common patterns.';
}

/** Detect .env files and whether they are gitignored. */
function scanEnvFiles(dir) {
  const lines = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 'Could not read directory.'; }

  const envFiles = entries
    .filter(e => e.isFile() && /^\.env(\.|$)/.test(e.name) && e.name !== '.env.example')
    .map(e => e.name);

  if (!envFiles.length) {
    lines.push('No .env files found in project root.');
  } else {
    lines.push(`⚠️  Found: ${envFiles.join(', ')}`);
    const ignoreContent = readFileSafe(path.join(dir, '.gitignore'), 10000) || '';
    const gitignored = envFiles.every(f => ignoreContent.includes(f) || ignoreContent.includes('.env'));
    lines.push(gitignored ? '  → Covered by .gitignore.' : '  ❌ NOT in .gitignore — risk of credential exposure.');
  }

  const hasExample = fs.existsSync(path.join(dir, '.env.example'))
    || fs.existsSync(path.join(dir, '.env.sample'));
  lines.push(hasExample ? '.env.example present ✓' : '.env.example missing — required for onboarding.');

  return lines.join('\n');
}

/** Heuristic scan for hardcoded secrets in source files. Reports file paths only (no values). */
function scanSecretSignals(dir) {
  const findings = [];
  let fileCount = 0;

  function walk(d, depth) {
    if (depth > 4 || fileCount >= MAX_FILES_PER_SCANNER) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (fileCount >= MAX_FILES_PER_SCANNER) return;
      if (IGNORE_DIRS.has(e.name)) continue;
      if (e.isDirectory()) { walk(path.join(d, e.name), depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) continue;
      const fullPath = path.join(d, e.name);
      fileCount++;
      try {
        const buf = Buffer.alloc(MAX_FILE_READ_BYTES);
        const fd  = fs.openSync(fullPath, 'r');
        const n   = fs.readSync(fd, buf, 0, MAX_FILE_READ_BYTES, 0);
        fs.closeSync(fd);
        const content = buf.subarray(0, n).toString('utf8');
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            findings.push(`  ⚠️  ${path.relative(dir, fullPath)} — matches credential pattern`);
            break;
          }
        }
      } catch {}
    }
  }
  walk(dir, 0);

  return findings.length
    ? `${findings.length} file(s) with potential hardcoded credentials:\n${findings.join('\n')}\n  → Review manually before shipping.`
    : 'No hardcoded credential patterns detected.';
}

/** Check infrastructure readiness: Dockerfile, CI, lockfiles, etc. */
function scanInfrastructure(dir) {
  const check = (name) => fs.existsSync(path.join(dir, name));
  const lines = [];

  // Dockerfile
  lines.push(check('Dockerfile') ? 'Dockerfile: ✓' : 'Dockerfile: missing');
  lines.push(check('docker-compose.yml') || check('docker-compose.yaml')
    ? 'docker-compose: ✓' : 'docker-compose: missing');

  // CI
  const ciFiles = [];
  if (fs.existsSync(path.join(dir, '.github', 'workflows'))) {
    try {
      const wf = fs.readdirSync(path.join(dir, '.github', 'workflows'));
      ciFiles.push(...wf.map(f => `.github/workflows/${f}`));
    } catch {}
  }
  if (check('.gitlab-ci.yml'))   ciFiles.push('.gitlab-ci.yml');
  if (check('.circleci/config.yml')) ciFiles.push('.circleci/config.yml');
  if (check('Jenkinsfile'))      ciFiles.push('Jenkinsfile');
  lines.push(ciFiles.length
    ? `CI/CD: ✓ — ${ciFiles.join(', ')}`
    : 'CI/CD: missing — no workflow files found');

  // Lockfiles
  const lockfile = ['package-lock.json','yarn.lock','pnpm-lock.yaml','go.sum','Gemfile.lock','poetry.lock','Pipfile.lock','Cargo.lock']
    .find(f => check(f));
  lines.push(lockfile ? `Lockfile: ✓ — ${lockfile}` : 'Lockfile: missing');

  // Makefile
  lines.push(check('Makefile') ? 'Makefile: ✓' : 'Makefile: not present');

  return lines.join('\n');
}

/** Check test health: empty files, skip-heavy files, large source files. */
function scanTestHealth(dir, testFiles) {
  const empty   = [];
  const skipped = [];
  const SKIP_RE = /\b(it\.skip|test\.skip|describe\.skip|t\.Skip|t\.SkipNow|xit\(|xdescribe\(|skip\(|pytest\.mark\.skip)\b/;

  for (const relPath of testFiles) {
    const fullPath = path.join(dir, relPath);
    try {
      const buf = Buffer.alloc(MAX_FILE_READ_BYTES);
      const fd  = fs.openSync(fullPath, 'r');
      const n   = fs.readSync(fd, buf, 0, MAX_FILE_READ_BYTES, 0);
      fs.closeSync(fd);
      const content = buf.subarray(0, n).toString('utf8');
      if (content.trim().length < 80) empty.push(relPath);
      else if (SKIP_RE.test(content)) skipped.push(relPath);
    } catch {}
  }

  // Large source files (> 500 lines) — potential god objects
  const large = [];
  let fileCount2 = 0;
  function walkLarge(d, depth) {
    if (depth > 4 || fileCount2 >= MAX_FILES_PER_SCANNER) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (fileCount2 >= MAX_FILES_PER_SCANNER) return;
      if (IGNORE_DIRS.has(e.name)) continue;
      if (e.isDirectory()) { walkLarge(path.join(d, e.name), depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) continue;
      const fullPath = path.join(d, e.name);
      fileCount2++;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 15_000) { // ~500 lines threshold by size
          const content = fs.readFileSync(fullPath, 'utf8');
          const lineCount = content.split('\n').length;
          if (lineCount > 500) large.push(`  ${path.relative(dir, fullPath)}: ${lineCount} lines`);
        }
      } catch {}
    }
  }
  walkLarge(dir, 0);

  const out = [];
  out.push(empty.length   ? `Empty test files (${empty.length}):\n${empty.map(f => '  ' + f).join('\n')}` : 'No empty test files.');
  out.push(skipped.length ? `Tests with skip markers (${skipped.length}):\n${skipped.map(f => '  ' + f).join('\n')}` : 'No skip-heavy test files.');
  out.push(large.length   ? `Large source files >500 lines (${large.length}):\n${large.join('\n')}` : 'No source files >500 lines.');
  return out.join('\n\n');
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

  // Technical health scan
  const codeQuality   = scanCodeQuality(dir);
  const gitignore     = scanGitignore(dir);
  const envFiles      = scanEnvFiles(dir);
  const secretSignals = scanSecretSignals(dir);
  const infra         = scanInfrastructure(dir);
  const testHealth    = scanTestHealth(dir, testFiles);

  const briefing = render('adopt/scan', {
    ROLE, CONSTRAINTS, REASONING,
    PROJECT_DIR:    dir,
    FILE_TREE:      fileTree,
    PKG_JSON:       pkgJson || '',
    README:         readme  || '',
    TEST_SUMMARY:   testSummary || '',
    CODE_QUALITY:   codeQuality,
    GITIGNORE:      gitignore,
    ENV_FILES:      envFiles,
    SECRET_SIGNALS: secretSignals,
    INFRA:          infra,
    TEST_HEALTH:    testHealth,
  });

  process.stdout.write(briefing + '\n');

  const bar = '─'.repeat(60);
  process.stderr.write(
    `\n${bar}\n` +
    ` aitri adopt scan printed the briefing above.\n` +
    ` Your agent will create: ADOPTION_SCAN.md and IDEA.md\n\n` +
    ` What happens next:\n` +
    `   1. Agent reads the briefing and scans the project\n` +
    `   2. Agent creates ADOPTION_SCAN.md (diagnostic) and IDEA.md (stabilization plan)\n` +
    `   3. Review ADOPTION_SCAN.md\n` +
    `   4. When ready: aitri adopt apply\n` +
    `${bar}\n`
  );
}

// ── apply ─────────────────────────────────────────────────────────────────────

function adoptApply({ dir, VERSION, err, fromPhase }) {
  if (fromPhase !== null && fromPhase !== undefined) {
    return adoptApplyFrom({ dir, fromPhase, VERSION, err });
  }

  const ideaPath = path.join(dir, 'IDEA.md');
  const ideaExists = fs.existsSync(ideaPath);

  if (!ideaExists) {
    process.stderr.write(
      `[aitri] Warning: IDEA.md not found.\n` +
      `  Run 'aitri adopt scan' first so the agent generates IDEA.md and ADOPTION_SCAN.md.\n` +
      `  Proceeding with a placeholder — fill in IDEA.md before running Phase 1.\n\n`
    );
  }

  console.log('\n🔄 Aitri Adopt — Apply');
  console.log('─'.repeat(50));
  console.log(`  Project dir: ${dir}`);

  if (process.stdin.isTTY) {
    console.log('\n  This will:');
    console.log('    1. Initialize Aitri (creates .aitri, spec/)');
    if (!ideaExists) console.log('    2. Create placeholder IDEA.md (fill before Phase 1)');
    console.log('\n  Proceed? (y/N) ');

    const buf = Buffer.alloc(1);
    let answer = '';
    try { fs.readSync(0, buf, 0, 1, null); answer = buf.toString().trim().toLowerCase(); } catch {}
    if (answer !== 'y') { console.log('  Aborted.'); process.exit(0); }
  }

  const config = loadConfig(dir);
  config.projectName     = config.projectName  || path.basename(dir);
  config.createdAt       = config.createdAt    || new Date().toISOString();
  config.aitriVersion    = VERSION;
  config.currentPhase    = config.currentPhase || 0;
  config.approvedPhases  = config.approvedPhases  || [];
  config.completedPhases = config.completedPhases || [];

  if (config.artifactsDir === undefined) {
    config.artifactsDir = 'spec';
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  }

  if (!ideaExists) {
    fs.writeFileSync(
      ideaPath,
      `# ${path.basename(dir)} — Adoption Stabilization\n\n` +
      `Fill in this file before running Phase 1.\n` +
      `Run: aitri adopt scan  to generate a proper stabilization plan.\n`,
      'utf8'
    );
    console.log('\n  📝 Placeholder IDEA.md created — fill in before Phase 1');
  } else {
    console.log('\n  📝 IDEA.md found (from scan) — will be used for Phase 1');
  }

  saveConfig(dir, config);

  console.log('\n  ✅ Aitri initialized');
  console.log('\n  Next: aitri run-phase 1  to define stabilization requirements');
  console.log('─'.repeat(50));
}

// ── apply --from <N> ──────────────────────────────────────────────────────────

function adoptApplyFrom({ dir, fromPhase, VERSION, err }) {
  if (isNaN(fromPhase) || fromPhase < 1 || fromPhase > 5)
    err(
      `--from requires a phase number between 1 and 5.\n` +
      `  aitri adopt apply --from 1   no prior work — greenfield start\n` +
      `  aitri adopt apply --from 4   phases 1-3 exist, enter at implementation`
    );

  // Get project summary for IDEA.md: IDEA.md already exists (from scan) > README > placeholder
  const ideaSummary = readFileSafe(path.join(dir, 'README.md'), 2000)
    || readFileSafe(path.join(dir, 'readme.md'), 2000)
    || `${path.basename(dir)} — adopted via aitri adopt apply --from ${fromPhase}`;

  const phasesToMark = [];
  for (let i = 1; i < fromPhase; i++) phasesToMark.push(i);

  console.log('\n🔄 Aitri Adopt — Apply (--from mode)');
  console.log('─'.repeat(50));
  console.log(`  Project dir:  ${dir}`);
  console.log(`  Entering at:  Phase ${fromPhase}`);
  console.log(`  Mark as done: ${phasesToMark.length ? phasesToMark.join(', ') : 'none'}`);

  if (process.stdin.isTTY) {
    console.log('\n  ⚠️  This will:');
    console.log('     1. Initialize Aitri (creates .aitri, spec/)');
    if (!fs.existsSync(path.join(dir, 'IDEA.md')))
      console.log('     2. Create IDEA.md from README.md or ADOPTION_PLAN.md');
    if (phasesToMark.length)
      console.log(`     3. Mark phases [${phasesToMark.join(', ')}] as completed`);
    console.log('\n  Proceed? (y/N) ');

    const buf = Buffer.alloc(1);
    let answer = '';
    try { fs.readSync(0, buf, 0, 1, null); answer = buf.toString().trim().toLowerCase(); } catch {}
    if (answer !== 'y') { console.log('  Aborted.'); process.exit(0); }
  }

  const config = loadConfig(dir);
  config.projectName     = config.projectName  || path.basename(dir);
  config.createdAt       = config.createdAt    || new Date().toISOString();
  config.aitriVersion    = VERSION;
  config.currentPhase    = config.currentPhase || 0;
  config.approvedPhases  = config.approvedPhases  || [];
  config.completedPhases = config.completedPhases || [];

  if (config.artifactsDir === undefined) {
    config.artifactsDir = 'spec';
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  }

  const ideaPath = path.join(dir, 'IDEA.md');
  if (!fs.existsSync(ideaPath)) {
    fs.writeFileSync(ideaPath, `# Project Idea\n\n${ideaSummary}\n`, 'utf8');
    console.log('\n  📝 IDEA.md created from README');
  } else {
    console.log('\n  📝 IDEA.md already exists — not overwritten');
  }

  const completed = new Set(config.completedPhases);
  const approved  = new Set(config.approvedPhases);
  const newlyMarked = [];
  for (const phase of phasesToMark) {
    if (!completed.has(phase) && !approved.has(phase)) {
      completed.add(phase);
      newlyMarked.push(phase);
    }
  }

  config.completedPhases = [...completed];

  // Auto-infer from any existing Aitri artifacts in spec/
  const autoInferred = inferFromArtifacts(dir, config);
  if (autoInferred.length) config.completedPhases = [...new Set([...config.completedPhases, ...autoInferred])];

  saveConfig(dir, config);

  console.log('\n  ✅ Aitri initialized');
  if (newlyMarked.length) console.log(`  ✅ Marked as completed (--from ${fromPhase}): phases ${newlyMarked.join(', ')}`);
  if (autoInferred.length) console.log(`  ✅ Inferred from existing artifacts: phases ${autoInferred.join(', ')}`);
  console.log(`\n  Run: aitri status`);
  console.log(`  Run: aitri run-phase ${fromPhase}  to start Phase ${fromPhase}`);
  console.log('─'.repeat(50));
}

// ── shared: infer completed phases from existing artifacts ────────────────────

function inferFromArtifacts(dir, config) {
  const completed = new Set(config.completedPhases || []);
  const approved  = new Set(config.approvedPhases  || []);
  const inferred  = [];
  for (const key of [...OPTIONAL_PHASES, ...CORE_PHASES]) {
    const p = PHASE_DEFS[key];
    if (!fs.existsSync(artifactPath(dir, config, p.artifact))) continue;
    const numKey = p.num;
    if (!completed.has(numKey) && !approved.has(numKey)) {
      completed.add(numKey);
      inferred.push(numKey);
    }
  }
  return inferred;
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

  // Optional: register in Hub if installed and not already registered — same pattern as init.js
  const isTempDir = /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(dir);
  if (!isTempDir) {
    try {
      const hubProjectsPath = path.join(os.homedir(), '.aitri-hub', 'projects.json');
      if (fs.existsSync(hubProjectsPath)) {
        const hubData = JSON.parse(fs.readFileSync(hubProjectsPath, 'utf8'));
        const projects = Array.isArray(hubData.projects) ? hubData.projects : [];
        if (!projects.some(p => p.location === dir)) {
          const id = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 8);
          projects.push({ id, name: (config.projectName || path.basename(dir)).slice(0, 40), location: dir, type: 'local', addedAt: new Date().toISOString() });
          hubData.projects = projects;
          fs.writeFileSync(hubProjectsPath, JSON.stringify(hubData, null, 2));
          console.log(`  Registered in Aitri Hub`);
        }
      }
    } catch { /* Hub not installed or inaccessible — skip silently */ }
  }
}

// ── named exports for unit testing ───────────────────────────────────────────
export { scanCodeQuality, scanSecretSignals, scanInfrastructure, scanTestHealth };
