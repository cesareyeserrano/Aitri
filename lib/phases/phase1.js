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
  alias: 'requirements',
  name: 'Requirements',
  persona: 'Product Manager',
  artifact: '01_REQUIREMENTS.json',
  inputs: ['IDEA.md'],

  extractContext: extractRequirements,

  validate(content) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('01_REQUIREMENTS.json is not valid JSON — check that the agent did not wrap output in markdown fences or add trailing commas.');
    }
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

    // Warn when a MUST FR has no linked user story — non-blocking, nudges toward richer requirements
    const linkedFRIds = new Set((d.user_stories || []).map(us => us.requirement_id).filter(Boolean));
    const mustFRsWithoutStory = mustFRs.filter(fr => !linkedFRIds.has(fr.id));
    if (mustFRsWithoutStory.length) {
      process.stderr.write(
        `[aitri] Warning: ${mustFRsWithoutStory.length} MUST FR(s) have no linked user story:\n` +
        mustFRsWithoutStory.map(fr => `  ${fr.id}: ${fr.title}`).join('\n') + '\n' +
        `  Add user_stories with requirement_id referencing these FRs.\n`
      );
    }

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

    // Vagueness check for ALL MUST FRs — every criterion being purely vague is always wrong
    // Covers English and Spanish qualifiers (Aitri supports mixed-language projects).
    const BROAD_VAGUE = /\b(good|nice|beautiful|pretty|clean|fast|smooth|properly|correctly|efficiently|reliably|appropriately|securely|safely|effectively|adequately|seamlessly|correctamente|adecuadamente|apropiadamente|eficientemente|confiablemente|seguramente|efectivamente|debidamente|bonito|suave|limpio)\b/i;
    for (const fr of mustFRs) {
      const criteria = fr.acceptance_criteria || [];
      if (criteria.length === 0) continue;
      const allVague = criteria.every(c => BROAD_VAGUE.test(c) && !HAS_METRIC.test(c));
      if (allVague)
        throw new Error(`${fr.id} (type: ${fr.type}) — all acceptance_criteria are vague ("${criteria[0]}"). Add at least one specific, testable criterion.`);
    }

    // Title vagueness — MUST FRs whose title is a vague word with no concrete content.
    // Rule: if BROAD_VAGUE matches the title AND ≤1 substantive token remains after
    // stripping stopwords and vague words, throw. "Generate reports efficiently" passes
    // (2 substantive tokens); "La app debe funcionar correctamente" fails (0 remaining).
    const TITLE_STOP = /^(the|a|an|la|el|los|las|un|una|de|del|must|should|be|to|is|are|y|o|and|or|in|on|it|this|that|all|debe|se|que|por|para|con|sin|es|app|sistema|system|makes|make|can|will|that|for|of)$/i;
    for (const fr of mustFRs) {
      const title = fr.title || '';
      if (!BROAD_VAGUE.test(title)) continue;
      const substantive = title
        .replace(/\[ASSUMPTION[^\]]*\]/gi, ' ')
        .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/gi, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !TITLE_STOP.test(t) && !BROAD_VAGUE.test(t));
      if (substantive.length < 2)
        throw new Error(`${fr.id} — title is too vague ("${title}"). Title must name the specific behavior, not describe quality abstractly.`);
    }

    // Duplicate acceptance_criteria across FRs — copy-paste of ACs is an anti-pattern
    // indicating FRs are not semantically differentiated. Jaccard similarity ≥0.9
    // (normalized: lowercase, punctuation stripped, whitespace collapsed).
    // Only applies to FRs with ≥3 ACs to avoid false positives on trivial cases.
    const normalizeAC = ac => String(ac).toLowerCase().replace(/[^\w\sáéíóúñ]/gi, ' ').replace(/\s+/g, ' ').trim();
    const richFRs = d.functional_requirements.filter(fr => (fr.acceptance_criteria || []).length >= 3);
    for (let i = 0; i < richFRs.length; i++) {
      const a = new Set(richFRs[i].acceptance_criteria.map(normalizeAC).filter(Boolean));
      for (let j = i + 1; j < richFRs.length; j++) {
        const b = new Set(richFRs[j].acceptance_criteria.map(normalizeAC).filter(Boolean));
        const intersection = new Set([...a].filter(x => b.has(x)));
        const union = new Set([...a, ...b]);
        if (union.size === 0) continue;
        const jaccard = intersection.size / union.size;
        if (jaccard >= 0.9) {
          const pct = Math.round(jaccard * 100);
          throw new Error(`${richFRs[i].id} and ${richFRs[j].id} have ${pct}% identical acceptance_criteria — differentiate the FRs or merge them into one.`);
        }
      }
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

    return render('phases/requirements', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      IDEA_MD: idea,
      ARTIFACTS_BASE: artifactsBase || dir,
      PARENT_REQUIREMENTS: inputs['PARENT_REQUIREMENTS.json'] || '',
    });
  },
};
