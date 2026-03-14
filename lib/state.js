/**
 * Module: Aitri State Manager
 * Purpose: Load/save .aitri config and read project artifacts.
 *          Shared by CLI and MCP server.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CONFIG_FILE = '.aitri';

const DEFAULTS = { currentPhase: 0, approvedPhases: [], completedPhases: [] };

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
  return { ...DEFAULTS, ...raw };
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

export function readArtifact(dir, filename, artifactsDir = '') {
  const p = artifactsDir ? path.join(dir, artifactsDir, filename) : path.join(dir, filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
