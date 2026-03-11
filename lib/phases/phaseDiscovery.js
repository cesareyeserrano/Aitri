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
  },

  buildBriefing({ dir, inputs, feedback }) {
    const idea = inputs['IDEA.md'];
    const wordCount = idea.trim().split(/\s+/).length;

    return render('phases/phaseDiscovery', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      IDEA_WORD_COUNT: String(wordCount),
      IDEA_MD: idea,
      DIR: dir,
    });
  },
};
