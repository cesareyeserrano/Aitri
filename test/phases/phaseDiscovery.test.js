import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validDiscovery = () => `# Problem Definition

## Problem

Users managing multiple freelance clients manually track invoices in spreadsheets.
When a payment is late they have no automated reminder — they must check and email manually.
This leads to late payments going unnoticed for weeks, causing cash flow disruption.

## Users

- Freelancer (solo): non-technical, manages 5-20 clients, goal is to get paid on time
- Small agency owner: manages a team of 2-5 freelancers, needs consolidated payment view

## Success Criteria

- User can create an invoice in under 2 minutes
- Overdue invoices trigger an automated reminder within 24 hours of due date
- Payment status visible at a glance — no navigation required
- All invoices for a client accessible from a single screen

## Out of Scope

- Payroll or employee payment processing
- Multi-currency conversion
- Accounting software integration (QuickBooks, Xero)
- Mobile native app (web only at launch)
`;

describe('Phase Discovery — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS['discovery'].validate(validDiscovery()));
  });

  it('throws when ## Problem section is missing', () => {
    const d = validDiscovery().replace('## Problem', '## Background');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Problem/);
  });

  it('throws when ## Users section is missing', () => {
    const d = validDiscovery().replace('## Users', '## Personas');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Users/);
  });

  it('throws when ## Success Criteria section is missing', () => {
    const d = validDiscovery().replace('## Success Criteria', '## Goals');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Success Criteria/);
  });

  it('throws when ## Out of Scope section is missing', () => {
    const d = validDiscovery().replace('## Out of Scope', '## Exclusions');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Out of Scope/);
  });

  it('throws when artifact is too short', () => {
    const d = '## Problem\n## Users\n## Success Criteria\n## Out of Scope\n';
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /too short/);
  });

  it('phaseDiscovery is accessible via PHASE_DEFS["discovery"]', () => {
    assert.equal(PHASE_DEFS['discovery'].num, 'discovery');
    assert.equal(PHASE_DEFS['discovery'].artifact, '00_DISCOVERY.md');
  });
});

describe('Phase Discovery — buildBriefing()', () => {
  const idea = 'A tool to help freelancers manage invoices automatically and send payment reminders.';
  const briefing = PHASE_DEFS['discovery'].buildBriefing({
    dir: '/tmp/test',
    inputs: { 'IDEA.md': idea },
    feedback: null,
  });

  it('briefing contains ROLE, CONSTRAINTS, and REASONING from discovery persona', () => {
    assert.ok(briefing.includes('Discovery Facilitator'), 'ROLE must be present');
    assert.ok(briefing.includes('Never'), 'CONSTRAINTS must be present');
    assert.ok(briefing.includes('Before finalizing'), 'REASONING auto-check must be present');
  });

  it('briefing contains the idea content with word count', () => {
    assert.ok(briefing.includes(idea), 'IDEA.md content must appear in briefing');
    assert.ok(briefing.includes('words'), 'word count must be shown');
  });

  it('briefing contains required output sections instructions', () => {
    assert.ok(briefing.includes('## Problem'), 'Problem section instruction must be present');
    assert.ok(briefing.includes('## Users'), 'Users section instruction must be present');
    assert.ok(briefing.includes('## Success Criteria'), 'Success Criteria section instruction must be present');
    assert.ok(briefing.includes('## Out of Scope'), 'Out of Scope section instruction must be present');
  });

  it('applies feedback when provided', () => {
    const withFeedback = PHASE_DEFS['discovery'].buildBriefing({
      dir: '/tmp/test',
      inputs: { 'IDEA.md': idea },
      feedback: 'Focus more on the pain point of late payments',
    });
    assert.ok(withFeedback.includes('Focus more on the pain point'), 'feedback must appear in briefing');
  });

  it('word count reflects actual idea length', () => {
    const wordCount = idea.trim().split(/\s+/).length;
    assert.ok(briefing.includes(`${wordCount} words`), `briefing must show correct word count (${wordCount})`);
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS['discovery'].buildBriefing({
      dir: '/tmp/test',
      inputs: { 'IDEA.md': idea },
      feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/00_DISCOVERY.md'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/00_DISCOVERY.md'), 'artifact path must NOT use bare dir');
  });
});
