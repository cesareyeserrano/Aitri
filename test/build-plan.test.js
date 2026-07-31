/**
 * Tests: lib/build-plan.js — tolerant advisory BUILD_PLAN.md reader (PLAN-ARTIFACT-0715 S2)
 * Posture under test: degrade-to-null, never throw — nothing gates on this parse.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBuildPlan, summarizeEpicProgress } from '../lib/build-plan.js';

const PLAN = `# Build Plan — Demo (plan generation 1)

## EP-01 — Core ledger   [status: done]
  Delivers:    US-001, US-002
  FRs:         FR-001, FR-002
  Makes pass:  TC-001h, TC-001f, TC-002h
  Build steps: skeleton → persistence → hardening
  Why here:    foundation for everything

Evidence: TC run 3/3 green 2026-07-17.

## EP-02 — Reports   [status: in-progress]
  Delivers:    US-003
  FRs:         FR-003
  Makes pass:  TC-003h, TC-003f
  Why here:    reads over EP-01 data

## EP-03 — Export   [status: pending]
  Delivers:    US-004
  Makes pass:  TC-004h
  Why here:    last, depends on reports
`;

describe('parseBuildPlan()', () => {
  it('parses epics with id, title, status, and id lists', () => {
    const plan = parseBuildPlan(PLAN);
    assert.equal(plan.epics.length, 3);
    const [a, b, c] = plan.epics;
    assert.deepEqual([a.id, a.status], ['EP-01', 'done']);
    assert.equal(a.title, 'Core ledger');
    assert.deepEqual(a.delivers, ['US-001', 'US-002']);
    assert.deepEqual(a.makes_pass, ['TC-001h', 'TC-001f', 'TC-002h']);
    assert.deepEqual([b.id, b.status], ['EP-02', 'in-progress']);
    assert.deepEqual([c.id, c.status], ['EP-03', 'pending']);
  });

  it('tolerates the rc.170 legacy heading (Epic N) so in-flight plans still display', () => {
    const plan = parseBuildPlan('## Epic 1 — Old style [status: done]\n  Makes pass: TC-001\n');
    assert.equal(plan.epics[0].id, 'Epic 1');
    assert.equal(plan.epics[0].status, 'done');
  });

  it('missing [status: ...] defaults to pending; unknown tokens pass through lowercased', () => {
    const plan = parseBuildPlan('## EP-01 — A\n\n## EP-02 — B   [status: Blocked]\n');
    assert.equal(plan.epics[0].status, 'pending');
    assert.equal(plan.epics[1].status, 'blocked');
  });

  it('degrades to null on free-form / malformed / empty / non-string input — never throws', () => {
    assert.equal(parseBuildPlan('# Plan\nJust prose, no epic headings.\n'), null);
    assert.equal(parseBuildPlan(''), null);
    assert.equal(parseBuildPlan(null), null);
    assert.equal(parseBuildPlan(undefined), null);
    assert.equal(parseBuildPlan(42), null);
  });
});

describe('summarizeEpicProgress()', () => {
  it('reports done count and the in-progress epic', () => {
    const s = summarizeEpicProgress(parseBuildPlan(PLAN));
    assert.match(s, /1\/3 epic\(s\) done/);
    assert.match(s, /in progress: EP-02 — Reports/);
  });

  it('falls back to the next pending epic when none is in progress', () => {
    const s = summarizeEpicProgress(parseBuildPlan('## EP-01 — A [status: done]\n\n## EP-02 — B [status: pending]\n'));
    assert.match(s, /next: EP-02 — B/);
  });
});

// Adversarial findings: linear-time parsing (no catastrophic backtracking) + fence skip.
describe('parseBuildPlan() — pathological and quoted input', () => {
  it('a heading padded with 50k spaces parses in linear time (no backtracking hang)', () => {
    const start = Date.now();
    const plan = parseBuildPlan(`## EP-01 — T${' '.repeat(50000)}x [status: done]\n`);
    assert.ok(Date.now() - start < 1000, 'must parse in well under a second');
    assert.equal(plan.epics[0].status, 'done');
  });

  it('epic headings inside fenced code blocks are ignored (no phantom epics)', () => {
    const md = '## EP-01 — Real [status: done]\n\nExample:\n```\n## EP-02 — Quoted example\n```\n';
    const plan = parseBuildPlan(md);
    assert.equal(plan.epics.length, 1);
    assert.equal(plan.epics[0].id, 'EP-01');
  });

  it('a [status: ...] on the NEXT line does not get absorbed into the heading', () => {
    const plan = parseBuildPlan('## EP-01 — Title\n[status: done]\n');
    assert.equal(plan.epics[0].status, 'pending', 'status must be same-line only');
    assert.equal(plan.epics[0].title, 'Title');
  });
});
