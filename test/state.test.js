import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { loadConfig, saveConfig, readArtifact, artifactPath, hashArtifact, writeLastSession, detectAgent, cascadeInvalidate, configExists, homedirCaptureNote, clearCascadePending, atomicWrite } from '../lib/state.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-state-test-'));
}

describe('loadConfig()', () => {

  it('returns defaults when .aitri does not exist', () => {
    const dir = tmpDir();
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, []);
    assert.deepEqual(cfg.completedPhases, []);
    assert.equal(cfg.currentPhase, 0);
    fs.rmSync(dir, { recursive: true });
  });

  it('loads valid config from .aitri', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ approvedPhases: [1, 2], currentPhase: 2 }));
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, [1, 2]);
    assert.equal(cfg.currentPhase, 2);
    fs.rmSync(dir, { recursive: true });
  });

  it('merges defaults for missing fields (backward compat)', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ approvedPhases: [1] }));
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.completedPhases, [], 'completedPhases default must be applied when missing');
    assert.equal(cfg.currentPhase, 0, 'currentPhase default must be applied when missing');
    fs.rmSync(dir, { recursive: true });
  });

  it('returns defaults on malformed JSON', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), '{not valid json');
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, []);
    assert.deepEqual(cfg.completedPhases, []);
    fs.rmSync(dir, { recursive: true });
  });

  it('creates .aitri.bak when config is malformed', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), '{not valid json');
    loadConfig(dir);
    assert.ok(fs.existsSync(path.join(dir, '.aitri.bak')), '.aitri.bak must exist after malformed config');
    fs.rmSync(dir, { recursive: true });
  });

  it('handles BOM-prefixed config file', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), '\uFEFF' + JSON.stringify({ approvedPhases: [1, 2] }));
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, [1, 2], 'BOM must be stripped before parsing');
    fs.rmSync(dir, { recursive: true });
  });

  it('R3-17: coerces a malformed array field (wrong type) to [] instead of crashing the snapshot', () => {
    const dir = tmpDir();
    // Valid JSON, but approvedPhases was hand-edited to an object \u2014 would crash
    // downstream .map/.has in the snapshot SSoT (resume/status/validate).
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ approvedPhases: {}, completedPhases: 'oops', currentPhase: 1 }));
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, [], 'object array-field must coerce to []');
    assert.deepEqual(cfg.completedPhases, [], 'string array-field must coerce to []');
    assert.equal(cfg.currentPhase, 1, 'non-array fields are untouched');
    fs.rmSync(dir, { recursive: true });
  });

  it('R3-17: leaves genuine object fields (rejections/frSnapshots/artifactHashes) untouched', () => {
    const dir = tmpDir();
    const rejections = { '1': 'redo' };
    const frSnapshots = { '1': ['FR-1'] };
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ rejections, frSnapshots, approvedPhases: [1] }));
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.rejections, rejections, 'object field must not be coerced to []');
    assert.deepEqual(cfg.frSnapshots, frSnapshots, 'object field must not be coerced to []');
    assert.deepEqual(cfg.approvedPhases, [1]);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('saveConfig()', () => {

  it('writes config to .aitri as JSON', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [1, 2], currentPhase: 2 });
    const raw = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.deepEqual(raw.approvedPhases, [1, 2]);
    assert.equal(raw.currentPhase, 2);
    fs.rmSync(dir, { recursive: true });
  });

  it('adds updatedAt timestamp to saved config', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [] });
    const raw = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.ok(raw.updatedAt, 'updatedAt must be present');
    assert.doesNotThrow(() => new Date(raw.updatedAt), 'updatedAt must be a valid ISO date');
    fs.rmSync(dir, { recursive: true });
  });

  it('saved config is readable by loadConfig (round-trip)', () => {
    const dir = tmpDir();
    const original = { approvedPhases: [1, 2, 3], currentPhase: 3, completedPhases: [1, 2, 3] };
    saveConfig(dir, original);
    const loaded = loadConfig(dir);
    assert.deepEqual(loaded.approvedPhases, original.approvedPhases);
    assert.equal(loaded.currentPhase, original.currentPhase);
    assert.deepEqual(loaded.completedPhases, original.completedPhases);
    fs.rmSync(dir, { recursive: true });
  });

  it('overwrites existing config on repeated saves', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [1] });
    saveConfig(dir, { approvedPhases: [1, 2] });
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, [1, 2]);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('split layout — .aitri (shared) + .aitri.local (per-machine) (ADR-045)', () => {
  const cp = (dir) => path.join(dir, '.aitri');          // shared, tracked
  const lp = (dir) => path.join(dir, '.aitri.local');    // per-machine, gitignored
  const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

  it('loadConfig merges .aitri (shared) + .aitri.local (per-machine)', () => {
    const dir = tmpDir();
    fs.writeFileSync(cp(dir), JSON.stringify({ approvedPhases: [1], aitriVersion: 'x' }));
    fs.writeFileSync(lp(dir), JSON.stringify({ lastSession: { agent: 'claude' }, reconcileState: { baseRef: 'abc' } }));
    const c = loadConfig(dir);
    assert.deepEqual(c.approvedPhases, [1]);
    assert.equal(c.lastSession.agent, 'claude');
    assert.equal(c.reconcileState.baseRef, 'abc');
  });

  // ADV-0622-25: when the same key exists in BOTH files, the merge `{...raw, ...local}`
  // makes the per-machine local file win. This was undefined+untested; pin it so a future
  // merge-order change is caught (a per-machine override silently shadowing shared state).
  it('loadConfig: .aitri.local takes precedence over .aitri on a key collision', () => {
    const dir = tmpDir();
    fs.writeFileSync(cp(dir), JSON.stringify({ aitriVersion: 'shared', currentPhase: 1 }));
    fs.writeFileSync(lp(dir), JSON.stringify({ aitriVersion: 'local' }));
    const c = loadConfig(dir);
    assert.equal(c.aitriVersion, 'local', 'a colliding key resolves to the per-machine local value');
    assert.equal(c.currentPhase, 1, 'non-colliding shared keys are preserved');
    fs.rmSync(dir, { recursive: true });
  });

  // ADV-0622-25: a malformed per-machine local file is non-fatal (it is re-establishable)
  // — loadConfig must degrade to the shared config, not throw.
  it('loadConfig: a malformed .aitri.local degrades gracefully to the shared config', () => {
    const dir = tmpDir();
    fs.writeFileSync(cp(dir), JSON.stringify({ aitriVersion: 'x', approvedPhases: [1, 2] }));
    fs.writeFileSync(lp(dir), '{ not valid json');
    let c;
    assert.doesNotThrow(() => { c = loadConfig(dir); }, 'a malformed .aitri.local must not throw');
    assert.deepEqual(c.approvedPhases, [1, 2], 'shared config still loads when local is garbage');
    fs.rmSync(dir, { recursive: true });
  });

  it('saveConfig partitions: shared → .aitri, per-machine → .aitri.local', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [1, 2], aitriVersion: 'x', lastSession: { agent: 'codex' }, reconcileState: { baseRef: 'def' } });
    const shared = readJSON(cp(dir));
    const local  = readJSON(lp(dir));
    assert.deepEqual(shared.approvedPhases, [1, 2]);
    assert.ok(!('lastSession' in shared) && !('reconcileState' in shared), 'per-machine fields must NOT be in .aitri');
    assert.equal(local.lastSession.agent, 'codex');
    assert.equal(local.reconcileState.baseRef, 'def');
    assert.ok(!('approvedPhases' in local), 'shared fields must NOT be in .aitri.local');
  });

  it('does NOT rewrite .aitri on a local-only change (no updatedAt churn)', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [1], aitriVersion: 'x', lastSession: { agent: 'a' } });
    const firstStamp = readJSON(cp(dir)).updatedAt;
    // change ONLY a per-machine field; the shared partition is identical
    saveConfig(dir, { approvedPhases: [1], aitriVersion: 'x', lastSession: { agent: 'b' } });
    assert.equal(readJSON(cp(dir)).updatedAt, firstStamp, '.aitri must stay byte-identical (no updatedAt bump) on a local-only save');
    assert.equal(readJSON(lp(dir)).lastSession.agent, 'b', '.aitri.local must update');
  });

  it('does NOT re-churn .aitri when a shared field is set to undefined (ADV-23)', () => {
    const dir = tmpDir();
    // A shared field explicitly set to undefined is dropped by JSON.stringify on write,
    // so it never reaches disk — and must not make the no-churn compare think the shape changed.
    saveConfig(dir, { approvedPhases: [1], aitriVersion: 'x', someField: undefined });
    const firstStamp = readJSON(cp(dir)).updatedAt;
    saveConfig(dir, { approvedPhases: [1], aitriVersion: 'x', someField: undefined });
    assert.equal(readJSON(cp(dir)).updatedAt, firstStamp,
      'an undefined shared field must not re-dirty .aitri (no updatedAt churn) every save');
  });

  it('DOES rewrite .aitri when a shared field changes', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [1], aitriVersion: 'x', lastSession: { agent: 'a' } });
    saveConfig(dir, { approvedPhases: [1, 2], aitriVersion: 'x', lastSession: { agent: 'a' } });
    assert.deepEqual(readJSON(cp(dir)).approvedPhases, [1, 2], '.aitri must reflect the shared change');
  });

  it('an old single-file .aitri (per-machine fields inline) auto-migrates on first save', () => {
    const dir = tmpDir();
    fs.writeFileSync(cp(dir), JSON.stringify({ approvedPhases: [1], aitriVersion: 'x', lastSession: { agent: 'old' } }));
    saveConfig(dir, loadConfig(dir));   // first save splits it
    assert.ok(!('lastSession' in readJSON(cp(dir))), 'per-machine field migrated out of .aitri');
    assert.equal(readJSON(lp(dir)).lastSession.agent, 'old', 'per-machine field now lives in .aitri.local');
  });

  it('round-trips through loadConfig after a split save', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [1, 2, 3], aitriVersion: 'x', reconcileState: { baseRef: 'sha', method: 'git', status: 'resolved' } });
    const c = loadConfig(dir);
    assert.deepEqual(c.approvedPhases, [1, 2, 3]);
    assert.equal(c.reconcileState.baseRef, 'sha');
  });

  it('directory-collision layout still works (.aitri/ as a dir → config.json + local.json)', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.aitri'));
    saveConfig(dir, { approvedPhases: [1], aitriVersion: 'x', lastSession: { agent: 'z' } });
    assert.deepEqual(readJSON(path.join(dir, '.aitri', 'config.json')).approvedPhases, [1]);
    assert.equal(readJSON(path.join(dir, '.aitri', 'local.json')).lastSession.agent, 'z');
    assert.equal(loadConfig(dir).lastSession.agent, 'z');
  });

  it('configExists detects both layouts and the absence of any config', () => {
    const flat = tmpDir();
    fs.writeFileSync(cp(flat), JSON.stringify({ aitriVersion: 'x' }));
    assert.equal(configExists(flat), true, 'flat .aitri file must be detected');

    const collision = tmpDir();
    fs.mkdirSync(path.join(collision, '.aitri'));
    fs.writeFileSync(path.join(collision, '.aitri', 'config.json'), JSON.stringify({ aitriVersion: 'x' }));
    assert.equal(configExists(collision), true, 'directory-collision config.json must be detected');

    assert.equal(configExists(tmpDir()), false, 'a fresh dir has no config');
  });
});

// ADV-0622-33: atomicWrite is now exported so artifact/data writers (04_TEST_RESULTS.json,
// BUGS.json, BACKLOG.json) avoid mid-write truncation on a kill.
describe('atomicWrite()', () => {
  it('writes content and leaves no .tmp file behind', () => {
    const dir = tmpDir();
    const dest = path.join(dir, 'out.json');
    atomicWrite(dest, JSON.stringify({ ok: true }));
    assert.equal(JSON.parse(fs.readFileSync(dest, 'utf8')).ok, true);
    const leftovers = fs.readdirSync(dir).filter(f => f.startsWith('.tmp-'));
    assert.equal(leftovers.length, 0, 'no temp file should remain after an atomic write');
    fs.rmSync(dir, { recursive: true });
  });

  it('overwrites an existing file atomically (via rename)', () => {
    const dir = tmpDir();
    const dest = path.join(dir, 'out.json');
    fs.writeFileSync(dest, 'old');
    atomicWrite(dest, 'new');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'new');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('homedirCaptureNote() — C2 stray ~/.aitri capture', () => {
  const home = '/Users/demo';

  it('returns null when cwd is its own project (resolvedDir === cwd)', () => {
    assert.equal(homedirCaptureNote('/Users/demo/proj', '/Users/demo/proj', home), null);
  });

  it('returns null when resolved to a non-$HOME ancestor (legitimate walk-up)', () => {
    // cwd was a spec/ subdir; resolved to the real project root, not $HOME.
    assert.equal(homedirCaptureNote('/Users/demo/proj/spec', '/Users/demo/proj', home), null);
  });

  it('returns a note when an empty dir under $HOME resolves to $HOME', () => {
    const note = homedirCaptureNote('/Users/demo/scratch', '/Users/demo', home);
    assert.ok(note, 'must surface a note');
    assert.match(note, /\$HOME/);
    assert.match(note, /aitri init/);
  });

  it('returns null when cwd IS $HOME (no walk happened)', () => {
    assert.equal(homedirCaptureNote('/Users/demo', '/Users/demo', home), null);
  });
});

describe('phase-key canonicalisation (state.js)', () => {
  // Defect: canary saw `approve ux` route to `requirements` instead of
  // `architecture` when phase 1 was approved. Hypothesis: an upstream write
  // path persisted `approvedPhases` as `["1"]` (string), making `Set.has(1)`
  // miss in approve.js. saveConfig + loadConfig now coerce numeric strings
  // back to numbers; alias keys ('ux', 'discovery', 'review') are preserved.

  it('loadConfig coerces numeric phase strings to numbers in approvedPhases', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      approvedPhases: ['1', 2, 'ux', '3'],
    }));
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, [1, 2, 'ux', 3]);
    fs.rmSync(dir, { recursive: true });
  });

  it('loadConfig preserves alias keys for optional phases', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      approvedPhases: ['ux', 'discovery', 'review'],
    }));
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.approvedPhases, ['ux', 'discovery', 'review']);
    fs.rmSync(dir, { recursive: true });
  });

  it('saveConfig canonicalises numeric phase strings before persisting', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: ['1', '2', 'ux'], completedPhases: ['1', '2', 'ux', '3'] });
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.deepEqual(onDisk.approvedPhases,  [1, 2, 'ux']);
    assert.deepEqual(onDisk.completedPhases, [1, 2, 'ux', 3]);
    fs.rmSync(dir, { recursive: true });
  });

  it('canonicalisation also covers driftPhases', () => {
    const dir = tmpDir();
    saveConfig(dir, { driftPhases: ['1', '2', 'ux'] });
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg.driftPhases, [1, 2, 'ux']);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('saveConfig() — file locking', () => {

  it('releases lock after successful save (no leftover .aitri.lock)', () => {
    const dir = tmpDir();
    saveConfig(dir, { approvedPhases: [1] });
    assert.ok(!fs.existsSync(path.join(dir, '.aitri.lock')), '.aitri.lock must not exist after save');
    fs.rmSync(dir, { recursive: true });
  });

  it('removes stale lock and proceeds when lock is older than 5s', () => {
    const dir = tmpDir();
    const lockPath = path.join(dir, '.aitri.lock');
    // Write a stale lock by backdating its mtime
    fs.writeFileSync(lockPath, '');
    const staleTime = new Date(Date.now() - 6000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    // Must not throw — stale lock should be removed and save should succeed
    assert.doesNotThrow(() => saveConfig(dir, { approvedPhases: [1] }));
    assert.ok(fs.existsSync(path.join(dir, '.aitri')), '.aitri must be written after stale lock removal');
    assert.ok(!fs.existsSync(lockPath), 'lock must be gone after save');
    fs.rmSync(dir, { recursive: true });
  });

  it('throws when a fresh lock file exists (concurrent writer)', () => {
    const dir = tmpDir();
    const lockPath = path.join(dir, '.aitri.lock');
    // Write a fresh lock (simulates another process actively writing)
    fs.writeFileSync(lockPath, '');

    assert.throws(
      () => saveConfig(dir, { approvedPhases: [1] }),
      /locked/
    );
    fs.rmSync(dir, { recursive: true });
  });
});

describe('saveConfig() — atomic write location', () => {

  it('temp file is created in project dir, not os.tmpdir()', () => {
    const dir = tmpDir();
    // We can't observe the temp file directly (it's deleted after rename),
    // but we can verify saveConfig succeeds and .aitri lands in the project dir.
    saveConfig(dir, { approvedPhases: [1] });
    assert.ok(fs.existsSync(path.join(dir, '.aitri')), '.aitri must be in project dir');
    // No leftover .aitri-<pid>.tmp file should remain
    const leftovers = fs.readdirSync(dir).filter(f => f.startsWith('.aitri-') && f.endsWith('.tmp'));
    assert.equal(leftovers.length, 0, 'no temp file must remain after save');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('hashArtifact()', () => {

  it('returns a 64-char hex string for any content', () => {
    const h = hashArtifact('hello world');
    assert.match(h, /^[a-f0-9]{64}$/, 'must be SHA-256 hex');
  });

  it('same content produces same hash', () => {
    assert.equal(hashArtifact('abc'), hashArtifact('abc'));
  });

  it('different content produces different hash', () => {
    assert.notEqual(hashArtifact('abc'), hashArtifact('abcd'));
  });

  it('empty string produces a valid hash', () => {
    const h = hashArtifact('');
    assert.match(h, /^[a-f0-9]{64}$/);
  });
});

describe('readArtifact()', () => {

  it('returns file content when file exists', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), '{"ok":true}');
    const content = readArtifact(dir, '01_REQUIREMENTS.json');
    assert.equal(content, '{"ok":true}');
    fs.rmSync(dir, { recursive: true });
  });

  it('returns null when file does not exist', () => {
    const dir = tmpDir();
    const content = readArtifact(dir, 'nonexistent.json');
    assert.equal(content, null);
    fs.rmSync(dir, { recursive: true });
  });

  it('reads from artifactsDir subdirectory when specified', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), '{"spec":true}');
    const content = readArtifact(dir, '01_REQUIREMENTS.json', 'spec');
    assert.equal(content, '{"spec":true}');
    fs.rmSync(dir, { recursive: true });
  });

  it('returns null when file is in root but artifactsDir is spec', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), '{"root":true}');
    const content = readArtifact(dir, '01_REQUIREMENTS.json', 'spec');
    assert.equal(content, null);
    fs.rmSync(dir, { recursive: true });
  });

  it('R3-16: strips a leading BOM so artifact JSON parses', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '03_TEST_CASES.json'), '\uFEFF{"ok":true}');
    const content = readArtifact(dir, '03_TEST_CASES.json');
    assert.equal(content, '{"ok":true}', 'BOM must be stripped from artifact content');
    assert.doesNotThrow(() => JSON.parse(content), 'stripped content must be valid JSON');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('artifactPath()', () => {

  it('returns path.join(dir, name) when config has no artifactsDir', () => {
    const p = artifactPath('/project', {}, '01_REQUIREMENTS.json');
    assert.equal(p, path.join('/project', '01_REQUIREMENTS.json'));
  });

  it('returns path.join(dir, artifactsDir, name) when config.artifactsDir is set', () => {
    const p = artifactPath('/project', { artifactsDir: 'spec' }, '01_REQUIREMENTS.json');
    assert.equal(p, path.join('/project', 'spec', '01_REQUIREMENTS.json'));
  });

  it('falls back to root path when artifactsDir is empty string', () => {
    const p = artifactPath('/project', { artifactsDir: '' }, '03_TEST_CASES.json');
    assert.equal(p, path.join('/project', '03_TEST_CASES.json'));
  });

  it('handles null/undefined config gracefully', () => {
    const p = artifactPath('/project', null, '02_SYSTEM_DESIGN.md');
    assert.equal(p, path.join('/project', '02_SYSTEM_DESIGN.md'));
  });
});

describe('detectAgent()', () => {

  it('returns "claude" when CLAUDE_CODE is set', () => {
    const orig = process.env.CLAUDE_CODE;
    process.env.CLAUDE_CODE = '1';
    assert.equal(detectAgent(), 'claude');
    if (orig === undefined) delete process.env.CLAUDE_CODE;
    else process.env.CLAUDE_CODE = orig;
  });

  it('returns "codex" when CODEX_CLI is set', () => {
    const orig = process.env.CODEX_CLI;
    process.env.CODEX_CLI = '1';
    assert.equal(detectAgent(), 'codex');
    if (orig === undefined) delete process.env.CODEX_CLI;
    else process.env.CODEX_CLI = orig;
  });

  it('returns "unknown" when no agent env vars are set', () => {
    const saved = {};
    for (const k of ['CLAUDE_CODE', 'CLAUDE_CODE_ENTRY', 'CODEX_CLI', 'GEMINI_CLI', 'OPENCODE', 'CURSOR_TRACE_ID']) {
      saved[k] = process.env[k]; delete process.env[k];
    }
    assert.equal(detectAgent(), 'unknown');
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
    }
  });
});

describe('writeLastSession()', () => {

  it('writes lastSession with event and timestamp', () => {
    const config = {};
    const dir = tmpDir();
    writeLastSession(config, dir, 'complete requirements');
    assert.ok(config.lastSession, 'lastSession must exist');
    assert.equal(config.lastSession.event, 'complete requirements');
    assert.ok(config.lastSession.at, 'must have timestamp');
    assert.ok(config.lastSession.agent, 'must have agent field');
    fs.rmSync(dir, { recursive: true });
  });

  it('includes context when provided', () => {
    const config = {};
    const dir = tmpDir();
    writeLastSession(config, dir, 'checkpoint', 'implementing FR-003');
    assert.equal(config.lastSession.context, 'implementing FR-003');
    fs.rmSync(dir, { recursive: true });
  });

  it('omits context when not provided', () => {
    const config = {};
    const dir = tmpDir();
    writeLastSession(config, dir, 'approve tests');
    assert.equal(config.lastSession.context, undefined);
    fs.rmSync(dir, { recursive: true });
  });

  it('persists through saveConfig round-trip', () => {
    const dir = tmpDir();
    const config = { approvedPhases: [1] };
    writeLastSession(config, dir, 'complete requirements', 'halfway through FR-001');
    saveConfig(dir, config);
    const loaded = loadConfig(dir);
    assert.equal(loaded.lastSession.event, 'complete requirements');
    assert.equal(loaded.lastSession.context, 'halfway through FR-001');
    fs.rmSync(dir, { recursive: true });
  });

  // TPA-10: getFilesTouched must work cross-platform. The HEAD→plain-diff fallback
  // (formerly a shell `||`) and stderr suppression (formerly POSIX `2>/dev/null`,
  // which cmd.exe cannot parse) are exercised here against a real git repo.
  it('records files_touched in a git repo with commits (HEAD-diff branch)', () => {
    const dir = tmpDir();
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email t@t.t && git config user.name t', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one');
    execSync('git add -A && git commit -q -m init', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'two'); // tracked modification → shows in diff
    const config = {};
    writeLastSession(config, dir, 'complete requirements');
    assert.deepEqual(config.lastSession.files_touched, ['a.txt'], 'HEAD-diff must list the modified file');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not throw in a git repo with no commits yet (plain-diff fallback)', () => {
    const dir = tmpDir();
    execSync('git init -q', { cwd: dir }); // no commit → `git diff HEAD` exits non-zero
    const config = {};
    assert.doesNotThrow(() => writeLastSession(config, dir, 'approve 1'));
    assert.equal(config.lastSession.files_touched, undefined, 'no staged/tracked changes → field omitted');
    fs.rmSync(dir, { recursive: true });
  });
});

// ── Cross-platform shell-command hygiene (TPA-10 regression guard) ─────────────
// execSync/spawnSync run through cmd.exe on Windows, which cannot parse the POSIX null
// device path in a command string (a stderr redirect to it leaks an error to the
// operator on every state-mutating command). Nothing in lib/ should hardcode that path:
// silence stderr via the `stdio` option, and use os.devNull for a portable null file.
describe('shell-command portability (TPA-10)', () => {
  it('no lib/ file hardcodes the POSIX null device path', () => {
    const libDir = path.join(import.meta.dirname, '..', 'lib');
    const needle = ['/dev', 'null'].join('/'); // assembled so this guard does not flag itself
    const offenders = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.js') && fs.readFileSync(p, 'utf8').includes(needle)) offenders.push(p);
      }
    };
    walk(libDir);
    assert.deepEqual(offenders, [], `Hardcoded POSIX null device breaks on Windows cmd.exe. Suppress stderr with stdio:['ignore','pipe','ignore']; use os.devNull for a portable null file. Offenders: ${offenders.join(', ')}`);
  });
});

// ── cascadeInvalidate() ───────────────────────────────────────────────────────

describe('cascadeInvalidate()', () => {
  it('returns empty array when phase has no downstream (deploy)', () => {
    const config = { approvedPhases: [], completedPhases: [], artifactHashes: {} };
    const result = cascadeInvalidate(config, 5);
    assert.deepEqual(result, []);
  });

  it('returns empty array when phase has no downstream (review)', () => {
    const config = { approvedPhases: [], completedPhases: [], artifactHashes: {} };
    const result = cascadeInvalidate(config, 'review');
    assert.deepEqual(result, []);
  });

  it('removes downstream phases from approvedPhases', () => {
    const config = {
      approvedPhases:  [1, 2, 3],
      completedPhases: [1, 2, 3],
      artifactHashes:  {},
    };
    cascadeInvalidate(config, 1);
    assert.ok(config.approvedPhases.map(String).includes('1'), 'phase 1 must stay approved');
    assert.ok(!config.approvedPhases.map(String).includes('2'), 'phase 2 must be removed');
    assert.ok(!config.approvedPhases.map(String).includes('3'), 'phase 3 must be removed');
  });

  it('removes downstream phases from completedPhases', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      artifactHashes:  {},
    };
    cascadeInvalidate(config, 2);
    assert.ok(!config.completedPhases.map(String).includes('3'), 'phase 3 must be removed');
    assert.ok(!config.completedPhases.map(String).includes('4'), 'phase 4 must be removed');
    assert.ok(config.completedPhases.map(String).includes('2'), 'phase 2 must remain');
  });

  it('removes downstream artifactHashes', () => {
    const config = {
      approvedPhases:  [1, 2, 3],
      completedPhases: [1, 2, 3],
      artifactHashes:  { '1': 'hash1', '2': 'hash2', '3': 'hash3' },
    };
    cascadeInvalidate(config, 1);
    assert.ok(config.artifactHashes['1'], 'phase 1 hash must remain');
    assert.ok(!config.artifactHashes['2'], 'phase 2 hash must be removed');
    assert.ok(!config.artifactHashes['3'], 'phase 3 hash must be removed');
  });

  it('resets verifyPassed when build is in cascade', () => {
    const config = {
      approvedPhases:  [1, 2, 3],
      completedPhases: [1, 2, 3],
      artifactHashes:  {},
      verifyPassed:    true,
      verifySummary:   { passed: 5 },
    };
    cascadeInvalidate(config, 1); // cascade includes 4 and 5
    assert.equal(config.verifyPassed, false);
    assert.ok(!config.verifySummary, 'verifySummary must be cleared');
  });

  // ADV-0622-28: the stale last-run snapshot must also be cleared, or the next-action
  // ladder reads a pre-cascade run and misroutes to verify-complete (which then errors).
  it('clears lastVerifyRun + verifyRanAt when build/deploy is in the cascade (ADV-28)', () => {
    const config = {
      approvedPhases:  [1, 2, 3],
      completedPhases: [1, 2, 3],
      artifactHashes:  {},
      verifyPassed:    true,
      verifySummary:   { passed: 5 },
      lastVerifyRun:   { passed: 5, failed: 0, skipped: 0, manual: 0, at: '2026-01-01T00:00:00.000Z' },
      verifyRanAt:     '2026-01-01T00:00:00.000Z',
    };
    cascadeInvalidate(config, 1); // cascade includes 4 and 5
    assert.ok(!config.lastVerifyRun, 'lastVerifyRun must be cleared so the ladder does not misroute');
    assert.ok(!config.verifyRanAt, 'verifyRanAt must be cleared');
  });

  it('does not reset verifyPassed when cascade does not reach build', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      artifactHashes:  {},
      verifyPassed:    true,
    };
    cascadeInvalidate(config, 4); // cascade is only [5]
    assert.equal(config.verifyPassed, false, 'verifyPassed reset because 5 is downstream');
  });

  it('returns only phases that were actually tracked', () => {
    const config = {
      approvedPhases:  [1, 3],   // phase 2 was never approved
      completedPhases: [1, 3],
      artifactHashes:  {},
    };
    const invalidated = cascadeInvalidate(config, 1);
    // downstream of 1: ux, 2, 3, 4, 5, review — but only 3 was tracked
    assert.ok(invalidated.map(String).includes('3'), 'phase 3 must be in invalidated list');
    assert.ok(!invalidated.map(String).includes('2'), 'phase 2 must not appear (was not tracked)');
  });

  it('C5b: marks invalidated phases as cascadePending', () => {
    const config = {
      approvedPhases:  [1, 2, 3],
      completedPhases: [1, 2, 3],
      artifactHashes:  {},
    };
    cascadeInvalidate(config, 1);
    assert.deepEqual((config.cascadedPhases || []).map(String).sort(), ['2', '3'],
      'only the tracked downstream phases get marked');
  });

  it('C5b: does not mark cascadedPhases when nothing was tracked downstream', () => {
    const config = { approvedPhases: [1], completedPhases: [1], artifactHashes: {} };
    cascadeInvalidate(config, 1);   // downstream exists but none were approved
    assert.ok(!config.cascadedPhases || config.cascadedPhases.length === 0,
      'no cascade mark when no downstream phase was tracked');
  });

  it('C5b: unions with an existing cascadedPhases mark (no duplicates)', () => {
    const config = {
      approvedPhases:  [1, 2, 3],
      completedPhases: [1, 2, 3],
      artifactHashes:  {},
      cascadedPhases:  ['3'],
    };
    cascadeInvalidate(config, 1);
    assert.deepEqual((config.cascadedPhases || []).map(String).sort(), ['2', '3']);
  });

  it('handles optional phase ux in cascade from requirements', () => {
    const config = {
      approvedPhases:  [1, 'ux', 2],
      completedPhases: [1, 'ux', 2],
      artifactHashes:  {},
    };
    cascadeInvalidate(config, 1);
    assert.ok(!config.approvedPhases.includes('ux'), 'ux must be invalidated');
    assert.ok(!config.approvedPhases.map(String).includes('2'), 'phase 2 must be invalidated');
    assert.ok(config.approvedPhases.map(String).includes('1'), 'phase 1 must remain');
  });

  it('cascade from ux invalidates architecture and below but not requirements', () => {
    const config = {
      approvedPhases:  [1, 'ux', 2, 3],
      completedPhases: [1, 'ux', 2, 3],
      artifactHashes:  {},
    };
    cascadeInvalidate(config, 'ux');
    assert.ok(config.approvedPhases.map(String).includes('1'), 'requirements must remain');
    assert.ok(!config.approvedPhases.map(String).includes('2'), 'architecture must be invalidated');
    assert.ok(!config.approvedPhases.map(String).includes('3'), 'tests must be invalidated');
  });
});

describe('clearCascadePending() — C5b', () => {
  it('removes the given phase from cascadedPhases (string-coerced)', () => {
    const config = { cascadedPhases: ['2', '3', 'ux'] };
    clearCascadePending(config, 2);
    assert.deepEqual(config.cascadedPhases, ['3', 'ux']);
  });

  it('is a no-op when the phase is not marked', () => {
    const config = { cascadedPhases: ['3'] };
    clearCascadePending(config, 2);
    assert.deepEqual(config.cascadedPhases, ['3']);
  });

  it('handles an absent cascadedPhases without throwing', () => {
    const config = {};
    clearCascadePending(config, 2);
    assert.deepEqual(config.cascadedPhases, []);
  });
});
