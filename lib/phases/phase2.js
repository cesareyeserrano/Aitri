/**
 * Module: Phase 2 — System Architecture
 * Purpose: Software Architect persona. Designs the complete system from requirements.
 * Artifact: 02_SYSTEM_DESIGN.md
 */

import { head } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/architect.js';
import { render } from '../prompts/render.js';

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
      'Performance & Scalability',
      'Deployment Architecture',
      'Risk Analysis',
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
    return render('phases/phase2', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      UX_SPEC: inputs['01_UX_SPEC.md'] || '',
      DIR: dir,
    });
  },
};
