/**
 * Module: Phase 1 — PM Analysis
 * Purpose: Product Manager persona. Extracts structured requirements from IDEA.md.
 * Artifact: 01_REQUIREMENTS.json
 */

import { extractRequirements } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/pm.js';

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

  buildBriefing({ dir, inputs, feedback }) {
    return [
      `# Phase 1 — PM Analysis`,
      `${ROLE}`,
      `\n## Constraints\n${CONSTRAINTS}`,
      `\n## How to reason\n${REASONING}`,
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
      `  user_personas: [{role:"End User", tech_level:"low|mid|high", goal:"...", pain_point:"..."}],`,
      `  user_stories: [{id:"US-001", requirement_id, as_a, i_want, so_that}],`,
      `  non_functional_requirements: [{id:"NFR-001", category:"Performance|Security|Reliability|Scalability|Usability", requirement, acceptance_criteria}],`,
      `  no_go_zone: ["item — what is explicitly out of scope and why"],`,
      `  constraints:[], technology_preferences:[] }`,
      `\n## No-go zone (mandatory)`,
      `Before listing any FR, declare ≥3 items that are explicitly OUT OF SCOPE for this delivery.`,
      `The no_go_zone field must be populated — an empty array is a scope defect.`,
      `Examples of what belongs here:`,
      `  - "No backend server — frontend-only, no Node/Python/Go process"`,
      `  - "No authentication — no login, no sessions, no user accounts"`,
      `  - "No database — localStorage or in-memory only"`,
      `  - "No third-party API calls — no external HTTP requests at runtime"`,
      `  - "No mobile native build — web browser only"`,
      `Derive the no-go zone from: (a) explicit constraints in IDEA.md, (b) what the idea does NOT mention, (c) common scope creep patterns for this type of product.`,
      `\n## Product Analysis Vector`,
      `Before writing FRs, identify:`,
      `  - North Star KPI: the single metric that defines success (e.g. "user records first movement within 60s of opening app")`,
      `  - JTBD (Jobs To Be Done): what job does the user hire this product to do? (e.g. "track daily spend without opening a bank app")`,
      `  - Top guardrail metric: what must NOT get worse (e.g. "load time must stay ≤2s even with 365 days of data")`,
      `Include these as comments in project_summary or as a separate "product_analysis" field.`,
      `\n## Rules`,
      `- Min 5 FRs, each with at least 1 user story`,
      `- user_personas: infer from IDEA.md — who uses this product, their tech level, goal, and pain point`,
      `  If IDEA.md doesn't specify, use the most likely real user (not "general user")`,
      `- Min 3 NFRs`,
      `- Every MUST FR must have a type (UX|persistence|security|reporting|logic)`,
      `- acceptance_criteria must be measurable by type:`,
      `    UX         → "passes mobile viewport at 375px", "animation completes in ≤200ms", "contrast ≥4.5:1"`,
      `    visual     → "component renders at 375px/768px/1440px", "color contrast ≥4.5:1", "layout matches spec at each breakpoint"`,
      `    audio      → "sound plays within ≤100ms of trigger", "volume normalized to ≤-14 LUFS", "no audio gap on loop"`,
      `    persistence → "data survives process restart", "query returns correct record after write"`,
      `    security   → "returns 401 on invalid token", "rejects SQL injection input"`,
      `    reporting  → "chart renders with ≥10 data points", "export generates valid CSV"`,
      `    logic      → "calculation returns expected value for edge case X"`,
      `- CRITICAL — qualitative attributes (UX/visual/audio) MUST be operationalized by YOU into measurable criteria:`,
      `    ❌ "the UI looks nice"         → ✅ "layout visible without scroll at 375px viewport"`,
      `    ❌ "immersive sound design"    → ✅ "audio plays within 100ms of trigger, loop has no gap"`,
      `    ❌ "smooth animations"         → ✅ "transition completes in ≤200ms, no jank at 60fps"`,
      `    Aitri does not define aesthetic values — you define them, Aitri enforces that they exist.`,
      `\n## Instructions`,
      `1. Declare no_go_zone (≥3 items) before writing any FR`,
      `2. Identify North Star KPI + JTBD + guardrail metric`,
      `3. Generate complete 01_REQUIREMENTS.json`,
      `4. Save to: ${dir}/01_REQUIREMENTS.json`,
      `5. Run: aitri complete 1`,
    ].join('\n');
  },
};
