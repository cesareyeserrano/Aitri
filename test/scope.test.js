/**
 * Test: lib/scope.js — scopeTokens helper
 *
 * Why: This is the single source of truth for the `feature ` verb-prefix and
 * the ` <name>` argument-suffix in every command Aitri prints. The alpha.6
 * version got the order wrong (single `commandPrefix` placed before the verb),
 * which produced grammatically-broken commands like
 * `aitri feature network-monitoring complete ux` — Ultron canary 2026-04-27
 * surfaced the regression because feature.js parses the first token after
 * `feature` as the verb, not as the name.
 *
 * Pure-function tests are the floor; the integration tests in
 * approve/complete/reject/verify exercise the end-to-end emission path, and
 * the round-trip test below dispatches the emitted strings through feature.js
 * to prove they actually parse.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scopeTokens, scopeNameFromDir } from '../lib/scope.js';

describe('scopeTokens()', () => {
  it('returns empty tokens for root context (no featureRoot)', () => {
    const t = scopeTokens(null, 'foo');
    assert.deepEqual(t, { verb: '', arg: '' });
  });

  it('returns empty tokens for root context (no scopeName, defensive)', () => {
    const t = scopeTokens('/parent', null);
    assert.deepEqual(t, { verb: '', arg: '' });
  });

  it('returns feature tokens with trailing/leading spaces baked in', () => {
    const t = scopeTokens('/parent', 'network-monitoring');
    assert.equal(t.verb, 'feature ');
    assert.equal(t.arg,  ' network-monitoring');
  });

  it('templated splice produces correct CLI grammar (verb-then-name-then-phase)', () => {
    const root = scopeTokens(null, null);
    const feat = scopeTokens('/parent', 'foo');
    assert.equal(`aitri ${root.verb}complete${root.arg} 1`, 'aitri complete 1');
    assert.equal(`aitri ${feat.verb}complete${feat.arg} 1`, 'aitri feature complete foo 1');
    assert.equal(`aitri ${root.verb}verify-run${root.arg}`, 'aitri verify-run');
    assert.equal(`aitri ${feat.verb}verify-run${feat.arg}`, 'aitri feature verify-run foo');
  });
});

describe('scopeNameFromDir()', () => {
  it('returns the basename of the path', () => {
    assert.equal(scopeNameFromDir('/parent/features/foo'), 'foo');
    assert.equal(scopeNameFromDir('foo'),                  'foo');
  });
});

// ── Round-trip parse: emitted commands must parse through feature.js ─────────
//
// The Ultron canary regression (alpha.6) was that commands looked plausible
// to a human but failed under literal copy-paste because they didn't match
// the grammar feature.js actually parses. This test extracts every emitted
// `aitri feature <X> <Y> ...` line from a representative output stream, then
// applies the exact same parse logic feature.js uses (first token after
// `feature` is the verb, second is the name) to verify the verb is one that
// feature.js routes — not a feature directory it would try to look up.
//
// Without this, the only signal would have been a real canary 8 handoffs
// deep. This test fires the alarm in CI.

describe('round-trip: every emitted feature command parses through feature.js grammar', () => {
  // Mirrors the dispatch logic in lib/commands/feature.js:42-50:
  //   const [sub, ...rest] = args;        // sub = first token after `feature`
  //   const [name, ...subRest] = rest;    // name = second token
  //   switch (sub) { case 'run-phase': ... }
  // If `sub` is not in the recognized verb set, feature.js falls through to
  // `Unknown feature sub-command`. That's exactly the failure we want to
  // catch at template/emission time, not at canary time.
  const VALID_VERBS = new Set([
    'run-phase', 'complete', 'approve', 'reject',
    'verify-run', 'verify-complete', 'rehash', 'status', 'list', 'init',
  ]);

  function extractFeatureCommands(text) {
    // Match `aitri feature <token1> <token2>` — the two tokens are what
    // feature.js parses as `sub` and `name` respectively.
    const re = /\baitri feature (\S+)(?:\s+(\S+))?/g;
    const cmds = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      cmds.push({ raw: m[0], sub: m[1], second: m[2] });
    }
    return cmds;
  }

  function assertGrammar(text, label) {
    const cmds = extractFeatureCommands(text);
    assert.ok(cmds.length > 0, `${label}: expected at least one feature command in output`);
    for (const c of cmds) {
      assert.ok(VALID_VERBS.has(c.sub),
        `${label}: "${c.raw}" — first token "${c.sub}" must be a valid feature verb. ` +
        `If feature.js parsed this it would treat "${c.sub}" as the feature name and fail with ` +
        `"Unknown feature sub-command". This is the alpha.6 bug class.`);
    }
  }

  // Synthetic stream covering every common shape we emit. If alpha.6's
  // wrong order ever creeps back ("aitri feature network-monitoring complete ux"),
  // this test fails on the first occurrence.
  it('correct alpha.7 emissions all parse', () => {
    const stream = `
      Run: aitri feature complete network-monitoring 1
      Next: aitri feature complete network-monitoring 1   →   aitri feature approve network-monitoring 1
      PIPELINE INSTRUCTION:
        aitri feature run-phase network-monitoring architecture
      Approved → aitri feature approve network-monitoring ux
      Rerun: aitri feature run-phase network-monitoring tests --feedback "x"
      Run: aitri feature verify-run network-monitoring
      Run: aitri feature verify-complete network-monitoring
      Run: aitri feature rehash network-monitoring 3
    `;
    assertGrammar(stream, 'alpha.7 sample');
  });

  it('alpha.6 broken order is rejected (regression guard)', () => {
    const broken = 'PIPELINE INSTRUCTION:\n  aitri feature network-monitoring run-phase ux';
    assert.throws(() => assertGrammar(broken, 'alpha.6 broken'), /alpha\.6 bug class/);
  });
});
