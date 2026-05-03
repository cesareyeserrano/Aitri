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
import { cmdReject }  from '../lib/commands/reject.js';
import { loadConfig, saveConfig, appendEvent, hashArtifact, hasDrift } from '../lib/state.js';

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

// ── STATE-MISSING — preserve operator intent (Ultron canary 2026-04-28) ───────
//
// Round-trip per ADR-029: state is seeded by the actual producers
// (`cmdReject` for rejections; `appendEvent('started', …)` mirrors what
// `run-phase` writes at run-phase.js:178). Inference is consumed via the
// public `runUpgrade` entry point. Assertions read post-state through the
// real `loadConfig`. No string-matched fixtures of internal shape.
describe('lib/upgrade — STATE-MISSING preserves operator intent', () => {
  // Helper: seed an artifact on disk so the inference loop sees it.
  function writeArtifact(dir, relPath, content = '{}') {
    const full = path.join(dir, 'spec', relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  // Helper: simulate `aitri run-phase <phase>` having been started but never
  // completed. Mirrors run-phase.js:178 — `appendEvent(config, 'started', phase)`.
  function seedInProgress(dir, phase) {
    const c = loadConfig(dir);
    appendEvent(c, 'started', phase);
    saveConfig(dir, c);
  }

  it('skips a phase whose artifact is on disk but only has a `started` event (in_progress)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeArtifact(dir, '01_REQUIREMENTS.json');
      writeArtifact(dir, '02_SYSTEM_DESIGN.md', '# Design\n'.repeat(5));
      // Phase 1 has a `completed` event so the alpha.11 hasNoEventHistory
      // check lets it through. Phase 2 only has a `started` — preserved by
      // the alpha.10 isInProgress check. Both rules exercised in one run.
      const c0 = loadConfig(dir);
      appendEvent(c0, 'completed', 1);
      saveConfig(dir, c0);
      seedInProgress(dir, 2);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.ok(c.completedPhases.includes(1), 'phase 1 (completed event present) must infer');
      assert.ok(!c.completedPhases.includes(2), 'phase 2 (started, not completed) must NOT be auto-completed');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips a phase that has an entry in config.rejections — round-trip through cmdReject', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeArtifact(dir, '01_REQUIREMENTS.json');
      writeArtifact(dir, '03_TEST_CASES.json');

      // Phase 1 has a `completed` event so alpha.11's hasNoEventHistory
      // doesn't preserve it; phase 3 will be rejected explicitly below.
      const c0 = loadConfig(dir);
      appendEvent(c0, 'completed', 1);
      saveConfig(dir, c0);

      // Round-trip: reach `config.rejections` through the actual reject command,
      // not by hand-writing the JSON. If reject's storage shape ever changes,
      // this test discovers the drift instead of testing a stale fixture.
      silence(() => cmdReject({
        dir,
        args: ['tests', '--feedback', 'Coverage gap on FR-002'],
        flagValue: (name) => name === '--feedback' ? 'Coverage gap on FR-002' : null,
        err: (msg) => { throw new Error(msg); },
      }));

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.ok(c.completedPhases.includes(1), 'phase 1 (completed event present) must infer');
      assert.ok(!c.completedPhases.includes(3), 'phase 3 (rejected) must NOT be auto-completed');
      assert.ok(c.rejections[3], 'rejection record must survive the upgrade');
      assert.equal(c.rejections[3].feedback, 'Coverage gap on FR-002');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('Ultron canary scenario: phase-1 approved + phases ux/2/3/4/5 in_progress + phase 5 rejected', () => {
    // Reproduces the exact pre-upgrade state captured in /tmp/ultron-canary-alpha9.
    // Acceptance criterion (BACKLOG): completedPhases stays [1] (i.e. unchanged
    // beyond what was already there), rejections survive, in_progress phases
    // are not auto-completed. Real run output must equal dry-run output.
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });

      // Phase 1 approved.
      const c0 = loadConfig(dir);
      c0.approvedPhases = [1];
      saveConfig(dir, c0);

      // Artifacts on disk for phases ux, 2, 3, 4, 5.
      writeArtifact(dir, '01_UX_SPEC.md',                   '# UX\n'.repeat(5));
      writeArtifact(dir, '01_REQUIREMENTS.json');           // phase 1, already approved → skipped as already-tracked
      writeArtifact(dir, '02_SYSTEM_DESIGN.md',             '# Design\n'.repeat(5));
      writeArtifact(dir, '03_TEST_CASES.json');
      writeArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json');
      writeArtifact(dir, '05_PROOF_OF_COMPLIANCE.json');

      // ux, 2, 3, 4 in_progress (started but not completed).
      seedInProgress(dir, 'ux');
      seedInProgress(dir, 2);
      seedInProgress(dir, 3);
      seedInProgress(dir, 4);

      // Phase 5 rejected via the real producer.
      silence(() => cmdReject({
        dir,
        args: ['deploy', '--feedback', 'Docker→systemd'],
        flagValue: (name) => name === '--feedback' ? 'Docker→systemd' : null,
        err: (msg) => { throw new Error(msg); },
      }));

      // Capture dry-run output.
      let dryOut = '';
      const origLog = console.log;
      const origErr = process.stderr.write.bind(process.stderr);
      console.log = (...a) => { dryOut += a.join(' ') + '\n'; };
      process.stderr.write = () => true;
      try { runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR, dryRun: true }); }
      finally { console.log = origLog; process.stderr.write = origErr; }

      // Dry-run must not have written.
      assert.equal(loadConfig(dir).aitriVersion, '0.1.10', 'dry-run must not advance version');

      // Real run.
      let realOut = '';
      console.log = (...a) => { realOut += a.join(' ') + '\n'; };
      process.stderr.write = () => true;
      try { runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }); }
      finally { console.log = origLog; process.stderr.write = origErr; }

      const c = loadConfig(dir);
      assert.deepEqual(c.completedPhases, [], 'no phase must be auto-completed in this scenario');
      assert.deepEqual(c.approvedPhases,  [1], 'pre-existing approval must survive');
      assert.ok(c.rejections[5],          'phase 5 rejection must survive upgrade');

      // Both runs must report the same preserved phases (real ≈ dry-run on
      // the rejected/in_progress sections — only the ◻️/⚠️ markers differ).
      const preserved = /Preserved \(operator action required\)/;
      assert.match(dryOut,  preserved, 'dry-run report must surface preserved phases');
      assert.match(realOut, preserved, 'real-run report must surface preserved phases');
      assert.match(realOut, /rejected, not auto-completed/);
      assert.match(realOut, /in progress, not auto-completed/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('positive path: started + completed events → phase IS inferred (events do not block legitimate completes)', () => {
    // Negative-of-the-negative per ADR-029 round-trip: ensure the in_progress
    // detector does not over-fire. A phase that was started AND completed in
    // the buffer must still be inferred when missing from completedPhases.
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeArtifact(dir, '01_REQUIREMENTS.json');

      const c0 = loadConfig(dir);
      appendEvent(c0, 'started',   1);
      appendEvent(c0, 'completed', 1);
      saveConfig(dir, c0);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      assert.ok(loadConfig(dir).completedPhases.includes(1),
        'phase 1 with started+completed events must still be inferred');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('legacy fallback: artifact on disk with empty events buffer is still inferred (no buffer = no signal)', () => {
    // Old projects upgraded from before the events log was meaningful must
    // continue to work — absence of a `started` event means "no positive
    // evidence of in_progress", which is different from "in_progress".
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeArtifact(dir, '01_REQUIREMENTS.json');
      // Force an empty events buffer — represents a legacy project.
      const c0 = loadConfig(dir);
      c0.events = [];
      saveConfig(dir, c0);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      assert.ok(loadConfig(dir).completedPhases.includes(1),
        'legacy project (no events) must continue to be inferred — no regression');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // alpha.11: third edge case the alpha.10 fix did not cover. Surfaced by the
  // Ultron canary against alpha.10 on 2026-04-29.
  //
  // Real Ultron pre-upgrade had `events[]` rich with phase-1 activity (cascade
  // re-approval at 22:15-22:17), but ZERO entries for phases 2/3/4 — those
  // events had been evicted past the 20-entry cap, OR the cascade itself
  // never recorded a `started` for them. Artifacts for 2/3/4 still on disk
  // from the prior build. Alpha.10 fell through to legacy inference and
  // proposed marking 2/3/4 completed — corrupting the cascade's intent.
  it('skips a phase whose artifact is on disk but has zero events when buffer is non-empty', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeArtifact(dir, '01_REQUIREMENTS.json');
      writeArtifact(dir, '02_SYSTEM_DESIGN.md', '# Design\n'.repeat(5));

      // Phase 1 has explicit completed/approved events; phase 2 has none.
      // The events buffer is non-empty (positive evidence the project is
      // active and tracked), so the legacy "artifact-presence ≡ completed"
      // fallback must NOT fire for phase 2.
      const c0 = loadConfig(dir);
      appendEvent(c0, 'started',   1);
      appendEvent(c0, 'completed', 1);
      appendEvent(c0, 'approved',  1);
      saveConfig(dir, c0);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.ok(c.completedPhases.includes(1),
        'phase 1 (completed event in buffer) must be inferred');
      assert.ok(!c.completedPhases.includes(2),
        'phase 2 (artifact on disk, zero events, non-empty buffer) must NOT be auto-completed');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reports a phase skipped for "no event history" under Preserved (operator action required)', () => {
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
      writeArtifact(dir, '01_REQUIREMENTS.json');
      writeArtifact(dir, '02_SYSTEM_DESIGN.md', '# Design\n'.repeat(5));

      const c0 = loadConfig(dir);
      appendEvent(c0, 'completed', 1);
      saveConfig(dir, c0);

      let out = '';
      const origLog = console.log;
      const origErr = process.stderr.write.bind(process.stderr);
      console.log = (...a) => { out += a.join(' ') + '\n'; };
      process.stderr.write = () => true;
      try { runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR, dryRun: true }); }
      finally { console.log = origLog; process.stderr.write = origErr; }

      assert.match(out, /Preserved \(operator action required\)/);
      assert.match(out, /no event history, possibly stale/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('Ultron alpha.11 scenario: phase 1 active in events, phases 2-4 cascade-stale, phase 5 rejected', () => {
    // Tighter version of the existing Ultron scenario: artifacts for ux/2/3/4/5
    // exist on disk, BUT only phase 1 has events (mirrors real .aitri post-cascade).
    // No `started` events for 2/3/4 — the alpha.10 isInProgress check returns false
    // for them. Without alpha.11's hasNoEventHistory, the legacy fallback would
    // wrongly infer them completed.
    const dir = tmpDir();
    try {
      cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });

      const c0 = loadConfig(dir);
      c0.approvedPhases = [1];
      appendEvent(c0, 'completed', 1);
      appendEvent(c0, 'approved',  1);
      appendEvent(c0, 'started',   'ux');
      saveConfig(dir, c0);

      writeArtifact(dir, '01_UX_SPEC.md', '# UX\n'.repeat(5));
      writeArtifact(dir, '01_REQUIREMENTS.json');
      writeArtifact(dir, '02_SYSTEM_DESIGN.md', '# Design\n'.repeat(5));
      writeArtifact(dir, '03_TEST_CASES.json');
      writeArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json');
      writeArtifact(dir, '05_PROOF_OF_COMPLIANCE.json');

      // Phase 5 rejected via the real producer.
      silence(() => cmdReject({
        dir,
        args: ['deploy', '--feedback', 'Docker→systemd'],
        flagValue: (name) => name === '--feedback' ? 'Docker→systemd' : null,
        err: (msg) => { throw new Error(msg); },
      }));

      silence(() => runUpgrade({ dir, VERSION: '0.1.99', rootDir: ROOT_DIR }));

      const c = loadConfig(dir);
      assert.deepEqual(c.approvedPhases, [1], 'pre-existing approval must survive');
      assert.ok(!c.completedPhases.includes(2), 'phase 2 (cascade-stale) must NOT auto-complete');
      assert.ok(!c.completedPhases.includes(3), 'phase 3 (cascade-stale) must NOT auto-complete');
      assert.ok(!c.completedPhases.includes(4), 'phase 4 (cascade-stale) must NOT auto-complete');
      assert.ok(!c.completedPhases.includes(5), 'phase 5 (rejected) must NOT auto-complete');
      assert.ok(c.rejections[5], 'phase 5 rejection must survive upgrade');
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

// ── Z2 (alpha.13): artifactHashes backfill ──────────────────────────────────
//
// Projects upgraded from pre-alpha schemas have approvedPhases populated but
// artifactHashes absent. Without backfill, drift detection silently dies.
// Surfaced by Zombite root canary 2026-04-29 (alpha.4 → alpha.12 path).

describe('lib/upgrade/migrations/from-0.1.65 — STATE-MISSING: artifactHashes backfill (Z2)', () => {
  function seedArtifacts(dir) {
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), '{"functional_requirements":[]}');
    fs.writeFileSync(path.join(dir, 'spec/02_SYSTEM_DESIGN.md'),  '# Design');
    fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'),   '{"test_cases":[]}');
    fs.writeFileSync(path.join(dir, 'spec/04_IMPLEMENTATION_MANIFEST.json'), '{"files_created":[]}');
    fs.writeFileSync(path.join(dir, 'spec/05_PROOF_OF_COMPLIANCE.json'),     '{"requirement_compliance":[]}');
  }

  it('backfills artifactHashes for every approved phase when field is empty', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1, 2, 3, 4, 5], artifactHashes: {} });
      seedArtifacts(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.artifactHashes);
      assert.ok(c.artifactHashes['1'], 'phase 1 hash backfilled');
      assert.ok(c.artifactHashes['2'], 'phase 2 hash backfilled');
      assert.ok(c.artifactHashes['3'], 'phase 3 hash backfilled');
      assert.ok(c.artifactHashes['4'], 'phase 4 hash backfilled');
      assert.ok(c.artifactHashes['5'], 'phase 5 hash backfilled');
      // The hash must equal the on-disk content hash — that locks the SSoT.
      const expected = hashArtifact(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(c.artifactHashes['1'], expected);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('backfills only missing phases — preserves existing hashes (idempotent)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, {
        approvedPhases: [1, 2, 3],
        artifactHashes: { '1': 'preexisting-hash-do-not-touch' },
      });
      seedArtifacts(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.equal(c.artifactHashes['1'], 'preexisting-hash-do-not-touch', 'must not overwrite existing hash');
      assert.ok(c.artifactHashes['2'], 'phase 2 hash backfilled');
      assert.ok(c.artifactHashes['3'], 'phase 3 hash backfilled');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips phases whose artifact is missing on disk', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1, 2], artifactHashes: {} });
      // Only phase 1 has an artifact on disk.
      fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), '{}');
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.artifactHashes['1']);
      assert.equal(c.artifactHashes['2'], undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('handles optional phase keys (ux, discovery)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: ['discovery', 'ux', 1], artifactHashes: {} });
      fs.writeFileSync(path.join(dir, 'spec/00_DISCOVERY.md'), '# d');
      fs.writeFileSync(path.join(dir, 'spec/01_UX_SPEC.md'),    '# ux');
      fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), '{}');
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.ok(c.artifactHashes['discovery'], 'discovery hash backfilled');
      assert.ok(c.artifactHashes['ux'],        'ux hash backfilled');
      assert.ok(c.artifactHashes['1'],         'phase 1 hash backfilled');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not fire when all approved phases already have hashes (idempotent re-run)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, {
        approvedPhases:  [1, 2],
        artifactHashes: { '1': 'h1', '2': 'h2' },
      });
      seedArtifacts(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      assert.deepEqual(c.artifactHashes, { '1': 'h1', '2': 'h2' });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not fire when approvedPhases is empty (no work to lock in)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [], artifactHashes: {} });
      seedArtifacts(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      // Empty object preserved (writeLegacyConfig seeds {}). No new keys.
      assert.deepEqual(c.artifactHashes, {});
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('emits upgrade_migration events per backfilled phase', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1, 2], artifactHashes: {} });
      seedArtifacts(dir);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const c = loadConfig(dir);
      const evs = c.events.filter(e =>
        e.event === 'upgrade_migration' && e.target?.startsWith('.aitri#artifactHashes['));
      assert.equal(evs.length, 2, 'one event per phase backfilled');
      assert.ok(evs.some(e => e.target === '.aitri#artifactHashes[1]'));
      assert.ok(evs.some(e => e.target === '.aitri#artifactHashes[2]'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // alpha.18 — surface the lock-in caveat in the upgrade report. Comment in
  // diagnoseArtifactHashes had claimed this since alpha.13 but the report
  // never actually emitted it.
  function captureStdoutLocal(fn) {
    let out = '';
    const origLog = console.log;
    const origErr = process.stderr.write.bind(process.stderr);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    process.stderr.write = () => true;
    try { fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
    return out;
  }

  it('upgrade report surfaces the lock-in caveat when artifactHashes are backfilled', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1, 2], artifactHashes: {} });
      seedArtifacts(dir);
      const out = captureStdoutLocal(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      assert.match(out, /artifactHashes were stamped from current on-disk state/);
      assert.match(out, /now the approved baseline/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('upgrade report does NOT surface the caveat when no artifactHashes are backfilled', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, {
        approvedPhases:  [1, 2],
        artifactHashes: { '1': 'h1', '2': 'h2' },
      });
      seedArtifacts(dir);
      const out = captureStdoutLocal(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      assert.doesNotMatch(out, /artifactHashes were stamped/);
      assert.doesNotMatch(out, /artifactHashes would be stamped/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('dry-run report shows the caveat in conditional voice ("would be stamped")', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1], artifactHashes: {} });
      seedArtifacts(dir);
      const out = captureStdoutLocal(() => runUpgrade({ dir, VERSION: '0.1.99', dryRun: true }));
      assert.match(out, /artifactHashes would be stamped from current on-disk state/);
      assert.doesNotMatch(out, /artifactHashes were stamped/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Z5 (alpha.13): legacy 04_TEST_RESULTS.json schema flagging ──────────────
//
// Surfaced by Zombite root canary 2026-04-29: `.aitri.verifyPassed: true` but
// the artifact had pre-alpha shape (`suite_summary`, no `results[]`). Upgrade
// passed silently as "schema canonical" — validate kept reporting deployable.
// Fix per backlog: flag-only finding (Option A); operator runs verify-run to
// regenerate.

describe('lib/upgrade/migrations/from-0.1.65 — VALIDATOR-GAP: legacy test results schema (Z5)', () => {
  it('flags when verifyPassed is true and artifact lacks results[] + summary', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { verifyPassed: true });
      // Pre-alpha shape: suite_summary, no results, no summary
      fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
        executed_at: '2026-03-10T00:00:00.000Z',
        suite_summary: { total_tests: 27, passed: 27, failed: 0, skipped: 0 },
        fr_coverage: [{ fr_id: 'FR-001', status: 'covered', evidence: ['TC-001'] }],
      }));
      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      const f = findings.find(x => x.target === '04_TEST_RESULTS.json' && /legacy/.test(x.transform));
      assert.ok(f, 'expected a legacy-schema finding');
      assert.equal(f.category, 'validatorGap');
      assert.equal(f.autoMigratable, false);
      assert.match(f.reason, /aitri verify-run/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT flag when artifact already has modern shape (results[] + summary)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { verifyPassed: true });
      fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
        executed_at: '2026-04-01T00:00:00.000Z',
        results: [{ tc_id: 'TC-001', status: 'pass' }],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        fr_coverage: [],
      }));
      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findings.find(x => x.target === '04_TEST_RESULTS.json' && /legacy/.test(x.transform)), undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT flag when verifyPassed is false (no deploy gate to mislead)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { verifyPassed: false });
      fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
        suite_summary: { total_tests: 0 },
      }));
      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findings.find(x => x.target === '04_TEST_RESULTS.json' && /legacy/.test(x.transform)), undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT flag when 04_TEST_RESULTS.json is absent (not yet a deploy claim)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { verifyPassed: true });
      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findings.find(x => x.target === '04_TEST_RESULTS.json' && /legacy/.test(x.transform)), undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('flag survives migrateAll (non-auto-migratable → returned in flagged[])', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { verifyPassed: true });
      fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
        suite_summary: { total_tests: 5 },
      }));
      let result;
      silence(() => { result = migrateAll(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')), '0.1.99'); });
      const flagged = result.flagged.find(f => f.target === '04_TEST_RESULTS.json' && /legacy/.test(f.transform));
      assert.ok(flagged);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── N1 (alpha.16): legacy venv-relative manifest test_runner flagging ───────
//
// Surfaced by Cesar canary 2026-05-02 (deepening pass). Projects authored
// before alpha.9 (cwd change `3603a49`) whose `04_IMPLEMENTATION_MANIFEST.json::
// test_runner` is `.venv/bin/pytest …` (relative to project root) silently
// break once `aitri feature verify-run` runs from the feature directory:
// the binary is no longer reachable. Symptom is a degraded results file
// (0 passed / N skipped) plus `verifyPassed: false` per Z1, even though the
// runner never executed. Decision: flag at upgrade time (VALIDATOR-GAP); do
// not auto-rewrite (option (ii) would violate ADR-027 §2 shape-only and is
// fragile across venv layouts) and do not introduce `--cwd` (option (i)
// undoes the alpha.9 scoping fix). Operator edits the manifest to use an
// absolute path or a PATH-resolved binary.

describe('lib/upgrade/migrations/from-0.1.65 — VALIDATOR-GAP: legacy venv-relative manifest runner (N1)', () => {
  function writeRootManifest(dir, runner) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'spec/04_IMPLEMENTATION_MANIFEST.json'),
      JSON.stringify({ files_created: [{ path: 'src/x.py' }], test_runner: runner })
    );
  }
  function writeFeatureManifest(dir, name, runner) {
    const featDir = path.join(dir, 'features', name, 'spec');
    fs.mkdirSync(featDir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'features', name, '.aitri'),
      JSON.stringify({ projectName: name, artifactsDir: 'spec' })
    );
    fs.writeFileSync(
      path.join(featDir, '04_IMPLEMENTATION_MANIFEST.json'),
      JSON.stringify({ files_created: [{ path: 'src/x.py' }], test_runner: runner })
    );
  }

  it('flags root manifest when test_runner starts with `.venv/`', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeRootManifest(dir, '.venv/bin/pytest tests/ -v');
      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      const f = findings.find(x => /legacy venv-relative/.test(x.transform));
      assert.ok(f, 'expected a venv-relative finding for the root manifest');
      assert.equal(f.category, 'validatorGap');
      assert.equal(f.autoMigratable, false);
      assert.equal(f.target, '04_IMPLEMENTATION_MANIFEST.json');
      assert.match(f.reason, /alpha\.9|cwd/i);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('flags `venv/` (no leading dot) and `env/` prefixes', () => {
    for (const runner of ['venv/bin/pytest -v', 'env/bin/pytest -v']) {
      const dir = tmpDir();
      try {
        writeLegacyConfig(dir);
        writeRootManifest(dir, runner);
        const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
        assert.ok(
          findings.find(x => /legacy venv-relative/.test(x.transform)),
          `expected finding for runner "${runner}"`
        );
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  });

  it('does NOT flag absolute test_runner paths', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeRootManifest(dir, '/Users/me/.venv/bin/pytest tests/ -v');
      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findings.find(x => /legacy venv-relative/.test(x.transform)), undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT flag PATH-resolved or unrelated runners (bare pytest, npm test, go test)', () => {
    for (const runner of ['pytest -v', 'npm test', 'go test ./... -v', 'pipenv run pytest']) {
      const dir = tmpDir();
      try {
        writeLegacyConfig(dir);
        writeRootManifest(dir, runner);
        const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
        assert.equal(
          findings.find(x => /legacy venv-relative/.test(x.transform)), undefined,
          `did not expect a finding for runner "${runner}"`
        );
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  });

  it('emits one finding per offending manifest across root + features/', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeRootManifest(dir, '.venv/bin/pytest -v');
      writeFeatureManifest(dir, 'alpha-feature', '.venv/bin/pytest -v');
      writeFeatureManifest(dir, 'beta-feature',  'venv/bin/pytest -v');
      writeFeatureManifest(dir, 'clean-feature', '/abs/bin/pytest -v');  // not flagged

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')))
        .filter(x => /legacy venv-relative/.test(x.transform));

      assert.equal(findings.length, 3, `expected 3 findings, got ${findings.length}`);
      const targets = findings.map(f => f.target).sort();
      assert.deepEqual(targets, [
        '04_IMPLEMENTATION_MANIFEST.json',
        'features/alpha-feature/spec/04_IMPLEMENTATION_MANIFEST.json',
        'features/beta-feature/spec/04_IMPLEMENTATION_MANIFEST.json',
      ]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('flag survives migrateAll (non-auto-migratable → returned in flagged[])', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir);
      writeRootManifest(dir, '.venv/bin/pytest tests/ -v');
      let result;
      silence(() => { result = migrateAll(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')), '0.1.99'); });
      assert.ok(result.flagged.find(f => /legacy venv-relative/.test(f.transform)));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Orphan IDEA.md absorption (alpha.17) ────────────────────────────────────
//
// Background: `aitri approve 1` archives IDEA.md into
// `01_REQUIREMENTS.json.original_brief` and deletes the file. That logic
// landed in v0.1.89 (commit fa68794). Projects whose Phase 1 was approved
// before v0.1.89 missed the archive — `IDEA.md` survives every subsequent
// `adopt --upgrade` because no migrator touches it. This migrator closes
// that gap retroactively: when Phase 1 is approved + IDEA.md still on disk
// + 01_REQUIREMENTS.json lacks `original_brief`, absorb and unlink.
//
// Auto-migratable (shape transform — same content moves from one file to
// one field; nothing semantic). Non-destructive: the brief is preserved
// inside the artifact before IDEA.md is removed.
//
// Cost: a single `fs.existsSync` per upgrade run. After the first
// successful migration the file is gone, so subsequent upgrades short-
// circuit on the existsSync check without parsing or reading anything.

describe('lib/upgrade/migrations/from-0.1.65 — orphan IDEA.md absorption', () => {
  function writeReqsArtifact(dir, data = { functional_requirements: [] }) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify(data, null, 2));
  }

  it('migrates: Phase 1 approved + IDEA.md present + original_brief missing → absorb + unlink', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir);
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Brief\n\nThe original idea text.\n');

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));

      assert.equal(fs.existsSync(path.join(dir, 'IDEA.md')), false, 'IDEA.md must be removed');
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(after.original_brief, '# Brief\n\nThe original idea text.\n',
        'original_brief must contain the verbatim IDEA.md content');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('flags (does NOT auto-migrate) when original_brief already exists', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir, { functional_requirements: [], original_brief: 'pre-existing' });
      fs.writeFileSync(path.join(dir, 'IDEA.md'), 'leftover content');

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      const f = findings.find(x => x.target === 'IDEA.md');
      assert.ok(f, 'expected an orphan-IDEA finding');
      assert.equal(f.autoMigratable, false, 'must NOT auto-migrate when original_brief is present (would clobber)');
      assert.match(f.reason, /original_brief/);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      assert.equal(fs.existsSync(path.join(dir, 'IDEA.md')), true,
        'IDEA.md must be preserved when migration is non-auto');
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(after.original_brief, 'pre-existing', 'original_brief must be untouched');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT flag when Phase 1 is not approved (nothing to archive against)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [] });
      writeReqsArtifact(dir);
      fs.writeFileSync(path.join(dir, 'IDEA.md'), 'pre-approval brief');

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findings.find(x => x.target === 'IDEA.md'), undefined);
      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      assert.equal(fs.existsSync(path.join(dir, 'IDEA.md')), true, 'IDEA.md must remain — Phase 1 not yet approved');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT flag when IDEA.md is absent (no work to do, fast path)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir);
      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findings.find(x => x.target === 'IDEA.md'), undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('migration is idempotent: a second upgrade run finds nothing more', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir);
      fs.writeFileSync(path.join(dir, 'IDEA.md'), 'one-shot brief');

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      const findingsSecond = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findingsSecond.find(x => x.target === 'IDEA.md'), undefined,
        'second run must find no orphan-IDEA work');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('preserves Phase 1 approval across the absorb (re-stamps artifactHashes[1])', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir);
      fs.writeFileSync(path.join(dir, 'IDEA.md'), 'approved-baseline brief');
      // Stamp a stale hash for phase 1 to mirror a real approved project.
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      cfg.artifactHashes = { 1: hashArtifact(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8')) };
      fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(cfg, null, 2));

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));

      const after = fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8');
      const cfgAfter = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      assert.equal(cfgAfter.artifactHashes['1'], hashArtifact(after),
        'artifactHashes[1] must match post-archive content (no false drift)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Orphan IDEA.md absorption — pre-flight scan + stale-ref detection (alpha.24) ─
//
// Background: alpha.17 introduced the auto-absorb migration but did not check
// whether downstream artifacts referenced IDEA.md as a literal path. Hub
// surfaced the gap on 2026-05-02: its `hub-web-only` feature treated IDEA.md
// as user-facing documentation tracked in 04_IMPLEMENTATION_MANIFEST.json
// (`path: "IDEA.md"`) plus 14+ references across TCs, system design, and
// proof of compliance. The alpha.17 migration silently unlinked the file
// and broke `aitri verify-run` invisibly.
//
// alpha.24 closes the gap with two paths through diagnoseOrphanIdea:
//   (a) PRE-FLIGHT: when IDEA.md still exists, scan root + features for
//       /\bIDEA\.md\b/. If any match, block auto-absorption and emit a
//       validatorGap finding listing the offenders.
//   (b) STALE-REF DETECTION: when IDEA.md is already absent (post-absorb)
//       and Phase 1 is approved, scan again. Surface the same offenders
//       so an already-broken project can fix forward without restoring the
//       file. Auto-fix is impossible — references could be intentional
//       documentation or test assertions; only the operator knows.
//
// 01_REQUIREMENTS.json is excluded from the scan at every level because
// `original_brief` legitimately holds the absorbed IDEA.md content as a
// substring (the absorbed text, not a path reference).

describe('lib/upgrade/migrations/from-0.1.65 — orphan IDEA.md pre-flight scan + stale-ref detection (alpha.24)', () => {
  function writeReqsArtifact(dir, data = { functional_requirements: [] }) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify(data, null, 2));
  }

  it('PRE-FLIGHT: blocks auto-absorb when 04_IMPLEMENTATION_MANIFEST.json references IDEA.md as a path', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir);
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Brief\n');
      fs.writeFileSync(
        path.join(dir, 'spec/04_IMPLEMENTATION_MANIFEST.json'),
        JSON.stringify({ files: [{ path: 'IDEA.md', kind: 'doc' }] }, null, 2),
      );

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      const f = findings.find(x => x.target === 'IDEA.md');
      assert.ok(f, 'expected an orphan-IDEA finding');
      assert.equal(f.autoMigratable, false, 'pre-flight scan must block absorption');
      assert.match(f.reason, /04_IMPLEMENTATION_MANIFEST\.json/);
      assert.match(f.reason, /literal path/);

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      assert.equal(fs.existsSync(path.join(dir, 'IDEA.md')), true,
        'IDEA.md must NOT be unlinked when references exist');
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(after.original_brief, undefined, 'original_brief must NOT be populated when blocked');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('PRE-FLIGHT: scans feature artifacts (read-only — does not violate A2)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir);
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Brief\n');

      const featSpec = path.join(dir, 'features/foo/spec');
      fs.mkdirSync(featSpec, { recursive: true });
      fs.writeFileSync(
        path.join(featSpec, '03_TEST_CASES.json'),
        JSON.stringify({ test_cases: [{ id: 'TC-001', given: 'IDEA.md exists', when: 'read IDEA.md', expected_result: 'present' }] }, null, 2),
      );

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      const f = findings.find(x => x.target === 'IDEA.md');
      assert.ok(f, 'feature-level reference must be detected');
      assert.equal(f.autoMigratable, false);
      assert.match(f.reason, /features\/foo\/spec\/03_TEST_CASES\.json/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('PRE-FLIGHT: ignores 01_REQUIREMENTS.json content (original_brief may legitimately contain IDEA.md text)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      // The brief text itself happens to mention "IDEA.md" — this must NOT block.
      writeReqsArtifact(dir, { functional_requirements: [], note: 'see IDEA.md for context' });
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Brief\n');

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      const f = findings.find(x => x.target === 'IDEA.md');
      assert.ok(f, 'expected an orphan-IDEA finding');
      assert.equal(f.autoMigratable, true,
        '01_REQUIREMENTS.json content must NOT count as a path reference (false-positive guard)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('PRE-FLIGHT: regression — clean project (no references) still auto-absorbs', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir);
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Clean brief\n');
      fs.writeFileSync(path.join(dir, 'spec/02_SYSTEM_DESIGN.md'), '# Design\n\nNo path references here.\n');

      silence(() => runUpgrade({ dir, VERSION: '0.1.99' }));
      assert.equal(fs.existsSync(path.join(dir, 'IDEA.md')), false, 'IDEA.md must be removed (clean path)');
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(after.original_brief, '# Clean brief\n');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('STALE-REF DETECTION: IDEA.md absent + references remaining → flag (no auto-fix)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir, { functional_requirements: [], original_brief: 'previously absorbed' });
      // No IDEA.md on disk (already absorbed by a prior alpha.17+ upgrade).
      // But a downstream artifact still references it as a path.
      fs.writeFileSync(
        path.join(dir, 'spec/05_PROOF_OF_COMPLIANCE.json'),
        JSON.stringify({ evidence: 'grep IDEA.md returns zero matches' }, null, 2),
      );

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      const f = findings.find(x => String(x.target).startsWith('IDEA.md'));
      assert.ok(f, 'expected stale-ref finding');
      assert.equal(f.autoMigratable, false);
      assert.equal(f.target, 'IDEA.md (absorbed)');
      assert.match(f.reason, /no longer exists/);
      assert.match(f.reason, /05_PROOF_OF_COMPLIANCE\.json/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('STALE-REF DETECTION negative: IDEA.md absent + no references → no finding (clean post-absorb state)', () => {
    const dir = tmpDir();
    try {
      writeLegacyConfig(dir, { approvedPhases: [1] });
      writeReqsArtifact(dir, { functional_requirements: [], original_brief: 'previously absorbed' });
      fs.writeFileSync(path.join(dir, 'spec/02_SYSTEM_DESIGN.md'), '# Design\n\nNothing here.\n');

      const findings = from065.diagnose(dir, JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')));
      assert.equal(findings.find(x => String(x.target).startsWith('IDEA.md')), undefined,
        'no orphan-IDEA finding when post-absorb state is clean');
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
