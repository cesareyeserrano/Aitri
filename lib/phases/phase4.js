/**
 * Module: Phase 4 — Implementation
 * Purpose: Full-Stack Developer persona. Writes production-ready code + tests.
 * Artifact: 04_IMPLEMENTATION_MANIFEST.json + src/ + tests/
 */

import fs from 'fs';
import path from 'path';
import { extractManifest, extractRequirements, head } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/developer.js';
import { render } from '../prompts/render.js';

export default {
  num: 4,
  alias: 'build',
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

  buildTDDRecommendation(requirementsJson) {
    let reqs;
    try { reqs = JSON.parse(requirementsJson); } catch { return ''; }
    const frs = (reqs.functional_requirements || []).filter(fr => fr.priority === 'MUST');
    if (frs.length === 0) return '';

    const STATEFUL_KEYWORDS = /\b(valid|invalid|must reject|must return|error|fail|unauthorized|token|session|rate.?limit|permission|auth|csrf|expires?|retry|rollback|conflict|duplicate)\b/i;
    const tdd = [], testAfter = [];

    for (const fr of frs) {
      const acs = Array.isArray(fr.acceptance_criteria) ? fr.acceptance_criteria : [];
      const isUXType = ['ux', 'visual', 'audio'].includes(fr.type?.toLowerCase());
      const hasStatefulAC = acs.some(ac => STATEFUL_KEYWORDS.test(ac));
      if (!isUXType && acs.length > 4 && hasStatefulAC) {
        const reason = `${acs.length} ACs with stateful/validation rules`;
        tdd.push(`  ✦ ${fr.id} — ${fr.title} (${reason})`);
      } else {
        const reason = isUXType ? 'visual/UX type' : (acs.length <= 4 ? 'low AC count' : 'no state/validation keywords');
        testAfter.push(`  ✦ ${fr.id} — ${fr.title} (${reason})`);
      }
    }

    const lines = ['## Testing Approach Recommendation', ''];
    if (tdd.length) {
      lines.push('TDD recommended for:');
      lines.push(...tdd);
      lines.push('  Reason: High AC count with state/validation logic — write tests first to clarify edge cases.');
      lines.push('');
    }
    if (testAfter.length) {
      lines.push('Test-After recommended for:');
      lines.push(...testAfter);
      lines.push('  Reason: Visual, exploratory, or simple — implement first, test to confirm.');
      lines.push('');
    }
    lines.push('Decision rule: TDD if AC count > 4 AND ACs involve state, validation, or error conditions.');
    lines.push('This is a recommendation — override if project context requires it.');
    return lines.join('\n');
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

    const tddRec = inputs['01_REQUIREMENTS.json']
      ? this.buildTDDRecommendation(inputs['01_REQUIREMENTS.json'])
      : '';

    return render('phases/phase4', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      DEBUG: debug,
      FR_SNAPSHOT: frSnapshot,
      REQUIREMENTS_JSON: extractRequirements(inputs['01_REQUIREMENTS.json']),
      SYSTEM_DESIGN: head(inputs['02_SYSTEM_DESIGN.md'], 200),
      TEST_CASES_JSON: inputs['03_TEST_CASES.json'],
      TC_LOCK: tcIds,
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
      TDD_RECOMMENDATION: tddRec,
    });
  },
};
