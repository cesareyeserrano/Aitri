import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMustRequirement } from '../lib/requirements.js';

// REG-GATE-0621: single source for "does this requirement count as a hard-block MUST?".
// A regression NFR is a Must-Not-Break commitment and counts as MUST even with no
// priority — the category arm makes category:"Regression" mechanically load-bearing.
describe('isMustRequirement() (REG-GATE-0621)', () => {
  it('is true for an explicit priority:MUST requirement', () => {
    assert.equal(isMustRequirement({ id: 'FR-001', priority: 'MUST' }), true);
  });

  it('is true for a regression NFR even with NO priority', () => {
    assert.equal(isMustRequirement({ id: 'NFR-001', category: 'Regression' }), true);
  });

  it('is true for a regression NFR that also sets priority:MUST', () => {
    assert.equal(isMustRequirement({ id: 'NFR-001', category: 'Regression', priority: 'MUST' }), true);
  });

  it('is false for a SHOULD requirement with no regression category', () => {
    assert.equal(isMustRequirement({ id: 'FR-002', priority: 'SHOULD' }), false);
  });

  it('is false for a non-regression NFR with no priority (unchanged behavior)', () => {
    assert.equal(isMustRequirement({ id: 'NFR-002', category: 'Security' }), false);
  });

  it('is false for an undefined/empty requirement (no crash)', () => {
    assert.equal(isMustRequirement(undefined), false);
    assert.equal(isMustRequirement({}), false);
  });

  it('does not let a regression-named FR-style object slip in via priority alone', () => {
    // FRs have no category field; the category arm never changes FR behavior.
    assert.equal(isMustRequirement({ id: 'FR-003', priority: 'NICE' }), false);
  });
});
