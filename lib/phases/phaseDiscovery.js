/**
 * Module: Phase Discovery — Problem Definition
 * Purpose: Discovery Facilitator persona. Defines problem, users, success criteria, and out-of-scope.
 * Artifact: 00_DISCOVERY.md
 * Optional: run before Phase 1. Phase 1 reads it if present.
 */

import { ROLE, CONSTRAINTS, REASONING } from '../personas/discovery.js';
import { render } from '../prompts/render.js';

export default {
  num: 'discovery',
  name: 'Problem Definition',
  persona: 'Discovery Facilitator',
  artifact: '00_DISCOVERY.md',
  inputs: ['IDEA.md'],
  // Memoryful re-run (DISCOVERY-DIALOGUE-0724): the sanctioned iteration path is
  // low-confidence → BLOCKED → re-run. Without this, the re-run briefing never sees the
  // prior round's Evidence gaps — a fresh session starts blind. Same injection pattern
  // as phase 1's DISCOVERY_MD.
  optionalInputs: ['00_DISCOVERY.md'],

  extractContext: (content) => content,

  validate(content) {
    // Anchored heading match (line-start + word boundary), NOT a substring scan:
    // `content.includes('## Problem')` was true for `## Problematic Areas` — a
    // different section satisfied the requirement (audit Tier-2, false-accept).
    const required = ['Problem', 'Users', 'Success Criteria', 'Out of Scope'];
    const missing = required.filter(name => !new RegExp(`^##\\s+${name}\\b`, 'mi').test(content));
    if (missing.length)
      throw new Error(`00_DISCOVERY.md missing required sections:\n  ${missing.map(n => '## ' + n).join('\n  ')}`);
    if (content.split('\n').length < 20)
      throw new Error('00_DISCOVERY.md too short — min 20 lines expected for a complete discovery');

    // Discovery Confidence gate — gating on agent's own confidence declaration
    const confMatch = content.match(/## Discovery Confidence\s*\n([\s\S]*?)(?=\n## |$)/i);
    if (!confMatch)
      throw new Error(
        '00_DISCOVERY.md missing required section: ## Discovery Confidence\n' +
        '  Add it as the last section:\n' +
        '    Confidence: low | medium | high\n' +
        '    Evidence gaps: <bullet list or "none">\n' +
        '    Handoff decision: ready | blocked — <one-line reason>'
      );

    const confSection = confMatch[1];
    const confLevel = (confSection.match(/^Confidence:\s*(low|medium|high)/im) || [])[1]?.toLowerCase();
    if (!confLevel)
      throw new Error('## Discovery Confidence missing "Confidence: low|medium|high" line');

    const handoff = (confSection.match(/^Handoff decision:\s*(ready|blocked)/im) || [])[1]?.toLowerCase();
    if (!handoff)
      throw new Error('## Discovery Confidence missing "Handoff decision: ready|blocked" line');

    const gapsMatch = confSection.match(/^Evidence gaps:\s*(.+)/im);
    const gaps      = gapsMatch ? gapsMatch[1].trim() : '';
    const gapsNote  = gaps && gaps.toLowerCase() !== 'none' ? `\n  Evidence gaps: ${gaps}` : '';

    if (handoff === 'blocked')
      throw new Error(`Discovery handoff is blocked${gapsNote}\nClarify open items before proceeding to Phase 1.`);

    if (confLevel === 'low')
      throw new Error(`Discovery confidence is low${gapsNote}\nClarify gaps and re-run discovery before proceeding to Phase 1.`);

    if (confLevel === 'medium')
      process.stderr.write(
        `[aitri] Warning: Discovery confidence is medium.` +
        (gapsNote ? `\n  Evidence gaps: ${gaps}` : '') +
        `\n  You may proceed to Phase 1, but clarify gaps with stakeholders first.\n`
      );
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, interviewContext, config = {}, scopeVerb = '', scopeArg = '', contextAssets = '' }) {
    const idea = inputs['IDEA.md'];
    const wordCount = idea.trim().split(/\s+/).length;

    // Prior round + reject feedback ride the same block: both are round memory the
    // re-run must not lose. rejections is advisory state (never gates) — surfacing it
    // here is its first read path. Suppressed when --feedback carries the same text
    // (reject's suggested command does exactly that — don't print it twice), and
    // timestamp-qualified: the entry lives until approve clears it, so a later round
    // may already have addressed it.
    const prior = inputs['00_DISCOVERY.md'] || '';
    const rej = config.rejections?.discovery;
    const rejection = prior && rej?.feedback && rej.feedback !== feedback ? rej : null;

    return render('phases/phaseDiscovery', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK:          feedback         || '',
      INTERVIEW_CONTEXT: interviewContext || '',
      IDEA_WORD_COUNT:   String(wordCount),
      IDEA_MD:           idea,
      PRIOR_DISCOVERY_MD: prior,
      PRIOR_REJECTION_NOTE: rejection
        ? `The reviewer REJECTED a prior round (recorded ${rejection.at}) with this feedback — if the round below does not already address it, address it first:\n> ${rejection.feedback}\n`
        : '',
      DIR:               dir,
      ARTIFACTS_BASE:    artifactsBase || dir,
      CONTEXT_ASSETS:    contextAssets,
      SCOPE_VERB:        scopeVerb,
      SCOPE_ARG:         scopeArg,
    });
  },
};
