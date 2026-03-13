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

  extractContext: (content) => content,

  validate(content) {
    const required = ['## Problem', '## Users', '## Success Criteria', '## Out of Scope'];
    const missing = required.filter(s => !content.includes(s));
    if (missing.length)
      throw new Error(`00_DISCOVERY.md missing required sections:\n  ${missing.join('\n  ')}`);
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

  buildBriefing({ dir, inputs, feedback, artifactsBase, interviewContext }) {
    const idea = inputs['IDEA.md'];
    const wordCount = idea.trim().split(/\s+/).length;

    return render('phases/phaseDiscovery', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK:          feedback         || '',
      INTERVIEW_CONTEXT: interviewContext || '',
      IDEA_WORD_COUNT:   String(wordCount),
      IDEA_MD:           idea,
      DIR:               dir,
      ARTIFACTS_BASE:    artifactsBase || dir,
    });
  },
};
