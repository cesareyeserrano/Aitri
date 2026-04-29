/**
 * Module: Aitri State Manager
 * Purpose: Load/save .aitri config and read project artifacts.
 *          Shared by CLI and MCP server.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const CONFIG_FILE = '.aitri';

const DEFAULTS = { currentPhase: 0, approvedPhases: [], completedPhases: [] };

/**
 * Canonical phase-key form. Core phases are stored as numbers (1-5);
 * optional phases are stored as strings ('ux', 'discovery', 'review').
 *
 * If a numeric string sneaks into a phase-key array (canary 2026-04-27 saw
 * `approve ux` route to `requirements` instead of `architecture`, hypothesis:
 * approvedPhases was persisted as `["1"]` instead of `[1]`), `Set.has(1)`
 * misses and the next-action emitter picks the wrong branch. We canonicalise
 * at both load and save boundaries so downstream `Set.has(<number>)` and
 * alias matches work regardless of which write-path produced the value.
 */
function canonicalPhaseKey(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return value;
}

function canonicalisePhaseArrays(config) {
  for (const k of ['approvedPhases', 'completedPhases', 'driftPhases']) {
    if (Array.isArray(config[k])) {
      config[k] = config[k].map(canonicalPhaseKey);
    }
  }
  return config;
}

/**
 * Resolve the config file path.
 * If .aitri already exists as a directory (e.g. a pre-existing docs folder),
 * store the JSON config inside it as .aitri/config.json.
 */
function configFilePath(dir) {
  const p = path.join(dir, CONFIG_FILE);
  try {
    if (fs.statSync(p).isDirectory()) return path.join(p, 'config.json');
  } catch {}
  return p;
}

export function hashArtifact(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function loadConfig(dir) {
  const p = configFilePath(dir);
  if (!fs.existsSync(p)) return { ...DEFAULTS };

  let raw;
  try {
    // Strip BOM if present (added by some text editors)
    raw = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    process.stderr.write(`[aitri] Warning: .aitri config is malformed — backing up to .aitri.bak and resetting.\n`);
    try { fs.copyFileSync(p, p + '.bak'); } catch {}
    return { ...DEFAULTS };
  }

  // Merge defaults so missing fields never cause undefined errors (backward compat)
  return canonicalisePhaseArrays({ ...DEFAULTS, ...raw });
}

const LOCK_FILE      = '.aitri.lock';
const LOCK_STALE_MS  = 5000;

function acquireLock(dir) {
  const lockPath = path.join(dir, LOCK_FILE);
  try {
    const fd = fs.openSync(lockPath, 'wx');  // O_EXCL — atomic on POSIX
    fs.closeSync(fd);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // Lock exists — check if stale
    try {
      const age = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (age > LOCK_STALE_MS) {
        process.stderr.write(`[aitri] Warning: stale lock removed (${Math.round(age / 1000)}s old)\n`);
        fs.unlinkSync(lockPath);
        const fd = fs.openSync(lockPath, 'wx');
        fs.closeSync(fd);
      } else {
        throw new Error(
          `[aitri] State file locked — another process may be writing.\n` +
          `  Remove ${lockPath} if this persists.`
        );
      }
    } catch (e2) {
      if (e2.message.includes('locked')) throw e2;
      // stat/unlink raced with another process — proceed without lock (best-effort)
    }
  }
}

function releaseLock(dir) {
  try { fs.unlinkSync(path.join(dir, LOCK_FILE)); } catch { /* already removed — fine */ }
}

export function saveConfig(dir, config) {
  acquireLock(dir);
  try {
    const dest    = configFilePath(dir);
    canonicalisePhaseArrays(config);
    const content = JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2);

    // Atomic write: temp file in same directory ensures same filesystem (avoids EXDEV on tmpfs)
    const tmp = path.join(dir, `.aitri-${process.pid}.tmp`);
    try {
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, dest);
    } finally {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    }
  } finally {
    releaseLock(dir);
  }
}

/**
 * Resolve the path to an Aitri pipeline artifact.
 * Respects config.artifactsDir ('spec' for new projects, '' for old projects).
 */
export function artifactPath(dir, config, name) {
  const d = config?.artifactsDir || '';
  return d ? path.join(dir, d, name) : path.join(dir, name);
}

const EVENT_CAP = 20;

/**
 * Append a pipeline event to config.events (capped at EVENT_CAP).
 * Mutates config in place — caller must saveConfig afterwards.
 *
 * @param {object} config - Mutable config object from loadConfig().
 * @param {'completed'|'approved'|'rejected'} event - Event type.
 * @param {number|string} phase - Phase identifier.
 * @param {object} [extra] - Optional extra fields (e.g. { feedback }).
 */
export function appendEvent(config, event, phase, extra = {}) {
  if (!Array.isArray(config.events)) config.events = [];
  config.events.push({ at: new Date().toISOString(), event, phase, ...extra });
  if (config.events.length > EVENT_CAP) config.events = config.events.slice(-EVENT_CAP);
}

// ── Last Session (auto-checkpoint) ────────────────────────────────────────────

/**
 * Detect the current agent from well-known environment variables.
 * Returns a short identifier or 'unknown'.
 */
export function detectAgent() {
  const env = process.env;
  if (env.CLAUDE_CODE)          return 'claude';
  if (env.CLAUDE_CODE_ENTRY)    return 'claude';
  if (env.CODEX_CLI)            return 'codex';
  if (env.GEMINI_CLI)           return 'gemini';
  if (env.OPENCODE)             return 'opencode';
  if (env.CURSOR_TRACE_ID)     return 'cursor';
  return 'unknown';
}

/**
 * Gather list of files changed since last checkpoint via git diff.
 * Returns array of relative paths, or empty array if git is unavailable.
 */
function getFilesTouched(dir) {
  try {
    const out = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only 2>/dev/null', {
      cwd: dir, encoding: 'utf8', timeout: 5000
    });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Write lastSession to config. Called automatically by state-mutating commands.
 * Mutates config in place — caller must saveConfig afterwards.
 *
 * @param {object} config - Mutable config object.
 * @param {string} dir - Project root.
 * @param {string} event - What triggered the checkpoint (e.g. 'complete requirements').
 * @param {string} [context] - Optional agent/user-provided context.
 */
export function writeLastSession(config, dir, event, context) {
  const files = getFilesTouched(dir);
  config.lastSession = {
    at: new Date().toISOString(),
    agent: detectAgent(),
    event,
    ...(files.length > 0 && { files_touched: files }),
    ...(context && { context }),
  };
}

export function readArtifact(dir, filename, artifactsDir = '') {
  const p = artifactsDir ? path.join(dir, artifactsDir, filename) : path.join(dir, filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/**
 * Mark a phase as drifted in the stored driftPhases[] array.
 * Mutates config in place — caller must saveConfig afterwards.
 */
export function setDriftPhase(config, phaseKey) {
  const k = String(phaseKey);
  const arr = (config.driftPhases || []).map(String);
  if (!arr.includes(k)) config.driftPhases = [...arr, k];
}

/**
 * Remove a phase from the stored driftPhases[] array.
 * Mutates config in place — caller must saveConfig afterwards.
 */
export function clearDriftPhase(config, phaseKey) {
  const k = String(phaseKey);
  config.driftPhases = (config.driftPhases || []).map(String).filter(x => x !== k);
}

/**
 * Cascade invalidation map — phases that must be reset when a given phase is re-approved.
 * Keys are string representations of phase keys (numbers or aliases).
 * Downstream phases are removed from approvedPhases, completedPhases, and artifactHashes.
 *
 *   requirements (1) → ux, 2, 3, 4, 5, review
 *   ux               → 2, 3, 4, 5, review
 *   architecture (2) → 3, 4, 5, review
 *   tests        (3) → 4, 5
 *   build        (4) → 5
 *   deploy       (5) → (nothing)
 *   discovery        → (nothing — optional pre-phase, advisory only)
 *   review           → (nothing — audit artifact, post-build)
 */
const CASCADE_DOWNSTREAM = {
  '1':         ['ux', 2, 3, 4, 5, 'review'],
  'ux':        [2, 3, 4, 5, 'review'],
  '2':         [3, 4, 5, 'review'],
  '3':         [4, 5],
  '4':         [5],
  '5':         [],
  'discovery': [],
  'review':    [],
};

/**
 * Invalidate all downstream phases after a re-approval.
 * Mutates config in place — caller must saveConfig afterwards.
 * Returns the list of phase keys that were actually removed (for display).
 */
export function cascadeInvalidate(config, phaseKey) {
  const downstream = CASCADE_DOWNSTREAM[String(phaseKey)] ?? [];
  if (!downstream.length) return [];

  const downstreamSet = new Set(downstream.map(String));
  const invalidated   = [];

  for (const p of downstream) {
    const k = String(p);
    const wasTracked =
      (config.approvedPhases  || []).some(x => String(x) === k) ||
      (config.completedPhases || []).some(x => String(x) === k);
    if (wasTracked) invalidated.push(p);
  }

  config.approvedPhases  = (config.approvedPhases  || []).filter(p => !downstreamSet.has(String(p)));
  config.completedPhases = (config.completedPhases || []).filter(p => !downstreamSet.has(String(p)));

  if (config.artifactHashes) {
    for (const p of downstream) delete config.artifactHashes[String(p)];
  }

  for (const p of downstream) clearDriftPhase(config, p);

  // Reset verify + normalize state if build or deploy is in the cascade
  if (downstream.some(p => String(p) === '4' || String(p) === '5')) {
    config.verifyPassed  = false;
    delete config.verifySummary;
    delete config.normalizeState;
  }

  return invalidated;
}

/**
 * Check if a phase artifact has drifted since approval.
 * Fast-path: trusts driftPhases[] (set by run-phase when re-running an approved phase).
 * Dynamic-path: compares current artifact hash against stored hash at approval time.
 */
export function hasDrift(dir, config, phaseKey, artifactFile) {
  if (Array.isArray(config.driftPhases) &&
      config.driftPhases.map(String).includes(String(phaseKey))) {
    return true;
  }
  const stored = (config.artifactHashes || {})[String(phaseKey)];
  if (!stored) return false;
  try {
    const content = fs.readFileSync(artifactPath(dir, config, artifactFile), 'utf8');
    return hashArtifact(content) !== stored;
  } catch { return false; }
}
