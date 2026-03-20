/**
 * Module: Phase 2 — System Architecture
 * Purpose: Software Architect persona. Designs the complete system from requirements.
 * Artifact: 02_SYSTEM_DESIGN.md
 */

import { head, extractRequirements } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/architect.js';
import { render } from '../prompts/render.js';

export default {
  num: 2,
  alias: 'architecture',
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
      'Performance & Scalability',
      'Deployment Architecture',
      'Risk Analysis',
      'Technical Risk Flags',
    ];
    // Accept plain (## Name), integer (## 1. Name), and decimal (## 1.1 Name) headers
    const hasSection = name =>
      new RegExp(`^##\\s+(?:[\\d.]+\\s+)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').test(content);
    const missing = required.filter(name => !hasSection(name)).map(name => `## ${name}`);
    if (missing.length)
      throw new Error(`02_SYSTEM_DESIGN.md missing required sections:\n  ${missing.join('\n  ')}`);
    // Technical Risk Flags must have content — not just the header
    const lines = content.split('\n');
    const flagsIdx = lines.findIndex(l => /^##\s+(?:[\d.]+\s+)?Technical Risk Flags/.test(l));
    if (flagsIdx !== -1) {
      const nextSection = lines.findIndex((l, i) => i > flagsIdx && /^##\s/.test(l));
      const flagsBody = lines.slice(flagsIdx + 1, nextSection === -1 ? undefined : nextSection).join('\n').trim();
      if (!flagsBody)
        throw new Error('## Technical Risk Flags is empty — declare [RISK] flags or write "None detected" with justification');
    }
    if (content.split('\n').length < 40)
      throw new Error('02_SYSTEM_DESIGN.md too short — min 40 lines expected for a complete design');
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, bestPractices }) {
    return render('phases/phase2', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      REQUIREMENTS_JSON: extractRequirements(inputs['01_REQUIREMENTS.json']),
      UX_SPEC: inputs['01_UX_SPEC.md'] || '',
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
    });
  },
};
