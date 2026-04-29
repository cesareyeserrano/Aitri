/**
 * Tests: lib/upgrade/ — reconciliation protocol entry point (ADR-027)
 *
 * Architectural marker: exercises runUpgrade directly, not through cmdAdopt.
 * Guarantees the module is a public surface. End-to-end `adopt --upgrade`
 * behavior is covered in test/commands/adopt.test.js.
 *
 * Covers:
 *   - Absorbed legacy behaviors (Corte A):
 *       STRUCTURE       artifactsDir recovery
 *       STATE-MISSING   phase inference
 *       CAPABILITY-NEW  agent-files regeneration
 *   - Per-version migrations (Corte B):
 *       from-0.1.65.js  TC.requirement → TC.requirement_id
 *                       NFR {title, constraint} → {category, requirement}
 *       Flagging of semantic-content findings (§2 compliance)
 *       upgrade_migration events in config.events
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runUpgrade } from '../lib/upgrade/index.js';
import { diagnose, migrateAll } from '../lib/upgrade/diagnose.js';
import * as from065 from '../lib/upgrade/migrations/from-0.1.65.js';
import { cmdInit }    from '../lib/commands/init.js';
import { loadConfig, saveConfig, hashArtifact, hasDrift } from '../lib/state.js';

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

describe('lib/upgrade — diagnose composer', () => {
  it('returns an empty catalog when no drift is present', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      const cat = diagnose(dir, loadConfig(dir));
      assert.deepEqual(cat.blocking,      []);
      assert.deepEqual(cat.stateMissing,  []);
      assert.deepEqual(cat.validatorGap,  []);
      assert.deepEqual(cat.capabilityNew, []);
      assert.deepEqual(cat.structure,     []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Corte B: from-0.1.65.js migration module ─────────────────────────────────

function writeTcs(dir, tcs) {
  const specDir = path.join(dir, 'spec');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, '03_TEST_CASES.json'),
    JSON.stringify({ test_cases: tcs }, null, 2)
  );
}

function writeReqs(dir, data) {
  const specDir = path.join(dir, 'spec');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, '01_REQUIREMENTS.json'),
    JSON.stringify(data, null, 2)
  );
}

function readTcs(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'utf8')).test_cases;
}

function readNfrs(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), 'utf8')).non_functional_requirements;
}

describe('lib/upgrade/migrations/from-0.1.65 — BLOCKING: TC.requirement → requirement_id', () => {
  it('renames single-FR requirement to requirement_id (mechanical)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [
        { id: 'TC-001', requirement: 'FR-001', title: 'Login ok' },
        { id: 'TC-002', requirement: 'FR-002', title: 'Logout ok' },
      ]);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const tcs = readTcs(dir);
      assert.equal(tcs[0].requirement_id, 'FR-001');
      assert.equal(tcs[1].requirement_id, 'FR-002');
      assert.equal(tcs[0].requirement, undefined);
      assert.equal(tcs[1].requirement, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('FLAGS comma-separated multi-FR TCs — does not auto-split (§2)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [
        { id: 'TC-001', requirement: 'FR-001, FR-002', title: 'Combined' },
      ]);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const tcs = readTcs(dir);
      assert.equal(tcs[0].requirement, 'FR-001, FR-002', 'original value must be preserved on flag');
      assert.equal(tcs[0].requirement_id, undefined, 'requirement_id must not be synthesized');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('is idempotent: re-running after migration is a no-op', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [{ id: 'TC-001', requirement: 'FR-001' }]);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));
      const snapshot1 = fs.readFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'utf8');

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));
      const snapshot2 = fs.readFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'utf8');

      assert.equal(snapshot1, snapshot2);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('leaves TCs already on the new shape untouched', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [{ id: 'TC-001', requirement_id: 'FR-001', title: 'Already modern' }]);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const tcs = readTcs(dir);
      assert.equal(tcs[0].requirement_id, 'FR-001');
      assert.equal(tcs[0].requirement, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade/migrations/from-0.1.65 — BLOCKING: NFR shape rewrite', () => {
  it('renames constraint → requirement (mechanical)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeReqs(dir, {
        non_functional_requirements: [
          { id: 'NFR-001', category: 'Performance', constraint: '<100ms' },
        ],
      });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const nfrs = readNfrs(dir);
      assert.equal(nfrs[0].requirement, '<100ms');
      assert.equal(nfrs[0].constraint, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('normalizes title → category when title is a valid category (case-insensitive lookup)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeReqs(dir, {
        non_functional_requirements: [
          { id: 'NFR-001', title: 'performance', requirement: '<100ms' },
          { id: 'NFR-002', title: 'Security',    requirement: 'TLS 1.3' },
        ],
      });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const nfrs = readNfrs(dir);
      assert.equal(nfrs[0].category, 'Performance');
      assert.equal(nfrs[1].category, 'Security');
      assert.equal(nfrs[0].title, undefined);
      assert.equal(nfrs[1].title, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('FLAGS NFRs whose title is free-text — does not infer category (§2)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeReqs(dir, {
        non_functional_requirements: [
          { id: 'NFR-001', title: 'Fast response time', constraint: '<100ms' },
        ],
      });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const nfrs = readNfrs(dir);
      assert.equal(nfrs[0].title, 'Fast response time', 'title must be preserved when no category match');
      assert.equal(nfrs[0].category, undefined);
      // constraint still gets the mechanical rename even though category is flagged.
      assert.equal(nfrs[0].requirement, '<100ms');
      assert.equal(nfrs[0].constraint, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade/migrations/from-0.1.65 — event log', () => {
  it('appends upgrade_migration events with before/after hashes', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [{ id: 'TC-001', requirement: 'FR-001' }]);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      const evs = (c.events || []).filter(e => e.event === 'upgrade_migration');
      assert.equal(evs.length, 1);
      assert.equal(evs[0].from_version, '0.1.65');
      assert.equal(evs[0].to_version,   '0.1.99');
      assert.equal(evs[0].category,     'blocking');
      assert.equal(evs[0].target,       '03_TEST_CASES.json');
      assert.ok(evs[0].before_hash && evs[0].after_hash);
      assert.notEqual(evs[0].before_hash, evs[0].after_hash);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade — diagnose composer surfaces module findings', () => {
  it('routes per-module findings into catalog categories', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [
        { id: 'TC-001', requirement: 'FR-001' },           // mechanical
        { id: 'TC-002', requirement: 'FR-001, FR-002' },   // flag
      ]);
      const cat = diagnose(dir, loadConfig(dir));
      assert.equal(cat.blocking.length,     1, 'mechanical rename finding routed to blocking');
      assert.equal(cat.validatorGap.length, 1, 'multi-FR finding routed to validatorGap');
      assert.equal(cat.blocking[0].module,     from065.FROM_VERSION);
      assert.equal(cat.validatorGap[0].module, from065.FROM_VERSION);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('migrateAll returns migrated + flagged per module', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [
        { id: 'TC-001', requirement: 'FR-001' },
        { id: 'TC-002', requirement: 'FR-001, FR-002' },
      ]);
      const config = loadConfig(dir);
      const r = migrateAll(dir, config, '0.1.99');
      assert.equal(r.migrated.length, 1);
      assert.equal(r.flagged.length,  1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Corte C: STATE-MISSING backfills ──────────────────────────────────────────

/**
 * Write a legacy-style .aitri (root file, not dir) bypassing saveConfig to
 * avoid the automatic updatedAt stamp. Mirrors how a real brownfield project
 * looks before upgrade.
 */
function writeLegacyConfig(dir, overrides = {}) {
  const base = {
    projectName: 'legacy',
    aitriVersion: '0.1.65',
    createdAt: '2026-03-01T00:00:00.000Z',
    artifactsDir: 'spec',
    completedPhases: [],
    approvedPhases: [],
    events: [],
    artifactHashes: {},
    driftPhases: [],
    rejections: [],
    ...overrides,
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(base, null, 2));
  return base;
}

describe('lib/upgrade/migrations/from-0.1.65 — STATE-MISSING: updatedAt', () => {
  it('backfills updatedAt when missing', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.updatedAt, 'updatedAt must be set after upgrade');
      assert.ok(!isNaN(Date.parse(c.updatedAt)), 'updatedAt must be a valid ISO timestamp');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not override existing updatedAt from the upgrade itself', () => {
    // saveConfig always stamps updatedAt on write, so after the first upgrade
    // the field exists. A second upgrade must not emit a stateMissing finding.
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c1 = loadConfig(dir);
      const ev1 = (c1.events || []).filter(e => e.target === '.aitri#updatedAt').length;
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c2 = loadConfig(dir);
      const ev2 = (c2.events || []).filter(e => e.target === '.aitri#updatedAt').length;
      assert.equal(ev1, 1, 'first run backfills once');
      assert.equal(ev2, 1, 'second run is a no-op — no new updatedAt event');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade/migrations/from-0.1.65 — STATE-MISSING: lastSession', () => {
  it('backfills from most recent complete|approve|verify event', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, {
        events: [
          { at: '2026-03-05T10:00:00.000Z', event: 'complete', phase: 1 },
          { at: '2026-03-10T12:00:00.000Z', event: 'approve',  phase: 1 },
          { at: '2026-03-11T09:00:00.000Z', event: 'note',     phase: null }, // irrelevant
        ],
      });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.lastSession);
      assert.equal(c.lastSession.event, 'approve');
      assert.equal(c.lastSession.at,    '2026-03-10T12:00:00.000Z');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips when there is no relevant event to derive from', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { events: [{ at: '2026-03-01T00:00:00.000Z', event: 'note', phase: null }] });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.equal(c.lastSession, undefined, 'must not synthesize lastSession without a source event');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade/migrations/from-0.1.65 — STATE-MISSING: verifyRanAt', () => {
  it('backfills from 04_TEST_RESULTS.json mtime when verifyPassed is true', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { verifyPassed: true });
      fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), '{"results":[]}');
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.verifyRanAt, 'verifyRanAt must be set');
      assert.ok(!isNaN(Date.parse(c.verifyRanAt)));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips when verifyPassed is not true', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), '{"results":[]}');
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.equal(c.verifyRanAt, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade/migrations/from-0.1.65 — STATE-MISSING: auditLastAt', () => {
  it('backfills from AUDIT_REPORT.md mtime when present', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      fs.writeFileSync(path.join(dir, 'spec', 'AUDIT_REPORT.md'), '# Audit\n');
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.auditLastAt, 'auditLastAt must be set');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips when AUDIT_REPORT.md is absent', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.equal(c.auditLastAt, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade/migrations/from-0.1.65 — STATE-MISSING: normalizeState', () => {
  it('stamps a baseline when Phase 4 is approved without one', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1, 2, 3, 4] });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.normalizeState);
      assert.equal(c.normalizeState.status, 'resolved');
      assert.ok(['git', 'initial'].includes(c.normalizeState.method));
      assert.ok(c.normalizeState.baseRef);
      assert.ok(c.normalizeState.lastRun);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips when Phase 4 is not approved', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1, 2, 3] });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.equal(c.normalizeState, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips when normalizeState already exists', () => {
    const dir = tmpDir();
    try {
      const existing = { baseRef: 'abc123', method: 'git', status: 'resolved', lastRun: '2026-04-01T00:00:00.000Z' };
      writeLegacyConfig(dir, { approvedPhases: [1, 2, 3, 4], normalizeState: existing });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.deepEqual(c.normalizeState, existing);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Approval preservation across shape-only migrations (Option B) ────────────
//
// §2 guarantees migrations change shape, not content. Therefore an approval
// captured before the migration is still valid against the post-migration
// artifact. Option B: update config.artifactHashes[phase] to the new hash so
// `aitri status` does not flag drift immediately after an upgrade.

// ── No-op UX: clean-project run (FEEDBACK 2026-04-24 H1 + H2) ────────────────

describe('lib/upgrade — no-op UX on already-current project', () => {
  function captureStdout(fn) {
    let out = '';
    const origLog = console.log;
    const origErr = process.stderr.write.bind(process.stderr);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    process.stderr.write = () => true;
    try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
    return out;
  }

  it('prints "already current" and skips "Already tracked" section when re-running at same version', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.99' });
      writeTcs(dir, [{ id: 'TC-001', requirement_id: 'FR-001' }]);
      // First run — mostly no-op but with inferred phase 3; not what we test here.
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));
      // Second run — truly no-op, phase 3 already tracked.
      const out = captureStdout(() =>
        runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR })
      );
      assert.match(out, /already current/);
      assert.match(out, /Version:\s+0\.1\.99 \(already current\)/);
      assert.doesNotMatch(out, /0\.1\.99\s+→\s+0\.1\.99/);
      assert.doesNotMatch(out, /Already tracked \(unchanged\)/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('shows the version arrow when actually bumping', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      const out = captureStdout(() =>
        runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR })
      );
      assert.match(out, /0\.1\.10\s+→\s+0\.1\.99/);
      assert.doesNotMatch(out, /already current/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dry-run with version bump does NOT claim "would be a no-op"', () => {
    // Defect: a dry-run that would bump the version string was emitting
    // "(dry-run: re-running without --dry-run would be a no-op.)" alongside
    // "only the version string would change" — contradicting itself. A user
    // reading "no-op" could skip the upgrade and leave the project pinned.
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.99' });
      writeTcs(dir, [{ id: 'TC-001', requirement_id: 'FR-001' }]);
      // First run tracks phase 3 so skipped[] becomes non-empty afterwards.
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));
      // Dry-run with a different VERSION: noOp (nothing to migrate) + versionBumped.
      const out = captureStdout(() =>
        runUpgrade({ dir, VERSION: '0.2.0', rootDir: ROOT_DIR, dryRun: true })
      );
      assert.match(out, /only the version string would change/);
      assert.doesNotMatch(out, /would be a no-op/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dry-run on already-current project still says "would be a no-op"', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.99' });
      writeTcs(dir, [{ id: 'TC-001', requirement_id: 'FR-001' }]);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));
      const out = captureStdout(() =>
        runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR, dryRun: true })
      );
      assert.match(out, /already current/);
      assert.match(out, /would be a no-op/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade — approval preservation (Option B)', () => {
  it('TC migration updates config.artifactHashes[3] so hasDrift is false after upgrade', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [{ id: 'TC-001', requirement: 'FR-001' }]);
      const specDir = path.join(dir, 'spec');
      // Pretend Phase 3 was approved with the pre-migration shape.
      const c0 = loadConfig(dir);
      const preHash = hashArtifact(fs.readFileSync(path.join(specDir, '03_TEST_CASES.json'), 'utf8'));
      c0.approvedPhases = [3];
      c0.artifactHashes = { '3': preHash };
      saveConfig(dir, c0);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));

      const c = loadConfig(dir);
      const postContent = fs.readFileSync(path.join(specDir, '03_TEST_CASES.json'), 'utf8');
      assert.equal(c.artifactHashes['3'], hashArtifact(postContent), 'stored hash must match new content');
      assert.equal(hasDrift(dir, c, '3', '03_TEST_CASES.json'), false, 'no drift after shape-only migration');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('NFR migration updates config.artifactHashes[1]', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeReqs(dir, {
        non_functional_requirements: [{ id: 'NFR-001', title: 'Performance', constraint: '<100ms' }],
      });
      const specDir = path.join(dir, 'spec');
      const c0 = loadConfig(dir);
      const preHash = hashArtifact(fs.readFileSync(path.join(specDir, '01_REQUIREMENTS.json'), 'utf8'));
      c0.approvedPhases = [1];
      c0.artifactHashes = { '1': preHash };
      saveConfig(dir, c0);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));

      const c = loadConfig(dir);
      const postContent = fs.readFileSync(path.join(specDir, '01_REQUIREMENTS.json'), 'utf8');
      assert.equal(c.artifactHashes['1'], hashArtifact(postContent));
      assert.equal(hasDrift(dir, c, '1', '01_REQUIREMENTS.json'), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT stamp a hash for a phase that was never approved', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [{ id: 'TC-001', requirement: 'FR-001' }]);
      // No approvedPhases, no artifactHashes entry.
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));

      const c = loadConfig(dir);
      assert.equal((c.artifactHashes || {})['3'], undefined,
        'must not synthesize approval hash for a non-approved phase');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT modify config.driftPhases (pre-existing drift is preserved)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeTcs(dir, [{ id: 'TC-001', requirement: 'FR-001' }]);
      const c0 = loadConfig(dir);
      c0.driftPhases = ['3']; // legacy on-disk form; canonicalised to [3]
      saveConfig(dir, c0);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));

      const c = loadConfig(dir);
      assert.deepEqual(c.driftPhases, [3], 'pre-existing drift stays — agent decides');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Corte D: VALIDATOR-GAP reporting (v0.1.82 Phase 1 rules) ─────────────────

describe('lib/upgrade/migrations/from-0.1.65 — VALIDATOR-GAP: Phase 1 vagueness', () => {
  it('flags MUST FRs with vague titles that have <2 substantive tokens', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeReqs(dir, {
        functional_requirements: [
          // Vague title, only "app" + "must" + stop-words + BROAD_VAGUE → fails
          { id: 'FR-001', priority: 'MUST', title: 'The app must work correctly', acceptance_criteria: ['does things'] },
        ],
      });
      const config = loadConfig(dir);
      const cat = diagnose(dir, config);
      const f = cat.validatorGap.find(x => x.target === '01_REQUIREMENTS.json' && x.transform.includes('vagueness'));
      assert.ok(f, 'vagueness finding expected');
      assert.equal(f.autoMigratable, false);
      assert.match(f.transform, /FR-001/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not flag specific behaviors even when containing a vague word', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeReqs(dir, {
        functional_requirements: [
          // "Generate reports efficiently" — 2 substantive tokens (Generate, reports) → passes
          { id: 'FR-001', priority: 'MUST', title: 'Generate reports efficiently', acceptance_criteria: ['report renders in <200ms'] },
        ],
      });
      const cat = diagnose(dir, loadConfig(dir));
      const vagueFindings = cat.validatorGap.filter(x => x.transform.includes('vagueness'));
      assert.equal(vagueFindings.length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('flags MUST FRs whose every AC is vague with no observable metric', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeReqs(dir, {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST', title: 'Login flow', acceptance_criteria: ['works nice', 'runs fast'] },
        ],
      });
      const cat = diagnose(dir, loadConfig(dir));
      const f = cat.validatorGap.find(x => x.transform.includes('vagueness') && x.transform.includes('FR-001'));
      assert.ok(f, 'all-vague-ACs finding expected');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('never auto-migrates — runUpgrade leaves the artifact byte-for-byte unchanged', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeReqs(dir, {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST', title: 'The app must work correctly', acceptance_criteria: ['ok'] },
        ],
      });
      const before = fs.readFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), 'utf8');
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const after = fs.readFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), 'utf8');
      assert.equal(before, after, 'VALIDATOR-GAP findings must never mutate artifacts');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade/migrations/from-0.1.65 — VALIDATOR-GAP: Phase 1 duplicate ACs', () => {
  it('flags FR pairs with Jaccard ≥0.9 on acceptance_criteria', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      const acs = ['user can log in', 'session persists 24h', 'logout clears token'];
      writeReqs(dir, {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST', title: 'Sign in',  acceptance_criteria: acs },
          { id: 'FR-002', priority: 'MUST', title: 'Sign out', acceptance_criteria: acs },  // identical
        ],
      });
      const cat = diagnose(dir, loadConfig(dir));
      const f = cat.validatorGap.find(x => x.transform.includes('duplicate acceptance_criteria'));
      assert.ok(f, 'duplicate-AC finding expected');
      assert.match(f.transform, /FR-001/);
      assert.match(f.transform, /FR-002/);
      assert.equal(f.autoMigratable, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not flag FRs with <3 ACs even if identical (threshold gates trivial cases)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeReqs(dir, {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST', title: 'A', acceptance_criteria: ['one', 'two'] },
          { id: 'FR-002', priority: 'MUST', title: 'B', acceptance_criteria: ['one', 'two'] },
        ],
      });
      const cat = diagnose(dir, loadConfig(dir));
      const dupFindings = cat.validatorGap.filter(x => x.transform.includes('duplicate acceptance_criteria'));
      assert.equal(dupFindings.length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('lib/upgrade — state backfill event log', () => {
  it('logs upgrade_migration events for state backfills without hashes', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, {
        events: [{ at: '2026-03-10T12:00:00.000Z', event: 'approve', phase: 1 }],
      });
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      const stateEvents = (c.events || []).filter(
        e => e.event === 'upgrade_migration' && e.category === 'stateMissing'
      );
      assert.ok(stateEvents.length >= 2, 'at least updatedAt + lastSession backfills logged');
      for (const e of stateEvents) {
        assert.equal(e.before_hash, undefined, 'state backfills must not carry a before_hash');
        assert.equal(e.after_hash,  undefined, 'state backfills must not carry an after_hash');
        assert.ok(e.target.startsWith('.aitri#'));
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Dry-run preview (v2.0.0-alpha.2) ─────────────────────────────────────────

describe('lib/upgrade — dry-run preview', () => {
  // Dry-run is safety infrastructure for a reconciliation protocol that
  // writes artifacts. Canaries (Hub, Ultron) had to simulate dry-run via
  // manual tar-copy into /tmp/ — the friction is evidence of the need.

  it('dryRun=true does not bump aitriVersion', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR, dryRun: true }));
      assert.equal(loadConfig(dir).aitriVersion, '0.1.10', 'version must not change in dry-run');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dryRun=true does not write TC migration to disk', () => {
    // Seed a legacy TC shape (requirement instead of requirement_id) that would
    // trigger the BLOCKING migration under a real run. Dry-run must leave it
    // byte-for-byte unchanged.
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.65' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      const tcPath = path.join(specDir, '03_TEST_CASES.json');
      const legacy = JSON.stringify({
        test_cases: [{ id: 'TC-001', requirement: 'FR-001', title: 'x', expected_result: 'y' }],
      }, null, 2);
      fs.writeFileSync(tcPath, legacy, 'utf8');

      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR, dryRun: true }));

      const after = fs.readFileSync(tcPath, 'utf8');
      assert.equal(after, legacy, 'TC file must be byte-identical after dry-run');
      const data = JSON.parse(after);
      assert.equal(data.test_cases[0].requirement, 'FR-001');
      assert.equal(data.test_cases[0].requirement_id, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dryRun=true does not append upgrade_migration events', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.65' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(
        path.join(specDir, '03_TEST_CASES.json'),
        JSON.stringify({ test_cases: [{ id: 'TC-001', requirement: 'FR-001', title: 'x', expected_result: 'y' }] }, null, 2),
      );

      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR, dryRun: true }));

      const events = loadConfig(dir).events || [];
      const upgradeEvents = events.filter(e => e.event === 'upgrade_migration');
      assert.equal(upgradeEvents.length, 0, 'no upgrade_migration events in dry-run');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dryRun=true does not infer completedPhases into .aitri', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), '{}');
      fs.writeFileSync(path.join(specDir, '02_SYSTEM_DESIGN.md'), '# Design\n');

      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR, dryRun: true }));

      const c = loadConfig(dir);
      assert.ok(!c.completedPhases.includes(1), 'phase 1 must not be persisted in dry-run');
      assert.ok(!c.completedPhases.includes(2), 'phase 2 must not be persisted in dry-run');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dryRun=true prints a DRY-RUN banner in the report', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      let output = '';
      const origLog = console.log;
      console.log = (msg = '') => { output += msg + '\n'; };
      process.stderr.write = () => true;
      try {
        runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR, dryRun: true });
      } finally {
        console.log = origLog;
      }
      assert.match(output, /DRY-RUN/i, 'report must announce dry-run mode');
      assert.match(output, /To apply these changes|aitri adopt --upgrade/,
        'dry-run output must instruct how to apply for real');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dryRun=true does not regenerate agent instruction files', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      // Remove agent files created by cmdInit so dry-run would otherwise recreate them.
      for (const f of ['CLAUDE.md', 'GEMINI.md', '.codex/instructions.md']) {
        try { fs.rmSync(path.join(dir, f), { force: true }); } catch {}
      }
      try { fs.rmSync(path.join(dir, '.codex'), { recursive: true, force: true }); } catch {}

      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR, dryRun: true }));

      assert.equal(fs.existsSync(path.join(dir, 'CLAUDE.md')), false, 'CLAUDE.md must not be recreated in dry-run');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('persists flagged findings in .aitri.upgradeFindings[] (A1, alpha.3+)', () => {
    // Seed a multi-FR TC (non-canonical requirement) that the migrator flags
    // but does not auto-migrate. The flag must survive to .aitri so the
    // next-action ladder can surface it beyond the upgrade report.
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.65' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(
        path.join(specDir, '03_TEST_CASES.json'),
        JSON.stringify({
          test_cases: [{ id: 'TC-001', requirement: 'FR-001, FR-002', title: 'x', expected_result: 'y' }],
        }, null, 2),
      );

      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.ok(Array.isArray(c.upgradeFindings), 'upgradeFindings must be an array');
      assert.ok(c.upgradeFindings.length >= 1, 'multi-FR TC must produce at least one finding');
      const finding = c.upgradeFindings[0];
      assert.ok(finding.target, 'finding must carry target');
      assert.ok(finding.transform, 'finding must carry transform description');
      assert.ok(finding.reason, 'flagged finding must carry reason');
      assert.ok(finding.recordedAt, 'finding must carry recordedAt timestamp');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('clears .aitri.upgradeFindings on subsequent run when drift is resolved (A1)', () => {
    // Snapshot model: the array is replaced every upgrade, so stale items
    // disappear automatically once the agent has re-authored the artifacts.
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.65' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      const tcPath = path.join(specDir, '03_TEST_CASES.json');
      fs.writeFileSync(
        tcPath,
        JSON.stringify({
          test_cases: [{ id: 'TC-001', requirement: 'FR-001, FR-002', title: 'x', expected_result: 'y' }],
        }, null, 2),
      );

      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR }));
      assert.ok(loadConfig(dir).upgradeFindings.length >= 1);

      // Agent re-authors: single-FR requirement_id, no more flags.
      fs.writeFileSync(
        tcPath,
        JSON.stringify({
          test_cases: [{ id: 'TC-001', requirement_id: 'FR-001', title: 'x', expected_result: 'y' }],
        }, null, 2),
      );
      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR }));
      assert.equal(loadConfig(dir).upgradeFindings.length, 0,
        'findings must be cleared when diagnose() returns empty');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dryRun=true does NOT mutate .aitri.upgradeFindings (preview must not persist)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.65' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(
        path.join(specDir, '03_TEST_CASES.json'),
        JSON.stringify({
          test_cases: [{ id: 'TC-001', requirement: 'FR-001, FR-002', title: 'x', expected_result: 'y' }],
        }, null, 2),
      );
      silence(() => runUpgrade({ dir, VERSION: '9.9.9', rootDir: ROOT_DIR, dryRun: true }));
      const c = loadConfig(dir);
      // dryRun skips saveConfig, so upgradeFindings is whatever cmdInit wrote
      // (undefined on a fresh project) — never mutated by the preview.
      assert.ok(!c.upgradeFindings || c.upgradeFindings.length === 0,
        'dry-run must not persist findings');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('migrateAll({ dryRun: true }) returns the same findings as a real migrate without mutating', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.65' });
      const specDir = path.join(dir, 'spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(
        path.join(specDir, '03_TEST_CASES.json'),
        JSON.stringify({ test_cases: [{ id: 'TC-001', requirement: 'FR-001', title: 'x', expected_result: 'y' }] }, null, 2),
      );
      const config = loadConfig(dir);
      const result = migrateAll(dir, config, '9.9.9', { dryRun: true });
      assert.ok(result.migrated.length >= 1, 'dry-run must surface migratable findings');
      const tcPath = path.join(specDir, '03_TEST_CASES.json');
      const data = JSON.parse(fs.readFileSync(tcPath, 'utf8'));
      assert.equal(data.test_cases[0].requirement, 'FR-001',
        'TC must remain on legacy shape — diagnose() did not apply');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
