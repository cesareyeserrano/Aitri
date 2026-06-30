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
    assert.throws(() => PHASE_DEFS['review'].validate(content), /no clear verdict/);
  });

  // validate() now uses the same extractor the reviewGate consumes (audit Tier-1):
  // a prose mention or the unfilled placeholder menu is NOT a verdict.
  it('rejects the unfilled placeholder menu as a verdict', () => {
    const content = validReview().replace('PASS', 'PASS | CONDITIONAL_PASS | FAIL');
    assert.throws(() => PHASE_DEFS['review'].validate(content), /no clear verdict/);
  });

  it('rejects the unfilled NEWLINE-separated placeholder menu (no phantom FAIL — R3-9)', () => {
    // An agent that leaves the menu one-per-line must not have the LAST line read as a
    // phantom FAIL that complete-review accepts and the reviewGate then dead-ends on.
    const content = validReview().replace(
      'PASS — all MUST FRs implemented correctly, no undeclared technical debt.',
      'PASS\nCONDITIONAL_PASS\nFAIL');
    assert.throws(() => PHASE_DEFS['review'].validate(content), /no clear verdict/);
    assert.equal(PHASE_DEFS['review'].extractVerdict(content), null);
  });

  it('rejects the unfilled menu even with blank lines between the verdicts (R3-9)', () => {
    const content = validReview().replace(
      'PASS — all MUST FRs implemented correctly, no undeclared technical debt.',
      'PASS\n\nCONDITIONAL_PASS\n\nFAIL');
    assert.equal(PHASE_DEFS['review'].extractVerdict(content), null);
  });

  it('KEEPS a real verdict beside an adjacent bare verdict line — only the full 3-verdict menu is suppressed (R3-9)', () => {
    // The earlier multi-line {2,} regex collapsed ANY two adjacent verdict lines, dropping a
    // real "FAIL\nPASS" to null → reviewGate would let a real FAIL through. Only a run covering
    // all three distinct verdicts is the unfilled menu; a 1–2-verdict run is a real choice.
    assert.equal(PHASE_DEFS['review'].extractVerdict('## Verdict\nFAIL\nPASS'), 'FAIL');
    assert.equal(PHASE_DEFS['review'].extractVerdict('## Verdict\nFAIL\nFAIL'), 'FAIL');
    assert.equal(PHASE_DEFS['review'].extractVerdict('## Verdict\nPASS\nCONDITIONAL_PASS'), 'CONDITIONAL_PASS');
    assert.equal(PHASE_DEFS['review'].extractVerdict('## Verdict\nFAIL'), 'FAIL');
  });

  it('accepts a lowercase verdict (extractor is case-insensitive)', () => {
    const content = validReview().replace('PASS', 'fail');
    assert.doesNotThrow(() => PHASE_DEFS['review'].validate(content));
    assert.equal(PHASE_DEFS['review'].extractVerdict(content), 'FAIL');
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
      '04_BUILD_REPORT.json': JSON.stringify({
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

  it('lists files from a MODIFIED-only (brownfield) build, not just files_created (R3-18)', () => {
    const b = PHASE_DEFS['review'].buildBriefing({
      dir: '/tmp/test',
      inputs: {
        '01_REQUIREMENTS.json': '{"functional_requirements":[]}',
        '03_TEST_CASES.json': '{"test_cases":[]}',
        '04_BUILD_REPORT.json': JSON.stringify({ files_modified: ['src/legacy.js', 'src/api.js'] }),
      },
      feedback: null,
    });
    assert.ok(b.includes('src/legacy.js'), 'must list modified files');
    assert.ok(b.includes('src/api.js'), 'must list modified files');
    assert.ok(!b.includes('(no files listed in manifest)'), 'file list must not be empty for a modified-only build');
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
        '04_BUILD_REPORT.json': '{}',
      },
      feedback: 'Focus on the auth module',
    });
    assert.ok(b.includes('Focus on the auth module'), 'feedback must appear in briefing');
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS['review'].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '03_TEST_CASES.json': '{}', '04_BUILD_REPORT.json': '{}' },
      feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/04_CODE_REVIEW.md'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/04_CODE_REVIEW.md'), 'artifact path must NOT use bare dir');
  });
});

describe('Phase review — buildBriefing() design inputs (AUDIT-0630-A)', () => {
  const base = {
    '01_REQUIREMENTS.json': '{}',
    '03_TEST_CASES.json': '{}',
    '04_BUILD_REPORT.json': '{"files_modified":["src/x.ts"]}',
    '02_SYSTEM_DESIGN.md': '# Design\n\nSticky 320px hierarchy column; Postgres.',
  };
  it('declares the design contract as OPTIONAL inputs (02_SYSTEM_DESIGN + 01_UX_SPEC)', () => {
    const opt = PHASE_DEFS['review'].optionalInputs || [];
    assert.ok(opt.includes('02_SYSTEM_DESIGN.md'),
      '02 must be OPTIONAL, not hard — adopt --from approves Phase 4 on the build report alone, so a hard 02 would block review on a no-design adopt');
    assert.ok(opt.includes('01_UX_SPEC.md'));
    assert.ok(!PHASE_DEFS['review'].inputs.includes('02_SYSTEM_DESIGN.md'), '02 must NOT be a hard input');
  });
  it('degrades gracefully with no design doc (adopt edge): no error, no design block, no leaked tokens', () => {
    const minimal = { '01_REQUIREMENTS.json': '{}', '03_TEST_CASES.json': '{}', '04_BUILD_REPORT.json': '{}' };
    const b = PHASE_DEFS['review'].buildBriefing({ dir: '/tmp/t', inputs: minimal, feedback: null });
    assert.ok(!/review the code against this contract/.test(b), 'no System Design block when 02 absent');
    assert.ok(!/\{\{#?\/?IF_(UX_SPEC|SYSTEM_DESIGN)\}\}|\{\{(UX_SPEC|SYSTEM_DESIGN)\}\}/.test(b), 'no leaked tokens');
  });
  it('injects the system design + points the protocol at it', () => {
    const b = PHASE_DEFS['review'].buildBriefing({ dir: '/tmp/t', inputs: base, feedback: null });
    assert.ok(b.includes('Sticky 320px hierarchy column'), 'design content reaches the reviewer');
    assert.ok(/review the code against this contract/i.test(b), 'protocol points the reviewer at the design');
  });
  it('renders the UX block when a UX spec is present, omits it (no leaked tokens) when absent', () => {
    const withUx = PHASE_DEFS['review'].buildBriefing({
      dir: '/tmp/t', inputs: { ...base, '01_UX_SPEC.md': '# UX\n\nover-budget shown in red' }, feedback: null });
    assert.ok(withUx.includes('over-budget shown in red') && /approved visual contract/.test(withUx),
      'the UX/design spec reaches the reviewer so it can flag visual deviations');
    const without = PHASE_DEFS['review'].buildBriefing({ dir: '/tmp/t', inputs: base, feedback: null });
    assert.ok(!/approved visual contract/.test(without), 'no UX block when absent');
    assert.ok(!/\{\{#?\/?IF_UX_SPEC\}\}|\{\{UX_SPEC\}\}/.test(without), 'no leaked template tokens');
  });
});
