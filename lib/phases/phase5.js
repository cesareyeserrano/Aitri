/**
 * Module: Phase 5 — Deployment
 * Purpose: DevOps Engineer persona. Creates deployment config and compliance proof.
 * Artifact: 05_PROOF_OF_COMPLIANCE.json + Dockerfile + docker-compose.yml
 */

import fs from 'fs';
import { extractTestResults } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/devops.js';
import { render } from '../prompts/render.js';
import { artifactPath } from '../state.js';

export default {
  num: 5,
  name: 'Deployment',
  persona: 'DevOps Engineer',
  artifact: '05_PROOF_OF_COMPLIANCE.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md', '04_IMPLEMENTATION_MANIFEST.json', '04_TEST_RESULTS.json'],

  extractContext: (content) => content,

  validate(content, { dir, config } = {}) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('05_PROOF_OF_COMPLIANCE.json is not valid JSON — check that the agent did not wrap output in markdown fences or add trailing commas.');
    }
    const missing = ['project', 'version', 'phases_completed', 'requirement_compliance', 'overall_status']
      .filter(k => !d[k]);
    if (missing.length) throw new Error(`PROOF_OF_COMPLIANCE missing fields: ${missing.join(', ')}`);
    if (!Array.isArray(d.requirement_compliance) || d.requirement_compliance.length === 0)
      throw new Error('requirement_compliance must list per-FR status — cannot be empty');
    const validLevels = ['placeholder', 'functionally_present', 'partial', 'complete', 'production_ready'];
    const invalid = d.requirement_compliance.filter(r => !validLevels.includes(r.level));
    if (invalid.length) {
      const detail = invalid.map((r, i) =>
        `  entry[${i}]: id="${r.id ?? r.fr_id ?? '(missing)'}" level="${r.level ?? '(missing)'}"${!r.id && r.fr_id ? ' — field must be "id" not "fr_id"' : ''}`
      ).join('\n');
      throw new Error(`Invalid compliance level(s) in requirement_compliance:\n${detail}\nValid levels: ${validLevels.join(' | ')}`);
    }
    const VALID_STATUSES = ['compliant', 'partial', 'draft'];
    if (!VALID_STATUSES.includes(d.overall_status))
      throw new Error(`overall_status must be "compliant" | "partial" | "draft" — got "${d.overall_status}"`);
    const placeholders = d.requirement_compliance.filter(r => r.level === 'placeholder');
    if (placeholders.length)
      throw new Error(`Pipeline blocked — ${placeholders.map(r => r.id).join(', ')} has compliance level "placeholder". Placeholder implementations cannot be shipped. Implement or declare honest debt in Phase 4.`);

    // Cross-artifact: every FR-MUST must appear in requirement_compliance
    if (dir) {
      const reqPath = artifactPath(dir, config || {}, '01_REQUIREMENTS.json');
      if (fs.existsSync(reqPath)) {
        let reqs;
        try { reqs = JSON.parse(fs.readFileSync(reqPath, 'utf8')); } catch { /* malformed — skip */ }
        if (reqs?.functional_requirements) {
          const mustFRIds = reqs.functional_requirements
            .filter(fr => fr.priority === 'MUST')
            .map(fr => fr.id);
          const coveredIds = new Set(d.requirement_compliance.map(r => r.id).filter(Boolean));
          const uncovered = mustFRIds.filter(id => !coveredIds.has(id));
          if (uncovered.length > 0)
            throw new Error(
              `${uncovered.length} FR-MUST(s) not found in requirement_compliance:\n` +
              uncovered.map(id => `  ${id}`).join('\n') + '\n' +
              `  Every MUST requirement must have a compliance entry in 05_PROOF_OF_COMPLIANCE.json.`
            );
        }
      }
    }
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase }) {
    return render('phases/phase5', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      SYSTEM_DESIGN: inputs['02_SYSTEM_DESIGN.md'],
      MANIFEST_JSON: inputs['04_IMPLEMENTATION_MANIFEST.json'],
      TEST_RESULTS_JSON: extractTestResults(inputs['04_TEST_RESULTS.json']),
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
    });
  },
};
