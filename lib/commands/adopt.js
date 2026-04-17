/**
 * Module: Command — adopt
 * Purpose: Integrate existing projects into Aitri.
 *   scan      Conventional project (no Aitri): scan codebase → briefing for agent → ADOPTION_SCAN.md + IDEA.md
 *   apply     Read IDEA.md → confirm → init project + mark inferred phases
 *   --upgrade Aitri-aware project (old version): infer completedPhases from existing
 *             artifacts, update aitriVersion. Non-destructive — never removes state.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig, artifactPath, readArtifact, hashArtifact, clearDriftPhase, appendEvent } from '../state.js';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { render } from '../prompts/render.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/adopter.js';
import { readStdinSync } from '../read-stdin.js';
import { writeAgentFiles } from '../agent-files.js';

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
const MAX_TREE_LINES        = 150;    // cap file tree to avoid overwhelming agent context

// Asset/binary extensions excluded from the file tree (not useful for code analysis)
const ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.webm', '.ogg', '.wav',
  '.map', '.lock',
]);

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
  if (sub === '--upgrade') return adoptUpgrade({ dir, VERSION, rootDir });
  if (sub === 'apply') {
    const fromIdx  = args.findIndex(a => a === '--from');
    const fromPhase = fromIdx !== -1 ? parseInt(args[fromIdx + 1], 10) : null;
    return adoptApply({ dir, VERSION, err, fromPhase, rootDir });
  }
  if (sub === 'verify-spec') {
    const isComplete = args.includes('--complete');
    return isComplete
      ? adoptVerifySpecComplete({ dir, err })
      : adoptVerifySpec({ dir, err });
  }

  err(
    'adopt: unknown subcommand.\n' +
    '  Usage:\n' +
    '    aitri adopt scan              Scan project → briefing for agent → ADOPTION_SCAN.md + IDEA.md\n' +
    '    aitri adopt apply             Read IDEA.md → confirm → initialize\n' +
    '    aitri adopt apply --from <N>  Initialize and enter pipeline at Phase N (1-5)\n' +
    '    aitri adopt verify-spec       Generate stub briefing for uncovered AC items\n' +
    '    aitri adopt verify-spec --complete  Register stubs in pipeline after agent writes them\n' +
    '    aitri adopt --upgrade         Sync state from existing Aitri artifacts (non-destructive)'
  );
}

// ── scan ──────────────────────────────────────────────────────────────────────

function buildFileTree(dir, depth = 0, maxDepth = 2, _state = { count: 0 }) {
  const lines = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return lines; }

  for (const e of entries) {
    if (_state.count >= MAX_TREE_LINES) {
      if (_state.count === MAX_TREE_LINES) {
        lines.push('  ... (tree truncated — too many files)');
        _state.count++;
      }
      return lines;
    }
    if (IGNORE_DIRS.has(e.name)) continue;
    if (!e.isDirectory() && ASSET_EXTS.has(path.extname(e.name).toLowerCase())) continue;
    const prefix = '  '.repeat(depth) + (e.isDirectory() ? '📁 ' : '📄 ');
    lines.push(prefix + e.name);
    _state.count++;
    if (e.isDirectory() && depth < maxDepth) {
      lines.push(...buildFileTree(path.join(dir, e.name), depth + 1, maxDepth, _state));
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
  // Inform agent if project is already Aitri-initialized
  const aitriConfigPath = path.join(dir, '.aitri', 'config.json');
  if (fs.existsSync(aitriConfigPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(aitriConfigPath, 'utf8'));
      const approved = (existing.approvedPhases || []).length;
      process.stderr.write(
        `[aitri] Note: project already has .aitri (Aitri v${existing.aitriVersion || 'unknown'}, ` +
        `${approved} phase(s) approved).\n` +
        `  Scanning anyway — ADOPTION_SCAN.md and IDEA.md will reflect current project state.\n\n`
      );
    } catch { /* malformed config — scan anyway */ }
  }

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

function adoptApply({ dir, VERSION, err, fromPhase, rootDir }) {
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

  // Detect existing .aitri
  const aitriConfigPath = path.join(dir, '.aitri', 'config.json');
  const isExisting = fs.existsSync(aitriConfigPath);
  if (isExisting) {
    try {
      const existing = JSON.parse(fs.readFileSync(aitriConfigPath, 'utf8'));
      process.stderr.write(
        `[aitri] Note: project already has .aitri (Aitri v${existing.aitriVersion || 'unknown'}).\n` +
        `  Existing state preserved. aitriVersion will be updated to ${VERSION}.\n\n`
      );
    } catch { /* malformed config — proceed */ }
  }

  console.log('\n🔄 Aitri Adopt — Apply');
  console.log('─'.repeat(50));
  console.log(`  Project dir: ${dir}`);

  if (process.stdin.isTTY) {
    console.log('\n  This will:');
    console.log('    1. Initialize Aitri (creates .aitri, spec/)');
    if (!ideaExists) console.log('    2. Create placeholder IDEA.md (fill before Phase 1)');
    console.log('\n  Proceed? (y/N) ');

    let answer = '';
    try { answer = readStdinSync(10).trim().toLowerCase(); } catch {}
    if (answer !== 'y' && answer !== 'yes') { console.log('  Aborted.'); process.exit(0); }
  }

  const config = loadConfig(dir);
  config.projectName     = config.projectName  || path.basename(dir);
  config.createdAt       = config.createdAt    || new Date().toISOString();
  config.aitriVersion    = VERSION;
  config.currentPhase    = config.currentPhase || 0;
  config.approvedPhases  = config.approvedPhases  || [];
  config.completedPhases = config.completedPhases || [];

  if (config.artifactsDir === undefined) {
    // Guard: if known Aitri artifacts already exist at the project root, this is a
    // legacy Aitri project — setting artifactsDir='spec' would break all lookups.
    const knownArtifacts = [...OPTIONAL_PHASES, ...CORE_PHASES]
      .map(k => PHASE_DEFS[k]?.artifact)
      .filter(Boolean);
    const artifactsAtRoot = knownArtifacts.some(a => fs.existsSync(path.join(dir, a)));
    if (artifactsAtRoot) {
      err(
        'Aitri artifacts found at project root — this looks like an existing Aitri project.\n' +
        '  adopt apply is for projects without prior Aitri artifacts.\n\n' +
        '  To sync state from existing artifacts, run:\n' +
        '    aitri adopt --upgrade'
      );
    }
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
    console.log('\n  📝 IDEA.md found — will be used for Phase 1');
  }

  saveConfig(dir, config);

  writeAgentFiles(dir, rootDir);

  console.log('\n  ✅ Aitri initialized');

  const hasExistingState = (config.approvedPhases || []).length > 0 || (config.completedPhases || []).length > 0;
  if (hasExistingState) {
    console.log('\n  Next: aitri status  to see current pipeline state');
  } else {
    console.log('\n  Next: aitri run-phase 1  to define stabilization requirements');
  }
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
      console.log('     2. Create IDEA.md from README.md or ADOPTION_SCAN.md');
    if (phasesToMark.length)
      console.log(`     3. Mark phases [${phasesToMark.join(', ')}] as completed`);
    console.log('\n  Proceed? (y/N) ');

    let answer = '';
    try { answer = readStdinSync(10).trim().toLowerCase(); } catch {}
    if (answer !== 'y' && answer !== 'yes') { console.log('  Aborted.'); process.exit(0); }
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

function adoptUpgrade({ dir, VERSION, rootDir }) {
  const config    = loadConfig(dir);
  const prevVer   = config.aitriVersion || '(unknown)';
  const completed = new Set(config.completedPhases || []);
  const approved  = new Set(config.approvedPhases  || []);

  // Recovery: if config has a non-root artifactsDir but no artifacts are found there,
  // check if artifacts exist at the project root (e.g. after a misapplied 'adopt apply').
  if (config.artifactsDir) {
    const hasAnyInDir = [...OPTIONAL_PHASES, ...CORE_PHASES].some(key =>
      fs.existsSync(artifactPath(dir, config, PHASE_DEFS[key].artifact))
    );
    if (!hasAnyInDir) {
      const hasAnyAtRoot = [...OPTIONAL_PHASES, ...CORE_PHASES].some(key =>
        fs.existsSync(path.join(dir, PHASE_DEFS[key].artifact))
      );
      if (hasAnyAtRoot) {
        process.stderr.write(
          `[aitri] Warning: config has artifactsDir='${config.artifactsDir}' but no artifacts found there.\n` +
          `  Artifacts detected at project root — correcting artifactsDir to '' (root).\n\n`
        );
        config.artifactsDir = '';
      }
    }
  }

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

  if (rootDir) writeAgentFiles(dir, rootDir);

}

// ── verify-spec ───────────────────────────────────────────────────────────────

function detectTestFramework(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.vitest)  return 'Vitest (vitest run --reporter verbose)';
      if (deps.jest)    return 'Jest (jest --verbose)';
      if (deps.mocha)   return 'Mocha';
      return 'Node.js test runner (node --test)';
    } catch { /* fall through */ }
  }
  if (fs.existsSync(path.join(dir, 'go.mod')))         return 'Go test (go test ./... -v)';
  if (fs.existsSync(path.join(dir, 'pyproject.toml'))
   || fs.existsSync(path.join(dir, 'setup.py')))        return 'pytest (pytest -v)';
  if (fs.existsSync(path.join(dir, 'Gemfile')))         return 'RSpec';
  if (fs.existsSync(path.join(dir, 'Cargo.toml')))      return 'Rust test (cargo test)';
  return 'unknown — inspect the project and use its existing test framework';
}

function adoptVerifySpec({ dir, err }) {
  const config       = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';

  const reqRaw = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
  if (!reqRaw) err('01_REQUIREMENTS.json not found — complete Phase 1 first.');

  let reqs;
  try { reqs = JSON.parse(reqRaw); }
  catch { err('01_REQUIREMENTS.json is malformed JSON'); }

  const tcsRaw = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
  let coveredFRIds = new Set();
  if (tcsRaw) {
    try {
      const tcs = JSON.parse(tcsRaw);
      for (const tc of (tcs.test_cases || [])) {
        if (tc.requirement_id && tc.status !== 'skip') coveredFRIds.add(tc.requirement_id);
      }
    } catch { /* non-fatal */ }
  }

  const mustFRs = (reqs.functional_requirements || []).filter(fr => fr.priority === 'MUST');
  const uncovered = mustFRs.filter(fr => !coveredFRIds.has(fr.id));

  if (uncovered.length === 0) {
    console.log('✅ All MUST FRs have active test cases — no stubs needed.');
    console.log('   If you have new AC items not covered by existing TCs, add them manually in Phase 3.');
    return;
  }

  const uncoveredFRsText = uncovered.map(fr => {
    const acs = (fr.acceptance_criteria || [])
      .map((ac, i) => `  AC-${i + 1}: ${ac}`)
      .join('\n');
    return `### ${fr.id} — ${fr.title}\n${acs}`;
  }).join('\n\n');

  const artifactsPath = artifactsDir ? path.join(dir, artifactsDir) : dir;

  const briefing = render('adopt/verify-spec', {
    ROLE, CONSTRAINTS, REASONING,
    TEST_FRAMEWORK:  detectTestFramework(dir),
    UNCOVERED_FRS:   uncoveredFRsText,
    ARTIFACTS_PATH:  artifactsPath,
  });

  process.stdout.write(briefing + '\n');

  process.stderr.write(
    `\n${'─'.repeat(60)}\n` +
    ` aitri adopt verify-spec: ${uncovered.length} FR(s) with uncovered ACs.\n` +
    ` Agent will write stubs and update 03_TEST_CASES.json.\n` +
    ` After agent completes: aitri adopt verify-spec --complete\n` +
    `${'─'.repeat(60)}\n`
  );
}

function adoptVerifySpecComplete({ dir, err }) {
  const config       = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';

  const tcsRaw = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
  if (!tcsRaw) err('03_TEST_CASES.json not found — agent must update it with stub entries first.');

  let tcs;
  try { tcs = JSON.parse(tcsRaw); }
  catch { err('03_TEST_CASES.json is malformed JSON'); }

  const stubs = (tcs.test_cases || []).filter(tc => tc.stub === true);
  if (stubs.length === 0)
    err('No stub TCs found in 03_TEST_CASES.json.\nAgent must add entries with "stub": true before calling --complete.');

  // Update artifact hash baseline for phase 3 so hasDrift returns false for this intentional update
  const tcsPath = artifactPath(dir, config, '03_TEST_CASES.json');
  try {
    const content = fs.readFileSync(tcsPath, 'utf8');
    config.artifactHashes = { ...(config.artifactHashes || {}), '3': hashArtifact(content) };
  } catch { /* non-fatal — drift detection will catch it on next check */ }

  clearDriftPhase(config, 3);
  appendEvent(config, 'verify-spec-complete', 'adopt', { stubs: stubs.length });
  saveConfig(dir, config);

  const verified = stubs.filter(tc => tc.status === 'verified').length;
  const pending  = stubs.length - verified;

  console.log(`✅ verify-spec complete — ${stubs.length} stub TC(s) registered`);
  if (verified) console.log(`   ${verified} already verified (existing tests cover those ACs)`);
  if (pending)  console.log(`   ${pending} pending verification — run: aitri verify-run`);
  console.log(`\n   Next: aitri verify-run`);
  console.log(`   Then: aitri verify-complete  (will prompt for known gaps on failing stubs)`);
}

// ── named exports for unit testing ───────────────────────────────────────────
export { scanCodeQuality, scanSecretSignals, scanInfrastructure, scanTestHealth };
