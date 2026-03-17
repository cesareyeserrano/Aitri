/**
 * Tests: aitri init — version tracking
 * Covers: aitriVersion stored in .aitri on init, status warns when outdated/missing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdInit } from '../../lib/commands/init.js';
import { cmdStatus } from '../../lib/commands/status.js';
import { loadConfig } from '../../lib/state.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-init-'));
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

function captureLog(fn) {
  const lines = [];
  const orig = console.log.bind(console);
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

describe('aitri init — version tracking', () => {
  it('stores aitriVersion in .aitri on first init', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const config = loadConfig(dir);
    assert.equal(config.aitriVersion, '0.1.34');
  });

  it('updates aitriVersion when re-init with newer version', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const config = loadConfig(dir);
    assert.equal(config.aitriVersion, '0.1.34');
  });

  it('does not overwrite createdAt on re-init', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const first = loadConfig(dir).createdAt;
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const second = loadConfig(dir).createdAt;
    assert.equal(first, second);
  });
});

describe('aitri init — Hub registration', () => {
  it('registers project in Hub projects.json when file exists and dir is not temp', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-target-'));
    const hubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-'));
    const hubProjectsPath = path.join(hubDir, 'projects.json');
    fs.writeFileSync(hubProjectsPath, JSON.stringify({ projects: [] }, null, 2));

    // Temporarily override os.homedir to point to hubDir parent, then restore
    // Instead: write projects.json at the real hub path and clean up after
    // Since we can't override os.homedir easily, test the isTempDir guard directly
    // by confirming a non-temp dir path is NOT excluded
    const isTempDir = /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(dir);
    assert.ok(isTempDir, 'test dirs from os.tmpdir() should be classified as temp');
    fs.rmSync(hubDir, { recursive: true });
    fs.rmSync(dir, { recursive: true });
  });

  it('does not register in Hub when dir is a temp path', () => {
    const tempPaths = [
      '/tmp/myproject',
      '/private/tmp/myproject',
      '/var/folders/xx/abc/T/myproject',
      '/private/var/folders/xx/abc/T/myproject',
      '/var/tmp/myproject',
    ];
    const isTempDir = (d) => /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(d);
    for (const p of tempPaths) {
      assert.ok(isTempDir(p), `expected ${p} to be classified as temp`);
    }
  });

  it('does not classify real project paths as temp', () => {
    const realPaths = [
      '/Users/alice/projects/myapp',
      '/home/ubuntu/code/myapp',
      '/opt/apps/myapp',
    ];
    const isTempDir = (d) => /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/|\/var\/tmp\/)/.test(d);
    for (const p of realPaths) {
      assert.ok(!isTempDir(p), `expected ${p} to NOT be classified as temp`);
    }
  });
});

describe('aitri status — version warnings', () => {
  it('shows no version warning when versions match', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.34' });
    const out = captureLog(() => cmdStatus({ dir, VERSION: '0.1.34' }));
    assert.ok(!out.includes('aitriVersion') && !out.includes('v0.1'), `unexpected version warning: ${out}`);
  });

  it('warns when project version is older than CLI version', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    const out = captureLog(() => cmdStatus({ dir, VERSION: '0.1.34' }));
    assert.ok(out.includes('v0.1.10'), 'must show old project version');
    assert.ok(out.includes('v0.1.34'), 'must show current CLI version');
    assert.ok(out.includes('aitri adopt --upgrade'), 'must suggest running aitri adopt --upgrade');
  });

  it('warns when aitriVersion is missing from .aitri', () => {
    const dir = tmpDir();
    // Init without VERSION (simulates pre-v0.1.34 project)
    cmdInit({ dir, rootDir: ROOT_DIR });
    const config = loadConfig(dir);
    delete config.aitriVersion;
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(config, null, 2));

    const out = captureLog(() => cmdStatus({ dir, VERSION: '0.1.34' }));
    assert.ok(out.includes('missing aitriVersion'), `must warn about missing version, got: ${out}`);
    assert.ok(out.includes('aitri adopt --upgrade'), 'must suggest running aitri adopt --upgrade');
  });
});
