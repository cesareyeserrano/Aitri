/**
 * Tests: aitri approve — mark phase as approved (non-TTY path)
 * Covers: state recording, not-completed gate, missing artifact, lastSession, alias support
 * Note: TTY-interactive paths (checklist, drift confirmation) cannot be tested in unit tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  cmdApprove,
  buildApprovalSummary,
  summarizeRequirements,
  summarizeTestCases,
  summarizeManifest,
  summarizeCompliance,
  summarizeMarkdownSections,
  buildArtifactDriftDiff,
  showArtifact,
} from '../../lib/commands/approve.js';
import { loadConfig, hashArtifact } from '../../lib/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-approve-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function captureAll(fn) {
  let out = '';
  const origLog = console.log.bind(console);
  const origWrite = process.stdout.write.bind(process.stdout);
  console.log = (...a) => { out += a.join(' ') + '\n'; };
  process.stdout.write = (s) => { out += s; return true; }; // B1 (rc.12): summary/checklist use stdout.write
  try { fn(); } finally { console.log = origLog; process.stdout.write = origWrite; }
  return out;
}

const noopErr = (msg) => { throw new Error(msg); };

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: 'spec',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

const ARTIFACT_CONTENT = '{"project_name":"T","functional_requirements":[]}';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdApprove() — B1/B2 human-review gate (rc.12)', () => {
  function captureStdout(fn) {
    let out = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const origLog = console.log;
    process.stdout.write = (s) => { out += s; return true; };
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { fn(); } finally { process.stdout.write = origWrite; console.log = origLog; }
    return out;
  }

  function seedPhase1(dir, overrides = {}) {
    writeFile(dir, 'spec/01_REQUIREMENTS.json', '{"project_name":"T","functional_requirements":[]}');
    writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1], ...overrides }));
  }

  it('B1 — agent-mode approve prints summary + real checklist + checkpoint (was silent before)', () => {
    const dir = tmpDir();
    try {
      seedPhase1(dir);
      const out = captureStdout(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.match(out, /HUMAN CHECKPOINT — approve requirements/, 'summary must print in agent mode (was silent on !isTTY)');
      assert.match(out, /Human Review/, 'real Human Review checklist must be extracted from the template');
      assert.match(out, /HUMAN REVIEW CHECKPOINT/, 'agent-relay checkpoint directive must print');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // FB-APPROVE-UX-0715 + FB-APPROVE-VERIFY-LEGIBILITY-0715: the checkpoint block uses a
  // shared grammar (WHAT YOU ARE REVIEWING / WHAT APPROVING MEANS) so the human — often via
  // a relaying agent — sees what the gate covers and what it does NOT. Pins are on sections
  // and load-bearing wording, not byte-exact layout.
  it('checkpoint grammar — labeled sections print on every approve', () => {
    const dir = tmpDir();
    try {
      seedPhase1(dir);
      const out = captureStdout(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.match(out, /WHAT YOU ARE REVIEWING/, 'reviewing section header');
      assert.match(out, /Artifact: 01_REQUIREMENTS\.json/);
      assert.match(out, /WHAT APPROVING MEANS/, 'meaning section header');
      assert.match(out, /sealed as the input for every later phase/, 'phase-1 meaning line');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('approve 4 states it is build-phase review, not final sign-off — and that Aitri re-verifies', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/04_BUILD_REPORT.json', JSON.stringify({
        files_created: [{ path: 'a.js' }], test_runner: 'node t.js',
      }));
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1, 2, 3, 4], approvedPhases: [1, 2, 3] }));
      const out = captureStdout(() => cmdApprove({ dir, args: ['build'], err: noopErr }));
      assert.match(out, /approving the BUILD PHASE, not the final product/, 'the approve-4 meaning');
      assert.match(out, /agent-attested/, 'names why Aitri re-runs the suite');
      assert.match(out, /verify-run/, 'points at the independent verify');
      assert.match(out, /Build approved ≠ verified/, 'post-approval context carries the same clarification');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('D1 — agent-mode approve emits a CHECKPOINT, never the "your only next action" auto-chain imperative', () => {
    const dir = tmpDir();
    try {
      seedPhase1(dir);   // no TTY in tests → agent-mode-no-gate path
      const out = captureStdout(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.match(out, /PIPELINE CHECKPOINT — Phase (1|requirements) approval recorded, human review pending/,
        'agent mode must print the checkpoint, not the direct instruction');
      assert.doesNotMatch(out, /your only next action is/,
        'the imperative AGENTS.md obeys literally is the concrete auto-chain mechanism — it must NOT print in agent mode');
      assert.match(out, /After they confirm, the next action is:/, 'the next command is framed as post-confirmation');
      assert.match(out, /aitri run-phase (ux|architecture)/, 'the next command is still NAMED so the agent can relay it');
      assert.match(out, /do NOT run the next action before the user confirms/i, 'the stop is explicit');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('B2 — humanApprovalGate ON blocks agent-mode approval and does not record it', () => {
    const dir = tmpDir();
    try {
      seedPhase1(dir, { humanApprovalGate: true });
      let msg = '';
      assert.throws(() => captureStdout(() =>
        cmdApprove({ dir, args: ['requirements'], err: (m) => { msg = m; throw new Error(m); } })));
      assert.match(msg, /humanApprovalGate is ON/);
      assert.ok(!(loadConfig(dir).approvedPhases || []).map(String).includes('1'),
        'approval must NOT be recorded when the gate blocks');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('B2 — default (gate absent) proceeds and records approval', () => {
    const dir = tmpDir();
    try {
      seedPhase1(dir);
      captureStdout(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.ok((loadConfig(dir).approvedPhases || []).map(String).includes('1'),
        'default agent-mode approval must still proceed (autonomy preserved)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('clears a prior rejection of the phase on approval (state-hunt finding #2 Part B)', () => {
    const dir = tmpDir();
    try {
      // Phase 1 was rejected, then redone; approving it resolves the rejection.
      seedPhase1(dir, { rejections: { '1': { at: '2026-01-01T00:00:00.000Z', feedback: 'redo' } } });
      captureStdout(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      const cfg = loadConfig(dir);
      assert.ok((cfg.approvedPhases || []).map(String).includes('1'), 'phase 1 approved');
      assert.ok(!cfg.rejections || !cfg.rejections['1'],
        'the addressed rejection must be cleared on approval (no stale advisory)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdApprove() — first approve of phase 1 archives IDEA.md', () => {
  let dir;
  let output;
  const ideaContent = '# My Project\n\n## Problem\nUsers waste hours.\n## Target Users\nDevs.\n## Business Rules\nMust be fast.\n## Success Criteria\nGiven X when Y then Z.\n';
  const reqContent  = '{"project_name":"T","functional_requirements":[]}';

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'IDEA.md', ideaContent);
    writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
    writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
    output = captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('removes IDEA.md from disk', () => {
    assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')), 'IDEA.md must be deleted');
  });

  it('writes original_brief field with full IDEA.md content into 01_REQUIREMENTS.json', () => {
    const updated = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
    assert.equal(updated.original_brief, ideaContent, 'full IDEA content must land verbatim in original_brief');
    assert.equal(updated.project_name, 'T', 'existing fields must be preserved');
  });

  it('records hash of post-archive artifact (not the original)', () => {
    const config   = loadConfig(dir);
    const onDisk   = fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8');
    assert.equal(config.artifactHashes['1'], hashArtifact(onDisk),
      'recorded hash must match what is now on disk — otherwise drift fires immediately');
  });

  it('logs ideaArchived in the approved event', () => {
    const config = loadConfig(dir);
    const last   = config.events[config.events.length - 1];
    assert.equal(last.event, 'approved');
    assert.equal(last.ideaArchived, true);
  });

  it('prints user notice about absorb + archive (rc.80: moved, not deleted)', () => {
    assert.ok(output.includes('IDEA.md absorbed'), 'user must be told what happened');
    assert.ok(output.includes('archive/'), 'notice must name the archive location');
  });
});

// ── alpha.27: pre-flight scan in approve.js (ADR-031 addendum 2) ────────────
// Producer-side classifier blocks phase 1 first-approve when downstream
// artifacts reference IDEA.md as content that would break post-archive.
// Auto-fixes structural refs (manifest array elements) mechanically.
// Frozen evidence (04_TEST_RESULTS.json, 05_TRACEABILITY.json)
// silently skipped — preserves immutable history.

describe('cmdApprove() — alpha.27 pre-flight scan on first-approve of phase 1', () => {
  const reqContent = '{"project_name":"T","functional_requirements":[]}';
  const ideaContent = '# Brief\n';

  it('BLOCKS first-approve when narrative ref exists in 02_SYSTEM_DESIGN.md', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design\n\nThis project reads IDEA.md occasionally.\n');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));

      assert.throws(
        () => captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr })),
        /Cannot approve Phase 1.*IDEA\.md absorption would break/s,
      );
      // IDEA.md must be preserved
      assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')), 'IDEA.md must NOT be unlinked when narrative blocks');
      // original_brief NOT populated
      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(updated.original_brief, undefined);
      // Phase 1 NOT approved
      const c = loadConfig(dir);
      assert.ok(!(c.approvedPhases || []).includes(1));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT block when the only seed mention lives in AUDIT_REPORT.md (AUDIT-REF-0706)', () => {
    // The recommended pre-approval flow is `audit requirements` → `approve 1`;
    // the auditor legitimately cites the seed while it still exists. That
    // point-in-time record must not make the recommended flow self-blocking.
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      writeFile(dir, 'spec/AUDIT_REPORT.md', '## Coverage\n- Source: `IDEA.md` — the exact line\n');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));

      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));

      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')), 'absorb proceeds — IDEA.md archived');
      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(updated.original_brief, ideaContent, 'brief absorbed');
      const c = loadConfig(dir);
      assert.ok((c.approvedPhases || []).includes(1), 'phase 1 approved');
      assert.ok(fs.existsSync(path.join(dir, 'spec/AUDIT_REPORT.md')), 'report left untouched');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('BLOCK message lists narrative refs grouped by file with field paths', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design\n\nIDEA.md mention.\n');
      writeFile(dir, 'spec/03_TEST_CASES.json', JSON.stringify({
        test_cases: [{ id: 'TC-001', test_data: { files: ['IDEA.md'] } }]
      }, null, 2));
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));

      let caughtMsg = null;
      try {
        captureAll(() => cmdApprove({ dir, args: ['requirements'], err: (m) => { caughtMsg = m; throw new Error(m); } }));
      } catch { /* expected */ }

      assert.ok(caughtMsg, 'expected err() to be invoked');
      assert.match(caughtMsg, /spec\/02_SYSTEM_DESIGN\.md/);
      assert.match(caughtMsg, /spec\/03_TEST_CASES\.json/);
      assert.match(caughtMsg, /test_cases\[0\]\.test_data\.files\[0\]/);
      assert.match(caughtMsg, /body/);  // markdown body refs labeled 'body'
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('AUTO-FIX drops files_modified[i].path === "IDEA.md" then proceeds with absorb (no narrative)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      writeFile(dir, 'spec/04_BUILD_REPORT.json', JSON.stringify({
        files_modified: [{ path: 'IDEA.md', change: 'rewrote' }, { path: 'src/main.js', change: 'edit' }],
      }, null, 2));
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));

      const out = captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));

      // Auto-fix log line emitted
      assert.match(out, /Pre-flight auto-fixed/);
      assert.match(out, /04_BUILD_REPORT\.json/);

      // Manifest IDEA entry dropped
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), 'utf8'));
      assert.equal(m.files_modified.length, 1);
      assert.equal(m.files_modified[0].path, 'src/main.js');

      // Absorb proceeded (IDEA gone, brief absorbed)
      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')));
      const r = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(r.original_brief, ideaContent);

      // Phase 1 approved
      const c = loadConfig(dir);
      assert.ok(c.approvedPhases.includes(1));

      // Auto-fix event recorded
      const fixEvent = c.events.find(e => e.event === 'approve_preflight_autofix');
      assert.ok(fixEvent, 'approve_preflight_autofix event must be recorded');
      assert.equal(fixEvent.target, 'spec/04_BUILD_REPORT.json');
      assert.ok(fixEvent.before_hash && fixEvent.after_hash);
      assert.notEqual(fixEvent.before_hash, fixEvent.after_hash);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('AUTO-FIX runs even when narrative blocks absorb (independently committable)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      writeFile(dir, 'spec/04_BUILD_REPORT.json', JSON.stringify({
        files_modified: [{ path: 'IDEA.md', change: 'x' }, { path: 'a.js', change: 'y' }],
      }, null, 2));
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design\n\nIDEA.md narrative.\n');  // blocks
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));

      try {
        captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      } catch { /* expected — narrative blocks */ }

      // Auto-fix DID apply (manifest IDEA entry dropped)
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), 'utf8'));
      assert.equal(m.files_modified.length, 1, 'auto-fix must apply even when block follows');
      assert.equal(m.files_modified[0].path, 'a.js');

      // IDEA preserved (absorb blocked)
      assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')));

      // Auto-fix event persisted
      const c = loadConfig(dir);
      const fixEvent = (c.events || []).find(e => e.event === 'approve_preflight_autofix');
      assert.ok(fixEvent, 'auto-fix event must persist even on block');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('FROZEN refs silently skipped (only frozen → absorb proceeds)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      // Frozen evidence with IDEA.md mention — must NOT block
      writeFile(dir, 'spec/04_TEST_RESULTS.json', JSON.stringify({
        results: [{ tc_id: 'TC-001', notes: 'IDEA.md was checked' }],
      }, null, 2));
      writeFile(dir, 'spec/05_TRACEABILITY.json', JSON.stringify({
        evidence: 'grep IDEA.md returned zero',
      }, null, 2));
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));

      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));

      // Absorb proceeded — frozen did NOT block
      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')));
      const r = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(r.original_brief, ideaContent);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('CLEAN project (no refs anywhere) absorbs as before — regression guard', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design\n\nNo path refs here.\n');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));

      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));

      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')));
      const r = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(r.original_brief, ideaContent);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT trigger pre-flight on re-approve (already approved)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'IDEA.md', ideaContent);  // present + narrative ref present
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design\n\nIDEA.md narrative.\n');
      writeFile(dir, '.aitri', minimalConfig({
        approvedPhases:  [1],   // already approved
        completedPhases: [1],
        artifactHashes:  { '1': hashArtifact(reqContent) },
      }));

      // Re-approve must NOT fire pre-flight (no archive happens on re-approve)
      assert.doesNotThrow(() =>
        captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }))
      );
      // IDEA.md preserved (re-approve doesn't archive)
      assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdApprove() — phase 1 approve when IDEA.md is already absent', () => {
  let dir;
  const reqContent = '{"project_name":"T","functional_requirements":[]}';

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
    writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
    captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not add original_brief when no IDEA.md to archive', () => {
    const updated = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
    assert.equal(updated.original_brief, undefined, 'no field added when no IDEA.md exists');
  });

  it('approval still succeeds without IDEA.md', () => {
    const config = loadConfig(dir);
    assert.ok(config.approvedPhases.includes(1));
  });
});

describe('cmdApprove() — re-approve of phase 1 does not re-archive', () => {
  let dir;
  const reqContent = '{"project_name":"T","functional_requirements":[],"original_brief":"old"}';

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'IDEA.md', 'NEW IDEA CONTENT'); // would be archived if re-archive ran
    writeFile(dir, 'spec/01_REQUIREMENTS.json', reqContent);
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases:  [1],   // already approved
      completedPhases: [1],
      artifactHashes:  { '1': hashArtifact(reqContent) },
    }));
    captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('preserves existing original_brief — does not overwrite with new IDEA', () => {
    const updated = JSON.parse(fs.readFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), 'utf8'));
    assert.equal(updated.original_brief, 'old', 're-approve must not re-archive');
  });

  it('does not delete IDEA.md on re-approval', () => {
    assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')), 'IDEA.md must remain on re-approve (only first approve archives)');
  });
});

describe('cmdApprove() — successful approval (non-TTY)', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
    writeFile(dir, '.aitri', minimalConfig({
      completedPhases: [1],
    }));
    output = captureAll(() =>
      cmdApprove({ dir, args: ['requirements'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('adds phase to approvedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(config.approvedPhases.includes(1));
  });

  it('stores artifact hash', () => {
    const config = loadConfig(dir);
    const expected = hashArtifact(ARTIFACT_CONTENT);
    assert.equal(config.artifactHashes['1'], expected);
  });

  it('appends approved event', () => {
    const config = loadConfig(dir);
    const last = config.events[config.events.length - 1];
    assert.equal(last.event, 'approved');
    assert.equal(last.phase, 1);
  });

  it('writes lastSession', () => {
    const config = loadConfig(dir);
    assert.ok(config.lastSession, 'lastSession must exist');
    assert.equal(config.lastSession.event, 'approve requirements');
  });

  it('prints success message', () => {
    assert.ok(output.includes('APPROVED'), 'should include APPROVED');
    assert.ok(output.includes('requirements'), 'should include alias');
  });

  // 3.1 (UX-PRO-0707): agent-mode approval is RECORDED but not human-validated — the headline
  // must say so, not read as an unqualified human APPROVED. The approval still happens (default
  // is agent/CI/sandbox-friendly; the hard stop is opt-in via humanApprovalGate).
  it('qualifies the agent-mode APPROVED line as human-confirmation-pending', () => {
    assert.match(output, /APPROVED \(recorded by agent — human confirmation pending\)/,
      'agent-mode success line must not read as human-confirmed');
    assert.ok(loadConfig(dir).approvedPhases.includes(1),
      'the approval is still recorded — agent/sandbox approval stays a supported flow');
  });
});

describe('cmdApprove() — accepts numeric phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '## Executive Summary\nDesign.\n');
    writeFile(dir, '.aitri', minimalConfig({
      completedPhases: [2],
      approvedPhases:  [1], // upstream must be approved (ordering gate §3.1)
    }));
    captureAll(() =>
      cmdApprove({ dir, args: ['2'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('approves phase 2', () => {
    const config = loadConfig(dir);
    assert.ok(config.approvedPhases.includes(2));
  });
});

describe('cmdApprove() — not-completed gate', () => {
  it('throws if phase not completed first', () => {
    const dir = tmpDir();
    writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
    writeFile(dir, '.aitri', minimalConfig({ completedPhases: [] }));
    try {
      assert.throws(
        () => cmdApprove({ dir, args: ['requirements'], err: noopErr }),
        /not been validated/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdApprove() — missing artifact', () => {
  it('throws if artifact file is missing', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
    // No artifact file written
    try {
      assert.throws(
        () => cmdApprove({ dir, args: ['requirements'], err: noopErr }),
        /Artifact missing/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('early-phase approve names the real next step, not the dead-end "complete N" chain (UX-PRO-0707 2.3 follow-up)', () => {
    // approve build at phase 1 used to say "Complete phase 4 first" — but complete 4 then
    // says "save the artifact first", guiding the user to hand-write a Phase-4 artifact.
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ aitriVersion: '2.0.0-rc.168' }));
    try {
      let captured = '';
      const err = (msg) => { captured = msg; throw new Error(msg); };
      try { cmdApprove({ dir, args: ['build'], err }); } catch { /* expected */ }
      assert.match(captured, /Artifact missing/, 'names the gate');
      assert.doesNotMatch(captured, /Complete phase 4 first/, 'must not resurrect the backwards chain');
      assert.match(captured, /Next: aitri \S/, 'must name a concrete reachable command');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdApprove() — unknown phase', () => {
  it('throws usage error', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      assert.throws(
        () => cmdApprove({ dir, args: ['nonexistent'], err: noopErr }),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// NOTE: drift approval requires TTY interaction (confirmation prompt).
// In non-TTY mode, cmdApprove calls process.exit(1) on drift — cannot be unit-tested.
// Drift clearing is covered by the approve.js logic path that runs after TTY confirmation.

// ── Cascade invalidation ──────────────────────────────────────────────────────

describe('cmdApprove() — cascade invalidation on re-approval', () => {
  it('does not cascade on first approval (nothing downstream was approved)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
      writeFile(dir, '.aitri', minimalConfig({
        completedPhases: [1],
        approvedPhases:  [],   // first approval
      }));
      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      const config = loadConfig(dir);
      // No downstream to cascade — approvedPhases should only contain phase 1
      assert.deepEqual(config.approvedPhases.map(String), ['1']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('cascades downstream phases on re-approval of requirements', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
      writeFile(dir, '.aitri', minimalConfig({
        completedPhases: [1, 2, 3],
        approvedPhases:  [1, 2, 3],  // re-approval of phase 1
        artifactHashes:  { '2': 'oldhash', '3': 'oldhash' },
      }));
      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      const config = loadConfig(dir);
      assert.ok(config.approvedPhases.map(String).includes('1'), 'phase 1 must stay approved');
      assert.ok(!config.approvedPhases.map(String).includes('2'), 'phase 2 must be cascaded out');
      assert.ok(!config.approvedPhases.map(String).includes('3'), 'phase 3 must be cascaded out');
      assert.ok(!config.completedPhases.map(String).includes('2'), 'phase 2 must be cascaded from completed');
      assert.ok(!config.artifactHashes['2'], 'phase 2 hash must be cleared');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('resets verifyPassed when cascade reaches build', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
      writeFile(dir, '.aitri', minimalConfig({
        completedPhases: [1, 2, 3, 4],
        approvedPhases:  [1, 2, 3, 4],
        verifyPassed:    true,
      }));
      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.verifyPassed, false, 'verifyPassed must be reset');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('prints cascade warning when downstream phases are reset', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
      writeFile(dir, '.aitri', minimalConfig({
        completedPhases: [1, 2, 3],
        approvedPhases:  [1, 2, 3],
      }));
      const out = captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.ok(out.includes('Cascade'), `expected cascade warning, got: ${out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('cascade from architecture leaves requirements intact', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '## Executive Summary\nDesign.\n');
      writeFile(dir, '.aitri', minimalConfig({
        completedPhases: [1, 2, 3, 4],
        approvedPhases:  [1, 2, 3, 4],
      }));
      captureAll(() => cmdApprove({ dir, args: ['architecture'], err: noopErr }));
      const config = loadConfig(dir);
      assert.ok(config.approvedPhases.map(String).includes('1'), 'requirements must remain approved');
      assert.ok(!config.approvedPhases.map(String).includes('3'), 'tests must be cascaded');
      assert.ok(!config.approvedPhases.map(String).includes('4'), 'build must be cascaded');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdApprove() — phase 4 shows verify-run hint', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/04_BUILD_REPORT.json', '{"files_created":[],"setup_commands":[]}');
    writeFile(dir, '.aitri', minimalConfig({
      completedPhases: [4],
      approvedPhases:  [1, 2, 3], // upstream must be approved (ordering gate §3.1)
    }));
    output = captureAll(() =>
      cmdApprove({ dir, args: ['build'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('mentions verify-run as next step', () => {
    assert.ok(output.includes('verify-run'), 'should point to verify-run after phase 4');
  });
});

// ── Approval summary builders ────────────────────────────────────────────────

describe('summarizeRequirements()', () => {
  it('counts FRs by priority and type, plus NFRs and ACs', () => {
    const raw = JSON.stringify({
      functional_requirements: [
        { id: 'FR-1', priority: 'MUST',   type: 'business', acceptance_criteria: ['a','b'] },
        { id: 'FR-2', priority: 'MUST',   type: 'ux',       acceptance_criteria: ['c'] },
        { id: 'FR-3', priority: 'SHOULD', type: 'business', acceptance_criteria: [] },
      ],
      non_functional_requirements: [{ id: 'NFR-1' }, { id: 'NFR-2' }],
    });
    const lines = summarizeRequirements(raw);
    assert.ok(lines.some(l => l.includes('Functional requirements: 3')));
    assert.ok(lines.some(l => l.includes('2 MUST')));
    assert.ok(lines.some(l => l.includes('1 SHOULD')));
    assert.ok(lines.some(l => l.includes('2 business')));
    assert.ok(lines.some(l => l.includes('Non-functional requirements: 2')));
    assert.ok(lines.some(l => l.includes('Acceptance criteria: 3 total')));
  });

  it('returns null on malformed JSON', () => {
    assert.equal(summarizeRequirements('{ not json'), null);
  });

  // ADR-039 Phase 1 — seed provenance is surfaced at the approve checkpoint (the
  // one place a human looks), not buried in JSON.
  it('surfaces seed provenance (confirmed/assumed counts + assumed fields + gaps)', () => {
    const raw = JSON.stringify({
      functional_requirements: [{ id: 'FR-1', priority: 'MUST', type: 'core', acceptance_criteria: ['x'] }],
      non_functional_requirements: [],
      idea_provenance: { problem: 'confirmed', users: 'confirmed', baseline: 'assumed', success_metric: 'confirmed', no_go_zone: 'assumed' },
      idea_gaps: ['baseline: no metric — confirm', 'no_go_zone: inferred — confirm'],
    });
    const lines = summarizeRequirements(raw);
    assert.ok(lines.some(l => /Seed provenance: 3 confirmed · 2 assumed/.test(l)), 'must show confirmed/assumed counts');
    assert.ok(lines.some(l => /baseline, no_go_zone/.test(l)), 'must name the assumed fields');
    assert.ok(lines.some(l => /Open seed gaps.*2/.test(l)), 'must show open gap count');
  });

  it('omits the provenance line when idea_provenance is absent (legacy/back-compat)', () => {
    const raw = JSON.stringify({ functional_requirements: [], non_functional_requirements: [] });
    assert.ok(!summarizeRequirements(raw).some(l => /Seed provenance/.test(l)));
  });

  // rc.44 (ADR-040) — nudge on the all-confirmed-no-gaps shape (what an over-eager
  // agent produces by marking everything confirmed without asking the user).
  it('nudges to double-check when all provenance is confirmed with 0 assumed', () => {
    const raw = JSON.stringify({
      functional_requirements: [], non_functional_requirements: [],
      idea_provenance: { problem: 'confirmed', users: 'confirmed', baseline: 'confirmed', success_metric: 'confirmed', no_go_zone: 'confirmed' },
    });
    assert.ok(summarizeRequirements(raw).some(l => /All 5 ground-truth inputs are "confirmed"/.test(l)),
      'all-confirmed with 0 gaps must trigger the human double-check nudge');
  });

  it('does NOT nudge when at least one field is assumed', () => {
    const raw = JSON.stringify({
      functional_requirements: [], non_functional_requirements: [],
      idea_provenance: { problem: 'confirmed', users: 'assumed', baseline: 'confirmed', success_metric: 'confirmed', no_go_zone: 'confirmed' },
      idea_gaps: ['users: inferred — confirm'],
    });
    assert.ok(!summarizeRequirements(raw).some(l => /ground-truth inputs are "confirmed"/.test(l)),
      'no nudge when something is already flagged assumed');
  });

  // rc.45 (ADR-043 #5) — per-field source, weak one stands out, confirmed-without-source flagged.
  it('shows the per-field provenance source and flags a confirmed field with no source', () => {
    const raw = JSON.stringify({
      functional_requirements: [], non_functional_requirements: [],
      idea_provenance: { problem: 'confirmed', users: 'confirmed', baseline: 'assumed', success_metric: 'confirmed', no_go_zone: 'confirmed' },
      idea_provenance_sources: { problem: 'IDEA.md', success_metric: 'inferred from product type' },
      idea_gaps: ['baseline: no metric — confirm'],
    });
    const lines = summarizeRequirements(raw);
    assert.ok(lines.some(l => /problem: confirmed ← IDEA\.md/.test(l)), 'shows a strong source');
    assert.ok(lines.some(l => /success_metric: confirmed ← inferred from product type/.test(l)), 'shows a weak source verbatim');
    assert.ok(lines.some(l => /users: confirmed.*no source/.test(l)), 'flags a confirmed field that has no source');
  });

  it('omits the per-field source block when idea_provenance_sources is absent', () => {
    const raw = JSON.stringify({
      functional_requirements: [], non_functional_requirements: [],
      idea_provenance: { problem: 'confirmed', users: 'confirmed', baseline: 'confirmed', success_metric: 'confirmed', no_go_zone: 'confirmed' },
    });
    assert.ok(!summarizeRequirements(raw).some(l => /← |no source/.test(l)), 'no per-field block without sources');
  });
});

describe('summarizeTestCases()', () => {
  it('counts TCs by type, scenario and linked FRs', () => {
    const raw = JSON.stringify({
      test_cases: [
        { id: 'TC-1', type: 'unit',        scenario: 'happy_path', requirement_id: 'FR-1' },
        { id: 'TC-2', type: 'unit',        scenario: 'edge_case',  requirement_id: 'FR-1' },
        { id: 'TC-3', type: 'integration', scenario: 'happy_path', requirement_id: 'FR-2' },
      ],
    });
    const lines = summarizeTestCases(raw);
    assert.ok(lines.some(l => l.includes('Test cases: 3')));
    assert.ok(lines.some(l => l.includes('linked FRs: 2')));
    assert.ok(lines.some(l => l.includes('2 unit')));
    assert.ok(lines.some(l => l.includes('1 integration')));
    assert.ok(lines.some(l => l.includes('happy_path')));
  });
});

describe('summarizeManifest()', () => {
  it('reports created/modified counts and zero-debt case', () => {
    const raw = JSON.stringify({
      files_created:  ['a.js', 'b.js'],
      files_modified: ['c.js'],
      technical_debt: [],
    });
    const lines = summarizeManifest(raw);
    assert.ok(lines.some(l => l.includes('Files created:  2')));
    assert.ok(lines.some(l => l.includes('Files modified: 1')));
    assert.ok(lines.some(l => l.includes('Technical debt: none')));
  });

  it('lists fr_ids when technical_debt entries exist', () => {
    const raw = JSON.stringify({
      files_created: ['a.js'],
      technical_debt: [
        { fr_id: 'FR-1', substitution: 'mocked' },
        { fr_id: 'FR-3', substitution: 'stub'   },
      ],
    });
    const lines = summarizeManifest(raw);
    assert.ok(lines.some(l => l.includes('2 substitutions')));
    assert.ok(lines.some(l => l.includes('FR-1, FR-3')));
  });
});

describe('summarizeCompliance()', () => {
  it('breaks compliance entries down by level', () => {
    const raw = JSON.stringify({
      overall_status: 'production',
      phases_completed: [1, 2, 3, 4, 5],
      requirement_compliance: [
        { id: 'FR-1', level: 'production' },
        { id: 'FR-2', level: 'production' },
        { id: 'FR-3', level: 'mock'       },
      ],
    });
    const lines = summarizeCompliance(raw);
    assert.ok(lines.some(l => l.includes('Overall status: production')));
    assert.ok(lines.some(l => l.includes('3 entries')));
    assert.ok(lines.some(l => l.includes('2 production')));
    assert.ok(lines.some(l => l.includes('1 mock')));
    assert.ok(lines.some(l => l.includes('Phases completed: 5')));
  });
});

describe('summarizeMarkdownSections()', () => {
  it('lists H2 sections and truncates beyond 8', () => {
    const md = Array.from({ length: 10 }, (_, i) => `## Section ${i + 1}`).join('\n');
    const lines = summarizeMarkdownSections(md);
    assert.ok(lines[0].includes('Sections (10)'));
    assert.equal(lines.filter(l => l.includes('•')).length, 8);
    assert.ok(lines.some(l => l.includes('and 2 more')));
  });

  it('uses custom label when provided', () => {
    const lines = summarizeMarkdownSections('## A\n## B', 'Review sections');
    assert.ok(lines[0].includes('Review sections (2)'));
  });

  it('returns null on null input', () => {
    assert.equal(summarizeMarkdownSections(null), null);
  });
});

describe('buildApprovalSummary() — dispatcher', () => {
  it('routes phase 1 to summarizeRequirements', () => {
    const lines = buildApprovalSummary(1, '{"functional_requirements":[],"non_functional_requirements":[]}');
    assert.ok(lines.some(l => l.includes('Functional requirements: 0')));
  });
  it('routes phase 2 to markdown sections', () => {
    const lines = buildApprovalSummary(2, '## Overview\n## Components');
    assert.ok(lines[0].includes('Sections (2)'));
  });
  it('routes phase 3 to summarizeTestCases', () => {
    const lines = buildApprovalSummary(3, '{"test_cases":[]}');
    assert.ok(lines.some(l => l.includes('Test cases: 0')));
  });
  it('routes phase 4 to summarizeManifest', () => {
    const lines = buildApprovalSummary(4, '{"files_created":[],"technical_debt":[]}');
    assert.ok(lines.some(l => l.includes('Files created:  0')));
  });
  it('routes phase 5 to summarizeCompliance', () => {
    const lines = buildApprovalSummary(5, '{"requirement_compliance":[],"phases_completed":[]}');
    assert.ok(lines.some(l => l.includes('Requirement compliance: 0 entries')));
  });
  it('routes ux/discovery/review to markdown sections', () => {
    assert.ok(buildApprovalSummary('ux', '## Screen 1')[0].includes('Sections (1)'));
    assert.ok(buildApprovalSummary('discovery', '## Stakeholders')[0].includes('Sections (1)'));
    assert.ok(buildApprovalSummary('review', '## Findings')[0].includes('Review sections (1)'));
  });
  it('returns null on missing artifact content', () => {
    assert.equal(buildApprovalSummary(1, null), null);
  });
});

describe('cmdApprove() — phase 5 shows completion message', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/05_TRACEABILITY.json', '{"requirement_compliance":[]}');
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4, 5],
      verifyPassed: true,
    }));
    output = captureAll(() =>
      cmdApprove({ dir, args: ['deploy'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('shows all phases complete message', () => {
    assert.ok(output.includes('All 5 phases'), 'should celebrate completion');
  });
});

// ── Feature-context emission (alpha.6 — scope-aware PIPELINE INSTRUCTION) ────
//
// These tests cover the destructive-risk fix surfaced by the Ultron canary
// 2026-04-27. With `featureRoot` + `scopeName` set, every emitted command
// must include the `feature <name> ` infix; without them, output is
// byte-for-byte identical to root behavior.

describe('cmdApprove() — feature-context PIPELINE INSTRUCTION carries `feature <name> ` prefix', () => {
  // Phase 1 → Phase 2 transition (no UX FRs): "aitri feature run-phase foo architecture"
  it('phase 1 → architecture next-action', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      const output = captureAll(() =>
        cmdApprove({ dir, args: ['requirements'], err: noopErr, featureRoot: '/parent', scopeName: 'foo' })
      );
      assert.ok(output.includes('aitri feature run-phase foo architecture'),
        `expected feature-prefixed run-phase, got:\n${output}`);
      assert.ok(!/aitri run-phase architecture\b/.test(output),
        'must not emit root-style command in feature context');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // Phase 1 with UX FRs detected → "aitri feature run-phase foo ux"
  // (this is the exact path the Ultron canary triggered)
  it('phase 1 → ux next-action when UX/visual FRs are present', () => {
    const dir = tmpDir();
    try {
      const reqs = JSON.stringify({
        project_name: 'T',
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST', type: 'visual', title: 'Brand colors', acceptance_criteria: ['ac'] },
        ],
      });
      writeFile(dir, 'spec/01_REQUIREMENTS.json', reqs);
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      const output = captureAll(() =>
        cmdApprove({ dir, args: ['requirements'], err: noopErr, featureRoot: '/parent', scopeName: 'foo' })
      );
      assert.ok(output.includes('aitri feature run-phase foo ux'),
        `expected feature-prefixed UX run-phase (Ultron canary regression), got:\n${output}`);
      assert.ok(output.includes('aitri feature approve foo ux'),
        `expected feature-prefixed approve hint, got:\n${output}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // Phase 4 build approved → "aitri feature verify-run foo"
  it('phase 4 → verify-run next-action', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/04_BUILD_REPORT.json', '{"files_created":[{"path":"x"}]}');
      writeFile(dir, '.aitri', minimalConfig({
        approvedPhases: [1, 2, 3],
        completedPhases: [1, 2, 3, 4],
      }));
      const output = captureAll(() =>
        cmdApprove({ dir, args: ['build'], err: noopErr, featureRoot: '/parent', scopeName: 'foo' })
      );
      assert.ok(output.includes('aitri feature verify-run foo'),
        `expected feature-prefixed verify-run, got:\n${output}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // UX phase approved → "aitri feature run-phase foo architecture"
  it('UX → architecture next-action', () => {
    const dir = tmpDir();
    try {
      const uxContent = '## User Flows\nstuff\n## Component Inventory\nstuff\n## Nielsen Compliance\nstuff\n## Design Tokens\nstuff\n' + 'x\n'.repeat(30);
      writeFile(dir, 'spec/01_UX_SPEC.md', uxContent);
      writeFile(dir, '.aitri', minimalConfig({
        approvedPhases: [1],
        completedPhases: ['ux'],
      }));
      const output = captureAll(() =>
        cmdApprove({ dir, args: ['ux'], err: noopErr, featureRoot: '/parent', scopeName: 'foo' })
      );
      assert.ok(output.includes('aitri feature run-phase foo architecture'),
        `expected feature-prefixed architecture run-phase after UX, got:\n${output}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // Regression guard for the Ultron alpha.6 canary finding (BACKLOG P2):
  // even when `.aitri` was persisted with `approvedPhases: ["1"]` (string)
  // by some upstream write path, approving UX must still route to
  // `architecture`, not `requirements`. loadConfig canonicalises the type.
  it('UX → architecture even when approvedPhases on disk is ["1"] (string)', () => {
    const dir = tmpDir();
    try {
      const uxContent = '## User Flows\nstuff\n## Component Inventory\nstuff\n## Nielsen Compliance\nstuff\n## Design Tokens\nstuff\n' + 'x\n'.repeat(30);
      writeFile(dir, 'spec/01_UX_SPEC.md', uxContent);
      writeFile(dir, '.aitri', minimalConfig({
        approvedPhases: ['1'],
        completedPhases: ['ux'],
      }));
      const output = captureAll(() =>
        cmdApprove({ dir, args: ['ux'], err: noopErr, featureRoot: '/parent', scopeName: 'foo' })
      );
      assert.ok(output.includes('aitri feature run-phase foo architecture'),
        `string phase key must still route to architecture, got:\n${output}`);
      assert.ok(!/run-phase foo requirements\b/.test(output),
        'must not route to requirements when phase 1 is approved');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // Root context (no featureRoot) → output is unchanged. Regression guard.
  it('root context emits no `feature <name> ` infix (regression guard)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', ARTIFACT_CONTENT);
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      const output = captureAll(() =>
        cmdApprove({ dir, args: ['requirements'], err: noopErr })
      );
      assert.ok(!/aitri feature \w+ /.test(output),
        'root context must not emit feature-prefixed commands');
      assert.ok(output.includes('aitri run-phase architecture'),
        `expected root-style run-phase architecture, got:\n${output}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── D5 (UPLAN-0703): approve 1 surfaces intent-coverage audit freshness ──────
// Shift-left the requirements audit to the moment a dropped need is cheapest to catch.
// Informational (root + feature); never a gate.

describe('cmdApprove() — D5 intent-coverage audit surfacing at approve 1', () => {
  const REQS = '{"project_name":"T","functional_requirements":[{"id":"FR-1","priority":"MUST","type":"core","title":"t","acceptance_criteria":["a"]}]}';

  it('approve 1 warns when the requirements audit has not run for this version', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', REQS);
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      const out = captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.match(out, /Intent-coverage audit not run for this version/);
      assert.match(out, /aitri audit requirements/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('approve 1 stays silent when the audit is fresh (report + matching hash)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', REQS);
      writeFile(dir, 'spec/AUDIT_REPORT.md', '## Requirements Coverage\nall covered');
      writeFile(dir, '.aitri', minimalConfig({
        completedPhases: [1],
        coverageAuditLastAt: '2999-01-01T00:00:00.000Z',
        coverageAuditReqHash: hashArtifact(REQS),
      }));
      const out = captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      assert.doesNotMatch(out, /Intent-coverage audit not run/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('feature scope surfaces the feature-prefixed audit command', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', REQS);
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      const out = captureAll(() =>
        cmdApprove({ dir, args: ['requirements'], err: noopErr, featureRoot: '/parent', scopeName: 'foo' })
      );
      assert.match(out, /Intent-coverage audit not run for this version/);
      assert.match(out, /aitri feature audit foo requirements/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT surface the audit line when approving a non-1 phase', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/04_BUILD_REPORT.json', '{"files_created":[{"path":"x"}]}');
      writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1, 2, 3], completedPhases: [1, 2, 3, 4] }));
      const out = captureAll(() => cmdApprove({ dir, args: ['build'], err: noopErr }));
      assert.doesNotMatch(out, /Intent-coverage audit not run/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── P1.A (rc.1): feature approve 4 advances ROOT reconcile baseline ──────
// Closes BACKLOG.md "Pre-promotion findings (Codex canary 2026-05-11)" — P1
// upstream. Before this fix, feature-approve-4 advanced only the feature's
// .aitri reconcileState, leaving root frozen at the pre-feature baseline.
// On flat-codebase projects (Go monolith, single-package Python, Rust workspace)
// every feature completion left root in apparent drift against its own
// legitimately-approved feature-implementation files.

import { execSync } from 'child_process';

function gitInit(d) {
  execSync('git init -q', { cwd: d });
  execSync('git config user.email a@b.c', { cwd: d });
  execSync('git config user.name Test',   { cwd: d });
  execSync('git config commit.gpgsign false', { cwd: d });
}
function gitAddCommit(d, msg) {
  execSync('git add -A', { cwd: d });
  execSync(`git commit -q --no-verify -m "${msg}"`, { cwd: d });
}
function gitHead(d) {
  return execSync('git rev-parse HEAD', { cwd: d }).toString().trim();
}

describe('cmdApprove() — feature approve 4 advances ROOT reconcile baseline (P1 2026-05-12)', () => {

  it('feature approve 4 advances BOTH feature and root reconcileState (git method)', () => {
    const rootDir = tmpDir();
    try {
      // Project root: aitri project + git repo
      writeFile(rootDir, '.aitri', minimalConfig({ aitriVersion: '2.0.0-rc.1' }));
      const featureDir = path.join(rootDir, 'features', 'foo');
      writeFile(featureDir, '.aitri', minimalConfig({
        aitriVersion: '2.0.0-rc.1',
        approvedPhases: [1, 2, 3],
        completedPhases: [1, 2, 3, 4],
      }));
      writeFile(featureDir, 'spec/04_BUILD_REPORT.json',
        '{"files_created":[{"path":"internal/alerts/engine.go"}]}');
      gitInit(rootDir);
      gitAddCommit(rootDir, 'initial');

      const expectedSha = gitHead(rootDir);
      assert.equal(loadConfig(rootDir).reconcileState, undefined,
        'root has no baseline yet (fresh project)');

      captureAll(() =>
        cmdApprove({
          dir: featureDir, args: ['build'], err: noopErr,
          featureRoot: rootDir, scopeName: 'foo',
        })
      );

      const featureAfter = loadConfig(featureDir).reconcileState;
      const rootAfter    = loadConfig(rootDir).reconcileState;

      assert.equal(featureAfter.baseRef, expectedSha, 'feature baseline at HEAD');
      assert.equal(featureAfter.method,  'git');
      assert.equal(featureAfter.status,  'resolved');

      assert.equal(rootAfter.baseRef, expectedSha,
        'root baseline at HEAD — this is the P1 fix; before fix, root.baseRef was undefined');
      assert.equal(rootAfter.method,  'git');
      assert.equal(rootAfter.status,  'resolved');
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it('root approve 4 only advances root baseline — regression lock (no cross-write)', () => {
    const rootDir = tmpDir();
    try {
      writeFile(rootDir, '.aitri', minimalConfig({
        aitriVersion: '2.0.0-rc.1',
        completedPhases: [4],
        approvedPhases:  [1, 2, 3], // upstream must be approved (ordering gate §3.1)
      }));
      writeFile(rootDir, 'spec/04_BUILD_REPORT.json',
        '{"files_created":[]}');

      captureAll(() => cmdApprove({ dir: rootDir, args: ['build'], err: noopErr }));

      const cfg = loadConfig(rootDir);
      assert.ok(cfg.reconcileState,           'root baseline written');
      assert.ok(cfg.reconcileState.baseRef,   'baseRef present');
      assert.equal(cfg.reconcileState.status, 'resolved');
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it('feature approve 4 with non-aitri parent dir does not crash (graceful no-op on parent)', () => {
    const tmpRoot = tmpDir();
    try {
      // tmpRoot has NO .aitri config — parent is not an aitri project
      const featureDir = path.join(tmpRoot, 'features', 'foo');
      writeFile(featureDir, '.aitri', minimalConfig({
        aitriVersion: '2.0.0-rc.1',
        approvedPhases: [1, 2, 3],
        completedPhases: [1, 2, 3, 4],
      }));
      writeFile(featureDir, 'spec/04_BUILD_REPORT.json',
        '{"files_created":[{"path":"x"}]}');

      // Must not throw
      captureAll(() =>
        cmdApprove({
          dir: featureDir, args: ['build'], err: noopErr,
          featureRoot: tmpRoot, scopeName: 'foo',
        })
      );

      // Feature baseline still advanced normally
      assert.ok(loadConfig(featureDir).reconcileState,
        'feature baseline advanced even when parent is non-aitri');
      // Parent stays unmodified — no .aitri config created
      assert.ok(!fs.existsSync(path.join(tmpRoot, '.aitri')) ||
                !loadConfig(tmpRoot).aitriVersion,
        'parent never bootstrapped as aitri project');
    } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
  });

  it('sequential feature approvals advance root baseline forward each time', () => {
    const rootDir = tmpDir();
    try {
      writeFile(rootDir, '.aitri', minimalConfig({ aitriVersion: '2.0.0-rc.1' }));
      const fooDir = path.join(rootDir, 'features', 'foo');
      const barDir = path.join(rootDir, 'features', 'bar');
      writeFile(fooDir, '.aitri', minimalConfig({
        aitriVersion: '2.0.0-rc.1',
        approvedPhases: [1, 2, 3], completedPhases: [1, 2, 3, 4],
      }));
      writeFile(fooDir, 'spec/04_BUILD_REPORT.json',
        '{"files_created":[{"path":"a"}]}');
      writeFile(barDir, '.aitri', minimalConfig({
        aitriVersion: '2.0.0-rc.1',
        approvedPhases: [1, 2, 3], completedPhases: [1, 2, 3, 4],
      }));
      writeFile(barDir, 'spec/04_BUILD_REPORT.json',
        '{"files_created":[{"path":"b"}]}');
      gitInit(rootDir);
      gitAddCommit(rootDir, 'initial both features');

      const sha1 = gitHead(rootDir);

      captureAll(() => cmdApprove({
        dir: fooDir, args: ['build'], err: noopErr,
        featureRoot: rootDir, scopeName: 'foo',
      }));
      assert.equal(loadConfig(rootDir).reconcileState.baseRef, sha1,
        'root advanced to sha1 after approving foo');

      // Simulate another commit (real-world: bar feature work)
      fs.writeFileSync(path.join(rootDir, 'newfile.txt'), 'x');
      gitAddCommit(rootDir, 'bar work + foo bookkeeping');
      const sha2 = gitHead(rootDir);
      assert.notEqual(sha1, sha2);

      captureAll(() => cmdApprove({
        dir: barDir, args: ['build'], err: noopErr,
        featureRoot: rootDir, scopeName: 'bar',
      }));
      assert.equal(loadConfig(rootDir).reconcileState.baseRef, sha2,
        'root advanced to sha2 after approving bar (forward-only)');
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });
});

// TPA-11: approving a downstream phase snapshots the FR-id set it was built against,
// so a later cascade-triggered re-derivation can show the agent the FR delta.
describe('cmdApprove() — FR snapshot for downstream phases (TPA-11)', () => {
  it('records the FR-id set a downstream phase was approved against', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', JSON.stringify({
        project_name: 'T', functional_requirements: [{ id: 'FR-001' }, { id: 'FR-002' }],
      }));
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design');
      writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1, 2] }));
      captureAll(() => cmdApprove({ dir, args: ['architecture'], err: noopErr }));
      const config = loadConfig(dir);
      assert.deepEqual((config.frSnapshots || {})['2'], ['FR-001', 'FR-002']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not snapshot for phase 1 (it IS the requirements)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', JSON.stringify({ project_name: 'T', functional_requirements: [{ id: 'FR-001' }] }));
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      captureAll(() => cmdApprove({ dir, args: ['requirements'], err: noopErr }));
      const config = loadConfig(dir);
      assert.ok(!(config.frSnapshots && config.frSnapshots['1']), 'phase 1 needs no FR snapshot');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// §3.1 (rc.64 adopter): approval ordering + an honest completion message. A feature
// must not reach "🎉 All 5 phases complete and approved" while an upstream phase was
// never validated.
describe('cmdApprove() — upstream ordering gate + honest completion message (§3.1)', () => {
  it('refuses to approve a phase whose upstream is not approved', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '## Executive Summary\nD.\n');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [2], approvedPhases: [] })); // phase 1 NOT approved
      assert.throws(
        () => cmdApprove({ dir, args: ['architecture'], err: noopErr }),
        /upstream phase\(s\) not approved: requirements/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT celebrate "All 5 complete" when deploy is approved but an upstream phase is not', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/05_TRACEABILITY.json', '{"overall_status":"compliant","requirement_compliance":[]}');
      // Upstream of deploy (1,2,4) approved so the ordering gate passes — but phase 3 is NOT approved.
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [5], approvedPhases: [1, 2, 4] }));
      const out = captureAll(() => cmdApprove({ dir, args: ['deploy'], err: noopErr }));
      assert.ok(!/All 5 phases complete/.test(out), 'must not falsely celebrate a half-approved pipeline');
      assert.ok(/pipeline is NOT complete/.test(out) && /\b3\b/.test(out), 'must name the unapproved phase (3)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('celebrates only when every core phase is genuinely approved', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/05_TRACEABILITY.json', '{"overall_status":"compliant","requirement_compliance":[]}');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [5], approvedPhases: [1, 2, 3, 4] }));
      const out = captureAll(() => cmdApprove({ dir, args: ['deploy'], err: noopErr }));
      assert.ok(/All 5 phases complete and approved/.test(out), 'genuine completion must celebrate');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── D3 (UPLAN-0703): the drift-reapproval diff the human sees before re-approving ──
// The TTY drift path itself is not unit-testable (interactive y/N), so the load-bearing
// logic is extracted into buildArtifactDriftDiff and tested here against a git fixture.
describe('buildArtifactDriftDiff() — shows what changed since the artifact was committed (D3)', () => {
  it('renders a bounded diff (stat + hunks + full-diff pointer) for a committed-then-edited artifact', () => {
    const d = tmpDir();
    try {
      gitInit(d);
      fs.mkdirSync(path.join(d, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(d, 'spec/01_REQUIREMENTS.json'), '{\n  "project_name": "orig"\n}\n');
      gitAddCommit(d, 'seed');
      // Edit after commit — this is the drift the human must see.
      fs.writeFileSync(path.join(d, 'spec/01_REQUIREMENTS.json'), '{\n  "project_name": "EDITED"\n}\n');
      const out = buildArtifactDriftDiff(d, 'spec/01_REQUIREMENTS.json');
      assert.match(out, /Changes since the last commit of this artifact/);
      assert.match(out, /```diff/, 'the diff renders in a fenced block');
      assert.match(out, /-\s*"project_name": "orig"/, 'the removed line is shown');
      assert.match(out, /\+\s*"project_name": "EDITED"/, 'the added line is shown');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  it('returns empty string when the artifact matches its committed content (no drift to show)', () => {
    const d = tmpDir();
    try {
      gitInit(d);
      fs.mkdirSync(path.join(d, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(d, 'spec/01_REQUIREMENTS.json'), '{"project_name":"x"}\n');
      gitAddCommit(d, 'seed');
      assert.equal(buildArtifactDriftDiff(d, 'spec/01_REQUIREMENTS.json'), '',
        'no uncommitted change → nothing to show');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  it('returns empty string outside a git repo (silent no-op, never crashes the approve)', () => {
    const d = tmpDir();
    try {
      fs.mkdirSync(path.join(d, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(d, 'spec/01_REQUIREMENTS.json'), '{"x":1}');
      assert.equal(buildArtifactDriftDiff(d, 'spec/01_REQUIREMENTS.json'), '');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  it('caps a large diff and points at the full command', () => {
    const d = tmpDir();
    try {
      gitInit(d);
      fs.mkdirSync(path.join(d, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(d, 'spec/02_SYSTEM_DESIGN.md'), 'line\n'.repeat(5));
      gitAddCommit(d, 'seed');
      fs.writeFileSync(path.join(d, 'spec/02_SYSTEM_DESIGN.md'), Array.from({ length: 400 }, (_, i) => `new line ${i}`).join('\n') + '\n');
      const out = buildArtifactDriftDiff(d, 'spec/02_SYSTEM_DESIGN.md', { cap: 50 });
      assert.match(out, /more lines — full diff: git diff HEAD -- spec\/02_SYSTEM_DESIGN\.md/);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
});

// ── D2 (UPLAN-0703): `approve --show` renders the full artifact for review ──
describe('cmdApprove() --show / showArtifact() — full artifact content at approval (D2)', () => {
  function seed(dir, rel, content, cfg = {}) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec', rel), content);
    writeFile(dir, '.aitri', minimalConfig(cfg));
  }

  it('markdown artifact prints verbatim (a heading list is no longer all the human sees)', () => {
    const p = { artifact: '02_SYSTEM_DESIGN.md' };
    const dir = tmpDir();
    try {
      seed(dir, '02_SYSTEM_DESIGN.md', '# Design\n\n## API\nGET /health → 200\n');
      const out = showArtifact(dir, loadConfig(dir), p, path.join(dir, 'spec/02_SYSTEM_DESIGN.md'));
      assert.match(out, /02_SYSTEM_DESIGN\.md — full content for review/);
      assert.match(out, /GET \/health → 200/, 'the actual design content is shown, not just section titles');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('non-traceability JSON prints pretty (readable), not minified', () => {
    const p = { artifact: '01_REQUIREMENTS.json' };
    const dir = tmpDir();
    try {
      seed(dir, '01_REQUIREMENTS.json', '{"project_name":"X","functional_requirements":[{"id":"FR-001"}]}');
      const out = showArtifact(dir, loadConfig(dir), p, path.join(dir, 'spec/01_REQUIREMENTS.json'));
      assert.match(out, /"project_name": "X"/, 'pretty-printed with spaces, not minified');
      assert.match(out, /"id": "FR-001"/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('an unreadable artifact degrades to a note — never blocks the approval', () => {
    const p = { artifact: '01_REQUIREMENTS.json' };
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({}));
      const out = showArtifact(dir, loadConfig(dir), p, path.join(dir, 'spec/nope.json'));
      assert.match(out, /could not read/i);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('05_TRACEABILITY --show falls back to pretty JSON when requirements are missing (never crashes — adversarial-pass fix)', () => {
    // buildTraceabilityMarkdown returns an {error} OBJECT (not a throw) when 01_REQUIREMENTS
    // is absent/malformed; showArtifact must NOT try to .trimEnd() that object.
    const p = { artifact: '05_TRACEABILITY.json' };
    const dir = tmpDir();
    try {
      seed(dir, '05_TRACEABILITY.json', '{"overall_status":"partial","requirement_compliance":[{"id":"FR-001","level":"complete"}]}');
      let out;
      assert.doesNotThrow(() => { out = showArtifact(dir, loadConfig(dir), p, path.join(dir, 'spec/05_TRACEABILITY.json')); },
        'a missing upstream artifact must not crash --show');
      assert.match(out, /"overall_status": "partial"/, 'falls back to pretty JSON of the raw traceability file');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('05_TRACEABILITY --show renders the matrix through the export renderer when the pipeline is complete', () => {
    const p = { artifact: '05_TRACEABILITY.json' };
    const dir = tmpDir();
    try {
      seed(dir, '05_TRACEABILITY.json', '{"overall_status":"compliant","requirement_compliance":[{"id":"FR-001","level":"complete"}]}');
      fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), '{"project_name":"T","functional_requirements":[{"id":"FR-001","title":"Login","priority":"MUST"}]}');
      const out = showArtifact(dir, loadConfig(dir), p, path.join(dir, 'spec/05_TRACEABILITY.json'));
      assert.match(out, /FR-001/, 'the matrix renders through the export renderer (reuse, not a 2nd renderer)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a TTY user without --show is nudged to it; agent mode is NOT nudged (no transcript pollution)', () => {
    const dir = tmpDir();
    try {
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), '{"project_name":"T","functional_requirements":[]}');
      writeFile(dir, '.aitri', minimalConfig({ completedPhases: [1] }));
      // agent mode (no TTY): the summary+checklist print but NOT the --show hint.
      let out = '';
      const ow = process.stdout.write.bind(process.stdout), ol = console.log;
      process.stdout.write = (s) => { out += s; return true; };
      console.log = (...a) => { out += a.join(' ') + '\n'; };
      try { cmdApprove({ dir, args: ['requirements'], err: noopErr }); }
      finally { process.stdout.write = ow; console.log = ol; }
      assert.doesNotMatch(out, /--show/, 'agent mode must not print the --show hint');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
