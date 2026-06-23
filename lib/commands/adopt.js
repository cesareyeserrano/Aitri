/**
 * Module: Command — adopt
 * Purpose: Integrate existing projects into Aitri.
 *   scan      Conventional project (no Aitri): scan codebase → briefing for agent → ADOPTION_AUDIT.md + IDEA.md
 *   apply     Read IDEA.md → confirm → init project + mark inferred phases
 *   --upgrade Aitri-aware project (old version): infer completedPhases from existing
 *             artifacts, update aitriVersion. Non-destructive — never removes state.
 */

import fs from 'fs';
import path from 'path';
import { loadConfig, saveConfig, artifactPath, readArtifact, hashArtifact, clearDriftPhase, appendEvent, configExists, ideaPath as resolveIdeaPath, ideaContextDir, backlogMdPath } from '../state.js';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { render } from '../prompts/render.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/adopter.js';
import { readStdinSync } from '../read-stdin.js';
import { writeAgentFiles } from '../agent-files.js';
import { runUpgrade, compareVersions } from '../upgrade/index.js';
import { planLayoutMigration, executeLayoutMigration } from '../upgrade/layout-migration.js';

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

// Objective seed written by the guided entry (bare `aitri adopt`). Kept PURE — the
// operator's intent only (ADR-050/056); the audit's findings live separately in
// idea_context/, never crammed in here.
const ADOPT_OBJECTIVE_TEMPLATE = (name) =>
`# ${name} — Adoption Objective

## Objective
[What you want to achieve in this existing project — a migration, a feature, a refactor, a
security fix. Be specific. If you have NO specific objective and want a whole-project cleanup,
write "Stabilization" and the audit will derive the goals.]

## Must Not Break
[Existing behaviors that must keep working — each becomes a regression NFR at Phase 1.
e.g. "the login flow", "the public API contract", "data already stored".]

## Constraints
[Hard constraints: tech you must reuse, deadlines, what you cannot touch.]

## Supporting docs
[Drop migration guides, a prior PRD, API docs, specs in idea_context/ — Aitri feeds them to every phase.]
`;

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

  // Bare `aitri adopt` (no subcommand) is the GUIDED ENTRY for an existing project
  // (ADR-056 stage 2): scaffold the objective seed + the doc home, then point at scan.
  if (!sub) return adoptInit({ dir, err });
  if (sub === 'scan')    return adoptScan({ dir, VERSION, rootDir, err });
  if (sub === '--upgrade') {
    const dryRun = args.includes('--dry-run');
    if (args.includes('--layout')) return adoptLayout({ dir, rootDir, err, dryRun });
    return adoptUpgrade({ dir, VERSION, rootDir, dryRun });
  }
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
    '    aitri adopt                   Guided start: scaffold the objective seed + doc home (existing project)\n' +
    '    aitri adopt scan              Scan project → briefing for agent → ADOPTION_AUDIT.md + IDEA.md\n' +
    '    aitri adopt apply             Read IDEA.md → confirm → initialize\n' +
    '    aitri adopt apply --from <N>  Initialize and enter pipeline at Phase N (1-5)\n' +
    '    aitri adopt verify-spec       Generate stub briefing for uncovered AC items\n' +
    '    aitri adopt verify-spec --complete  Register stubs in pipeline after agent writes them\n' +
    '    aitri adopt --upgrade         Sync state from existing Aitri artifacts (non-destructive)\n' +
    '    aitri adopt --upgrade --dry-run  Preview upgrade changes without writing anything\n' +
    '    aitri adopt --upgrade --layout   Migrate a flat project to the contained aitri/ layout (human terminal; --dry-run to preview)'
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

// Project-root detection (FB-MULTI-0619 T2.2): in a nested layout the app — and its
// .gitignore / Dockerfile / lockfile — lives in a single subfolder, not the repo root.
// Presence signals that only looked at the repo root reported real files as "missing"
// (a .NET adopter with everything under SuzukiCR/). Detect the one obvious project
// subfolder and check both locations. Conservative: descends ONE level and returns the
// subfolder only when EXACTLY one carries a project descriptor — 0 or >1 (or a descriptor
// at the repo root) → repo root, i.e. behavior unchanged for flat layouts.
const PROJECT_DESCRIPTORS = [
  'package.json', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'pyproject.toml', 'Gemfile', 'composer.json',
];
function dirHasProjectDescriptor(d) {
  try {
    const names = fs.readdirSync(d);
    if (names.some(n => PROJECT_DESCRIPTORS.includes(n))) return true;
    return names.some(n => /\.(sln|csproj|fsproj|vbproj)$/i.test(n));
  } catch { return false; }
}
function detectProjectRoot(dir) {
  if (dirHasProjectDescriptor(dir)) return dir;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return dir; }
  const candidates = entries
    .filter(e => e.isDirectory() && !IGNORE_DIRS.has(e.name))
    .map(e => path.join(dir, e.name))
    .filter(dirHasProjectDescriptor);
  return candidates.length === 1 ? candidates[0] : dir;
}
/** Candidate roots for presence checks: repo root, plus the nested project folder if any. */
function presenceRoots(dir) {
  const pr = detectProjectRoot(dir);
  return pr === dir ? [dir] : [dir, pr];
}
/** First root containing `name`; returns its path relative to `dir` (or null). */
function findAtRoots(roots, dir, name) {
  for (const r of roots) {
    const full = path.join(r, name);
    if (fs.existsSync(full)) return path.relative(dir, full) || name;
  }
  return null;
}

/** Scan .gitignore (repo root or nested project folder) and report missing common patterns. */
function scanGitignore(dir) {
  const roots = presenceRoots(dir);
  let ignorePath = null;
  for (const r of roots) {
    const p = path.join(r, '.gitignore');
    if (fs.existsSync(p)) { ignorePath = p; break; }
  }
  if (!ignorePath) return 'MISSING — no .gitignore at the repo root or the project folder.';

  const where = path.relative(dir, ignorePath) || '.gitignore';
  const loc = where !== '.gitignore' ? ` (${where})` : '';
  const content = fs.readFileSync(ignorePath, 'utf8').toLowerCase();
  const missing = COMMON_GITIGNORE_PATTERNS
    .filter(({ pattern }) => !content.includes(pattern.toLowerCase()))
    .map(({ label }) => `  - ${label} not covered`);

  return missing.length
    ? `Present${loc} but incomplete. Missing patterns:\n${missing.join('\n')}`
    : `Present${loc} and covers common patterns.`;
}

/** Detect .env files (repo root or nested project folder) and whether they are gitignored. */
function scanEnvFiles(dir) {
  const lines = [];
  const roots = presenceRoots(dir);

  const envFiles = [];
  for (const r of roots) {
    let entries;
    try { entries = fs.readdirSync(r, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isFile() && /^\.env(\.|$)/.test(e.name) && e.name !== '.env.example')
        envFiles.push(path.relative(dir, path.join(r, e.name)) || e.name);
    }
  }

  if (!envFiles.length) {
    lines.push('No .env files found at the repo root or project folder.');
  } else {
    lines.push(`⚠️  Found: ${envFiles.join(', ')}`);
    let ignoreContent = '';
    for (const r of roots) ignoreContent += '\n' + (readFileSafe(path.join(r, '.gitignore'), 10000) || '');
    const gitignored = envFiles.every(f => ignoreContent.includes(path.basename(f)) || ignoreContent.includes('.env'));
    lines.push(gitignored ? '  → Covered by .gitignore.' : '  ❌ NOT in .gitignore — risk of credential exposure.');
  }

  const hasExample = roots.some(r => fs.existsSync(path.join(r, '.env.example')) || fs.existsSync(path.join(r, '.env.sample')));
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

/** Check infrastructure readiness: Dockerfile, CI, lockfiles, etc. (repo root + nested project folder) */
function scanInfrastructure(dir) {
  const roots = presenceRoots(dir);
  const find = (name) => findAtRoots(roots, dir, name);
  const sig = (label, name, missingWord = 'missing') => {
    const hit = find(name);
    return hit ? `${label}: ✓${hit !== name ? ` (${hit})` : ''}` : `${label}: ${missingWord}`;
  };
  const lines = [];

  // Dockerfile / docker-compose
  lines.push(sig('Dockerfile', 'Dockerfile'));
  const dc = find('docker-compose.yml') || find('docker-compose.yaml');
  lines.push(dc ? `docker-compose: ✓${/[\\/]/.test(dc) ? ` (${dc})` : ''}` : 'docker-compose: missing');

  // CI — .github/workflows at any root, plus single-file CI configs
  const ciFiles = [];
  for (const r of roots) {
    const wfDir = path.join(r, '.github', 'workflows');
    if (fs.existsSync(wfDir)) {
      try {
        const prefix = path.relative(dir, r);
        ciFiles.push(...fs.readdirSync(wfDir).map(f => `${prefix ? prefix + '/' : ''}.github/workflows/${f}`));
      } catch {}
    }
  }
  for (const f of ['.gitlab-ci.yml', '.circleci/config.yml', 'Jenkinsfile']) {
    const hit = find(f); if (hit) ciFiles.push(hit);
  }
  lines.push(ciFiles.length
    ? `CI/CD: ✓ — ${ciFiles.join(', ')}`
    : 'CI/CD: missing — no workflow files found');

  // Lockfiles (incl. .NET packages.lock.json)
  let lockfile = null;
  for (const f of ['package-lock.json','yarn.lock','pnpm-lock.yaml','go.sum','Gemfile.lock','poetry.lock','Pipfile.lock','Cargo.lock','packages.lock.json','composer.lock']) {
    lockfile = find(f); if (lockfile) break;
  }
  lines.push(lockfile ? `Lockfile: ✓ — ${lockfile}` : 'Lockfile: missing');

  // Makefile
  lines.push(sig('Makefile', 'Makefile', 'not present'));

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

// ── init (guided entry) ─────────────────────────────────────────────────────────
// Bare `aitri adopt` for an existing project: scaffold the operator's objective seed
// (IDEA.md — kept PURE) and the doc home (idea_context/), then guide them to scan.
// Pre-config, so it lands at the project root; `adopt apply` relocates it into the unit
// (ADR-056). Never clobbers an existing seed.
function adoptInit({ dir, err }) {
  const config     = loadConfig(dir);
  const ideaTarget = resolveIdeaPath(dir, config);   // root pre-config; unit if already adopted
  const ctxDir     = ideaContextDir(dir, config);
  const rel = (p) => path.relative(dir, p) || '.';

  console.log('\n🎯 Aitri Adopt — guided start (existing project)');
  console.log('─'.repeat(60));

  // 1. Objective seed (IDEA.md) — pure operator intent. Never overwrite.
  if (fs.existsSync(ideaTarget)) {
    console.log(`  📝 ${rel(ideaTarget)} already exists — left as-is (your objective).`);
  } else {
    fs.mkdirSync(path.dirname(ideaTarget), { recursive: true });
    fs.writeFileSync(ideaTarget, ADOPT_OBJECTIVE_TEMPLATE(path.basename(dir)), 'utf8');
    console.log(`  📝 ${rel(ideaTarget)} created — fill in your objective.`);
  }

  // 2. Doc home (idea_context/) — supporting specs/docs the phases (and the audit) will use.
  fs.mkdirSync(ctxDir, { recursive: true });
  const ctxReadme = path.join(ctxDir, 'README.md');
  if (!fs.existsSync(ctxReadme)) {
    fs.writeFileSync(ctxReadme,
      '# idea_context/ — supporting assets for the adoption\n\n' +
      'Drop the objective\'s supporting material here: a migration guide, a prior PRD, API docs, ' +
      'specs, screenshots, reference docs. Aitri lists these files in every phase briefing, and the ' +
      'adoption audit (ADOPTION_AUDIT.md) lands here too — so the requirements and plan are grounded in them.\n');
  }
  console.log(`  📁 ${rel(ctxDir)}/ ready — drop your specs/docs/rules here.`);

  // 3. Guide.
  console.log('\n  Next:');
  console.log(`    1. Edit ${rel(ideaTarget)} — state your objective (or "Stabilization" for a whole-project cleanup).`);
  console.log(`    2. Put supporting docs/specs in ${rel(ctxDir)}/.`);
  console.log('    3. Run:  aitri adopt scan   → audits the code focused on your objective.');
  console.log('    4. Then: aitri adopt apply  → initializes the pipeline.\n');
}

function adoptScan({ dir, VERSION, err }) {
  // Inform agent if project is already Aitri-initialized. Route through state.js
  // (configExists + loadConfig) so the layout is resolved in one place — the old
  // hardcoded `.aitri/config.json` missed the flat `.aitri` file (the normal layout).
  if (configExists(dir)) {
    const existing = loadConfig(dir);
    const approved = (existing.approvedPhases || []).length;
    process.stderr.write(
      `[aitri] Note: project already has .aitri (Aitri v${existing.aitriVersion || 'unknown'}, ` +
      `${approved} phase(s) approved).\n` +
      `  Scanning anyway — ADOPTION_AUDIT.md and IDEA.md will reflect current project state.\n\n`
    );
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

  // The template preserves an existing pure IDEA.md (ADR-056) — only a missing one is
  // created. Word the next-steps to match so the message does not contradict the template.
  const ideaAlreadyExists = fs.existsSync(path.join(dir, 'IDEA.md'));
  const ideaClause = ideaAlreadyExists
    ? `ADOPTION_AUDIT.md (your existing IDEA.md is preserved)`
    : `ADOPTION_AUDIT.md and IDEA.md`;
  const ideaStep = ideaAlreadyExists
    ? `   2. Agent creates ADOPTION_AUDIT.md (diagnostic); your existing IDEA.md is kept as-is\n`
    : `   2. Agent creates ADOPTION_AUDIT.md (diagnostic) and IDEA.md (adoption plan)\n`;
  const bar = '─'.repeat(60);
  process.stderr.write(
    `\n${bar}\n` +
    ` aitri adopt scan printed the briefing above.\n` +
    ` Your agent will create: ${ideaClause}\n\n` +
    ` What happens next:\n` +
    `   1. Agent reads the briefing and scans the project\n` +
    ideaStep +
    `   3. Review ADOPTION_AUDIT.md\n` +
    `   4. When ready: aitri adopt apply\n` +
    `${bar}\n`
  );
}

// ── apply ─────────────────────────────────────────────────────────────────────

function adoptApply({ dir, VERSION, err, fromPhase, rootDir }) {
  if (fromPhase !== null && fromPhase !== undefined) {
    return adoptApplyFrom({ dir, fromPhase, VERSION, err, rootDir });
  }

  const ideaPath = path.join(dir, 'IDEA.md');
  const ideaExists = fs.existsSync(ideaPath);

  if (!ideaExists) {
    process.stderr.write(
      `[aitri] Warning: IDEA.md not found.\n` +
      `  Run 'aitri adopt scan' first so the agent generates IDEA.md and ADOPTION_AUDIT.md.\n` +
      `  Proceeding with a placeholder — fill in IDEA.md before running Phase 1.\n\n`
    );
  }

  // Detect existing .aitri (either layout) via state.js — see adoptScan above.
  if (configExists(dir)) {
    const existing = loadConfig(dir);
    // The version write below is guarded against downgrade (ADV-0622-13) — say what will
    // actually happen rather than unconditionally claiming an update to VERSION.
    const willUpdate = !existing.aitriVersion || compareVersions(VERSION, existing.aitriVersion) >= 0;
    const versionLine = willUpdate
      ? `  Existing state preserved. aitriVersion will be updated to ${VERSION}.\n\n`
      : `  Existing state preserved. aitriVersion stays at ${existing.aitriVersion} (newer than this CLI, ${VERSION}) — no downgrade.\n\n`;
    process.stderr.write(
      `[aitri] Note: project already has .aitri (Aitri v${existing.aitriVersion || 'unknown'}).\n` +
      versionLine
    );
  }

  console.log('\n🔄 Aitri Adopt — Apply');
  console.log('─'.repeat(50));
  console.log(`  Project dir: ${dir}`);

  if (process.stdin.isTTY) {
    console.log('\n  This will:');
    console.log('    1. Initialize Aitri (creates .aitri at the root + the aitri/ container)');
    if (!ideaExists) console.log('    2. Create placeholder IDEA.md (fill before Phase 1)');
    console.log('\n  Proceed? (y/N) ');

    let answer = '';
    try { answer = readStdinSync(10).trim().toLowerCase(); } catch {}
    if (answer !== 'y' && answer !== 'yes') { console.log('  Aborted.'); process.exit(0); }
  }

  const config = loadConfig(dir);
  config.projectName     = config.projectName  || path.basename(dir);
  config.createdAt       = config.createdAt    || new Date().toISOString();
  if (!config.aitriVersion || compareVersions(VERSION, config.aitriVersion) >= 0) config.aitriVersion = VERSION;  // ADV-0622-13: never downgrade
  config.currentPhase    = config.currentPhase || 0;
  config.approvedPhases  = config.approvedPhases  || [];
  config.completedPhases = config.completedPhases || [];

  if (config.artifactsDir === undefined) {
    // Guard: if known Aitri artifacts already exist at the project root, this is a
    // legacy Aitri project — re-routing its layout would break all lookups.
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
    // Fresh adoption → contained layout, same as init (rc.78).
    config.layoutRoot   = 'aitri';
    config.artifactsDir = 'aitri/product/spec';
    fs.mkdirSync(path.join(dir, 'aitri', 'product', 'spec'), { recursive: true });
    // Context folder, like init — the rendered agent files point at it (Phase-D
    // canary SDLC-GRAPH: adopt left the advertised folder uncreated).
    const ctxDir = path.join(dir, 'aitri', 'product', 'idea_context');
    fs.mkdirSync(ctxDir, { recursive: true });
    if (!fs.existsSync(path.join(ctxDir, 'README.md'))) {
      fs.writeFileSync(
        path.join(ctxDir, 'README.md'),
        '# idea_context/ — supporting assets\n\nDrop reference material here: mockups, Figma exports, PDFs, a prior PRD, screenshots, reference docs.\nAitri automatically lists the files in this folder in every phase briefing so your agent can reference them.\n'
      );
    }
  }

  // The scan flow has the agent write IDEA.md at the project root; place it at
  // the layout-resolved location (moves it into aitri/product/ on a fresh
  // contained adoption; a no-op rename target for legacy flat re-applies).
  const unitIdeaPath = resolveIdeaPath(dir, config);
  if (ideaExists && unitIdeaPath !== ideaPath) {
    if (fs.existsSync(unitIdeaPath)) {
      // Never clobber an existing unit seed (rc.82, adversarial review): a
      // re-run of scan→apply on an already-contained project would otherwise
      // silently overwrite aitri/product/IDEA.md with the fresh root draft.
      process.stderr.write(
        `[aitri] Warning: ${path.relative(dir, unitIdeaPath)} already exists — the root IDEA.md was NOT moved.\n` +
        `  Compare the two and merge by hand, then delete the root copy.\n`
      );
    } else {
      fs.mkdirSync(path.dirname(unitIdeaPath), { recursive: true });
      fs.renameSync(ideaPath, unitIdeaPath);
    }
  }
  if (!ideaExists && !fs.existsSync(unitIdeaPath)) {
    fs.mkdirSync(path.dirname(unitIdeaPath), { recursive: true });
    fs.writeFileSync(
      unitIdeaPath,
      `# ${path.basename(dir)} — Adoption Goal\n\n` +
      `Fill in this file before running Phase 1.\n` +
      `Run: aitri adopt scan  to generate a proper adoption plan.\n`,
      'utf8'
    );
    console.log(`\n  📝 Placeholder ${path.relative(dir, unitIdeaPath)} created — fill in before Phase 1`);
  } else {
    console.log(`\n  📝 ${path.relative(dir, unitIdeaPath)} ${ideaExists ? 'in place' : 'found'} — will be used for Phase 1`);
  }

  // Move the operator's adoption inputs (root ADOPTION_AUDIT.md + idea_context/) into the
  // unit's idea_context/ so Phases 1-3 list and ground requirements/design in them (ADR-056).
  relocateAdoptionInputs(dir, config);

  saveConfig(dir, config);

  writeAgentFiles(dir, rootDir, config);

  const backlogPath = backlogMdPath(dir, config);
  if (!fs.existsSync(backlogPath)) {
    const tpl = path.join(rootDir, 'templates', 'BACKLOG.md');
    fs.writeFileSync(backlogPath, fs.readFileSync(tpl, 'utf8'));
  }

  console.log('\n  ✅ Aitri initialized');

  const hasExistingState = (config.approvedPhases || []).length > 0 || (config.completedPhases || []).length > 0;
  if (hasExistingState) {
    console.log('\n  Next: aitri status  to see current pipeline state');
  } else {
    console.log('\n  Next: aitri run-phase 1  to define the adoption requirements');
  }
  console.log('─'.repeat(50));
}

// ── shared: relocate root adoption inputs into the unit's idea_context/ ──────────
// Bare `aitri adopt` writes idea_context/ at the root; the scan writes ADOPTION_AUDIT.md at
// the root. Both `adopt apply` and `adopt apply --from` move them into the unit so Phases 1-3
// list them and ground requirements + design in them (ADR-056). IDEA.md stays the operator's
// pure intent; never clobber an existing unit file. (ADV-0622-07: `--from` used to skip this,
// orphaning the audit at the root where no phase briefing lists it.)
function relocateAdoptionInputs(dir, config) {
  const unitCtxDir = ideaContextDir(dir, config);
  const moveIntoCtx = (srcPath, label) => {
    if (!fs.existsSync(srcPath)) return;
    const destPath = path.join(unitCtxDir, path.basename(srcPath));
    if (srcPath === destPath) return;
    if (fs.existsSync(destPath)) {
      process.stderr.write(`[aitri] Note: ${path.relative(dir, destPath)} already exists — root ${path.basename(srcPath)} left in place (merge by hand).\n`);
      return;
    }
    fs.mkdirSync(unitCtxDir, { recursive: true });
    fs.renameSync(srcPath, destPath);
    if (label) console.log(`\n  📋 ${label} → ${path.relative(dir, unitCtxDir)}/`);
  };
  moveIntoCtx(path.join(dir, 'ADOPTION_AUDIT.md'), 'ADOPTION_AUDIT.md (Phases 1-3 read it)');
  const rootCtxDir = path.join(dir, 'idea_context');
  if (fs.existsSync(rootCtxDir) && path.resolve(rootCtxDir) !== path.resolve(unitCtxDir)) {
    for (const f of fs.readdirSync(rootCtxDir)) {
      if (f === 'README.md' && fs.existsSync(path.join(unitCtxDir, 'README.md'))) {
        fs.rmSync(path.join(rootCtxDir, f));
        continue;
      }
      moveIntoCtx(path.join(rootCtxDir, f));
    }
    try { fs.rmdirSync(rootCtxDir); } catch { /* not empty — leave it */ }
  }
}

// ── apply --from <N> ──────────────────────────────────────────────────────────

function adoptApplyFrom({ dir, fromPhase, VERSION, err, rootDir }) {
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
    console.log('     1. Initialize Aitri (creates .aitri at the root + the aitri/ container)');
    if (!fs.existsSync(path.join(dir, 'IDEA.md')))
      console.log('     2. Create IDEA.md from README.md or ADOPTION_AUDIT.md');
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
  if (!config.aitriVersion || compareVersions(VERSION, config.aitriVersion) >= 0) config.aitriVersion = VERSION;  // ADV-0622-13: never downgrade
  config.currentPhase    = config.currentPhase || 0;
  config.approvedPhases  = config.approvedPhases  || [];
  config.completedPhases = config.completedPhases || [];

  if (config.artifactsDir === undefined) {
    // Same legacy guard as plain apply (rc.82 — it was missing here): root
    // artifacts mean an existing Aitri project whose lookups a layout
    // re-route would orphan.
    const knownArtifactsFrom = [...OPTIONAL_PHASES, ...CORE_PHASES]
      .map(k => PHASE_DEFS[k]?.artifact)
      .filter(Boolean);
    if (knownArtifactsFrom.some(a => fs.existsSync(path.join(dir, a)))) {
      err(
        'Aitri artifacts found at project root — this looks like an existing Aitri project.\n' +
        '  adopt apply --from is for projects without prior Aitri artifacts.\n\n' +
        '  To sync state from existing artifacts, run:\n' +
        '    aitri adopt --upgrade'
      );
    }
    // Fresh adoption → contained layout, same as init (rc.78).
    config.layoutRoot   = 'aitri';
    config.artifactsDir = 'aitri/product/spec';
    fs.mkdirSync(path.join(dir, 'aitri', 'product', 'spec'), { recursive: true });
  }

  const ideaPath = resolveIdeaPath(dir, config);
  const rootIdea = path.join(dir, 'IDEA.md');
  if (!fs.existsSync(ideaPath) && ideaPath !== rootIdea && fs.existsSync(rootIdea)) {
    // A scan-written (or hand-written) root brief moves into the unit, like init.
    fs.mkdirSync(path.dirname(ideaPath), { recursive: true });
    fs.renameSync(rootIdea, ideaPath);
    console.log(`\n  📝 IDEA.md moved to ${path.relative(dir, ideaPath)}`);
  } else if (!fs.existsSync(ideaPath)) {
    fs.mkdirSync(path.dirname(ideaPath), { recursive: true });
    fs.writeFileSync(ideaPath, `# Project Idea\n\n${ideaSummary}\n`, 'utf8');
    console.log(`\n  📝 ${path.relative(dir, ideaPath)} created from README`);
  } else {
    console.log(`\n  📝 ${path.relative(dir, ideaPath)} already exists — not overwritten`);
  }

  const completed = new Set(config.completedPhases);
  const approved  = new Set(config.approvedPhases);
  const hashes    = { ...(config.artifactHashes || {}) };
  const newlyMarked = [];
  const newlyApproved = [];
  for (const phase of phasesToMark) {
    if (completed.has(phase) || approved.has(phase)) continue;
    completed.add(phase);
    newlyMarked.push(phase);
    // ADV-0622-26: if the prior phase's artifact actually exists, mark it APPROVED and stamp
    // its hash too. Otherwise it stays completed-not-approved, approve N's ordering gate blocks
    // forever, and the project can never reach deployable. Mark approved ONLY when the artifact
    // is present — marking it approved without the file just moves the dead-end to run-phase N's
    // missing-input check.
    const art     = PHASE_DEFS[phase]?.artifact;
    const artFile = art && artifactPath(dir, config, art);
    if (artFile && fs.existsSync(artFile)) {
      approved.add(phase);
      try { hashes[String(phase)] = hashArtifact(fs.readFileSync(artFile, 'utf8')); } catch { /* unreadable — leave unhashed */ }
      newlyApproved.push(phase);
    }
  }

  config.completedPhases = [...completed];
  config.approvedPhases  = [...approved];
  config.artifactHashes  = hashes;

  // Auto-infer from any existing Aitri artifacts in spec/
  const autoInferred = inferFromArtifacts(dir, config);
  if (autoInferred.length) config.completedPhases = [...new Set([...config.completedPhases, ...autoInferred])];

  // ADV-0622-07: move root ADOPTION_AUDIT.md + idea_context/ into the unit (was a --from-only gap)
  relocateAdoptionInputs(dir, config);
  saveConfig(dir, config);

  const backlogPath = backlogMdPath(dir, config);
  if (!fs.existsSync(backlogPath)) {
    const tpl = path.join(rootDir, 'templates', 'BACKLOG.md');
    fs.writeFileSync(backlogPath, fs.readFileSync(tpl, 'utf8'));
  }

  console.log('\n  ✅ Aitri initialized');
  if (newlyMarked.length) console.log(`  ✅ Marked as completed (--from ${fromPhase}): phases ${newlyMarked.join(', ')}`);
  if (newlyApproved.length) console.log(`  ✅ Approved (their artifacts are present): phases ${newlyApproved.join(', ')}`);
  if (autoInferred.length) console.log(`  ✅ Inferred from existing artifacts: phases ${autoInferred.join(', ')}`);
  const notApproved = newlyMarked.filter(p => !newlyApproved.includes(p));
  if (notApproved.length)
    console.log(`  ⚠ Phases ${notApproved.join(', ')} are marked done but have no artifact yet — approve them in order (or add their artifacts) before Phase ${fromPhase} can reach deploy.`);
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
// Thin dispatcher. Real protocol lives in lib/upgrade/ (ADR-027).

function adoptUpgrade({ dir, VERSION, rootDir, dryRun = false }) {
  const result = runUpgrade({ dir, VERSION, rootDir, dryRun });
  // Offer (never run) the layout migration to flat projects — one line, after
  // the report, so the regular upgrade stays exactly what it was (LAYOUT-1).
  const config = loadConfig(dir);
  if (config.aitriVersion && !config.layoutRoot) {
    console.log(
      '\nℹ️  This project uses the legacy flat layout. New projects group everything Aitri-owned\n' +
      '   under an aitri/ container. Optional migration (run it yourself, in a terminal):\n' +
      '     aitri adopt --upgrade --layout --dry-run   preview the move plan\n' +
      '     aitri adopt --upgrade --layout             apply (clean git tree required)'
    );
  }
  return result;
}

// ── layout migration (LAYOUT-1 Phase C) ──────────────────────────────────────
// Mechanics live in lib/upgrade/layout-migration.js; this wrapper owns the
// interactive gates: print the full plan, --dry-run exits before anything,
// agents (no TTY) are blocked — moving a user's directories is a human call.

function adoptLayout({ dir, rootDir, err, dryRun = false }) {
  const plan = planLayoutMigration(dir);

  if (!plan.ok) {
    if (plan.code === 'already-contained') { console.log(`✅ ${plan.reason}`); return; }
    err(plan.reason);
  }

  console.log('\n🔄 Aitri Layout Migration — flat → contained (aitri/)');
  console.log('─'.repeat(60));
  console.log('  Move plan:');
  for (const m of plan.moves) console.log(`    ${m.from}${m.kind === 'dir' ? '/' : ''}  →  ${m.to}${m.kind === 'dir' ? '/' : ''}`);
  console.log('  Config: layoutRoot = "aitri", artifactsDir = "aitri/product/spec"');
  for (const n of plan.notes) console.log(`  ⚠ ${n}`);
  console.log('─'.repeat(60));

  if (dryRun) {
    console.log('\nDry run — nothing was moved. Apply with: aitri adopt --upgrade --layout');
    return;
  }

  if (!process.stdin.isTTY) {
    process.stderr.write(
      '\n❌ Layout migration is blocked in agent mode — moving project directories is a human decision.\n' +
      '   Run in your terminal:  aitri adopt --upgrade --layout\n'
    );
    process.exit(1);
  }

  process.stdout.write('\n  Proceed with the move? (y/N) ');
  let answer = '';
  try { answer = readStdinSync(10).trim().toLowerCase(); } catch {}
  if (answer !== 'y' && answer !== 'yes') { console.log('  Aborted — nothing moved.'); return; }

  const { moved, agentFiles, keptAgentFiles } = executeLayoutMigration(dir, rootDir);
  console.log(`\n✅ Migrated to the contained layout — ${moved.length} path(s) moved into aitri/.`);
  if (agentFiles.length) console.log(`   Agent files regenerated: ${agentFiles.join(', ')}`);
  if (keptAgentFiles?.length) console.log(`   ⚠ Kept (user-authored, not Aitri-generated — reconcile yourself): ${keptAgentFiles.join(', ')}`);
  console.log('   Commit the move now:  git add -A && git commit -m "chore: migrate to aitri/ contained layout"');
  console.log('   (status/resume may report "files changed outside pipeline" until that commit lands — transient, clears itself.)');
  console.log('   If anything looks wrong instead:  git checkout -- . && rm -rf aitri/');
  console.log('   ⚠ If the plan listed gitignored files under moved paths, move those back out BEFORE any rm -rf aitri/ — git cannot restore them.');
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
  if (verified) console.log(`   ${verified} marked "verified" — each still needs a matching test name (TC id) or 'tc verify --evidence' to land as a pass; status alone does not cover the AC`);
  if (pending)  console.log(`   ${pending} pending verification — run: aitri verify-run`);
  console.log(`\n   Next: aitri verify-run`);
  console.log(`   Then: aitri verify-complete  (will prompt for known gaps on failing stubs)`);
}

// ── named exports for unit testing ───────────────────────────────────────────
export { scanCodeQuality, scanSecretSignals, scanInfrastructure, scanTestHealth, scanGitignore, scanEnvFiles, detectProjectRoot };
