import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validReview = () => [
  '## Issues Found',
  'No critical issues found.',
  '',
  '## FR Coverage',
  '| FR-001 | implemented | TC-001 |',
  '| FR-002 | implemented | TC-004 |',
  '| FR-003 | implemented | TC-007 |',
  '',
  '## Verdict',
  'PASS — all MUST FRs implemented correctly, no undeclared technical debt.',
  '',
  'Review completed on 2026-03-10.',
  'Reviewed files: src/index.js, src/auth.js, src/db.js',
  'No security bypasses detected.',
  'No substitutions found beyond declared technical_debt.',
  'Tests align with implementation.',
  'Line 1', 'Line 2', 'Line 3', 'Line 4', // pad to 20 lines
].join('\n');

describe('Phase review — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS['review'].validate(validReview()));
  });

  it('throws when artifact is too short (< 20 lines)', () => {
    assert.throws(
      () => PHASE_DEFS['review'].validate('## Issues Found\nNone.\n## Verdict\nPASS'),
      /too short/
    );
  });

  it('throws when verdict is missing', () => {
    const content = validReview().replace('PASS', 'looks good');
    assert.throws(() => PHASE_DEFS['review'].validate(content), /missing verdict/);
  });

  it('accepts CONDITIONAL_PASS as a valid verdict', () => {
    const content = validReview().replace('PASS', 'CONDITIONAL_PASS');
    assert.doesNotThrow(() => PHASE_DEFS['review'].validate(content));
  });

  it('accepts FAIL as a valid verdict', () => {
    const content = validReview().replace('PASS', 'FAIL');
    assert.doesNotThrow(() => PHASE_DEFS['review'].validate(content));
  });

  it('throws when ## Issues section is missing', () => {
    const content = validReview().replace('## Issues Found', '## Notes');
    assert.throws(() => PHASE_DEFS['review'].validate(content), /missing ## Issues/);
  });

  it('throws when ## Verdict section is missing', () => {
    const content = validReview().replace('## Verdict', '## Summary');
    assert.throws(() => PHASE_DEFS['review'].validate(content), /missing ## Verdict/);
  });

  it('phase review is accessible via PHASE_DEFS["review"]', () => {
    assert.ok(PHASE_DEFS['review'], 'review phase must exist in PHASE_DEFS');
    assert.equal(PHASE_DEFS['review'].artifact, '04_CODE_REVIEW.md');
  });
});

describe('Phase review — buildBriefing()', () => {
  const briefing = PHASE_DEFS['review'].buildBriefing({
    dir: '/tmp/test',
    inputs: {
      '01_REQUIREMENTS.json': '{"functional_requirements":[]}',
      '03_TEST_CASES.json': '{"test_cases":[]}',
      '04_IMPLEMENTATION_MANIFEST.json': JSON.stringify({
        files_created: ['src/index.js', 'src/auth.js'],
        technical_debt: [{ fr_id: 'FR-003', substitution: 'HTML table instead of chart' }],
      }),
    },
    feedback: null,
  });

  it('briefing contains ROLE, CONSTRAINTS, and REASONING from reviewer persona', () => {
    assert.ok(briefing.includes('Code Reviewer'), 'must reference Code Reviewer persona');
    assert.ok(briefing.includes('skepticism'), 'REASONING must mention skepticism');
  });

  it('briefing lists files to review from manifest', () => {
    assert.ok(briefing.includes('src/index.js'), 'must list files from manifest');
    assert.ok(briefing.includes('src/auth.js'), 'must list files from manifest');
  });

  it('briefing lists declared technical debt', () => {
    assert.ok(briefing.includes('FR-003'), 'must show declared technical debt');
    assert.ok(briefing.includes('HTML table'), 'must show substitution description');
  });

  it('briefing contains review protocol steps', () => {
    assert.ok(briefing.includes('Read every file'), 'must instruct to read every file');
  });

  it('briefing contains Human Review checklist', () => {
    assert.ok(briefing.includes('Human Review'), 'must include Human Review section');
  });

  it('applies feedback when provided', () => {
    const b = PHASE_DEFS['review'].buildBriefing({
      dir: '/tmp/test',
      inputs: {
        '01_REQUIREMENTS.json': '{}',
        '03_TEST_CASES.json': '{}',
        '04_IMPLEMENTATION_MANIFEST.json': '{}',
      },
      feedback: 'Focus on the auth module',
    });
    assert.ok(b.includes('Focus on the auth module'), 'feedback must appear in briefing');
  });
});
