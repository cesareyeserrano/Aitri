/**
 * Module: Layout migration (LAYOUT-1 Phase C, ADR-049)
 * Purpose: Migrate a legacy FLAT project to the contained `aitri/` layout —
 *          the only operation in Aitri that moves directories in a user's repo.
 *
 * Deliberately NOT a registered migration in migrations/ (those run
 * automatically on `adopt --upgrade`): a layout move must NEVER be automatic.
 * It is invoked explicitly via `aitri adopt --upgrade --layout`, and adopt.js
 * owns the interactive gates (dry-run print, isTTY confirm). This module owns
 * the mechanical ones:
 *
 *   1. already contained → nothing to do
 *   2. clean git tree REQUIRED — the recovery contract is `git checkout -- .`
 *      (there is no rollback machinery; a dirty tree could lose work)
 *   3. idempotency guard — `aitri/` must not exist (or be an empty dir);
 *      re-running after a partial move is a refuse-and-inspect, never a merge
 *   4. only the layouts Aitri created are migratable (artifactsDir 'spec' or
 *      '' — a custom value means a hand-tuned project: migrate manually)
 *
 * What moves: IDEA.md, idea_context/ → aitri/product/; artifacts → aitri/
 * product/spec/; BACKLOG.md → aitri/; features/ → aitri/features/ (wholesale —
 * feature configs are feature-relative and need no rewrite). Hardcoded old
 * paths inside artifact CONTENT (manifests, test_runner) are flagged in the
 * plan, never rewritten — content is the agent's job (ADR-027 §2).
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig, saveConfig, appendEvent } from '../state.js';
import { regenerateAgentFiles } from '../agent-files.js';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';

const CORE_PHASES = [1, 2, 3, 4, 5];
const OFF_PIPELINE_FILES = ['BUGS.json', 'BACKLOG.json', 'AUDIT_REPORT.md'];

function knownArtifactFiles() {
  const fromPhases = [...OPTIONAL_PHASES, ...CORE_PHASES]
    .map(k => PHASE_DEFS[k]?.artifact)
    .filter(Boolean);
  // 04_TEST_RESULTS.json is written by verify-run, not a phase definition.
  return [...new Set([...fromPhases, '04_TEST_RESULTS.json', ...OFF_PIPELINE_FILES])];
}

function gitState(dir) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, stdio: 'ignore' });
  } catch {
    return { repo: false, clean: false };
  }
  try {
    const out = execSync('git status --porcelain --untracked-files=all', {
      cwd: dir, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    return { repo: true, clean: out.length === 0 };
  } catch {
    return { repo: true, clean: false };
  }
}

/**
 * Compute the migration plan for `dir` without touching anything.
 *
 * @returns {{ ok: boolean, code?: string, reason?: string,
 *             moves?: Array<{from: string, to: string, kind: 'file'|'dir'}>,
 *             notes?: string[] }}
 *   code: 'already-contained' | 'not-aitri' | 'custom-artifacts-dir' |
 *         'no-git' | 'dirty-tree' | 'container-collision'
 */
export function planLayoutMigration(dir) {
  const config = loadConfig(dir);

  if (config.layoutRoot) {
    return { ok: false, code: 'already-contained', reason: 'Project already uses the contained layout — nothing to migrate.' };
  }
  if (!config.aitriVersion) {
    return { ok: false, code: 'not-aitri', reason: 'Not an Aitri project (no aitriVersion in .aitri). Run: aitri adopt --upgrade first.' };
  }
  // Root-artifact aliases, all historically produced by Aitri itself:
  // '' (adopted/pre-v0.1.20 default), undefined (pre-field-era configs — the
  // code resolves it as root via `artifactsDir || ''`), and '.' (alpha-era
  // projects; path.join treats it as the project dir). Phase-D canaries
  // surfaced undefined (Drafts/T) and '.' (Zombite) as real-world states.
  const adir = config.artifactsDir;
  const rootArtifacts = adir === '' || adir === undefined || adir === '.';
  if (adir !== 'spec' && !rootArtifacts) {
    return {
      ok: false, code: 'custom-artifacts-dir',
      reason: `artifactsDir is '${adir}' — a custom location Aitri did not create. Migrate manually, then set layoutRoot/artifactsDir in .aitri.`,
    };
  }

  const git = gitState(dir);
  if (!git.repo) {
    return { ok: false, code: 'no-git', reason: 'Not a git repository. The migration\'s only recovery path is git — init and commit the project first.' };
  }
  if (!git.clean) {
    return { ok: false, code: 'dirty-tree', reason: 'Working tree is not clean. Commit or stash everything first — recovery from a failed move is `git checkout -- .`, which needs a clean baseline.' };
  }

  const containerPath = path.join(dir, 'aitri');
  if (fs.existsSync(containerPath)) {
    let empty = false;
    try { empty = fs.statSync(containerPath).isDirectory() && fs.readdirSync(containerPath).length === 0; }
    catch { empty = false; }
    if (!empty) {
      return {
        ok: false, code: 'container-collision',
        reason: 'An `aitri` path already exists at the project root and is not an empty directory. Inspect it (a partial previous migration?) and remove/restore before retrying.',
      };
    }
  }

  const moves = [];
  const notes = [];
  const addIfExists = (relFrom, relTo) => {
    const abs = path.join(dir, relFrom);
    if (!fs.existsSync(abs)) return;
    const kind = fs.statSync(abs).isDirectory() ? 'dir' : 'file';
    moves.push({ from: relFrom, to: relTo, kind });
  };

  addIfExists('IDEA.md', 'aitri/product/IDEA.md');
  addIfExists('idea_context', 'aitri/product/idea_context');
  // Archived seed (rc.80): file-level move — the bare `archive/` DIR is not
  // moved wholesale because the name is generic enough to be user-owned.
  addIfExists('archive/IDEA.md', 'aitri/product/archive/IDEA.md');
  addIfExists('BACKLOG.md', 'aitri/BACKLOG.md');
  addIfExists('features', 'aitri/features');

  if (adir === 'spec') {
    addIfExists('spec', 'aitri/product/spec');
  } else {
    // Root-artifact legacy project ('', undefined, '.'): move each known artifact file.
    for (const f of knownArtifactFiles()) addIfExists(f, `aitri/product/spec/${f}`);
  }

  if (fs.existsSync(path.join(dir, 'idea'))) {
    notes.push('A legacy `idea/` folder exists — it is NOT moved (it was deprecated in favor of idea_context/). Move its assets into the new idea_context/ location yourself.');
  }
  notes.push('Artifact CONTENT is not rewritten: if manifests/test_runner hardcode old paths (e.g. `cd spec && …`), the agent must update them — Aitri flags, never edits content.');
  notes.push('Agent instruction files (AGENTS.md, CLAUDE.md, GEMINI.md, .codex/, .github/) will be REGENERATED with layout-correct paths — these files are Aitri-generated; hand edits to them are not preserved.');

  return { ok: true, moves, notes };
}

/**
 * Execute a previously planned migration. Caller MUST have confirmed (adopt.js
 * owns the dry-run/isTTY gates). Re-plans internally so the gates are enforced
 * even if invoked directly.
 *
 * No rollback: a mid-move failure leaves the version/config untouched (config
 * is written LAST) — recovery is `git checkout -- .` plus removing aitri/.
 *
 * @returns {{ moved: Array<{from: string, to: string}>, agentFiles: string[] }}
 */
export function executeLayoutMigration(dir, rootDir) {
  const plan = planLayoutMigration(dir);
  if (!plan.ok) throw new Error(plan.reason);

  fs.mkdirSync(path.join(dir, 'aitri', 'product'), { recursive: true });

  const moved = [];
  for (const m of plan.moves) {
    const dest = path.join(dir, m.to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(path.join(dir, m.from), dest);
    moved.push({ from: m.from, to: m.to });
  }

  // Config is written AFTER all moves succeeded — a mid-move crash leaves the
  // old config pointing at the old layout, so `git checkout -- .` restores a
  // coherent project.
  const config = loadConfig(dir);
  config.layoutRoot   = 'aitri';
  config.artifactsDir = 'aitri/product/spec';
  appendEvent(config, 'layout_migrated', 'upgrade', { container: 'aitri' });
  saveConfig(dir, config);

  const agentFiles = regenerateAgentFiles(dir, rootDir, config);

  return { moved, agentFiles };
}
