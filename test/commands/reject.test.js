/**
 * Tests: aitri reject — record rejection with feedback
 * Covers: rejection recording, event appending, feedback required, alias support
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdReject } from '../../lib/commands/reject.js';
import { loadConfig } from '../../lib/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-reject-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

const noopErr = (msg) => { throw new Error(msg); };
const makeFlagValue = (flags = {}) => (f) => flags[f] || null;

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: '',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdReject() — successful rejection with alias', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    const origLog = console.log;
    let logged = '';
    console.log = (...a) => { logged += a.join(' ') + '\n'; };
    try {
      cmdReject({
        dir,
        args: ['requirements', '--feedback', 'Missing acceptance criteria for FR-003'],
        flagValue: makeFlagValue({ '--feedback': 'Missing acceptance criteria for FR-003' }),
        err: noopErr,
      });
    } finally {
      console.log = origLog;
    }
    output = logged;
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('stores rejection in config.rejections', () => {
    const config = loadConfig(dir);
    assert.ok(config.rejections[1], 'rejection for phase 1 must exist');
    assert.equal(config.rejections[1].feedback, 'Missing acceptance criteria for FR-003');
  });

  it('rejection has timestamp', () => {
    const config = loadConfig(dir);
    assert.ok(config.rejections[1].at, 'rejection must have timestamp');
  });

  it('appends rejected event', () => {
    const config = loadConfig(dir);
    const last = config.events[config.events.length - 1];
    assert.equal(last.event, 'rejected');
    assert.equal(last.phase, 1);
    assert.equal(last.feedback, 'Missing acceptance criteria for FR-003');
  });

  it('prints rejection confirmation with alias', () => {
    assert.ok(output.includes('requirements'), 'output should include alias');
    assert.ok(output.includes('rejected'), 'output should mention rejected');
  });

  it('prints rerun hint', () => {
    assert.ok(output.includes('run-phase'), 'output should include rerun hint');
  });
});

describe('cmdReject() — accepts numeric phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    const origLog = console.log;
    console.log = () => {};
    try {
      cmdReject({
        dir,
        args: ['2', '--feedback', 'Architecture needs work'],
        flagValue: makeFlagValue({ '--feedback': 'Architecture needs work' }),
        err: noopErr,
      });
    } finally {
      console.log = origLog;
    }
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('stores rejection under numeric key', () => {
    const config = loadConfig(dir);
    assert.ok(config.rejections[2], 'rejection for phase 2 must exist');
  });
});

describe('cmdReject() — missing feedback', () => {
  it('throws error when feedback is not provided', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      assert.throws(
        () => cmdReject({
          dir,
          args: ['requirements'],
          flagValue: makeFlagValue(),
          err: noopErr,
        }),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdReject() — unknown phase', () => {
  it('throws error for invalid phase', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      assert.throws(
        () => cmdReject({
          dir,
          args: ['nonexistent', '--feedback', 'test'],
          flagValue: makeFlagValue({ '--feedback': 'test' }),
          err: noopErr,
        }),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdReject() — overwrites previous rejection for same phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    const origLog = console.log;
    console.log = () => {};
    try {
      cmdReject({
        dir,
        args: ['requirements', '--feedback', 'first rejection'],
        flagValue: makeFlagValue({ '--feedback': 'first rejection' }),
        err: noopErr,
      });
      cmdReject({
        dir,
        args: ['requirements', '--feedback', 'second rejection'],
        flagValue: makeFlagValue({ '--feedback': 'second rejection' }),
        err: noopErr,
      });
    } finally {
      console.log = origLog;
    }
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps only the latest rejection', () => {
    const config = loadConfig(dir);
    assert.equal(config.rejections[1].feedback, 'second rejection');
  });

  it('appends both events to event log', () => {
    const config = loadConfig(dir);
    const rejections = config.events.filter(e => e.event === 'rejected');
    assert.equal(rejections.length, 2);
  });
});

describe('cmdReject() — optional phase (discovery)', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    const origLog = console.log;
    console.log = () => {};
    try {
      cmdReject({
        dir,
        args: ['discovery', '--feedback', 'needs more research'],
        flagValue: makeFlagValue({ '--feedback': 'needs more research' }),
        err: noopErr,
      });
    } finally {
      console.log = origLog;
    }
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('stores rejection for optional phase', () => {
    const config = loadConfig(dir);
    assert.ok(config.rejections['discovery'], 'rejection for discovery must exist');
  });
});

// ── Feature-context emission (alpha.6) ───────────────────────────────────────

describe('cmdReject() — feature-context Rerun hint carries `feature <name> ` prefix', () => {
  it('emits scope-prefixed rerun command in feature scope', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig());
      const out = captureStdout(() =>
        cmdReject({
          dir,
          args:        ['requirements', '--feedback', 'change FR-001 ACs'],
          flagValue:   makeFlagValue({ '--feedback': 'change FR-001 ACs' }),
          err:         noopErr,
          featureRoot: '/parent',
          scopeName:   'foo',
        })
      );
      assert.ok(out.includes('aitri feature run-phase foo requirements --feedback'),
        `expected feature-prefixed run-phase rerun hint, got:\n${out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('emits root-style rerun hint when featureRoot absent (regression guard)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig());
      const out = captureStdout(() =>
        cmdReject({
          dir,
          args:      ['requirements', '--feedback', 'change FR-001 ACs'],
          flagValue: makeFlagValue({ '--feedback': 'change FR-001 ACs' }),
          err:       noopErr,
        })
      );
      assert.ok(!/aitri feature \w+ /.test(out),
        'root context must not emit feature-prefixed rerun');
      assert.ok(/aitri run-phase requirements --feedback/.test(out),
        `expected root-style rerun hint, got:\n${out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
