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

describe('cmdResume() — output structure', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1, 2], completedPhases: [3] }));
    writeFile(dir, '01_REQUIREMENTS.json', requirementsJson);
    writeFile(dir, '02_SYSTEM_DESIGN.md', systemDesignMd);
    writeFile(dir, '04_TEST_RESULTS.json', testResultsJson);
    writeFile(dir, '04_IMPLEMENTATION_MANIFEST.json', manifestJson);
    output = captureStdout(() => cmdResume({ dir }));
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
    // Phase 4 artifact exists (04_IMPLEMENTATION_MANIFEST.json was written) but
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
    // No artifact files — all phases not started
    output = captureStdout(() => cmdResume({ dir }));
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
    output = captureStdout(() => cmdResume({ dir }));
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
