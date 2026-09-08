/**
 * Module: lib/git-frame
 * Purpose: Single source of truth for reconciling git's PATH FRAME with Aitri's.
 *
 * The problem it exists to close: `git diff --name-only` and `git status --porcelain`
 * emit paths relative to the REPO root, while `isAitriStatePath()` matches prefixes
 * relative to the PIPELINE root (artifactsDir, layoutRoot, features/). Whenever the two
 * frames differ — a contained-layout feature (`aitri/features/f1/…`, the DEFAULT layout)
 * or a project whose root is a repo SUBDIR (monorepo) — Aitri's own committed state file
 * and artifacts get classified as project code. That is not cosmetic: it manufactures
 * off-pipeline drift out of Aitri's own writes, and the reconcile cycle then never
 * closes (`reconcile` clears verifyPassed → `--resolve` demands a verify → verify writes
 * `.aitri` → `--resolve` demands that commit → the commit is fresh drift → repeat).
 *
 * rc.7 (ADR-085 / M1) introduced this normalization but wired it only into the
 * verify-ref binding. rc.11 promotes it to a shared module and migrates the three
 * reconcile-side readers that still filtered raw repo-relative paths:
 *   - reconcile.gitChangedFiles           (baseline diff)
 *   - reconcile.uncommittedBehavioralChanges (working-tree gate)
 *   - snapshot.detectUncountedChanges     (the status/next-action counter)
 *
 * We do NOT use `git diff --relative`: it silently DROPS out-of-subtree paths, which
 * would blind a feature's freshness to parent-code changes. And every git invocation that
 * yields paths lives HERE, with `-z`: a reader that runs its own `git diff --name-only`
 * gets C-quoted names for any non-ASCII path and re-opens the class silently.
 */

import { execFileSync } from 'node:child_process';
import { isBehavioralFile, isAitriStatePath } from './reconcile-patterns.js';

/** The pipeline dir's repo-relative prefix ('' at the repo root, null if not a repo). */
export function gitShowPrefix(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-prefix'],
      { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

/** Build the root-frame context for judging out-of-subtree paths (a feature seeing parent code). */
export function verifyRefRootCtx(rootDir, rootConfig) {
  const prefix = gitShowPrefix(rootDir);
  return prefix === null ? null : { prefix, config: rootConfig || {} };
}

/**
 * Is this repo-relative path a behavioral change, judged in the right frame?
 * Paths inside `pipelinePrefix` are re-framed before filtering. Paths OUTSIDE the
 * subtree (root code seen from a feature) are judged in the ROOT's frame when a
 * rootCtx is provided, else by the frame-independent filters only (conservative:
 * real code still counts).
 */
export function isBehavioralInFrame(repoRel, pipelinePrefix, config, rootCtx) {
  const norm = String(repoRel || '').replace(/\\/g, '/');
  if (!norm) return false;
  if (pipelinePrefix && norm.startsWith(pipelinePrefix)) {
    const local = norm.slice(pipelinePrefix.length);
    return !!local && !isAitriStatePath(local, config) && isBehavioralFile(local);
  }
  if (!pipelinePrefix) {
    // pipeline sits at the repo root — frames already agree
    return !isAitriStatePath(norm, config) && isBehavioralFile(norm);
  }
  // Outside this pipeline's subtree: judge in the root's frame when we have it.
  if (rootCtx && norm.startsWith(rootCtx.prefix)) {
    const rootLocal = rootCtx.prefix ? norm.slice(rootCtx.prefix.length) : norm;
    return !!rootLocal && !isAitriStatePath(rootLocal, rootCtx.config) && isBehavioralFile(rootLocal);
  }
  // No root context: frame-independent filters only (`.aitri*`, node_modules, the
  // literal spec/ default, extension allowlist). Conservative — code stays behavioral.
  return !isAitriStatePath(norm, {}) && isBehavioralFile(norm);
}

/**
 * Render a repo-relative path for DISPLAY and for use as a git pathspec from the
 * pipeline dir. In-subtree paths become pipeline-relative (the frame every other
 * Aitri surface uses — the mtime detector already returns this shape, and a plain
 * relative pathspec resolves correctly from `cwd: dir`). Out-of-subtree paths keep
 * their repo-relative form anchored with git's `:/` magic prefix, which is both an
 * honest marker ("outside this project") and a pathspec that resolves from any cwd —
 * a bare repo-relative path silently matched NOTHING when the project was a subdir.
 */
export function toPipelinePath(repoRel, pipelinePrefix) {
  const norm = String(repoRel || '').replace(/\\/g, '/');
  if (!pipelinePrefix) return norm;
  if (norm.startsWith(pipelinePrefix)) return norm.slice(pipelinePrefix.length);
  return `:/${norm}`;
}

/**
 * Repo-relative names changed in `<range>` — `git diff --name-only -z`. NUL-separated
 * output is the ONLY unquoted form git offers: without `-z`, `core.quotePath` (default on)
 * C-quotes any path with non-ASCII/backslash/control bytes (`"caf\303\251/.aitri"`), the
 * quoted string then fails every prefix match, and Aitri's own state under a `café`
 * feature reads as project code — the exact class this module exists to close, reproduced
 * against the CLI by the rc.11 adversarial pass. Never parse quoted names; ask git for raw
 * ones. `range` is a caller-validated ref expression (`<sha>..HEAD`) — this is execFileSync
 * with an argv array, never a shell string (ADR-058). Throws on git failure so callers keep
 * their own refuse-vs-degrade doctrine.
 */
export function gitDiffNames(dir, range, { diffFilter = null } = {}) {
  const args = ['diff', range, '--name-only', '-z'];
  if (diffFilter) args.push(`--diff-filter=${diffFilter}`);
  const out = execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return out.split('\0').filter(Boolean);
}

/**
 * Repo-relative working-tree paths that COUNT as changes — `git status --porcelain -z
 * --untracked-files=all`. Added/modified/renamed/copied/untracked count; pure deletions
 * and unmerged entries do not (mirrors the detection's `--diff-filter=ACMR`: only those can
 * re-trigger reconcile against a freshly advanced baseline). `-z` for the same reason as
 * gitDiffNames: raw bytes, no C-quoting. In `-z` form a rename/copy record is
 * `XY <new>\0<old>\0` — the old name is consumed and dropped. `--untracked-files=all`
 * so an untracked DIRECTORY does not collapse to `?? dir/`, hiding whether its contents
 * are behavioral. Shared by the working-tree gate and the verify dirty stamp — one parser,
 * so the two can never disagree about the same line. Throws on git failure.
 */
export function gitPorcelainPaths(dir) {
  const out = execFileSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'],
    { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const tokens = out.split('\0');
  const paths = [];
  for (let i = 0; i < tokens.length; i++) {
    const rec = tokens[i];
    if (rec.length < 4) continue;                 // "XY p" is the minimum; trailing '' too
    const code = rec.slice(0, 2);
    const p = rec.slice(3);
    if (/[RC]/.test(code)) i++;                   // rename/copy: next token is the OLD path
    if (!(code === '??' || /[AMRC]/.test(code))) continue;
    if (p) paths.push(p);
  }
  return paths;
}

/**
 * Is this repo-relative path Aitri's own state/artifact surface, judged in the pipeline
 * frame? The state-only sibling of isBehavioralInFrame — for readers that keep
 * non-behavioral project files (a bug's `files_changed` trail keeps docs) but must never
 * list Aitri's own files. Out-of-subtree paths: frame-independent filters only.
 */
export function isAitriStateInFrame(repoRel, pipelinePrefix, config) {
  const norm = String(repoRel || '').replace(/\\/g, '/');
  if (!norm) return true;
  if (pipelinePrefix && norm.startsWith(pipelinePrefix)) {
    const local = norm.slice(pipelinePrefix.length);
    return !local || isAitriStatePath(local, config);
  }
  return isAitriStatePath(norm, pipelinePrefix ? {} : config);
}
