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

## Discovery Confidence
Confidence: high
Evidence gaps: none
Handoff decision: ready — all sections grounded in user input
`;

describe('Phase Discovery — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS['discovery'].validate(validDiscovery()));
  });

  it('throws when ## Problem section is missing', () => {
    const d = validDiscovery().replace('## Problem', '## Background');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Problem/);
  });

  // Anchored heading match: a different section that merely starts with the word
  // (## Problematic Areas) must NOT satisfy the ## Problem requirement (audit Tier-2).
  it('does not accept ## Problematic Areas as the Problem section', () => {
    const d = validDiscovery().replace(/^## Problem\b.*$/m, '## Problematic Areas');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /missing required sections[\s\S]*Problem/);
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

  it('throws when ## Discovery Confidence section is absent', () => {
    const d = validDiscovery().replace('## Discovery Confidence\n', '## Notes\n');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Discovery Confidence/);
  });

  it('throws when Confidence line is missing from section', () => {
    const d = validDiscovery().replace('Confidence: high', 'Rating: high');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Confidence: low\|medium\|high/);
  });

  it('throws when Handoff decision line is missing from section', () => {
    const d = validDiscovery().replace('Handoff decision: ready', 'Status: ready');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /Handoff decision/);
  });

  it('throws when Confidence is low', () => {
    const d = validDiscovery().replace('Confidence: high', 'Confidence: low');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /confidence is low/);
  });

  it('throws when Handoff decision is blocked (overrides confidence)', () => {
    const d = validDiscovery()
      .replace('Confidence: high', 'Confidence: high')
      .replace('Handoff decision: ready', 'Handoff decision: blocked');
    assert.throws(() => PHASE_DEFS['discovery'].validate(d), /handoff is blocked/);
  });

  it('warns on stderr but does not throw when Confidence is medium', () => {
    const d = validDiscovery().replace('Confidence: high', 'Confidence: medium');
    const chunks = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (c) => { chunks.push(c); return true; };
    try {
      assert.doesNotThrow(() => PHASE_DEFS['discovery'].validate(d));
    } finally {
      process.stderr.write = orig;
    }
    assert.ok(chunks.join('').includes('medium'), 'stderr must mention medium confidence');
  });

  it('low confidence message includes evidence gaps when present', () => {
    const d = validDiscovery()
      .replace('Confidence: high', 'Confidence: low')
      .replace('Evidence gaps: none', 'Evidence gaps: pricing model unclear');
    assert.throws(
      () => PHASE_DEFS['discovery'].validate(d),
      /pricing model unclear/
    );
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

  // ADR-039 Phase 3a — discovery ingests provided context and scales depth.
  it('instructs ingesting referenced context (assets/idea folder/docs) before eliciting', () => {
    assert.ok(briefing.includes('Ingest the context FIRST'),
      'discovery must tell the agent to read provided sources first');
    assert.ok(/READ them before writing/.test(briefing));
  });

  it('instructs proportional depth (do not over-process an MVP)', () => {
    assert.ok(/proportional/i.test(briefing) && /MVP/.test(briefing),
      'discovery must scale depth to the project, not run a giant process on a landing page');
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

// DISCOVERY-DIALOGUE-0724 — discovery becomes a reasoned conversation, not a form.
describe('Phase Discovery — elicitation protocol (DISCOVERY-DIALOGUE-0724)', () => {
  const idea = 'A tool to help freelancers manage invoices automatically and send payment reminders.';
  const build = (extra = {}) => PHASE_DEFS['discovery'].buildBriefing({
    dir: '/tmp/test',
    inputs: { 'IDEA.md': idea, ...(extra.inputs || {}) },
    feedback: null,
    ...extra,
  });

  it('briefing carries the reason-ask-iterate protocol, subordinated to depth-matching', () => {
    const b = build();
    assert.match(b, /## Elicitation protocol — reason, ask, iterate/, 'protocol section present');
    assert.match(b, /skip to a single confirmation pass/, 'trivial tier skips the protocol, in those words');
    assert.match(b, /do not add rounds to a landing page/, 'no manufactured ceremony');
    assert.match(b, /Only then.*write/s, 'artifact is written only after the conversation');
  });

  it('logic check: contradictions are manifested to the user, never silently harmonized', () => {
    const b = build();
    assert.match(b, /never silently harmonized/, 'the mandate, verbatim');
    assert.match(b, /state both sides.*why they can't both hold.*which gives/s, 'the resolution mechanics');
    assert.match(b, /Evidence gaps verbatim/, 'unresolved contradictions land in Evidence gaps');
  });

  it('persona-level constraint: never silently reconcile contradictory inputs', () => {
    assert.match(build(), /Never silently reconcile contradictory inputs/, 'CONSTRAINT present in briefing');
  });

  it('questions derive from the material, not the generic form fields', () => {
    const b = build();
    assert.match(b, /open questions this material itself raises/i, 'derived, not scripted');
    assert.match(b, /NOT the generic form fields/, 'anti-form mandate');
  });

  it('no-human fallback: never simulate the conversation', () => {
    const b = build();
    assert.match(b, /Do NOT simulate the conversation/, 'fallback stated in those words');
    assert.match(b, /never fake resolutions or invent answers/, 'no invented answers');
  });

  it('Resolutions section: chat dies, artifact survives — with IDEA.md precedence rule', () => {
    const b = build();
    assert.match(b, /## Resolutions/, 'Resolutions section instructed');
    assert.match(b, /a resolution not recorded here never happened/i, 'the handoff rationale');
    assert.match(b, /supersedes IDEA\.md/, 'precedence marker format');
    assert.match(b, /NEVER edit IDEA\.md/, 'the seed is archived history');
  });

  it('Delivery Summary and Human Review surface the contradictions', () => {
    const b = build();
    assert.match(b, /Contradictions: \[N resolved · N open/, 'Delivery Summary line');
    assert.match(b, /resolved by YOU — the agent did not pick a side/, 'Human Review checkbox');
  });
});

// DISCOVERY-DIALOGUE-0724 kernel — memoryful re-run: the sanctioned iteration path
// (low confidence → BLOCKED → re-run) must regenerate the briefing AROUND the prior
// round's artifact, so a fresh session does not start blind to the gaps it must close.
describe('Phase Discovery — memoryful re-run (prior round injection)', () => {
  const idea = 'A tool to help freelancers manage invoices automatically.';
  const prior = [
    '# Product Discovery — Problem Statement',
    '## Problem\nLate invoices.',
    '## Discovery Confidence',
    'Confidence: low',
    'Evidence gaps:\n- pricing model unclear',
    'Handoff decision: ready — pending gaps',
  ].join('\n');

  it('declares 00_DISCOVERY.md as optionalInput (run-phase injects it on re-run)', () => {
    assert.deepEqual(PHASE_DEFS['discovery'].optionalInputs, ['00_DISCOVERY.md']);
  });

  it('first run: no prior-round block, no leaked template tokens', () => {
    const b = PHASE_DEFS['discovery'].buildBriefing({
      dir: '/tmp/test', inputs: { 'IDEA.md': idea }, feedback: null,
    });
    assert.ok(!b.includes('Prior discovery round'), 'no prior block on first run');
    assert.ok(!b.includes('{{'), 'no unrendered template tokens');
  });

  it('re-run: prior artifact is injected with the close-its-gaps objective', () => {
    const b = PHASE_DEFS['discovery'].buildBriefing({
      dir: '/tmp/test', inputs: { 'IDEA.md': idea, '00_DISCOVERY.md': prior }, feedback: null,
    });
    assert.match(b, /## Prior discovery round — close its gaps, do not restart/, 'objective header');
    assert.ok(b.includes('pricing model unclear'), 'prior Evidence gaps visible to the new round');
    assert.match(b, /do not re-ask what a `## Resolutions` entry already settled/, 'resolutions preserved');
  });

  it('re-run after reject: the rejection feedback is surfaced, timestamp-qualified', () => {
    const b = PHASE_DEFS['discovery'].buildBriefing({
      dir: '/tmp/test', inputs: { 'IDEA.md': idea, '00_DISCOVERY.md': prior }, feedback: null,
      config: { rejections: { discovery: { at: '2026-07-30T00:00:00Z', feedback: 'users section conflates buyer and payer' } } },
    });
    assert.match(b, /REJECTED a prior round \(recorded 2026-07-30T00:00:00Z\)/, 'rejection framing + timestamp');
    assert.ok(b.includes('users section conflates buyer and payer'), 'rejection feedback verbatim');
  });

  it('rejection without a prior artifact is not surfaced (no orphan note)', () => {
    const b = PHASE_DEFS['discovery'].buildBriefing({
      dir: '/tmp/test', inputs: { 'IDEA.md': idea }, feedback: null,
      config: { rejections: { discovery: { at: '2026-07-30T00:00:00Z', feedback: 'stale note' } } },
    });
    assert.ok(!b.includes('REJECTED a prior round'), 'no rejection note without prior round');
    assert.ok(!b.includes('stale note'), 'rejection text absent');
  });

  it('rejection note is suppressed when --feedback already carries the same text (reject\'s suggested command)', () => {
    const same = 'users section conflates buyer and payer';
    const b = PHASE_DEFS['discovery'].buildBriefing({
      dir: '/tmp/test', inputs: { 'IDEA.md': idea, '00_DISCOVERY.md': prior }, feedback: same,
      config: { rejections: { discovery: { at: '2026-07-30T00:00:00Z', feedback: same } } },
    });
    assert.ok(!b.includes('REJECTED a prior round'), 'no duplicate — feedback block already carries it');
    assert.match(b, /## Feedback to apply/, 'the --feedback block is the single carrier');
  });
});
