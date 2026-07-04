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
  // Same rationale as phase2.js — the brief lives in
  // 01_REQUIREMENTS.json#original_brief once Phase 1 has been approved. The UX
  // briefing surfaces it through REQUIREMENTS_JSON; declaring IDEA.md as a
  // required input was a dead assumption that broke re-runs on absorbed-brief
  // projects.
  inputs: ['01_REQUIREMENTS.json'],

  extractContext: (content) => content,

  validate(content) {
    // Anchored heading match (line-start), NOT a substring scan: `includes('## Design
    // Tokens')` was satisfied by the phrase appearing inline in prose or a demoted
    // `### Design Tokens` (audit Tier-2, false-accept).
    const required = ['User Flows', 'Component Inventory', 'Nielsen Compliance', 'Design Tokens'];
    const missing = required.filter(name => !new RegExp(`^##\\s+${name}\\b`, 'mi').test(content));
    if (missing.length)
      throw new Error(`01_UX_SPEC.md missing required sections:\n  ${missing.map(n => '## ' + n).join('\n  ')}`);
    if (content.split('\n').length < 30)
      throw new Error('01_UX_SPEC.md too short — min 30 lines expected for a complete UX spec');
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, bestPractices, scopeVerb = '', scopeArg = '', contextAssets = '' }) {
    let reqs = {};
    try { reqs = JSON.parse(inputs['01_REQUIREMENTS.json']); } catch {}
    const userPersonas = reqs.user_personas?.length
      ? reqs.user_personas.map(p => `  - ${p.role} (tech: ${p.tech_level}) — goal: ${p.goal}, pain: ${p.pain_point}`).join('\n')
      // C1 fix: original_brief/project_summary are STRIPPED from the extracted requirements
      // this briefing carries — pointing the agent at them here was a dead reference. Point
      // at the artifact ON DISK, which does carry them.
      : `  - User personas not defined in requirements — OPEN the full artifact on disk (01_REQUIREMENTS.json in the artifacts dir) and infer them from its original_brief / project_summary fields`;
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
      CONTEXT_ASSETS: contextAssets,
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
