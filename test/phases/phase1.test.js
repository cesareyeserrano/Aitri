import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  // #5 (finance-dashboard canary 2026-06-05): a feature sub-pipeline is an increment;
  // the greenfield 5-FR / 3-NFR floor forced filler. Feature scope relaxes to 2 / 1.
  it('[feature] passes with 2 FRs and 1 NFR (relaxed floor)', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements     = d.functional_requirements.slice(0, 2);
    d.non_functional_requirements = d.non_functional_requirements.slice(0, 1);
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d), { featureRoot: '/parent' }));
  });

  it('[feature] still blocks below the feature floor (1 FR)', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements = d.functional_requirements.slice(0, 1);
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d), { featureRoot: '/parent' }),
      /Min 2 functional_requirements required \(feature scope\)/);
  });

  it('[feature] does NOT relax the floor for root scope (no featureRoot)', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements = d.functional_requirements.slice(0, 3);
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /Min 5 functional_requirements/);
  });

  // FR/NFR id is the join key for phase3 (requirement_id) + phase5 (compliance).
  // Presence + uniqueness must be enforced or downstream keys on undefined / a
  // duplicate silently masks a requirement's coverage (audit Tier-1, phase1 B1/B2).
  it('throws when an FR has no id', () => {
    const d = JSON.parse(validP1());
    delete d.functional_requirements[0].id;
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)),
      /Every functional_requirements entry must have a non-empty string "id"/);
  });

  it('throws when two FRs share an id', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[1].id = 'FR-001';
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)),
      /Duplicate functional_requirements id\(s\):.*FR-001/);
  });

  it('throws when an NFR has no id', () => {
    const d = JSON.parse(validP1());
    delete d.non_functional_requirements[0].id;
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)),
      /Every non_functional_requirements entry must have a non-empty string "id"/);
  });

  it('throws when two NFRs share an id', () => {
    const d = JSON.parse(validP1());
    d.non_functional_requirements[1].id = 'NFR-001';
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)),
      /Duplicate non_functional_requirements id\(s\):.*NFR-001/);
  });

  // AC ids (ADR-041 option A): structured user_story ACs are the finer join key for
  // ac_id / AC-level coverage. Enforced ONLY when structured ACs are present (additive).
  it('passes with structured acceptance criteria carrying unique ids', () => {
    const d = JSON.parse(validP1());
    d.user_stories[0].acceptance_criteria = [
      { id: 'AC-001', text: 'returns 200 under the limit' },
      { id: 'AC-002', text: 'returns 429 over the limit' },
    ];
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('throws when two structured acceptance criteria share an id', () => {
    const d = JSON.parse(validP1());
    d.user_stories[0].acceptance_criteria = [
      { id: 'AC-001', text: 'a' },
      { id: 'AC-001', text: 'b' },
    ];
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)),
      /Duplicate acceptance-criterion id\(s\):.*AC-001/);
  });

  it('throws when a structured acceptance criterion has an empty id', () => {
    const d = JSON.parse(validP1());
    d.user_stories[0].acceptance_criteria = [{ id: '', text: 'x' }];
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)),
      /structured acceptance criterion .* has an empty "id"/);
  });

  it('does NOT enforce AC ids when ACs are plain strings or absent (additive)', () => {
    const d = JSON.parse(validP1());
    d.user_stories[0].acceptance_criteria = ['plain string criterion', 'another'];
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
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

  it('[title vague] throws when MUST FR title is fully vague (Spanish)', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].title = 'La app debe funcionar correctamente';
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /FR-001.*title is too vague/);
  });

  it('[title vague] throws when MUST FR title is fully vague (English)', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].title = 'System must work properly';
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /FR-001.*title is too vague/);
  });

  it('[title vague] passes when title has specific content alongside vague word', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].title = 'Generate reports efficiently';
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[title vague] passes when title has no vague words', () => {
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(validP1()));
  });

  it('[title vague] does not fire on SHOULD FRs (MUST-scope only)', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[3].title = 'Everything works fine';
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[dup-acs] throws when two FRs share ≥90% of acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    const shared = [
      'returns 200 on valid input with ≤200ms latency',
      'logs request id to audit trail',
      'validates token TTL under 60 seconds',
      'persists response to Postgres within same transaction',
    ];
    d.functional_requirements[0].acceptance_criteria = shared;
    d.functional_requirements[1].acceptance_criteria = shared;
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d)), /FR-001 and FR-002.*identical acceptance_criteria/);
  });

  it('[dup-acs] passes when FRs share some but not most acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].acceptance_criteria = [
      'returns 200 on valid input',
      'logs request to audit table',
      'validates token TTL ≤60s',
    ];
    d.functional_requirements[1].acceptance_criteria = [
      'returns 200 on valid input',
      'exports CSV with UTF-8 BOM marker',
      'throttles to 10 req per second',
    ];
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[dup-acs] skips check when FRs have fewer than 3 acceptance_criteria', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].acceptance_criteria = ['returns 200 on success with p99 ≤200ms'];
    d.functional_requirements[1].acceptance_criteria = ['returns 200 on success with p99 ≤200ms'];
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[ASSUMPTION] does not throw when FRs contain [ASSUMPTION] marker', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements[0].title = 'Login [ASSUMPTION: needs user confirmation]';
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d)));
  });

  it('[user-story] warning fires on stderr when MUST FR has no linked user story', () => {
    const d = JSON.parse(validP1());
    // FR-002 and FR-003 are MUST but have no user story (US-001 only links FR-001)
    const stderrChunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
    try {
      PHASE_DEFS[1].validate(JSON.stringify(d));
    } finally {
      process.stderr.write = origWrite;
    }
    const out = stderrChunks.join('');
    assert.match(out, /MUST FR\(s\) have no linked user story/);
    assert.match(out, /FR-002/);
    assert.match(out, /FR-003/);
  });

  it('[user-story] no warning when all MUST FRs have linked user stories', () => {
    const d = JSON.parse(validP1());
    d.user_stories.push(
      { id: 'US-002', requirement_id: 'FR-002', as_a: 'user', i_want: 'see dashboard', so_that: 'I can view data' },
      { id: 'US-003', requirement_id: 'FR-003', as_a: 'user', i_want: 'export data', so_that: 'I can share it' },
    );
    const stderrChunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
    try {
      PHASE_DEFS[1].validate(JSON.stringify(d));
    } finally {
      process.stderr.write = origWrite;
    }
    const out = stderrChunks.join('');
    assert.ok(!out.includes('MUST FR(s) have no linked user story'), 'no warning when all MUST FRs are covered');
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

  // C4 (finance-dashboard canary 2026-06-05): in feature scope the seed is
  // FEATURE_IDEA.md (materialized to IDEA.md), with a DIFFERENT section set. The
  // warner must check the feature sections, not the root ones.
  it('[feature] warns about the empty FEATURE_IDEA section, referencing FEATURE_IDEA.md', () => {
    const seed = '## Feature\nAuth.\n## Problem / Why\nUsers need login.\n## Target Users\nMembers.\n## New Behavior\n\n## Success Criteria\nGiven X when Y then Z.\n';
    const stderr = captureStderr(() => PHASE_DEFS[1].buildBriefing({ dir: '/tmp', inputs: { 'IDEA.md': seed }, feedback: null, featureRoot: '/parent' }));
    assert.match(stderr, /New Behavior/);
    assert.match(stderr, /FEATURE_IDEA\.md/);
  });

  it('[feature] does NOT warn about root-only sections (e.g. Business Rules) absent from a feature seed', () => {
    const seed = '## Feature\nAuth.\n## Problem / Why\nUsers need login.\n## Target Users\nMembers.\n## New Behavior\nAdd a login form.\n## Success Criteria\nGiven X when Y then Z.\n';
    const stderr = captureStderr(() => PHASE_DEFS[1].buildBriefing({ dir: '/tmp', inputs: { 'IDEA.md': seed }, feedback: null, featureRoot: '/parent' }));
    assert.equal(stderr, '', 'a complete FEATURE_IDEA seed must not trigger root-section warnings');
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

  // F1 (rc.11) — security applicability is a forced explicit decision, not opt-in by omission
  it('briefing forces an explicit security-applicability decision', () => {
    assert.ok(/\*\*Security\*\*/.test(briefing) || /Security.*applies to/i.test(briefing),
      'briefing must surface Security as an operational category');
    assert.ok(/does security apply/i.test(briefing),
      'briefing must force an explicit "does security apply?" decision');
    assert.ok(/not.*unaddressed by omission|state why/i.test(briefing),
      'briefing must require a reason when security does not apply');
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

// ── Re-run mode: 01_REQUIREMENTS.json is the SSoT, IDEA.md is irrelevant ─────

describe('Phase 1 — buildBriefing() re-run mode (01_REQUIREMENTS.json exists)', () => {
  it('renders the "Current Requirements — SSoT" block when 01_REQS exists and skips IDEA Pre-flight', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-phase1-rerun-'));
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    const reqContent = '{"project_name":"X","functional_requirements":[{"id":"FR-001","title":"existing","priority":"MUST","type":"logic"}]}';
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), reqContent);
    try {
      const briefing = PHASE_DEFS[1].buildBriefing({
        dir, inputs: {}, feedback: null,
        artifactsBase: path.join(dir, 'spec'),
        config: { artifactsDir: 'spec' },
      });
      assert.ok(briefing.includes('Current Requirements — SSoT'),
        're-run mode must render the SSoT section');
      assert.ok(briefing.includes('FR-001'),
        'briefing must include the existing FR ids verbatim');
      assert.ok(!briefing.includes('IDEA.md Pre-flight Evaluation'),
        'Pre-flight Evaluation must be skipped in re-run mode');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to IDEA.md mode when 01_REQS exists but is malformed JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-phase1-malformed-'));
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), '{not json');
    fs.writeFileSync(path.join(dir, 'IDEA.md'), '## Problem\nReal problem here.\n');
    try {
      const briefing = PHASE_DEFS[1].buildBriefing({
        dir, inputs: {}, feedback: null,
        artifactsBase: path.join(dir, 'spec'),
        config: { artifactsDir: 'spec' },
      });
      assert.ok(briefing.includes('IDEA.md Pre-flight Evaluation'),
        'malformed 01_REQS must fall back to IDEA.md first-run mode');
      assert.ok(!briefing.includes('Current Requirements — SSoT'),
        'SSoT block must not render when 01_REQS is malformed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws "Missing required file: IDEA.md" when neither IDEA.md nor 01_REQS exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-phase1-empty-'));
    try {
      assert.throws(
        () => PHASE_DEFS[1].buildBriefing({ dir, inputs: {}, feedback: null, config: {} }),
        /Missing required file: IDEA\.md/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── D2: Tier-A seed-input provenance gate ───────────────────────────────────
// Fires only on a fresh seed (Phase 1 not yet approved) AND only when a config
// is supplied. Bare validate(content) and re-runs of approved projects skip it.

describe('Phase 1 — Tier-A provenance gate (D2)', () => {
  const FRESH  = { config: {} };                       // fresh seed — Phase 1 not approved
  const SEALED = { config: { approvedPhases: [1] } };  // seed sealed after approval

  const allConfirmed = {
    problem: 'confirmed', users: 'confirmed', baseline: 'confirmed',
    success_metric: 'confirmed', no_go_zone: 'confirmed',
  };

  const withProv = (prov, extra = {}) => {
    const d = JSON.parse(validP1());
    if (prov) d.idea_provenance = prov;
    Object.assign(d, extra);
    return JSON.stringify(d);
  };

  it('bare validate(content) without ctx skips the gate (back-compat)', () => {
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(validP1()));
  });

  it('fresh seed without idea_provenance throws', () => {
    assert.throws(() => PHASE_DEFS[1].validate(validP1(), FRESH),
      /Missing required field: idea_provenance/);
  });

  it('fresh seed with all-confirmed provenance passes', () => {
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(withProv(allConfirmed), FRESH));
  });

  // rc.45 (ADR-043 #5) — a confirmed field with no source warns (does NOT block).
  it('warns (not blocks) when confirmed fields have no provenance source', () => {
    let stderr = '';
    const orig = process.stderr.write; process.stderr.write = (c) => { stderr += c; return true; };
    try { PHASE_DEFS[1].validate(withProv(allConfirmed), FRESH); } finally { process.stderr.write = orig; }
    assert.match(stderr, /"confirmed" Tier-A field\(s\) have no source/);
  });

  it('does NOT warn about sources when every confirmed field cites one', () => {
    const sources = { problem: 'IDEA.md', users: 'IDEA.md', baseline: 'user', success_metric: 'user', no_go_zone: 'IDEA.md' };
    let stderr = '';
    const orig = process.stderr.write; process.stderr.write = (c) => { stderr += c; return true; };
    try { PHASE_DEFS[1].validate(withProv(allConfirmed, { idea_provenance_sources: sources }), FRESH); } finally { process.stderr.write = orig; }
    assert.ok(!/have no source/.test(stderr), 'no source warning when all confirmed fields cite a source');
  });

  it('fresh seed with an invalid provenance value throws', () => {
    assert.throws(() => PHASE_DEFS[1].validate(withProv({ ...allConfirmed, users: 'maybe' }), FRESH),
      /missing or invalid entries: users/);
  });

  it('fresh seed with a missing provenance key throws', () => {
    const prov = { ...allConfirmed }; delete prov.baseline;
    assert.throws(() => PHASE_DEFS[1].validate(withProv(prov), FRESH),
      /missing or invalid entries: baseline/);
  });

  it('fresh seed with an assumed field NOT carried in idea_gaps throws', () => {
    assert.throws(() => PHASE_DEFS[1].validate(withProv({ ...allConfirmed, baseline: 'assumed' }), FRESH),
      /not carried in idea_gaps: baseline/);
  });

  it('fresh seed with an assumed field carried in top-level idea_gaps passes', () => {
    const content = withProv({ ...allConfirmed, baseline: 'assumed' },
      { idea_gaps: ['baseline: no current metric in IDEA.md — confirm with owner'] });
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(content, FRESH));
  });

  // The gap must START with the field key, not merely MENTION it anywhere — a
  // `baseline:` gap that says "power users" must NOT satisfy the `users`
  // assumption (audit Tier-2, cross-field false-accept).
  it('fresh seed: a gap that only mentions the field key elsewhere does NOT carry it', () => {
    const content = withProv({ ...allConfirmed, users: 'assumed' },
      { idea_gaps: ['baseline: current power users have no metric — confirm'] });
    assert.throws(() => PHASE_DEFS[1].validate(content, FRESH),
      /not carried in idea_gaps: users/);
  });

  it('fresh seed accepts idea_gaps nested under a project_summary object', () => {
    const d = JSON.parse(validP1());
    d.idea_provenance = { ...allConfirmed, no_go_zone: 'assumed' };
    d.project_summary = { idea_gaps: ['no_go_zone: inferred from product type — confirm'] };
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(JSON.stringify(d), FRESH));
  });

  it('sealed seed (Phase 1 approved) skips the gate even without provenance', () => {
    assert.doesNotThrow(() => PHASE_DEFS[1].validate(validP1(), SEALED));
  });

  it('gate runs last — an earlier schema error still surfaces with a config present', () => {
    const d = JSON.parse(validP1());
    d.functional_requirements = d.functional_requirements.slice(0, 3); // < 5 FRs
    assert.throws(() => PHASE_DEFS[1].validate(JSON.stringify(d), FRESH),
      /Min 5 functional_requirements/);
  });
});

describe('Phase 1 — discovery handoff (audit Tier-4)', () => {
  it('injects 00_DISCOVERY.md into the requirements briefing on first run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-disc-'));
    try {
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Idea\n## Problem\nx\n## Target Users\ny\n## Business Rules\nz\n## Success Criteria\nw\n');
      fs.writeFileSync(path.join(dir, 'spec/00_DISCOVERY.md'), '## Problem\nFreelancers lose invoices.\n## Out of Scope\nNo payroll.\n');
      const b = PHASE_DEFS[1].buildBriefing({ dir, inputs: {}, config: { artifactsDir: 'spec' } });
      assert.ok(b.includes('Freelancers lose invoices'), 'discovery content must reach the requirements agent');
      assert.ok(b.includes('Phase 0 handoff'), 'discovery handoff section must be rendered');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('omits the discovery block when no 00_DISCOVERY.md exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-nodisc-'));
    try {
      fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Idea\n## Problem\nx\n## Target Users\ny\n## Business Rules\nz\n## Success Criteria\nw\n');
      const b = PHASE_DEFS[1].buildBriefing({ dir, inputs: {}, config: { artifactsDir: 'spec' } });
      assert.ok(!b.includes('Phase 0 handoff'), 'no discovery block when the artifact is absent');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Phase 1 — feature regression boundary (ADR-039 Phase 2)', () => {
  it('feature briefing (PARENT_REQUIREMENTS present) instructs converting Must Not Break → regression NFRs', () => {
    const b = PHASE_DEFS[1].buildBriefing({
      dir: '/tmp', config: {},
      inputs: { 'IDEA.md': '## Feature\nx\n## Must Not Break\nlogin keeps working\n',
                'PARENT_REQUIREMENTS.json': '{"functional_requirements":[{"id":"FR-001"}]}' },
    });
    assert.ok(b.includes('regression NFR'), 'feature briefing must teach the regression-NFR mechanism');
    assert.ok(/Touch Points/.test(b), 'feature briefing must reference Touch Points');
  });

  it('non-feature briefing (no PARENT_REQUIREMENTS) omits the regression-boundary block', () => {
    const b = PHASE_DEFS[1].buildBriefing({
      dir: '/tmp', config: {},
      inputs: { 'IDEA.md': '## Problem\nx\n## Target Users\ny\n## Business Rules\nz\n## Success Criteria\nw\n' },
    });
    assert.ok(!b.includes('regression NFR'), 'greenfield briefing must not carry the feature-only regression block');
  });
});
