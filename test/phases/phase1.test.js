import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validP1 = () => JSON.stringify({
  project_name: 'Test Project',
  project_summary: 'A test project',
  functional_requirements: [
    { id: 'FR-001', title: 'Login',      priority: 'MUST',   type: 'security',    acceptance_criteria: ['returns 401 on invalid token'] },
    { id: 'FR-002', title: 'Dashboard',  priority: 'MUST',   type: 'UX',          acceptance_criteria: ['renders at 375px viewport'] },
    { id: 'FR-003', title: 'Export',     priority: 'MUST',   type: 'reporting',   acceptance_criteria: ['generates valid CSV'] },
    { id: 'FR-004', title: 'Save data',  priority: 'SHOULD', type: 'persistence', acceptance_criteria: ['data survives restart'] },
    { id: 'FR-005', title: 'Calc total', priority: 'NICE',   type: 'logic',       acceptance_criteria: ['returns correct sum'] },
  ],
  user_stories: [
    { id: 'US-001', requirement_id: 'FR-001', as_a: 'user', i_want: 'to login', so_that: 'I can access data' },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms' },
    { id: 'NFR-002', category: 'Security',    requirement: 'TLS 1.3' },
    { id: 'NFR-003', category: 'Reliability', requirement: '99.9% uptime' },
  ],
  constraints: [],
  technology_preferences: [],
});

describe('Phase 1 — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(validP1()));
  });

  it('throws on malformed JSON', () => {
    assert.throws(() => PHASE_DEFS[1].validate('{not json}'), /not valid JSON/);
  });

  it('throws when project_name is missing', () => {
    const d = JSON.parse(validP1());
    delete d.project_name;
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /Missing fields.*project_name/);
  });

  it('throws when functional_requirements is missing', () => {
    const d = JSON.parse(validP1());
    delete d.functional_requirements;
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /Missing fields.*functional_requirements/);
  });

  it('throws when fewer than 5 FRs', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements = d.functional_requirements.slice(0, 3);
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /Min 5 functional_requirements/);
  });

  it('throws when fewer than 3 NFRs', () => {
    const d = JSON.parse(validP1());
    d.non_functional_requirements = d.non_functional_requirements.slice(0, 2);
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /Min 3 non_functional_requirements/);
  });

  it('throws when MUST FR is missing type', () => {
    const d = JSON.parse(validP1());
    delete d.functional_requirements[0].type;
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /MUST FRs missing type field.*FR-001/);
  });

  it('throws when MUST FR has empty acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].acceptance_criteria = [];
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /MUST FRs missing acceptance_criteria.*FR-001/);
  });

  it('does NOT throw when SHOULD FR is missing type (only MUST is enforced)', () => {
    const d = JSON.parse(validP1());
    delete d.functional_requirements[3].type;
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('throws when UX MUST FR has only vague acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[1].acceptance_criteria = ['the UI looks nice and smooth'];
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /FR-002.*observable metric/);
  });

  it('throws when visual MUST FR has no metric in acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements.push({ id: 'FR-006', title: 'Visual theme', priority: 'MUST', type: 'visual', acceptance_criteria: ['beautiful modern design'] });
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /FR-006.*observable metric/);
  });

  it('passes when UX MUST FR has metric in acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[1].acceptance_criteria = ['layout visible at 375px viewport', 'animation ≤200ms'];
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('passes when audio MUST FR has metric in acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements.push({ id: 'FR-006', title: 'Sound design', priority: 'MUST', type: 'audio', acceptance_criteria: ['audio plays within 100ms of trigger'] });
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[broad vague] throws when security MUST FR has all-vague acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].acceptance_criteria = ['the system must work correctly', 'data must be handled safely'];
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /FR-001.*all acceptance_criteria are vague/);
  });

  it('[broad vague] throws when persistence MUST FR has all-vague acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements.push({ id: 'FR-006', title: 'Save state', priority: 'MUST', type: 'persistence', acceptance_criteria: ['data must be stored properly', 'state must be persisted correctly'] });
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /FR-006.*all acceptance_criteria are vague/);
  });

  it('[broad vague] passes when security MUST FR has specific acceptance_criteria without metric', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].acceptance_criteria = ['passwords must be hashed with bcrypt', 'tokens expire after inactivity'];
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[broad vague] passes when not all ACs are vague (mixed specific + vague)', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].acceptance_criteria = ['must be secure', 'returns 401 on invalid token'];
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[ASSUMPTION] does not throw when FRs contain [ASSUMPTION] marker', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].title = 'Login [ASSUMPTION: needs user confirmation]';
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[ASSUMPTION] warning is emitted on stderr when FR title contains [ASSUMPTION]', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].title = 'Notifications [ASSUMPTION: needs user confirmation]';
    d.functional_requirements[1].title = 'Analytics [ASSUMPTION: needs user confirmation]';
    const stderrChunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
    try {
      PHASE_DEFS[1].validate(JSON.stringify(d));
    } finally {
      process.stderr.write = origWrite;
    }
    const stderrOut = stderrChunks.join('');
    assert.match(stderrOut, /2 FR\(s\) marked as assumptions/);
    assert.match(stderrOut, /FR-001/);
    assert.match(stderrOut, /FR-002/);
  });
});

// ── Rank 2: Structured IDEA.md — empty-section warning tests ─────────────────

function captureStderr(fn) {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { chunks.push(chunk); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return chunks.join('');
}

describe('Phase 1 — buildBriefing() empty-section warnings (Rank 2)', () => {

  it('warns on stderr when Problem section is absent from IDEA.md', () => {
    // No ## Problem header at all → m=null → body='' → warning fires
    const idea = '## Target Users\nReal users here.\n## Business Rules\nThe system must do X.\n## Success Criteria\nGiven A when B then C.\n';
    const stderr = captureStderr(() => PHASE_DEFS[1].buildBriefing({ dir: '/tmp', inputs: { 'IDEA.md': idea }, feedback: null }));
    assert.match(stderr, /Problem/);
  });

  it('warns on stderr when Business Rules section has only HTML comment placeholder', () => {
    // Comment-only section → comment stripped → body='' → warning fires
    const idea = '## Problem\nReal problem here.\n## Target Users\nReal users here.\n## Business Rules\n<!-- list rules -->\n## Success Criteria\nGiven A when B then C.\n';
    const stderr = captureStderr(() => PHASE_DEFS[1].buildBriefing({ dir: '/tmp', inputs: { 'IDEA.md': idea }, feedback: null }));
    assert.match(stderr, /Business Rules/);
  });

  it('warns on stderr when section contains only HTML comment placeholder', () => {
    const idea = '## Problem\n<!-- What problem does this solve? -->\n\n## Target Users\nReal users\n## Business Rules\nThe system must do X.\n## Success Criteria\nGiven X when Y then Z.\n';
    const stderr = captureStderr(() => PHASE_DEFS[1].buildBriefing({ dir: '/tmp', inputs: { 'IDEA.md': idea }, feedback: null }));
    assert.match(stderr, /Problem/);
  });

  it('does not warn when all required sections are populated', () => {
    const idea = '## Problem\nThis is a real problem.\n## Target Users\nReal users\n## Business Rules\nThe system must do X.\n## Success Criteria\nGiven X when Y then Z.\n';
    const stderr = captureStderr(() => PHASE_DEFS[1].buildBriefing({ dir: '/tmp', inputs: { 'IDEA.md': idea }, feedback: null }));
    assert.equal(stderr, '', 'no warning when all required sections have content');
  });

  it('empty section warning is non-blocking — buildBriefing still returns a string', () => {
    const idea = '## Problem\n\n';
    let result;
    captureStderr(() => { result = PHASE_DEFS[1].buildBriefing({ dir: '/tmp', inputs: { 'IDEA.md': idea }, feedback: null }); });
    assert.ok(typeof result === 'string' && result.length > 0, 'briefing must be returned even when sections are empty');
  });
});

describe('Phase 1 — buildBriefing() (BL-001)', () => {
  const briefing = PHASE_DEFS[1].buildBriefing({ dir: '/tmp/test', inputs: { 'IDEA.md': 'A simple app idea.' }, feedback: null });

  it('[ASSUMPTION] briefing PM persona instructs agent to use [ASSUMPTION] marker', () => {
    assert.ok(briefing.includes('[ASSUMPTION'), 'PM persona must instruct agent to use [ASSUMPTION] marker for inferred requirements');
  });

  it('briefing contains no-go zone instruction', () => {
    assert.ok(briefing.includes('no-go'), 'briefing must mention no-go zone');
  });

  it('briefing contains no_go_zone field in schema', () => {
    assert.ok(briefing.includes('no_go_zone'), 'briefing schema must include no_go_zone field');
  });

  it('briefing contains North Star KPI instruction', () => {
    assert.ok(briefing.includes('North Star KPI'), 'briefing must mention North Star KPI');
  });

  it('briefing contains JTBD instruction', () => {
    assert.ok(briefing.includes('JTBD'), 'briefing must mention JTBD');
  });

  it('briefing contains scope protection in persona intro', () => {
    assert.ok(briefing.includes('scope protection'), 'briefing persona intro must mention scope protection');
  });

  it('briefing contains acceptance_criteria in user_stories schema (BL-006)', () => {
    assert.ok(briefing.includes('acceptance_criteria'), 'briefing schema must include acceptance_criteria in user_stories');
  });

  it('briefing contains AC Given/When/Then fields in user_stories schema (BL-006)', () => {
    assert.ok(briefing.includes('given:') && briefing.includes('when:') && briefing.includes('then:'),
      'briefing user_stories schema must include given/when/then AC fields');
  });

  it('briefing contains Human Review checklist', () => {
    assert.ok(briefing.includes('Human Review'), 'briefing must include Human Review section');
  });

  it('Human Review checklist covers no_go_zone and acceptance_criteria quality', () => {
    const reviewIdx = briefing.indexOf('Human Review');
    const reviewSection = briefing.slice(reviewIdx);
    assert.ok(reviewSection.includes('no_go_zone') && reviewSection.includes('acceptance_criteria'),
      'Human Review must cover no_go_zone and acceptance_criteria checks');
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS[1].buildBriefing({
      dir: '/tmp/test', inputs: { 'IDEA.md': 'A simple app idea.' }, feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/01_REQUIREMENTS.json'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/01_REQUIREMENTS.json'), 'artifact path must NOT use bare dir');
  });
});
