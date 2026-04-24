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
