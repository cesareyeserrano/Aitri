import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMustRequirement } from '../lib/requirements.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reqTemplate = readFileSync(
  join(__dirname, '..', 'templates', 'phases', 'requirements.md'), 'utf8'
);

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

  it('is true for a regression NFR despite case/whitespace typos in category (ADV-0622-06)', () => {
    // An agent typo must not let a Must-Not-Break NFR silently escape the MUST gates.
    assert.equal(isMustRequirement({ id: 'NFR-003', category: 'regression' }), true);
    assert.equal(isMustRequirement({ id: 'NFR-004', category: 'Regression ' }), true);
    assert.equal(isMustRequirement({ id: 'NFR-005', category: 'REGRESSION' }), true);
    assert.equal(isMustRequirement({ id: 'NFR-006', category: '  regression' }), true);
  });

  it('does NOT crash on a non-string category — degrades to not-MUST (ADV-0622-06)', () => {
    // A hand-authored array/number/object category must not throw (verify-complete has no
    // try/catch around this filter); the strict-equality original never crashed.
    assert.equal(isMustRequirement({ id: 'NFR-007', category: ['Regression'] }), false);
    assert.equal(isMustRequirement({ id: 'NFR-008', category: 123 }), false);
    assert.equal(isMustRequirement({ id: 'NFR-009', category: { v: 'Regression' } }), false);
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

// REG-GATE-0621 (Depth-Protocol follow-up): the always-on Requirement Depth Protocol
// must route a preserved behavior to the ENFORCED shape (regression NFR + category),
// not the escapable "regression FR". L207's sharp block renders for features only
// (IF_PARENT_REQUIREMENTS); for adopt/migration scope L135 is the ONLY regression
// instruction the agent sees, so the contradiction there is what let Must-Not-Break
// items slip past every gate (an FR with no priority:MUST is caught by nothing).
describe('requirements.md Depth Protocol routes regression to the armed NFR shape', () => {
  it('does NOT instruct a "regression FR" (the escapable shape)', () => {
    assert.equal(/regression FR/.test(reqTemplate), false,
      'Depth Protocol must not say "regression FR" — that shape escapes enforcement without priority:MUST');
  });

  it('instructs a regression NFR with category:"Regression" in the existing-system path', () => {
    assert.match(reqTemplate, /change to an existing system/);
    assert.match(reqTemplate, /regression NFR/);
    assert.match(reqTemplate, /category: "Regression"/);
  });
});
