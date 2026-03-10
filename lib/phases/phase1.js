/**
 * Module: Phase 1 — PM Analysis
 * Purpose: Product Manager persona. Extracts structured requirements from IDEA.md.
 * Artifact: 01_REQUIREMENTS.json
 */

import { extractRequirements } from './context.js';

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
  },

  buildBriefing({ dir, inputs, feedback }) {
    return [
      `# Phase 1 — PM Analysis`,
      `You are a Senior Product Manager. Extract structured requirements from the idea below.`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      `\n## IDEA.md\n\`\`\`\n${inputs['IDEA.md']}\n\`\`\``,
      `\n## Output: \`${dir}/01_REQUIREMENTS.json\``,
      `Schema: { project_name, project_summary,`,
      `  functional_requirements: [{`,
      `    id:"FR-001", title, description, priority:"MUST|SHOULD|NICE",`,
      `    type:"UX|persistence|security|reporting|logic",`,
      `    acceptance_criteria:["measurable metric — e.g. passes mobile viewport test"],`,
      `    implementation_level:"present|functional|complete|production_ready"`,
      `  }],`,
      `  user_stories: [{id:"US-001", requirement_id, as_a, i_want, so_that}],`,
      `  non_functional_requirements: [{id:"NFR-001", category:"Performance|Security|Reliability|Scalability|Usability", requirement, acceptance_criteria}],`,
      `  constraints:[], technology_preferences:[] }`,
      `\n## Rules`,
      `- Min 5 FRs, each with at least 1 user story`,
      `- Min 3 NFRs`,
      `- Every MUST FR must have a type (UX|persistence|security|reporting|logic)`,
      `- acceptance_criteria must be measurable by type:`,
      `    UX         → "passes mobile viewport at 375px", "renders dashboard with live data"`,
      `    persistence → "data survives process restart", "query returns correct record after write"`,
      `    security   → "returns 401 on invalid token", "rejects SQL injection input"`,
      `    reporting  → "chart renders with ≥10 data points", "export generates valid CSV"`,
      `    logic      → "calculation returns expected value for edge case X"`,
      `\n## Instructions`,
      `1. Generate complete 01_REQUIREMENTS.json`,
      `2. Save to: ${dir}/01_REQUIREMENTS.json`,
      `3. Run: aitri complete 1`,
    ].join('\n');
  },
};
