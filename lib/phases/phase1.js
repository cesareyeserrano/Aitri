/**
 * Module: Phase 1 — PM Analysis
 * Purpose: Product Manager persona. Extracts structured requirements from IDEA.md.
 * Artifact: 01_REQUIREMENTS.json
 */

import { extractRequirements } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/pm.js';
import { render } from '../prompts/render.js';

export default {
  num: 1,
  name: 'PM Analysis',
  persona: 'Product Manager',
  artifact: '01_REQUIREMENTS.json',
  inputs: ['IDEA.md'],

  extractContext: extractRequirements,

  validate(content) {
    const d = JSON.parse(content);
    const missing = ['project_name', 'functional_requirements', 'user_stories', 'non_functional_requirements']
      .filter(k => !d[k]);
    if (missing.length) throw new Error(`Missing fields: ${missing.join(', ')}`);
    if (d.functional_requirements.length < 5)
      throw new Error('Min 5 functional_requirements required');
    if (d.non_functional_requirements.length < 3)
      throw new Error('Min 3 non_functional_requirements required');
    const mustFRs = d.functional_requirements.filter(fr => fr.priority === 'MUST');
    const missingType = mustFRs.filter(fr => !fr.type);
    if (missingType.length)
      throw new Error(`MUST FRs missing type field: ${missingType.map(f => f.id).join(', ')}`);
    const missingCriteria = mustFRs.filter(fr => !fr.acceptance_criteria?.length);
    if (missingCriteria.length)
      throw new Error(`MUST FRs missing acceptance_criteria: ${missingCriteria.map(f => f.id).join(', ')}`);
    if (!d.user_personas?.length)
      process.stderr.write(`[aitri] Warning: user_personas missing — UX requirements lack user context. Add at least 1 persona.\n`);

    // Warn on PM-flagged assumptions — non-blocking, human reviews before approve
    const assumptions = d.functional_requirements.filter(fr =>
      fr.title?.includes('[ASSUMPTION') ||
      (fr.acceptance_criteria || []).some(ac => ac.includes('[ASSUMPTION'))
    );
    if (assumptions.length) {
      process.stderr.write(
        `[aitri] Warning: ${assumptions.length} FR(s) marked as assumptions — confirm with stakeholders before approving:\n` +
        assumptions.map(fr => `  ${fr.id}: ${fr.title}`).join('\n') + '\n'
      );
    }

    const qualitativeTypes = ['ux', 'visual', 'audio'];
    const VAGUE = /\b(good|nice|beautiful|pretty|clean|fast|smooth|responsive|immersive|modern|intuitive|elegant|polished)\b/i;
    const HAS_METRIC = /\d|px|ms|%|fps|kb|mb|ratio|:\d|viewport|breakpoint/i;
    const qualFRs = mustFRs.filter(fr => qualitativeTypes.includes(fr.type?.toLowerCase()));
    for (const fr of qualFRs) {
      const criteria = fr.acceptance_criteria || [];
      const hasMetric = criteria.some(c => HAS_METRIC.test(c));
      const allVague = criteria.every(c => VAGUE.test(c) && !HAS_METRIC.test(c));
      if (!hasMetric || allVague)
        throw new Error(`${fr.id} (type: ${fr.type}) — acceptance_criteria must include at least one observable metric (e.g. "375px viewport", "≤200ms", "contrast ≥4.5:1"). Avoid vague terms like "nice", "smooth", "beautiful".`);
    }
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase }) {
    // Warn on empty or placeholder sections — non-blocking, PM will flag gaps as [ASSUMPTION]
    const idea = inputs['IDEA.md'] || '';
    const REQUIRED = ['Problem', 'Target Users', 'Business Rules', 'Success Criteria'];
    for (const name of REQUIRED) {
      const re = new RegExp(`## ${name}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
      const m = idea.match(re);
      const body = m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
      if (!body) {
        process.stderr.write(
          `[aitri] Warning: IDEA.md section "## ${name}" is empty — PM will mark inferred content as [ASSUMPTION].\n`
        );
      }
    }

    return render('phases/phase1', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      IDEA_MD: idea,
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
      PARENT_REQUIREMENTS: inputs['PARENT_REQUIREMENTS.json'] || '',
    });
  },
};
