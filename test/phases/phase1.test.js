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
    assert.throws(() => PHASE_DEFS[1].validate('{not json}'), /SyntaxError|Unexpected/);
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
});
