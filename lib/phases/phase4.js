/**
 * Module: Phase 4 — Implementation
 * Purpose: Full-Stack Developer persona. Writes production-ready code + tests.
 * Artifact: 04_IMPLEMENTATION_MANIFEST.json + src/ + tests/
 */

import fs from 'fs';
import path from 'path';
import { extractManifest, head } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/developer.js';
import { render } from '../prompts/render.js';

export default {
  num: 4,
  name: 'Implementation',
  persona: 'Full-Stack Developer',
  artifact: '04_IMPLEMENTATION_MANIFEST.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md', '03_TEST_CASES.json'],

  extractContext: extractManifest,

  validate(content, { dir } = {}) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('04_IMPLEMENTATION_MANIFEST.json is not valid JSON — check that the agent did not wrap output in markdown fences or add trailing commas.');
    }
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
    if (!d.test_runner || typeof d.test_runner !== 'string' || !d.test_runner.trim())
      throw new Error('test_runner is required — e.g. "npm test" or "node --test tests/"');
    if (!Array.isArray(d.test_files) || d.test_files.length === 0)
      throw new Error('test_files must be a non-empty array — list all test files containing @aitri-tc markers');

    // Warn (non-blocking) if declared test_files don't exist on disk yet
    if (dir) {
      const missing = d.test_files.filter(f => !fs.existsSync(path.join(dir, f)));
      if (missing.length) {
        process.stderr.write(
          `[aitri] Warning: ${missing.length} test_file(s) declared in manifest not found on disk:\n` +
          missing.map(f => `  ${f}`).join('\n') + '\n' +
          `  Ensure the agent has written these files before running: aitri verify-run\n`
        );
      }
    }
  },

  buildBriefing({ dir, inputs, feedback, failingTests, artifactsBase, bestPractices }) {
    // Compact FR snapshot for context retention — resist drift across long agent sessions
    let frSnapshot = '';
    try {
      const reqs = JSON.parse(inputs['01_REQUIREMENTS.json']);
      frSnapshot = (reqs.functional_requirements || [])
        .map(fr => `  ${fr.id} [${fr.priority}/${fr.type}] ${fr.title} — AC: ${fr.acceptance_criteria}`)
        .join('\n');
    } catch { /* non-fatal — full requirements still follow below */ }

    // TC authorship lock — list all Phase 3 TC ids the agent must implement (no deviations)
    let tcIds = '';
    try {
      const tcs = JSON.parse(inputs['03_TEST_CASES.json']);
      tcIds = (tcs.test_cases || []).map(tc => `  ${tc.id} (${tc.requirement_id}): ${tc.title}`).join('\n');
    } catch { /* non-fatal */ }

    const debug = failingTests?.length
      ? failingTests.map(t => `  ✗ ${t.tc_id}${t.notes ? `: ${t.notes}` : ''}`).join('\n')
      : '';

    return render('phases/phase4', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      DEBUG: debug,
      FR_SNAPSHOT: frSnapshot,
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      SYSTEM_DESIGN: head(inputs['02_SYSTEM_DESIGN.md'], 200),
      TEST_CASES_JSON: inputs['03_TEST_CASES.json'],
      TC_LOCK: tcIds,
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
    });
  },
};
