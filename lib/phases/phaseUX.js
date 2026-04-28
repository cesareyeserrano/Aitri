/**
 * Module: Phase UX — UX/UI Specification
 * Purpose: UX/UI Designer persona. Defines screens, flows, component states and Nielsen compliance.
 * Artifact: 01_UX_SPEC.md
 * Optional: run before Phase 2. Phase 2 reads it if present.
 */

import { ROLE, CONSTRAINTS, REASONING } from '../personas/ux.js';
import { render } from '../prompts/render.js';

export default {
  num: 'ux',
  name: 'UX/UI Specification',
  persona: 'UX/UI Designer',
  artifact: '01_UX_SPEC.md',
  inputs: ['IDEA.md', '01_REQUIREMENTS.json'],

  extractContext: (content) => content,

  validate(content) {
    const required = ['## User Flows', '## Component Inventory', '## Nielsen Compliance', '## Design Tokens'];
    const missing = required.filter(s => !content.includes(s));
    if (missing.length)
      throw new Error(`01_UX_SPEC.md missing required sections:\n  ${missing.join('\n  ')}`);
    if (content.split('\n').length < 30)
      throw new Error('01_UX_SPEC.md too short — min 30 lines expected for a complete UX spec');
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, bestPractices, scopeVerb = '', scopeArg = '' }) {
    let reqs = {};
    try { reqs = JSON.parse(inputs['01_REQUIREMENTS.json']); } catch {}
    const userPersonas = reqs.user_personas?.length
      ? reqs.user_personas.map(p => `  - ${p.role} (tech: ${p.tech_level}) — goal: ${p.goal}, pain: ${p.pain_point}`).join('\n')
      : `  - User personas not defined in requirements — infer from IDEA.md`;
    const uxFRs = (reqs.functional_requirements || [])
      .filter(fr => ['ux', 'visual', 'audio'].includes(fr.type?.toLowerCase()))
      .map(fr => `  - ${fr.id}: ${fr.title} — ${fr.acceptance_criteria?.join(', ')}`)
      .join('\n') || '  - No UX/visual/audio FRs found';

    return render('phases/phaseUX', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      USER_PERSONAS: userPersonas,
      UX_FRS: uxFRs,
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
