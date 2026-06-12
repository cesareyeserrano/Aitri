/**
 * Module: lib/reconcile-patterns
 * Purpose: Single source of truth for what `aitri reconcile` and the snapshot's
 *          uncounted-files detector consider "behavioral" vs "non-behavioral"
 *          file changes outside the pipeline.
 *
 * Contract:
 *   isBehavioralFile(relPath) → true  → file goes through the reconcile gate
 *                             → false → file is auto-ignored (build/dep manifest,
 *                                       documentation, dotfile, CI config, generated
 *                                       asset). Counts toward neither the warning
 *                                       count nor the briefing's review scope.
 *
 * Rationale: a one-line bump in go.mod, package.json, or a typo fix in
 * CONTRIBUTING.md is not behavioral drift against the spec. Treating it as such
 * forces a 70KB Senior Code Reviewer briefing + full verify-run + TTY
 * confirmation for trivial maintenance work. Evidence: Ultron canary 2026-04-27
 * (three "chore: advance aitri reconcile baseline" workaround commits in git
 * history, all triggered by build-manifest or asset-regeneration commits).
 */

// Exact basename matches (no directory).
const EXACT_NAMES = new Set([
  // Build / dependency manifests
  'go.mod', 'go.sum',
  'package.json', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json',
  'Cargo.toml', 'Cargo.lock',
  'Pipfile', 'Pipfile.lock', 'poetry.lock', 'pyproject.toml',
  'Gemfile', 'Gemfile.lock',
  'composer.json', 'composer.lock',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  // Documentation
  'README', 'LICENSE', 'AUTHORS', 'NOTICE', 'CONTRIBUTING', 'CHANGELOG',
  'CODE_OF_CONDUCT', 'SECURITY', 'MAINTAINERS',
  // Dotfiles
  '.gitignore', '.dockerignore', '.editorconfig', '.gitattributes',
  '.npmrc', '.nvmrc', '.node-version', '.python-version', '.ruby-version',
  // CI / infra
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'Makefile', 'GNUmakefile',
  '.travis.yml', '.gitlab-ci.yml', 'azure-pipelines.yml', 'cloudbuild.yaml',
]);

// Extensions (lowercased, including the dot).
const ALLOWED_EXTS = new Set([
  '.md', '.markdown', '.rst', '.txt', '.adoc',
  '.lock',
]);

// Path prefixes (POSIX-style, leading or interior).
const PREFIXES = [
  '.github/', '.gitlab/', '.circleci/', '.azure/', '.bitbucket/',
  'ci/', 'scripts/ci/',
];

// Directory segments that mark generated assets — match anywhere in the path.
const GENERATED_SEGMENTS = ['/dist/', '/build/', '/.next/', '/.nuxt/', '/out/'];

// Compound suffix matches (minified, source maps, generated bundles).
const SUFFIXES = ['.min.js', '.min.css', '.map', '.bundle.js', '.bundle.css'];

// Variant matchers: README.md, LICENSE.txt, Dockerfile.dev, docker-compose.prod.yml, .env.local, etc.
function matchesVariantPrefix(name) {
  // Documentation variants: README*, LICENSE*, CONTRIBUTING*, CHANGELOG*, CODE_OF_CONDUCT*
  if (/^(README|LICEN[SC]E|AUTHORS|NOTICE|CONTRIBUTING|CHANGELOG|CODE_OF_CONDUCT|SECURITY|MAINTAINERS)([.\-_].*)?$/i.test(name)) return true;
  // Env files: .env, .env.local, .env.production, etc.
  if (/^\.env(\..+)?$/i.test(name)) return true;
  // Dockerfile variants: Dockerfile.dev, Dockerfile.prod
  if (/^Dockerfile([.\-_].+)?$/i.test(name)) return true;
  // docker-compose variants: docker-compose.prod.yml, docker-compose.override.yaml
  if (/^docker-compose([.\-_].+)?\.(yml|yaml)$/i.test(name)) return true;
  // Makefile variants: Makefile.dev
  if (/^(GNU)?[Mm]akefile([.\-_].+)?$/.test(name)) return true;
  // Lockfiles: anything ending in .lock or *-lock.json (covered by ALLOWED_EXTS / EXACT_NAMES respectively, but be explicit)
  if (/-lock\.json$/i.test(name)) return true;
  return false;
}

/**
 * Is this file path a behavioral change worth routing through reconcile?
 *
 * Returns true if the file should be reviewed (default), false if it matches
 * the non-behavioral allowlist.
 *
 * @param {string} relPath - POSIX-style relative path from project root.
 * @returns {boolean}
 */
export function isBehavioralFile(relPath) {
  if (!relPath || typeof relPath !== 'string') return true;
  const norm = relPath.replace(/\\/g, '/');
  const name = norm.includes('/') ? norm.slice(norm.lastIndexOf('/') + 1) : norm;
  const lower = name.toLowerCase();

  // Suffix matches (minified, generated bundles, source maps).
  for (const s of SUFFIXES) if (lower.endsWith(s)) return false;

  // Extension match. Use the LAST dot to handle .min.css → .css mismatch.
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx > 0) {
    const ext = lower.slice(dotIdx);
    if (ALLOWED_EXTS.has(ext)) return false;
  }

  // Exact basename match.
  if (EXACT_NAMES.has(name)) return false;

  // Variant matches (README.md, .env.local, Dockerfile.dev, etc.).
  if (matchesVariantPrefix(name)) return false;

  // Path prefix match (CI / infra directories).
  for (const p of PREFIXES) if (norm.startsWith(p) || norm.includes('/' + p)) return false;

  // Generated asset directories anywhere in the path.
  const padded = '/' + norm;
  for (const seg of GENERATED_SEGMENTS) if (padded.includes(seg)) return false;

  return true;
}

/**
 * Filter a list of changed file paths to only the behavioral subset.
 *
 * @param {string[]} files
 * @returns {string[]}
 */
export function filterBehavioral(files) {
  if (!Array.isArray(files)) return [];
  return files.filter(isBehavioralFile);
}

/**
 * Is this path a feature sub-pipeline artifact (features/<name>/spec/ or
 * features/<name>/.aitri)? Such files are governed by the feature's own gate,
 * not the parent build baseline, so off-pipeline change detection must exclude
 * them symmetrically with root spec/ + .aitri.
 *
 * SSoT for both `aitri reconcile` (lib/commands/reconcile.js) and the snapshot's
 * uncounted-files detector (lib/snapshot.js::detectUncountedChanges). Added to
 * reconcile.js in rc.3 (Hub canary 2026-05-13) but not mirrored into snapshot —
 * the divergence made `status`/`resume` count feature artifacts that `reconcile`
 * correctly ignored, leaving projects stuck reporting "1 file changed outside
 * pipeline" with no way to clear it. Sharing the helper closes that gap.
 *
 * Shared code the feature contributes (lib/, tests/ outside the feature dir)
 * stays in scope — that's a legitimate parent baseline change.
 *
 * @param {string} relPath - POSIX-style relative path from project root.
 * @param {string} [layoutRoot] - contained-layout container ('aitri') or '' (flat).
 * @returns {boolean}
 */
export function isFeaturePipelineArtifact(relPath, layoutRoot = '') {
  if (!relPath || typeof relPath !== 'string') return false;
  const norm = relPath.replace(/\\/g, '/');
  const lr = layoutRoot ? layoutRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\/' : '';
  return new RegExp(`^${lr}features\\/[^/]+\\/(spec\\/|\\.aitri(\\/|$))`).test(norm);
}

/**
 * Is this path Aitri's own state/artifact surface — i.e. NOT a project source
 * change worth counting? SSoT for the prefix filters that were previously
 * duplicated across snapshot.js, reconcile.js (×3), and bug.js (LAYOUT-1):
 * artifact dir, the contained-layout container, `.aitri*`, node_modules, and
 * feature sub-pipeline artifacts.
 *
 * Layout-aware: for a contained project everything under `<layoutRoot>/` is
 * Aitri-owned (unit content, BACKLOG.md, features). For flat projects the
 * artifact dir defaults to 'spec' — preserving the historical literal filter
 * even when artifactsDir is '' (root-artifact legacy projects).
 *
 * @param {string} relPath - relative path from project root (either separator).
 * @param {{artifactsDir?: string, layoutRoot?: string}} [config]
 * @returns {boolean}
 */
export function isAitriStatePath(relPath, config = {}) {
  if (!relPath || typeof relPath !== 'string') return false;
  const f = relPath.replace(/\\/g, '/');
  const layoutRoot = config.layoutRoot || '';
  const adir = (config.artifactsDir || 'spec').replace(/\\/g, '/');
  if (f.startsWith(adir + '/')) return true;
  if (layoutRoot && f.startsWith(layoutRoot + '/')) return true;
  if (f.startsWith('.aitri')) return true;
  if (f.startsWith('node_modules/')) return true;
  if (isFeaturePipelineArtifact(f, layoutRoot)) return true;
  return false;
}
