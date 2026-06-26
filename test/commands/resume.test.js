/**
 * Tests: aitri resume — session handoff briefing
 * Covers: output sections, graceful degradation, spec/ artifact path support
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdResume } from '../../lib/commands/resume.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-resume-'));
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

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: '',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

const requirementsJson = JSON.stringify({
  project_name: 'TestProject',
  functional_requirements: [
    { id: 'FR-001', title: 'User login', priority: 'high', type: 'core', acceptance_criteria: ['User can log in with email/password'] },
    { id: 'FR-002', title: 'Password reset', priority: 'medium', type: 'core', acceptance_criteria: [] },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'performance', requirement: 'Response time < 200ms' },
  ],
}, null, 2);

const systemDesignMd = [
  '## Executive Summary',
  'Node.js + PostgreSQL — team expertise.',
  '',
  '## System Architecture',
  'Client → API → DB',
  '',
  '## Data Model',
  'Users: id, email',
].join('\n');

const testResultsJson = JSON.stringify({
  summary: { total: 6, passed: 5, failed: 1 },
  fr_coverage: [
    { fr_id: 'FR-001', status: 'covered',  tests_passing: 3, tests_failing: 0, tests_skipped: 0 },
    { fr_id: 'FR-002', status: 'partial',  tests_passing: 2, tests_failing: 1, tests_skipped: 0 },
  ],
});

const manifestJson = JSON.stringify({
  files_created: ['src/index.js'],
  setup_commands: ['npm install'],
  environment_variables: [],
  technical_debt: [
    { fr_id: 'FR-002', substitution: 'Basic reset', reason: 'Email service not ready', effort_to_fix: 'low' },
  ],
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdResume() — output structure (full)', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1, 2], completedPhases: [3] }));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
    writeFile(dir, '02_SYSTEM_DESIGN.md', systemDesignMd);
    writeFile(dir, '04_TEST_RESULTS.json', testResultsJson);
    writeFile(dir, '04_BUILD_REPORT.json', manifestJson);
    // --full: reference sections (Architecture, Open Requirements, Test Coverage,
    // Technical Debt) are gated behind this flag; brief mode is tested below.
    output = captureStdout(() => cmdResume({ dir, args: ['--full'] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('includes project name and date in title', () => {
    assert.ok(output.includes('AITRI SESSION RESUME'), 'title must appear');
    assert.ok(output.includes('TestProject'), 'project name must appear');
  });

  it('includes Pipeline State section', () => {
    assert.ok(output.includes('## Pipeline State'), 'Pipeline State section must appear');
  });

  it('marks approved phases as approved', () => {
    assert.ok(output.includes('Phase 1: ✅ Approved'), 'Phase 1 approved');
    assert.ok(output.includes('Phase 2: ✅ Approved'), 'Phase 2 approved');
  });

  it('marks completed (unapproved) phases as awaiting approval', () => {
    assert.ok(output.includes('Phase 3: ⏳ Awaiting approval'), 'Phase 3 awaiting');
  });

  it('marks phases with artifact present but not completed as in-progress', () => {
    // Phase 4 artifact exists (04_BUILD_REPORT.json was written) but
    // phase 4 is neither completed nor approved → in-progress.
    assert.ok(output.includes('Phase 4: 🔄 In progress'), 'Phase 4 in progress');
  });

  it('marks phases with no artifact as not started', () => {
    assert.ok(output.includes('Phase 5: ⬜ Not started'), 'Phase 5 not started');
  });

  it('includes Architecture section with design content', () => {
    assert.ok(output.includes('## Architecture & Stack Decisions'), 'Architecture section must appear');
    assert.ok(output.includes('Executive Summary'), 'design content must appear');
  });

  it('includes Open Requirements section with FR ids', () => {
    assert.ok(output.includes('## Open Requirements'), 'Open Requirements section must appear');
    assert.ok(output.includes('FR-001'), 'FR-001 must appear');
    assert.ok(output.includes('FR-002'), 'FR-002 must appear');
  });

  it('includes FR priority and type in requirements', () => {
    assert.ok(output.includes('high'), 'priority must appear');
    assert.ok(output.includes('core'), 'type must appear');
  });

  it('includes NFR block', () => {
    assert.ok(output.includes('NFR-001'), 'NFR-001 must appear');
    assert.ok(output.includes('performance'), 'NFR category must appear');
  });

  it('includes Test Coverage section with FR coverage', () => {
    assert.ok(output.includes('## Test Coverage'), 'Test Coverage section must appear');
    assert.ok(output.includes('FR-001'), 'FR-001 coverage must appear');
    assert.ok(output.includes('FR-002'), 'FR-002 coverage must appear');
  });

  it('includes Technical Debt section with debt entries', () => {
    assert.ok(output.includes('## Technical Debt'), 'Technical Debt section must appear');
    assert.ok(output.includes('FR-002'), 'debt fr_id must appear');
    assert.ok(output.includes('Email service not ready'), 'debt reason must appear');
  });

  it('includes Next Action section', () => {
    assert.ok(output.includes('## Next Action'), 'Next Action section must appear');
    // Phase 3 is completed but not approved — next action is approve (using alias).
    assert.ok(output.includes('aitri approve tests'), 'next approve command must appear for completed phase');
  });
});

describe('cmdResume() — graceful degradation', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    // No artifact files — all phases not started. Uses --full so the
    // "Not yet available" notes emitted by reference sections are present.
    output = captureStdout(() => cmdResume({ dir, args: ['--full'] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not throw when all artifacts are missing', () => {
    assert.ok(output.length > 0, 'output must be non-empty');
  });

  it('shows "not yet available" for architecture when missing', () => {
    assert.ok(output.includes('Not yet available') || output.includes('not yet available'), 'missing design must produce graceful note');
  });

  it('shows "not yet available" for requirements when missing', () => {
    assert.ok(output.includes('Not yet available') || output.includes('not yet available'), 'missing requirements must produce graceful note');
  });

  it('shows "not yet available" for test coverage when missing', () => {
    assert.ok(output.includes('verify-run') || output.includes('not yet available'), 'missing test results must produce graceful note');
  });

  it('omits Rejection History section when there are no rejections', () => {
    assert.ok(!output.includes('## Rejection History'), 'Rejection History must not appear when empty');
  });
});

describe('cmdResume() — rejection history', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      rejections: {
        2: { at: new Date('2026-03-01').toISOString(), feedback: 'ADR missing for database choice' },
      },
    }));
    output = captureStdout(() => cmdResume({ dir }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('includes Rejection History section when rejections exist', () => {
    assert.ok(output.includes('## Rejection History'), 'Rejection History section must appear');
  });

  it('shows rejection feedback text', () => {
    assert.ok(output.includes('ADR missing for database choice'), 'rejection feedback must appear');
  });
});

describe('cmdResume() — spec/ artifactsDir support', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ artifactsDir: 'spec', approvedPhases: [1] }));
    writeFile(dir, 'spec/01_REQUIREMENTS.json', requirementsJson);
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', systemDesignMd);
    // --full: FR id + design excerpt live in reference sections.
    output = captureStdout(() => cmdResume({ dir, args: ['--full'] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads artifacts from spec/ subdirectory', () => {
    assert.ok(output.includes('FR-001'), 'FR-001 from spec/ must appear');
    assert.ok(output.includes('Executive Summary'), 'design content from spec/ must appear');
  });

  it('does not fall back to root for spec/ artifacts', () => {
    // Root artifacts do not exist — if graceful note appears, spec/ read failed
    assert.ok(!output.includes('Not yet available') || output.includes('FR-001'), 'spec/ artifacts must be found');
  });
});

describe('cmdResume() — deployable banner in Pipeline State (F1)', () => {
  it('shows ❌ Not ready inline when health.deployable is false', () => {
    // Phases 1-5 approved but verifyPassed=false → health.deployable = false.
    // User must see the contradiction next to the phase table, not only in Health.
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({
        aitriVersion: '0.1.89',
        approvedPhases: [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
        verifyPassed: false,
      }));
      writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
      writeFile(dir, '02_SYSTEM_DESIGN.md', systemDesignMd);
      const out = captureStdout(() => cmdResume({ dir, VERSION: '0.1.89' }));
      assert.match(out, /\*\*Deployable:\*\* ❌ Not ready/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('shows ✅ Ready when all gates pass', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({
        aitriVersion: '0.1.89',
        approvedPhases: [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
        verifyPassed: true,
        verifySummary: { passed: 3, failed: 0, total: 3 },
        verifyRanAt: new Date().toISOString(),
        auditLastAt: new Date().toISOString(),
        reconcileState: { baseRef: 'deadbeef', method: 'git', status: 'resolved', lastRun: new Date().toISOString() },
      }));
      writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
      writeFile(dir, '02_SYSTEM_DESIGN.md', systemDesignMd);
      writeFile(dir, '04_TEST_RESULTS.json', testResultsJson);
      writeFile(dir, '04_BUILD_REPORT.json', manifestJson);
      writeFile(dir, '05_TRACEABILITY.json', '{"requirement_compliance":[]}');
      writeFile(dir, '03_TEST_CASES.json', '{"test_cases":[]}');
      const out = captureStdout(() => cmdResume({ dir, VERSION: '0.1.89' }));
      assert.match(out, /\*\*Deployable:\*\* ✅ Ready/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('omits the banner entirely when no progress has been made', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({ aitriVersion: '0.1.89' }));
      const out = captureStdout(() => cmdResume({ dir, VERSION: '0.1.89' }));
      assert.doesNotMatch(out, /\*\*Deployable:\*\*/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdResume() — version-mismatch upgrade message (A3)', () => {
  it('no longer claims to "reconcile artifacts" and directs to reconcile --init', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({
        aitriVersion: '0.1.65',
        approvedPhases: [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
      }));
      writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
      writeFile(dir, '02_SYSTEM_DESIGN.md', systemDesignMd);
      const out = captureStdout(() => cmdResume({ dir, VERSION: '0.1.89' }));
      assert.doesNotMatch(out, /reconciles your artifacts/i);
      assert.match(out, /bumps `aitriVersion`/);
      assert.match(out, /Does \*\*not\*\* migrate artifact schemas/);
      assert.match(out, /aitri reconcile --init/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdResume() — next action logic', () => {
  function resume(overrides) {
    const d = tmpDir();
    writeFile(d, '.aitri', minimalConfig(overrides));
    const out = captureStdout(() => cmdResume({ dir: d }));
    fs.rmSync(d, { recursive: true, force: true });
    return out;
  }

  it('suggests run-phase requirements when no phases approved', () => {
    const out = resume({});
    assert.ok(out.includes('run-phase requirements'), 'must suggest phase 1 alias when nothing approved');
  });

  it('suggests run-phase tests when phases 1-2 approved', () => {
    const out = resume({ approvedPhases: [1, 2] });
    assert.ok(out.includes('run-phase tests'), 'must suggest phase 3 alias when 1-2 approved');
  });

  it('suggests verify-run when all 4 core phases approved but verify not passed', () => {
    const out = resume({ approvedPhases: [1, 2, 3, 4] });
    assert.ok(out.includes('verify-run'), 'must suggest verify-run when 4 phases approved');
  });

  it('suggests aitri validate when all phases approved and verify passed', () => {
    const out = resume({ approvedPhases: [1, 2, 3, 4, 5], verifyPassed: true });
    assert.ok(out.includes('aitri validate'), 'must suggest validate when fully done');
  });
});

// ── A1 (alpha.3): unresolved upgrade findings render in brief ────────────────

describe('cmdResume() — unresolved upgrade findings (A1)', () => {
  // The findings section is one of the few pieces of content that must NOT
  // be gated behind --full. Forgetting them perpetuates legacy drift; the
  // whole point of persisting them is to make them hard to miss.
  it('renders a warning section with finding details in brief mode', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({
        upgradeFindings: [
          { target: '03_TEST_CASES.json', transform: 'TCs with non-canonical requirement (2)', reason: 'multi-FR TCs need agent re-authoring', recordedAt: '2026-04-24T00:00:00Z' },
        ],
      }));
      const out = captureStdout(() => cmdResume({ dir }));
      assert.match(out, /Unresolved Upgrade Findings/);
      assert.match(out, /03_TEST_CASES\.json/);
      assert.match(out, /multi-FR TCs need agent re-authoring/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not render the section when findings are empty', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({ upgradeFindings: [] }));
      const out = captureStdout(() => cmdResume({ dir }));
      assert.doesNotMatch(out, /Unresolved Upgrade Findings/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── F8: brief default vs --full (reference sections gated) ───────────────────

describe('cmdResume() — brief default (F8)', () => {
  // Brief is the default because dumping architecture + requirements + test
  // coverage + technical debt on every resume floods the "what's next?" view
  // with 200+ lines of reference material that already lives on disk.
  let dir;
  let brief;
  let full;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1, 2], completedPhases: [3] }));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
    writeFile(dir, '02_SYSTEM_DESIGN.md', systemDesignMd);
    writeFile(dir, '04_TEST_RESULTS.json', testResultsJson);
    writeFile(dir, '04_BUILD_REPORT.json', manifestJson);
    brief = captureStdout(() => cmdResume({ dir }));
    full  = captureStdout(() => cmdResume({ dir, args: ['--full'] }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('omits Architecture & Stack Decisions in brief', () => {
    assert.ok(!brief.includes('## Architecture & Stack Decisions'), 'Architecture section must be full-only');
  });

  it('omits Open Requirements in brief', () => {
    assert.ok(!brief.includes('## Open Requirements'), 'Open Requirements section must be full-only');
  });

  it('omits Test Coverage in brief', () => {
    assert.ok(!brief.includes('## Test Coverage'), 'Test Coverage section must be full-only');
  });

  it('omits Technical Debt in brief', () => {
    assert.ok(!brief.includes('## Technical Debt'), 'Technical Debt section must be full-only');
  });

  it('keeps Pipeline State in brief', () => {
    assert.ok(brief.includes('## Pipeline State'), 'Pipeline State must appear in brief');
  });

  it('keeps Next Action in brief', () => {
    assert.ok(brief.includes('## Next Action'), 'Next Action must appear in brief');
  });

  it('includes a footer hint about --full in brief', () => {
    assert.ok(/resume --full/.test(brief), 'brief must hint at --full for reference sections');
  });

  it('does not include the --full hint when --full is passed', () => {
    assert.ok(!/resume --full/.test(full), '--full must not advertise itself');
  });

  it('full mode restores all reference sections', () => {
    assert.ok(full.includes('## Architecture & Stack Decisions'));
    assert.ok(full.includes('## Open Requirements'));
    assert.ok(full.includes('## Test Coverage'));
    assert.ok(full.includes('## Technical Debt'));
  });
});

// TPA-5 / A9: resume surfaces the narrative thread — shows it, flags staleness,
// and flags its ABSENCE on an in-flight pipeline (the one thing resume cannot
// reconstruct from state).
describe('cmdResume() — narrative session context (TPA-5)', () => {
  it('warns when no narrative context is saved on an in-flight pipeline', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      lastSession: { at: '2026-06-06T10:00:00.000Z', agent: 'claude', event: 'approve 1' },
    }));
    const out = captureStdout(() => cmdResume({ dir }));
    assert.ok(/Session Context/.test(out) && /No narrative context saved/i.test(out), 'absence must be surfaced');
  });

  it('shows the saved context and does not warn when it is fresh', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      lastSession:    { at: '2026-06-06T10:00:00.000Z', agent: 'claude', event: 'checkpoint' },
      sessionContext: { text: 'Master Data feature next', at: '2026-06-06T10:00:00.000Z' },
    }));
    const out = captureStdout(() => cmdResume({ dir }));
    assert.ok(out.includes('Master Data feature next'), 'saved context must be shown');
    assert.ok(!/may be stale/i.test(out), 'context as recent as the last action is not stale');
  });

  it('flags the context as stale when an action happened after it was written', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1, 2],
      lastSession:    { at: '2026-06-06T12:00:00.000Z', agent: 'claude', event: 'approve 2' },
      sessionContext: { text: 'was mid Phase 1', at: '2026-06-06T09:00:00.000Z' },
    }));
    const out = captureStdout(() => cmdResume({ dir }));
    assert.ok(out.includes('was mid Phase 1'), 'stale context is still shown');
    assert.ok(/may be stale/i.test(out), 'a later action must flag the context as possibly stale');
  });

  it('does not nag about absent context when the pipeline is complete', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1, 2, 3, 4, 5],
      lastSession: { at: '2026-06-06T10:00:00.000Z', agent: 'claude', event: 'approve 5' },
    }));
    const out = captureStdout(() => cmdResume({ dir }));
    assert.ok(!/No narrative context saved/i.test(out), 'a finished pipeline should not nag for narrative context');
  });
});

// ── Requirements Coverage nudge (ADR-048) ─────────────────────────────────────

describe('cmdResume() — Requirements Coverage nudge (ADR-048)', () => {
  it('suggests `aitri audit requirements` when Phase 1 is approved and never audited', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1] }));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
    const out = captureStdout(() => cmdResume({ dir }));
    assert.match(out, /Requirements Coverage — Independent Check Suggested/);
    assert.match(out, /aitri audit requirements/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT suggest it once audited and requirements unchanged', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1], coverageAuditLastAt: '2999-01-01T00:00:00.000Z' }));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
    const out = captureStdout(() => cmdResume({ dir }));
    assert.doesNotMatch(out, /aitri audit requirements/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('re-suggests it when requirements changed after the last coverage audit', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1], coverageAuditLastAt: '2000-01-01T00:00:00.000Z' }));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson); // mtime now > 2000 → changed since
    const out = captureStdout(() => cmdResume({ dir }));
    assert.match(out, /Requirements changed since the last coverage audit/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT suggest it before Phase 1 is approved', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [], completedPhases: [] }));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
    const out = captureStdout(() => cmdResume({ dir }));
    assert.doesNotMatch(out, /aitri audit requirements/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── Security Audit nudge (ADR-051) ────────────────────────────────────────────

const securityRequirementsJson = JSON.stringify({
  project_name: 'TestProject',
  functional_requirements: [
    { id: 'FR-001', title: 'User login', priority: 'MUST', type: 'security', acceptance_criteria: ['rejects invalid token'] },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Security', requirement: 'All endpoints require authentication' },
  ],
}, null, 2);

describe('cmdResume() — Security Audit nudge (ADR-051)', () => {
  const phase4Approved = { approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4] };

  it('suggests `aitri audit security` when Phase 4 is approved, security NFRs exist, never audited', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig(phase4Approved));
    writeFile(dir, '01_REQUIREMENTS.json', securityRequirementsJson);
    const out = captureStdout(() => cmdResume({ dir }));
    assert.match(out, /Security — Adversarial Audit Suggested/);
    assert.match(out, /aitri audit security/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT suggest it when the project declares no security NFRs (explicit not-applicable decision)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig(phase4Approved));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson); // performance NFR only
    const out = captureStdout(() => cmdResume({ dir }));
    assert.doesNotMatch(out, /aitri audit security/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT suggest it before Phase 4 is approved (no code to attack yet)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1] }));
    writeFile(dir, '01_REQUIREMENTS.json', securityRequirementsJson);
    const out = captureStdout(() => cmdResume({ dir }));
    assert.doesNotMatch(out, /aitri audit security/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT suggest it once audited and requirements unchanged', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ ...phase4Approved, securityAuditLastAt: '2999-01-01T00:00:00.000Z' }));
    writeFile(dir, '01_REQUIREMENTS.json', securityRequirementsJson);
    const out = captureStdout(() => cmdResume({ dir }));
    assert.doesNotMatch(out, /aitri audit security/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('re-suggests it when requirements changed after the last security audit', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ ...phase4Approved, securityAuditLastAt: '2000-01-01T00:00:00.000Z' }));
    writeFile(dir, '01_REQUIREMENTS.json', securityRequirementsJson); // mtime now > 2000 → changed since
    const out = captureStdout(() => cmdResume({ dir }));
    assert.match(out, /Requirements changed since the last security audit/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
