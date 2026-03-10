import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validP5 = () => JSON.stringify({
  project: 'Test Project',
  version: '1.0.0',
  generated_at: new Date().toISOString(),
  phases_completed: 5,
  requirement_compliance: [
    { id: 'FR-001', title: 'Login',     level: 'production_ready',     notes: 'All tests pass' },
    { id: 'FR-002', title: 'Dashboard', level: 'complete',             notes: 'Minor debt' },
    { id: 'FR-003', title: 'Export',    level: 'partial',              notes: 'CSV only' },
    { id: 'FR-004', title: 'Save',      level: 'functionally_present', notes: 'No persistence test' },
  ],
  technical_debt_inherited: [],
  overall_status: 'PARTIAL',
  approved_by: 'Aitri v2',
});

describe('Phase 5 — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS[5].validate(validP5()));
  });

  it('throws when project is missing', () => {
    const d = JSON.parse(validP5());
    delete d.project;
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /PROOF_OF_COMPLIANCE missing fields.*project/);
  });

  it('throws when overall_status is missing', () => {
    const d = JSON.parse(validP5());
    delete d.overall_status;
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /PROOF_OF_COMPLIANCE missing fields.*overall_status/);
  });

  it('throws when requirement_compliance is empty', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance = [];
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /requirement_compliance must list per-FR status/);
  });

  it('throws when a compliance level is invalid', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[0].level = 'done';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), (err) => {
      // message must mention invalid levels AND identify the offending entry
      return /Invalid compliance level/i.test(err.message) && err.message.includes('FR-001') && err.message.includes('"done"');
    });
  });

  it('throws when multiple compliance levels are invalid', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[0].level = 'done';
    d.requirement_compliance[1].level = 'complete_done';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /Invalid compliance level/);
  });

  it('accepts all 4 non-blocking compliance levels', () => {
    const levels = ['functionally_present', 'partial', 'complete', 'production_ready'];
    for (const level of levels) {
      const d = JSON.parse(validP5());
      d.requirement_compliance = [{ id: 'FR-001', title: 'Test', level, notes: '' }];
      assert.doesNotThrow(() => PHASE_DEFS[5].validate(JSON.stringify(d)), `Level "${level}" should be valid`);
    }
  });

  it('throws when any FR has compliance level "placeholder"', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[2].level = 'placeholder';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /Pipeline blocked.*FR-003.*placeholder/);
  });

  it('throws listing all placeholder FRs when multiple are placeholder', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[1].level = 'placeholder';
    d.requirement_compliance[2].level = 'placeholder';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /FR-002.*FR-003/);
  });

  it('passes when placeholder level is not present', () => {
    const d = JSON.parse(validP5());
    assert.doesNotThrow(() => PHASE_DEFS[5].validate(JSON.stringify(d)));
  });
});
