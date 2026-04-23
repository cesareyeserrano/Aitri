/**
 * Tests: lib/upgrade/ — reconciliation protocol entry point (ADR-027)
 *
 * Architectural marker: exercises runUpgrade directly, not through cmdAdopt.
 * Guarantees the module is a public surface. End-to-end `adopt --upgrade`
 * behavior is covered in test/commands/adopt.test.js.
 *
 * Corte A scope — only absorbed legacy behaviors are asserted:
 *   - STRUCTURE   (artifactsDir recovery)
 *   - STATE-MISSING (phase inference)
 *   - CAPABILITY-NEW (agent-files regeneration)
 * Per-version migrations land in later commits.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runUpgrade } from '../lib/upgrade/index.js';
import { diagnose }   from '../lib/upgrade/diagnose.js';
import { cmdInit }    from '../lib/commands/init.js';
import { loadConfig, saveConfig } from '../lib/state.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-upgrade-'));
}

function silence(fn) {
  const origLog = console.log;
  const origErr = process.stderr.write.bind(process.stderr);
  console.log = () => {};
  process.stderr.write = () => true;
  try { return fn(); }
  finally { console.log = origLog; process.stderr.write = origErr; }
}

describe('lib/upgrade — runUpgrade (Corte A: absorbed legacy behavior)', () => {
  it('writes aitriVersion last (commit point per ADR-027 Addendum §1)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));
      assert.equal(loadConfig(dir).aitriVersion, '0.1.99');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('STATE-MISSING: infers completedPhases from on-disk artifacts', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), '{}');
      fs.writeFileSync(path.join(specDir, '02_SYSTEM_DESIGN.md'), '# Design\n'.repeat(5));

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.ok(c.completedPhases.includes(1));
      assert.ok(c.completedPhases.includes(2));
      assert.ok(!c.completedPhases.includes(3));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('STATE-MISSING: does not re-mark phases that are already approved', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), '{}');

      // Simulate prior approval.
      const c0 = loadConfig(dir);
      c0.approvedPhases = [1];
      saveConfig(dir, c0);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.ok(c.approvedPhases.includes(1));
      assert.ok(!c.completedPhases.includes(1), 'approved phase must not be duplicated in completedPhases');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('STRUCTURE: corrects artifactsDir to root when spec/ is empty but artifacts sit at root', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), '{}');

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.equal(c.artifactsDir, '', 'artifactsDir must be corrected to root');
      assert.ok(c.completedPhases.includes(1), 'phase 1 must be inferred from root artifact');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('STRUCTURE: leaves artifactsDir untouched when artifacts are in the configured dir', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), '{}');

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      assert.equal(loadConfig(dir).artifactsDir, 'spec');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('CAPABILITY-NEW: regenerates agent instruction files when missing', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      for (const f of ['CLAUDE.md', 'GEMINI.md', '.codex/instructions.md']) {
        const p = path.join(dir, f);
        if (fs.existsSync(p)) fs.rmSync(p);
      }
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));
      assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')));
      assert.ok(fs.existsSync(path.join(dir, 'GEMINI.md')));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('is tolerant of projects with no artifacts', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      assert.doesNotThrow(() =>
        silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }))
      );
      const c = loadConfig(dir);
      assert.equal(c.aitriVersion, '0.1.99');
      assert.deepEqual(c.completedPhases, []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade — diagnose (skeleton, Corte A)', () => {
  it('returns an empty catalog with all five categories', () => {
    const cat = diagnose('/nonexistent', {});
    assert.deepEqual(cat, {
      blocking:      [],
      stateMissing:  [],
      validatorGap:  [],
      capabilityNew: [],
      structure:     [],
    });
  });
});
