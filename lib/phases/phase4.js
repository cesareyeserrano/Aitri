/**
 * Module: Phase 4 — Implementation
 * Purpose: Full-Stack Developer persona. Writes production-ready code + tests.
 * Artifact: 04_IMPLEMENTATION_MANIFEST.json + src/ + tests/
 */

import { extractManifest, head } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/developer.js';

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
    const GENERIC = /^(none|n\/a|no debt|no substitution|placeholder declared|todo|tbd|pending)$/i;
    for (const entry of d.technical_debt || []) {
      if (!entry.fr_id)
        throw new Error(`technical_debt entry missing fr_id — every debt entry must reference a specific FR`);
      if (!entry.substitution || GENERIC.test(entry.substitution.trim()))
        throw new Error(`technical_debt fr_id "${entry.fr_id}" has a generic or empty substitution — describe exactly what was simplified`);
    }
  },

  buildBriefing({ dir, inputs, feedback, failingTests }) {
    return [
      `# Phase 4 — Implementation`,
      `${ROLE}`,
      `\n## Constraints\n${CONSTRAINTS}`,
      `\n## How to reason\n${REASONING}`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      ...(failingTests?.length ? [
        `\n## Debug Mode — Fix Failing Tests`,
        `You are re-entering Phase 4 because the following tests failed:`,
        failingTests.map(t => `  ✗ ${t.tc_id}${t.notes ? `: ${t.notes}` : ''}`).join('\n'),
        ``,
        `Debug protocol — follow this order, do NOT rewrite working code:`,
        `1. For each failing TC: read its given/when/then in Test Specs below — that is the contract`,
        `2. Find the exact function/handler responsible for that TC`,
        `3. Identify the gap: what the code does vs what 'then' requires`,
        `4. Write the minimal fix — one function, one file if possible`,
        `5. Re-run only the failing TCs to confirm the fix before calling aitri complete 4`,
      ] : []),
      `\n## Requirements\n\`\`\`json\n${inputs['01_REQUIREMENTS.json']}\n\`\`\``,
      `\n> no_go_zone above lists what is explicitly out of scope — do NOT implement these items even if they seem implied.`,
      `\n## System Design\n${head(inputs['02_SYSTEM_DESIGN.md'], 200)}`,
      `\n## Test Specs — implement exactly to these\n\`\`\`json\n${inputs['03_TEST_CASES.json']}\n\`\`\``,
      `\n> Each TC above contains given/when/then — these are the acceptance specs your code must satisfy.`,
      `> Write code so that running each TC's 'when' on a system in state 'given' produces exactly 'then'.`,
      `\n## Code Standards (mandatory)`,
      `- JSDoc on every function: @param, @returns, @throws`,
      `- File header: Module, Purpose, Dependencies`,
      `- Zero hardcoded values — all config via env vars`,
      `- Error handling: input validation + async try-catch + HTTP errors`,
      `- Follow EXACT tech stack from System Design`,
      `- Traceability headers on key functions: /** @aitri-trace FR-ID: FR-001, US-ID: US-001, AC-ID: AC-001, TC-ID: TC-001 */`,
      `\n## Technical Definition of Done`,
      `You MUST verify ALL of the following before calling aitri complete 4:`,
      `  [ ] Linter/type checks pass (npm run lint or equivalent — zero errors)`,
      `  [ ] Tests pass (npm test or equivalent — no failures, no skipped tests)`,
      `  [ ] technical_debt in manifest is complete — every simplification is declared`,
      `  [ ] All files listed in files_created exist on disk`,
      `  [ ] No TODO/FIXME/PLACEHOLDER comments remain in production code`,
      `  [ ] .env.example includes all required environment variables`,
      ``,
      `If any item above fails, fix it before completing. Calling aitri complete 4 with a failing checklist item is a defect.`,
      `\n## Self-Evaluation Checklist — FR types`,
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
      `1. Phase skeleton: create all file structure and module interfaces`,
      `2. Phase persistence/integrations: implement DB layer, APIs, storage`,
      `3. Phase hardening: error handling, validation, boundary cases`,
      `4. Add @aitri-trace headers to key functions`,
      `5. Verify Technical Definition of Done checklist`,
      `6. Save manifest (with technical_debt) to: ${dir}/04_IMPLEMENTATION_MANIFEST.json`,
      `7. Run: aitri complete 4`,
      `\n## Human Review — Before approving phase 4`,
      `  [ ] All files listed in files_created exist on disk`,
      `  [ ] technical_debt is complete — every simplification named, no generic entries like "none" or "n/a"`,
      `  [ ] No TODO/FIXME/PLACEHOLDER in production code`,
      `  [ ] .env.example covers all environment_variables listed in manifest`,
      `  [ ] @aitri-trace headers on key functions reference real FR/US/AC/TC IDs`,
      `  [ ] Tech stack matches 02_SYSTEM_DESIGN.md exactly — no unrequested substitutions`,
    ].join('\n');
  },
};
