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
import { cmdApprove } from '../../lib/commands/approve.js';
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
  console.log = (...a) => { out += a.join(' ') + '\n'; };
  try { fn(); } finally { console.log = origLog; }
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
});

describe('cmdApprove() — accepts numeric phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '## Executive Summary\nDesign.\n');
    writeFile(dir, '.aitri', minimalConfig({
      completedPhases: [2],
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
    writeFile(dir, 'spec/04_IMPLEMENTATION_MANIFEST.json', '{"files_created":[],"setup_commands":[]}');
    writeFile(dir, '.aitri', minimalConfig({
      completedPhases: [4],
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

describe('cmdApprove() — phase 5 shows completion message', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/05_PROOF_OF_COMPLIANCE.json', '{"requirement_compliance":[]}');
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
