/**
 * Module: Aitri State Manager
 * Purpose: Load/save .aitri config and read project artifacts.
 *          Shared by CLI and MCP server.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';

const CONFIG_FILE = '.aitri';
const LOCAL_FILE  = 'local.json';

// Per-machine fields (ADR-045). These live in the gitignored `.aitri.local` (a sibling
// of the shared, tracked `.aitri` config file); everything else is shared, in `.aitri`.
// Denylist by design: any NEW field defaults to shared/tracked — the safe default for the
// integration contract (a shared field going local is invisible to teammates and breaks
// the contract; the reverse is only git noise).
const LOCAL_FIELDS = ['lastSession', 'reconcileState', 'sessionContext'];

const DEFAULTS = { currentPhase: 0, approvedPhases: [], completedPhases: [] };

/** Deep structural equality (order-independent for objects, order-sensitive for arrays). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

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
 * Whether `.aitri` is a directory — the rare collision layout (a pre-existing `.aitri`
 * folder), where the shared config lives at `.aitri/config.json`. The normal layout is
 * `.aitri` as a single file (shared) + `.aitri.local` sibling (per-machine), ADR-045.
 */
function isDirLayout(dir) {
  try { return fs.statSync(path.join(dir, CONFIG_FILE)).isDirectory(); }
  catch { return false; }
}

/**
 * Resolve the shared config path: `.aitri` (the normal single file) or
 * `.aitri/config.json` (the directory-collision layout).
 */
function configFilePath(dir) {
  const p = path.join(dir, CONFIG_FILE);
  return isDirLayout(dir) ? path.join(p, 'config.json') : p;
}

/**
 * Resolve the per-machine local path (ADR-045): `.aitri.local`, a sibling of the
 * `.aitri` config file — or `.aitri/local.json` in the directory-collision layout.
 */
function localFilePath(dir) {
  return isDirLayout(dir) ? path.join(dir, CONFIG_FILE, LOCAL_FILE) : path.join(dir, CONFIG_FILE + '.local');
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

  // Split layout (ADR-045): merge the per-machine local file over the shared config so
  // the rest of the codebase still sees ONE config object. A missing local file is the
  // normal case for a fresh clone / legacy project; a malformed one is non-fatal (it is
  // per-machine and re-establishable).
  let local = {};
  const lp = localFilePath(dir);
  if (fs.existsSync(lp)) {
    try { local = JSON.parse(fs.readFileSync(lp, 'utf8').replace(/^\uFEFF/, '')); }
    catch { local = {}; }
  }

  // Merge defaults so missing fields never cause undefined errors (backward compat)
  return canonicalisePhaseArrays({ ...DEFAULTS, ...raw, ...local });
}

/**
 * True when `dir` already has an Aitri config file (either the flat `.aitri` or the
 * directory-collision `.aitri/config.json` layout). Lets callers detect an existing
 * pipeline without resolving the layout themselves — the path knowledge stays here.
 */
export function configExists(dir) {
  return fs.existsSync(configFilePath(dir));
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
      // A vanished lock (ENOENT — another process released it mid-check) is safe
      // to proceed past silently. Any OTHER failure (e.g. EACCES on stat/unlink)
      // means we could not establish lock state: still proceed best-effort, but
      // SURFACE it — a silent unlocked write is the real hazard, not the proceed.
      if (e2.code !== 'ENOENT')
        process.stderr.write(
          `[aitri] Warning: could not verify the state lock (${e2.code || e2.message}); ` +
          `proceeding best-effort. Avoid running concurrent aitri processes on this project.\n`
        );
    }
  }
}

function releaseLock(dir) {
  try { fs.unlinkSync(path.join(dir, LOCK_FILE)); } catch { /* already removed — fine */ }
}

/**
 * Atomic write: temp file in the SAME directory as dest (same filesystem → no EXDEV
 * on tmpfs), then rename. Creates the destination directory if needed (the `.aitri/`
 * split layout). Tmp name is unique per dest + pid so two writes in one save never
 * collide.
 */
function atomicWrite(dest, content) {
  const destDir = path.dirname(dest);
  fs.mkdirSync(destDir, { recursive: true });
  const tmp = path.join(destDir, `.tmp-${process.pid}-${path.basename(dest)}`);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, dest);
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
  }
}

/**
 * Split-layout write (ADR-045). `local.json` is written every time (gitignored — churn
 * is free). `config.json` is written ONLY when a shared field other than `updatedAt`
 * actually changed, so a local-only change (e.g. lastSession) does not bump `updatedAt`
 * and re-dirty the tracked file — that churn is exactly the noise the split removes.
 */
function saveSplit(dir, config) {
  const local = {}, shared = {};
  for (const [k, v] of Object.entries(config)) {
    (LOCAL_FIELDS.includes(k) ? local : shared)[k] = v;
  }

  atomicWrite(localFilePath(dir), JSON.stringify(local, null, 2));

  const cp = configFilePath(dir);
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(cp, 'utf8').replace(/^\uFEFF/, '')); } catch { prev = null; }

  const strip = (o) => { if (!o) return null; const { updatedAt, ...rest } = o; return rest; };
  if (prev === null || !deepEqual(strip(shared), strip(prev))) {
    atomicWrite(cp, JSON.stringify({ ...shared, updatedAt: new Date().toISOString() }, null, 2));
  }
}

export function saveConfig(dir, config) {
  acquireLock(dir);
  try {
    canonicalisePhaseArrays(config);
    // Always split (ADR-045): shared fields → `.aitri`, per-machine → `.aitri.local`.
    // An old single-file `.aitri` (with per-machine fields inline) auto-migrates on its
    // first save — the shared file is rewritten without them and `.aitri.local` appears.
    saveSplit(dir, config);
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

/**
 * Persist the narrative session context (the "what/why/next" thread) in a field
 * that SURVIVES later state transitions — unlike lastSession, which every
 * state-mutating command overwrites (so context written via `checkpoint --context`
 * used to be wiped by the next `approve`/`complete`). Per-machine (.aitri.local):
 * the narrative is a personal thread; cross-dev action traceability lives in the
 * shared events[]. Carries its own timestamp so `resume` can flag staleness.
 * (TPA-5, third-party adopter A9. No LLM call — this is the free, mechanical half;
 * the agent still writes the text, Aitri only stops losing it.)
 * Mutates config in place — caller must saveConfig afterwards.
 *
 * @param {object} config - Mutable config object.
 * @param {string} text - The narrative context to persist.
 */
export function writeSessionContext(config, text) {
  config.sessionContext = { text, at: new Date().toISOString() };
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

  // Reset verify + reconcile state if build or deploy is in the cascade
  if (downstream.some(p => String(p) === '4' || String(p) === '5')) {
    config.verifyPassed  = false;
    delete config.verifySummary;
    delete config.reconcileState;
  }

  // C5b: mark the reset phases as cascade-pending so the next-action builder can
  // tell "reset by a real upstream change → re-derive (run-phase)" from "being
  // authored for the first time → complete". Cleared when the phase is completed
  // or re-approved (clearCascadePending). Only phases that were actually tracked
  // (in `invalidated`) get marked — an untracked downstream phase was never
  // approved, so its in_progress is genuine authoring, not a reset.
  if (invalidated.length) {
    config.cascadedPhases = [
      ...new Set([...(config.cascadedPhases || []).map(String), ...invalidated.map(String)]),
    ];
  }

  return invalidated;
}

/**
 * C5b: clear a phase's cascade-pending mark — called when the phase is completed
 * or re-approved (it has now been re-derived against the new upstream, so the
 * next action reverts to the normal complete/approve ladder).
 */
export function clearCascadePending(config, phaseKey) {
  const k = String(phaseKey);
  config.cascadedPhases = (config.cascadedPhases || []).map(String).filter(x => x !== k);
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

// ── Project-root discovery ────────────────────────────────────────────────────

/**
 * Walk up from startDir looking for an ancestor that contains a `.aitri/`
 * directory. Returns the absolute path of that ancestor, or null if none is
 * found before hitting the filesystem root.
 *
 * Used to resolve the root project dir when operating in feature scope —
 * approve, reconcile baseline advance, and any cross-scope bookkeeping rely on it.
 */
export function findProjectRoot(startDir) {
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

/**
 * C2: a stray `~/.aitri` captures every cwd beneath it — the dispatcher's
 * upward `.aitri` search resolves any unrelated directory under $HOME to the
 * $HOME project and commands then project that ancestor's state with no signal.
 *
 * Returns a one-line note when the resolution walked up to $HOME exactly (cwd
 * is not its own project), else null (unambiguous resolution — say nothing).
 * Pure: no fs, no stdout — the caller decides whether/where to print.
 */
export function homedirCaptureNote(cwd, resolvedDir, homedir = os.homedir()) {
  const c = path.resolve(cwd);
  const r = path.resolve(resolvedDir);
  if (r === c) return null;                       // cwd is its own project — no walk
  if (r !== path.resolve(homedir)) return null;   // resolved elsewhere — legitimate ancestor
  return `No .aitri here — resolved to the project at $HOME (${r}).\n` +
         `   If you meant to start a new project here, run: aitri init`;
}

// ── Reconcile baseline ────────────────────────────────────────────────────────

/**
 * Stamp `reconcileState` at the current git HEAD (or timestamp fallback).
 * Used by `approve build` to record the post-build baseline. Called for the
 * scope being approved AND — when approving in feature scope — for the root
 * project, so root drift detection does not flag legitimately-approved feature
 * implementation files as off-pipeline changes.
 *
 * Pure write: no validation, no event log. The caller decides when to advance.
 * The contract is documented in `docs/integrations/SCHEMA.md` (`reconcileState`).
 */
export function stampReconcileBaseline(targetDir) {
  let baseRef, method;
  try {
    baseRef = execSync('git rev-parse HEAD', { cwd: targetDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    method  = 'git';
  } catch {
    baseRef = new Date().toISOString();
    method  = 'mtime';
  }
  const config = loadConfig(targetDir);
  if (!config.aitriVersion) return null;  // not an Aitri project — no-op
  config.reconcileState = { baseRef, method, status: 'resolved', lastRun: new Date().toISOString() };
  saveConfig(targetDir, config);
  return { baseRef, method };
}
