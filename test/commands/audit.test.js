import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

import {
  auditReportPath,
  buildPipelineState,
  buildRequirementsSummary,
  buildIntentSources,
  buildSecurityNfrSummary,
  buildQualityGatesSummary,
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

  it('falls back to the project root when artifactsDir is absent (R3-11: matches artifact readers)', () => {
    const p = auditReportPath('/project', {});
    assert.strictEqual(p, path.join('/project', 'AUDIT_REPORT.md'));
    assert.ok(!p.includes(`${path.sep}spec${path.sep}`));
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

// ── audit coverage (ADR-048) ──────────────────────────────────────────────────

function captureStdout(fn) {
  let out = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (c) => { out += c; return true; };
  process.stderr.write = () => true;
  try { fn(); } finally { process.stdout.write = origOut; process.stderr.write = origErr; }
  return out;
}

describe('buildIntentSources()', () => {
  it('extracts original_brief from 01_REQUIREMENTS.json + discovery + root IDEA.md', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, '00_DISCOVERY.md', '# Discovery\nClient wants monthly PDF export.');
    writeArtifact(dir, '01_REQUIREMENTS.json', { original_brief: 'Invoicing app with PDF export', functional_requirements: [] });
    fs.writeFileSync(path.join(dir, 'IDEA.md'), 'raw seed text');
    const { discovery, originalBrief, idea } = buildIntentSources(dir, { artifactsDir: 'spec' });
    assert.match(discovery, /monthly PDF export/);
    assert.match(originalBrief, /Invoicing app with PDF export/);
    assert.match(idea, /raw seed text/);
  });

  it('returns empty strings when no intent source exists', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    const { discovery, originalBrief, idea } = buildIntentSources(dir, { artifactsDir: 'spec' });
    assert.equal(discovery, '');
    assert.equal(originalBrief, '');
    assert.equal(idea, '');
  });
});

describe('cmdAudit — coverage sub-command', () => {
  it('errs when there are no functional requirements', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    const err = captureErr();
    captureStdout(() => cmdAudit({ dir, args: ['coverage'], err }));
    assert.match(err.captured() || '', /no functional requirements/i);
  });

  it('errs when FRs exist but no intent source (no discovery/brief/idea)', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, '01_REQUIREMENTS.json', { functional_requirements: [{ id: 'FR-001', priority: 'MUST', title: 'export' }] });
    const err = captureErr();
    captureStdout(() => cmdAudit({ dir, args: ['coverage'], err }));
    assert.match(err.captured() || '', /no intent source/i);
  });

  it('generates a coverage briefing (intent + FRs) and persists coverageAuditLastAt', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, '00_DISCOVERY.md', '# Discovery\nSuccess: monthly PDF export for clients.');
    writeArtifact(dir, '01_REQUIREMENTS.json', {
      original_brief: 'Invoicing app',
      functional_requirements: [{ id: 'FR-001', priority: 'MUST', title: 'create invoice' }],
    });
    const err = noErr;
    const out = captureStdout(() => cmdAudit({ dir, args: ['coverage'], err }));
    assert.match(out, /Requirements Coverage Audit/);          // template title
    assert.match(out, /monthly PDF export/);                    // intent fed in
    assert.match(out, /FR-001/);                                // FR summary fed in
    assert.match(out, /Invoicing app/);                         // original_brief fed in
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.ok(cfg.coverageAuditLastAt, 'coverageAuditLastAt must be persisted');
  });
});

describe('coverage-auditor persona', () => {
  it('exports ROLE, CONSTRAINTS, REASONING', async () => {
    const m = await import('../../lib/personas/coverage-auditor.js');
    assert.ok(typeof m.ROLE === 'string' && m.ROLE.length > 0);
    assert.ok(typeof m.CONSTRAINTS === 'string' && m.CONSTRAINTS.length > 0);
    assert.ok(typeof m.REASONING === 'string' && m.REASONING.length > 0);
  });

  it('posture is completeness/omission, distinct from the code auditor', async () => {
    const { ROLE, CONSTRAINTS } = await import('../../lib/personas/coverage-auditor.js');
    assert.match(ROLE, /complete|drop|cover/i);          // about completeness, not code smells
    assert.match(CONSTRAINTS, /out-of-scope|out of scope/i); // bounds false positives on intentional exclusions
  });
});

// ── audit security (ADR-051) ──────────────────────────────────────────────────

describe('buildSecurityNfrSummary()', () => {
  it('returns only the security-category NFRs', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, '01_REQUIREMENTS.json', {
      functional_requirements: [],
      non_functional_requirements: [
        { id: 'NFR-001', category: 'Performance', requirement: 'p95 < 200ms' },
        { id: 'NFR-002', category: 'Security',    requirement: 'all endpoints require auth' },
      ],
    });
    const result = buildSecurityNfrSummary(dir, { artifactsDir: 'spec' });
    assert.match(result, /NFR-002 \[Security\] all endpoints require auth/);
    assert.doesNotMatch(result, /NFR-001/);
  });

  it('returns null when there are no security NFRs (explicit not-applicable decision)', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, '01_REQUIREMENTS.json', {
      non_functional_requirements: [{ id: 'NFR-001', category: 'Performance', requirement: 'fast' }],
    });
    assert.equal(buildSecurityNfrSummary(dir, { artifactsDir: 'spec' }), null);
  });

  it('returns null when 01_REQUIREMENTS.json is missing or malformed', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    assert.equal(buildSecurityNfrSummary(dir, { artifactsDir: 'spec' }), null);
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), 'not json {{{');
    assert.equal(buildSecurityNfrSummary(dir, { artifactsDir: 'spec' }), null);
  });
});

describe('buildQualityGatesSummary()', () => {
  it('summarizes declared gates with required/advisory marking', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, '04_BUILD_REPORT.json', {
      quality_gates: [
        { name: 'lint',     command: 'eslint .' },
        { name: 'security', command: 'bandit -q -r src', required: false },
      ],
    });
    const result = buildQualityGatesSummary(dir, { artifactsDir: 'spec' });
    assert.match(result, /lint: `eslint \.` \(required\)/);
    assert.match(result, /security: `bandit -q -r src` \(advisory\)/);
  });

  it('returns null when the manifest is missing or declares no gates', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    assert.equal(buildQualityGatesSummary(dir, { artifactsDir: 'spec' }), null);
    writeArtifact(dir, '04_BUILD_REPORT.json', { files_created: ['src/a.js'] });
    assert.equal(buildQualityGatesSummary(dir, { artifactsDir: 'spec' }), null);
  });
});

describe('cmdAudit — security sub-command (ADR-051)', () => {
  it('generates a security briefing fed with NFRs + declared gates, and persists securityAuditLastAt', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, '01_REQUIREMENTS.json', {
      functional_requirements: [{ id: 'FR-001', priority: 'MUST', title: 'login' }],
      non_functional_requirements: [{ id: 'NFR-002', category: 'Security', requirement: 'endpoints require auth' }],
    });
    writeArtifact(dir, '04_BUILD_REPORT.json', {
      quality_gates: [{ name: 'security', command: 'bandit -q -r src', required: false }],
    });
    const out = captureStdout(() => cmdAudit({ dir, args: ['security'], err: noErr }));
    assert.match(out, /Security Audit/);                       // template title
    assert.match(out, /endpoints require auth/);               // security NFRs fed in
    assert.match(out, /bandit -q -r src/);                     // declared gates fed in
    assert.match(out, /RQ-SEC/);                               // remediation-requirement output format
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.ok(cfg.securityAuditLastAt, 'securityAuditLastAt must be persisted');
  });

  it('runs without any artifacts — the static surface alone is auditable', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    const out = captureStdout(() => cmdAudit({ dir, args: ['security'], err: noErr }));
    assert.match(out, /Security Audit/);
  });
});

describe('security-auditor persona', () => {
  it('exports ROLE, CONSTRAINTS, REASONING', async () => {
    const m = await import('../../lib/personas/security-auditor.js');
    assert.ok(typeof m.ROLE === 'string' && m.ROLE.length > 0);
    assert.ok(typeof m.CONSTRAINTS === 'string' && m.CONSTRAINTS.length > 0);
    assert.ok(typeof m.REASONING === 'string' && m.REASONING.length > 0);
  });

  it('posture is adversarial-defensive: attacker-first, passive/non-destructive, both surfaces', async () => {
    const { ROLE, CONSTRAINTS } = await import('../../lib/personas/security-auditor.js');
    assert.match(ROLE, /attacker/i);                       // adversarial posture
    assert.match(ROLE, /non-destructive/i);                // defensive boundary
    assert.match(CONSTRAINTS, /BOTH surfaces/);            // static + runtime
    assert.match(CONSTRAINTS, /quality_gate/);             // leaves a permanent gate behind
    assert.match(CONSTRAINTS, /Never attempt exploitation/i);
  });
});

describe('cmdAudit — plan routes Security findings (ADR-051)', () => {
  it('plan briefing routes an RQ-SEC finding by priority and proposes the permanent gate', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, 'AUDIT_REPORT.md',
      '### Security\n**[RQ-SEC-001]** `P0` — /api/status exposes token usage publicly\n');
    const out = captureStdout(() => cmdAudit({ dir, args: ['plan'], err: noErr }));
    assert.match(out, /RQ-SEC/);                                  // protocol acknowledges the section
    assert.match(out, /quality_gate/);                            // permanent gate routing present
    assert.match(out, /exposes token usage publicly/);            // the report content is fed in
  });
});

describe('cmdAudit — plan routes Requirements Coverage gaps (ADR-048)', () => {
  it('plan briefing routes a coverage gap to a scope action (not a bug/backlog)', () => {
    const dir = tmpDir();
    writeAitri(dir, { artifactsDir: 'spec' });
    writeArtifact(dir, 'AUDIT_REPORT.md',
      '### Requirements Coverage\n**[GAP-1]** `UNCOVERED` — monthly PDF export for clients\n');
    const out = captureStdout(() => cmdAudit({ dir, args: ['plan'], err: noErr }));
    assert.match(out, /Requirements Coverage/);        // protocol acknowledges the section
    assert.match(out, /run-phase 1|out-of-scope/i);    // routed to a scope decision
    assert.match(out, /monthly PDF export for clients/); // the report content is fed in
  });
});
