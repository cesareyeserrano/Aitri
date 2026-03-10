/**
 * Module: Phase 4 — Implementation
 * Purpose: Full-Stack Developer persona. Writes production-ready code + tests.
 * Artifact: 04_IMPLEMENTATION_MANIFEST.json + src/ + tests/
 */

import { extractManifest, head } from './context.js';

export default {
  num: 4,
  name: 'Implementation',
  persona: 'Full-Stack Developer',
  artifact: '04_IMPLEMENTATION_MANIFEST.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md', '03_TEST_CASES.json'],

  extractContext: extractManifest,

  validate(content) {
    const d = JSON.parse(content);
    const missing = ['files_created', 'setup_commands', 'environment_variables']
      .filter(k => !d[k]);
    if (missing.length) throw new Error(`Manifest missing fields: ${missing.join(', ')}`);
    if (!Array.isArray(d.files_created) || d.files_created.length === 0)
      throw new Error('files_created must be a non-empty array');
    if (!('technical_debt' in d))
      throw new Error('technical_debt field is required — use [] if no substitutions were made');
  },

  buildBriefing({ dir, inputs, feedback }) {
    return [
      `# Phase 4 — Implementation`,
      `You are a Senior Full-Stack Developer. Write complete, production-ready code and tests.`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      `\n## Requirements\n\`\`\`json\n${inputs['01_REQUIREMENTS.json']}\n\`\`\``,
      `\n## System Design\n${head(inputs['02_SYSTEM_DESIGN.md'], 120)}`,
      `\n## Test Index\n\`\`\`json\n${inputs['03_TEST_CASES.json']}\n\`\`\``,
      `\n## Code Standards (mandatory)`,
      `- JSDoc on every function: @param, @returns, @throws`,
      `- File header: Module, Purpose, Dependencies`,
      `- Zero hardcoded values — all config via env vars`,
      `- Error handling: input validation + async try-catch + HTTP errors`,
      `- Follow EXACT tech stack from System Design`,
      `- Comment requirement traces: // Implements FR-003`,
      `\n## Self-Evaluation Checklist (verify BEFORE calling aitri complete 4)`,
      `For each MUST FR, confirm:`,
      `  [ ] type UX:          responsive layout implemented — not just functional HTML, passes 375px viewport`,
      `  [ ] type persistence: real DB or file storage — not in-memory variable or JSON mock`,
      `  [ ] type security:    real token validation — not mock/skip/hardcoded bypass`,
      `  [ ] type reporting:   chart/graph library rendering — not plain HTML table substitution`,
      `\n## Technical Debt Declaration (MANDATORY in manifest)`,
      `In 04_IMPLEMENTATION_MANIFEST.json, you MUST declare every simplification made vs. the MUST requirements:`,
      `  "technical_debt": [`,
      `    { "fr_id":"FR-003", "substitution":"HTML table instead of Chart.js graph",`,
      `      "reason":"library conflict", "effort_to_fix":"medium" }`,
      `  ]`,
      `→ Empty array [] is valid ONLY if zero substitutions were made.`,
      `→ Undeclared substitutions will fail compliance review in Phase 5.`,
      `\n## Output`,
      `- Source code: ${dir}/src/`,
      `- Tests: ${dir}/tests/`,
      `- ${dir}/package.json (or equivalent) + ${dir}/.env.example`,
      `- Manifest: ${dir}/04_IMPLEMENTATION_MANIFEST.json`,
      `  { files_created:[], setup_commands:[], environment_variables:[{name, default}],`,
      `    technical_debt:[{fr_id, substitution, reason, effort_to_fix:"low|medium|high"}] }`,
      `\n## Instructions`,
      `1. Create all source + test files`,
      `2. Complete self-evaluation checklist above`,
      `3. Save manifest (with technical_debt) to: ${dir}/04_IMPLEMENTATION_MANIFEST.json`,
      `4. Run: aitri complete 4`,
    ].join('\n');
  },
};
