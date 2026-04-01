import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

import {
  auditReportPath,
  buildPipelineState,
  buildRequirementsSummary,
  cmdAudit,
} from '../../lib/commands/audit.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-audit-'));
}

function writeAitri(dir, config = {}) {
  const defaults = {
    projectName: 'test-project',
    artifactsDir: 'spec',
    approvedPhases: [],
    completedPhases: [],
  };
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ ...defaults, ...config }));
}

function writeArtifact(dir, name, content) {
  const specDir = path.join(dir, 'spec');
  fs.mkdirSync(specDir, { recursive: true });
  const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(path.join(specDir, name), data);
}

function noErr(msg) {
  throw new Error(`Unexpected err() call: ${msg}`);
}

function captureErr() {
  let captured = null;
  const fn = (msg) => { captured = msg; };
  fn.captured = () => captured;
  return fn;
}

// ── auditReportPath() ─────────────────────────────────────────────────────────

describe('auditReportPath()', () => {
  it('returns path under artifactsDir', () => {
    const p = auditReportPath('/project', { artifactsDir: 'spec' });
    assert.ok(p.endsWith(path.join('spec', 'AUDIT_REPORT.md')));
  });

  it('defaults to spec/ when artifactsDir is absent', () => {
    const p = auditReportPath('/project', {});
    assert.ok(p.endsWith(path.join('spec', 'AUDIT_REPORT.md')));
  });

  it('respects custom artifactsDir', () => {
    const p = auditReportPath('/project', { artifactsDir: 'artifacts' });
    assert.ok(p.includes('artifacts'));
    assert.ok(p.endsWith('AUDIT_REPORT.md'));
  });
});

// ── buildPipelineState() ──────────────────────────────────────────────────────

describe('buildPipelineState()', () => {
  it('formats current phase, completed, and approved', () => {
    const state = buildPipelineState({
      currentPhase:    2,
      completedPhases: [1],
      approvedPhases:  [1],
    });
    assert.ok(state.includes('2'));
    assert.ok(state.includes('1'));
    assert.match(state, /Current phase/);
    assert.match(state, /Completed/);
    assert.match(state, /Approved/);
  });

  it('returns "not started" when currentPhase is absent', () => {
    const state = buildPipelineState({});
    assert.match(state, /not started/);
  });

  it('returns "none" for empty completed and approved arrays', () => {
    const state = buildPipelineState({ currentPhase: 1 });
    assert.match(state, /none/);
  });

  it('handles phase 0 without defaulting to "not started"', () => {
    const state = buildPipelineState({ currentPhase: 0 });
    assert.match(state, /Current phase: 0/);
  });

  it('joins multiple completed phases', () => {
    const state = buildPipelineState({
      currentPhase:    3,
      completedPhases: [1, 2],
      approvedPhases:  [1, 2],
    });
    assert.ok(state.includes('1'));
    assert.ok(state.includes('2'));
  });
});

// ── buildRequirementsSummary() ────────────────────────────────────────────────

describe('buildRequirementsSummary()', () => {
  it('returns null when 01_REQUIREMENTS.json is missing', () => {
    const dir = tmpDir();
    const result = buildRequirementsSummary(dir, { artifactsDir: 'spec' });
    assert.equal(result, null);
  });

  it('returns formatted FR summary lines', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', {
      functional_requirements: [
        { id: 'FR-001', priority: 'MUST',   title: 'User login' },
        { id: 'FR-002', priority: 'SHOULD', title: 'Dark mode' },
      ],
    });
    const result = buildRequirementsSummary(dir, { artifactsDir: 'spec' });
    assert.ok(result.includes('FR-001'));
    assert.ok(result.includes('MUST'));
    assert.ok(result.includes('User login'));
    assert.ok(result.includes('FR-002'));
    assert.ok(result.includes('SHOULD'));
    assert.ok(result.includes('Dark mode'));
  });

  it('returns null on malformed JSON', () => {
    const dir = tmpDir();
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), 'not json {{{');
    const result = buildRequirementsSummary(dir, { artifactsDir: 'spec' });
    assert.equal(result, null);
  });

  it('returns null when functional_requirements array is empty', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', { functional_requirements: [] });
    const result = buildRequirementsSummary(dir, { artifactsDir: 'spec' });
    assert.equal(result, null);
  });

  it('includes FR id, priority, and title in each line', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', {
      functional_requirements: [
        { id: 'FR-003', priority: 'MUST', title: 'Export CSV' },
      ],
    });
    const result = buildRequirementsSummary(dir, { artifactsDir: 'spec' });
    assert.match(result, /FR-003 \[MUST\] Export CSV/);
  });
});

// ── cmdAudit — plan sub-command error handling ────────────────────────────────

describe('cmdAudit — plan sub-command', () => {
  it('calls err when AUDIT_REPORT.md is missing', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });

    const err = captureErr();
    cmdAudit({ dir, args: ['plan'], flagValue: () => null, err });

    assert.ok(err.captured(), 'err should have been called');
    assert.match(err.captured(), /AUDIT_REPORT\.md/);
    assert.match(err.captured(), /aitri audit/);
  });

  it('does not call err when AUDIT_REPORT.md exists', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, 'AUDIT_REPORT.md', '# Audit Report\n\n### Findings → Bugs\nNone found.\n');

    const err = captureErr();
    // Suppress stdout for this test — we only care that err is not called
    const origWrite = process.stdout.write.bind(process.stdout);
    const origErr   = process.stderr.write.bind(process.stderr);
    process.stdout.write = () => {};
    process.stderr.write = () => {};
    try {
      cmdAudit({ dir, args: ['plan'], flagValue: () => null, err });
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErr;
    }

    assert.equal(err.captured(), null, 'err should not have been called');
  });
});

// ── cmdAudit — default (run) routing ─────────────────────────────────────────

describe('cmdAudit — default routing', () => {
  it('does not call err for unknown non-plan sub-command (runs audit instead)', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });

    const err = captureErr();
    const origWrite = process.stdout.write.bind(process.stdout);
    const origErr   = process.stderr.write.bind(process.stderr);
    process.stdout.write = () => {};
    process.stderr.write = () => {};
    try {
      // 'run' is not a registered sub-command — should fall through to default audit
      cmdAudit({ dir, args: ['run'], flagValue: () => null, err });
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErr;
    }

    assert.equal(err.captured(), null);
  });

  it('runs audit when no sub-command given', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });

    const err = captureErr();
    const origWrite = process.stdout.write.bind(process.stdout);
    const origErr   = process.stderr.write.bind(process.stderr);
    process.stdout.write = () => {};
    process.stderr.write = () => {};
    try {
      cmdAudit({ dir, args: [], flagValue: () => null, err });
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErr;
    }

    assert.equal(err.captured(), null);
  });
});

// ── Persona exports ───────────────────────────────────────────────────────────

describe('auditor persona', () => {
  it('exports ROLE, CONSTRAINTS, REASONING from lib/personas/auditor.js', async () => {
    const { ROLE, CONSTRAINTS, REASONING } = await import('../../lib/personas/auditor.js');
    assert.ok(typeof ROLE === 'string' && ROLE.length > 0);
    assert.ok(typeof CONSTRAINTS === 'string' && CONSTRAINTS.length > 0);
    assert.ok(typeof REASONING === 'string' && REASONING.length > 0);
  });

  it('ROLE describes an evaluative (not generative) mission', async () => {
    const { ROLE } = await import('../../lib/personas/auditor.js');
    assert.match(ROLE, /[Aa]udit/);
    assert.match(ROLE, /[Ff]ind/i);
  });

  it('CONSTRAINTS include file-reference requirement', async () => {
    const { CONSTRAINTS } = await import('../../lib/personas/auditor.js');
    assert.match(CONSTRAINTS, /file/i);
  });
});
