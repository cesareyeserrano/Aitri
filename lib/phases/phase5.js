/**
 * Module: Phase 5 — Deployment
 * Purpose: DevOps Engineer persona. Creates deployment config and compliance proof.
 * Artifact: 05_PROOF_OF_COMPLIANCE.json + Dockerfile + docker-compose.yml
 */

import { extractTestResults } from './context.js';

export default {
  num: 5,
  name: 'Deployment',
  persona: 'DevOps Engineer',
  artifact: '05_PROOF_OF_COMPLIANCE.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md', '04_IMPLEMENTATION_MANIFEST.json', '04_TEST_RESULTS.json'],

  extractContext: (content) => content,

  validate(content) {
    const d = JSON.parse(content);
    const missing = ['project', 'version', 'phases_completed', 'requirement_compliance', 'overall_status']
      .filter(k => !d[k]);
    if (missing.length) throw new Error(`PROOF_OF_COMPLIANCE missing fields: ${missing.join(', ')}`);
    if (!Array.isArray(d.requirement_compliance) || d.requirement_compliance.length === 0)
      throw new Error('requirement_compliance must list per-FR status — cannot be empty');
    const validLevels = ['functionally_present', 'partial', 'complete', 'production_ready'];
    const invalid = d.requirement_compliance.filter(r => !validLevels.includes(r.level));
    if (invalid.length)
      throw new Error(`Invalid compliance level(s) in: ${invalid.map(r => r.id).join(', ')} — use: ${validLevels.join('|')}`);
  },

  buildBriefing({ dir, inputs, feedback }) {
    return [
      `# Phase 5 — Deployment`,
      `You are a DevOps Engineer. Create deployment config and generate compliance proof.`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      `\n## Requirements\n\`\`\`json\n${inputs['01_REQUIREMENTS.json']}\n\`\`\``,
      `\n## System Design (architecture + stack)\n${inputs['02_SYSTEM_DESIGN.md']}`,
      `\n## Implementation Manifest\n\`\`\`json\n${inputs['04_IMPLEMENTATION_MANIFEST.json']}\n\`\`\``,
      `\n## Test Results (source of truth for compliance levels)\n\`\`\`json\n${extractTestResults(inputs['04_TEST_RESULTS.json'])}\n\`\`\``,
      `\n## Files to create`,
      `- ${dir}/DEPLOYMENT.md — prerequisites, dev setup, prod deploy, rollback, health checks`,
      `- ${dir}/Dockerfile — correct base image, multi-stage, non-root user, HEALTHCHECK`,
      `- ${dir}/docker-compose.yml — all services, \${ENV_VAR} substitution, health checks`,
      `- ${dir}/.env.example — all required env vars with example values`,
      `- ${dir}/05_PROOF_OF_COMPLIANCE.json`,
      `  { project, version:"1.0.0", generated_at, phases_completed:5,`,
      `    requirement_compliance:[`,
      `      { id:"FR-001", title, level:"functionally_present|partial|complete|production_ready", notes }`,
      `    ],`,
      `    technical_debt_inherited: [copy technical_debt array from 04_IMPLEMENTATION_MANIFEST.json],`,
      `    overall_status:"PRODUCTION_READY|PARTIAL|DRAFT",`,
      `    approved_by:"Aitri v2" }`,
      `\n## Compliance level — assign based on Test Results fr_coverage above:`,
      `  covered + zero debt     → "complete" or "production_ready"`,
      `  covered + declared debt → "partial"`,
      `  uncovered               → "functionally_present"`,
      `→ Do NOT default to production_ready. Let test results drive the level.`,
      `\n## Instructions`,
      `1. Create all deployment files`,
      `2. Assign compliance level per FR using fr_coverage from Test Results`,
      `3. Copy technical_debt from 04_IMPLEMENTATION_MANIFEST.json into technical_debt_inherited`,
      `4. Save 05_PROOF_OF_COMPLIANCE.json to: ${dir}/05_PROOF_OF_COMPLIANCE.json`,
      `5. Run: aitri complete 5`,
      `6. Document setup commands in DEPLOYMENT.md — do NOT run npm install or start the app`,
    ].join('\n');
  },
};
