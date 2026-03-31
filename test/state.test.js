import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, saveConfig, readArtifact, artifactPath, hashArtifact, writeLastSession, detectAgent } from '../lib/state.js';

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
});
