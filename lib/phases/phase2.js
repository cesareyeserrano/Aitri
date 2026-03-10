/**
 * Module: Phase 2 — System Architecture
 * Purpose: Software Architect persona. Designs the complete system from requirements.
 * Artifact: 02_SYSTEM_DESIGN.md
 */

import { head } from './context.js';

export default {
  num: 2,
  name: 'System Architecture',
  persona: 'Software Architect',
  artifact: '02_SYSTEM_DESIGN.md',
  inputs: ['IDEA.md', '01_REQUIREMENTS.json'],
  optionalInputs: ['01_UX_SPEC.md'],

  extractContext: (content) => head(content, 160),

  validate(content) {
    const required = [
      'Executive Summary',
      'System Architecture',
      'Data Model',
      'API Design',
      'Security Design',
    ];
    // Accept plain (## Name), integer (## 1. Name), and decimal (## 1.1 Name) headers
    const hasSection = name =>
      new RegExp(`^##\\s+(?:[\\d.]+\\s+)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').test(content);
    const missing = required.filter(name => !hasSection(name)).map(name => `## ${name}`);
    if (missing.length)
      throw new Error(`02_SYSTEM_DESIGN.md missing required sections:\n  ${missing.join('\n  ')}`);
    if (content.split('\n').length < 40)
      throw new Error('02_SYSTEM_DESIGN.md too short — min 40 lines expected for a complete design');
  },

  buildBriefing({ dir, inputs, feedback }) {
    const uxSpec = inputs['01_UX_SPEC.md'];
    return [
      `# Phase 2 — System Architecture`,
      `You are a Senior Software Architect. Design the complete system for the requirements below.`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      `\n## Requirements (01_REQUIREMENTS.json)\n\`\`\`json\n${inputs['01_REQUIREMENTS.json']}\n\`\`\``,
      ...(uxSpec ? [`\n## UX/UI Specification (01_UX_SPEC.md — read-only context)\n${uxSpec}`] : []),
      `\n## Output: \`${dir}/02_SYSTEM_DESIGN.md\``,
      `Required sections (in order):`,
      `1. Executive Summary — tech choices with justification`,
      `2. System Architecture — ASCII/Mermaid diagram + components`,
      `3. Data Model — ER diagram + schema with indexes`,
      `4. API Design — all endpoints (method, path, auth, request/response, errors)`,
      `5. Security Design — auth, encryption, input validation`,
      `6. Performance & Scalability — caching, query optimization, scaling`,
      `7. Deployment Architecture — environments, containers, CI/CD`,
      `8. Risk Analysis — top 3-5 risks + mitigation`,
      `\n## Rules`,
      `- Every FR-* and NFR-* must be addressed`,
      `- All tech choices must be justified with specific versions`,
      `\n## Instructions`,
      `1. Generate complete 02_SYSTEM_DESIGN.md`,
      `2. Save to: ${dir}/02_SYSTEM_DESIGN.md`,
      `3. Run: aitri complete 2`,
    ].join('\n');
  },
};
