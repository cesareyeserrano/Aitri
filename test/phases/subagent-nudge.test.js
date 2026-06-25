/**
 * Tests: optional independent-subagent suggestions in the review / test-design /
 * audit prompts. These are SUGGESTIONS (capability-conditional, token-costing,
 * operator's call), never gates — Aitri cannot run or verify a subagent pass.
 * The test locks the nudge into the rendered output AND guards the load-bearing
 * invariant: the block stays a conditional suggestion, never a mandate. The
 * assertions key off the concept (conditional framing, no imperative), not exact
 * prose, so a benign reword survives but turning the suggestion into a command fails.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../lib/prompts/render.js';

// Slice the "## Optional — …" section out of a rendered prompt: from its heading
// to the next "## " heading (or end of file). Asserting against the block — not
// the whole prompt — keeps the no-mandate guard scoped to the suggestion itself.
function optionalBlock(rendered, heading) {
  const start = rendered.indexOf(heading);
  assert.notEqual(start, -1, `missing heading "${heading}"`);
  const rest = rendered.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return heading + (next === -1 ? rest : rest.slice(0, next));
}

describe('Optional subagent-pass suggestions in prompts', () => {
  const cases = [
    ['phases/phaseReview', '## Optional — independent adversarial pass', /refute/i],
    ['phases/tests', '## Optional — independent edge-case sweep', /edge[- ]case|cases you .{0,4}did/i],
    ['phases/auditSecurity', '## Optional — multi-lens fan-out', /authz|injection|data exposure/i],
    ['phases/audit', '## Optional — multi-lens fan-out', /correctness|performance/i],
  ];

  for (const [tpl, heading, concept] of cases) {
    it(`${tpl} renders the optional suggestion block with its domain-specific hook`, () => {
      const block = optionalBlock(render(tpl, {}), heading);
      assert.match(block, concept, `${tpl} block lost its domain-specific failure mode`);
    });

    it(`${tpl} keeps the pass a conditional, token-costing suggestion — never a mandate`, () => {
      const block = optionalBlock(render(tpl, {}), heading);
      // Conditional framing: the pass is gated on the harness actually having subagents.
      assert.match(block, /\bif\b.*(subagents?|environment)/is, `${tpl} must condition on subagent availability`);
      // Suggestion verb, not a command.
      assert.match(block, /\bconsider\b/i, `${tpl} must phrase the pass as "consider", not an order`);
      // Cost + opt-in framing.
      assert.match(block, /optional/i, `${tpl} must mark the pass optional`);
      assert.match(block, /token/i, `${tpl} must state the token cost`);
      // No imperative that turns the suggestion into a mandate. Catches phrasings a
      // future edit might reach for ("you MUST run", "Always spawn", "Run a subagent").
      assert.doesNotMatch(block, /\b(you\s+)?must\b/i, `${tpl} must not mandate the pass`);
      assert.doesNotMatch(block, /\b(always|never skip)\b/i, `${tpl} must not phrase the pass as unconditional`);
      assert.doesNotMatch(block, /^\s*(run|spawn|use)\s+(a\s+)?(an\s+)?(independent\s+)?subagent/im,
        `${tpl} must not open with an imperative subagent command`);
    });
  }
});
