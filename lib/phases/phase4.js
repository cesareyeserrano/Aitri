/**
 * Module: Phase 4 — Implementation
 * Purpose: Full-Stack Developer persona. Writes production-ready code + tests.
 * Artifact: 04_BUILD_REPORT.json + src/ + tests/
 */

import fs from 'fs';
import path from 'path';
import { extractManifest, extractRequirements } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/developer.js';
import { render } from '../prompts/render.js';

export default {
  num: 4,
  alias: 'build',
  name: 'Implementation',
  persona: 'Full-Stack Developer',
  artifact: '04_BUILD_REPORT.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md', '03_TEST_CASES.json'],

  extractContext: extractManifest,

  validate(content, { dir } = {}) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('04_BUILD_REPORT.json is not valid JSON — check that the agent did not wrap output in markdown fences or add trailing commas.');
    }
    // setup_commands and environment_variables are optional. Until alpha.8 the
    // gate threw when the keys were absent, but the briefing presented them as
    // `[]`-by-default — the canary (alpha.7) hit three sequential rejections
    // because the agent omitted the empty arrays. The schema now accepts both
    // forms (absent ≡ `[]`); when present, the value must be an array.
    // Per-entry shape lives in the briefing (build.md), not here — keeping the
    // gate shape-only avoids re-creating the drift the canary just exposed.
    for (const k of ['setup_commands', 'environment_variables']) {
      if (!(k in d) || d[k] == null) continue; // absent ≡ []
      if (!Array.isArray(d[k]))
        throw new Error(`${k} must be an array (or omitted entirely if none) — got ${typeof d[k]}`);
    }
    const hasFilesCreated  = Array.isArray(d.files_created)  && d.files_created.length  > 0;
    const hasFilesModified = Array.isArray(d.files_modified) && d.files_modified.length > 0;
    if (!hasFilesCreated && !hasFilesModified)
      throw new Error('files_created or files_modified must be a non-empty array — list all files written or changed');
    if (!('technical_debt' in d))
      throw new Error('technical_debt field is required — use [] if no substitutions were made');
    // Anchored whole-string match: only rejects when the ENTIRE substitution is a
    // generic non-answer (so "replaced X — none of the edge cases" is NOT caught).
    // Expanded past the original bare words to the near-misses agents actually
    // write (audit Tier-2 false-accept): "nothing", "no debt incurred", "not
    // applicable", a lone dash/dot, "various", "minor", "see above", "stub".
    const GENERIC = /^(none|nothing|n\/?a|not applicable|no debt(?:\s+incurred)?|no substitution|placeholder declared|todo|tbd|pending|various|minor|stub|see above|[-–—.]+)\.?$/i;
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

    // quality_gates (ADR-037) — optional, additive. When present each entry must
    // declare a non-empty `command`; `required` defaults to true. Aitri runs the
    // command and gates the pipeline on its exit code (lint/type-check/security).
    if ('quality_gates' in d && d.quality_gates != null) {
      if (!Array.isArray(d.quality_gates))
        throw new Error('quality_gates must be an array (or omitted) — e.g. [{ "name": "lint", "command": "eslint .", "required": true }]');
      d.quality_gates.forEach((g, i) => {
        if (!g || typeof g !== 'object' || Array.isArray(g))
          throw new Error(`quality_gates[${i}] must be an object with a "command" string (or a numeric "threshold" for a coverage gate)`);
        const hasCommand   = typeof g.command === 'string' && g.command.trim();
        const hasThreshold = typeof g.threshold === 'number';
        // A gate is either command-based (lint/typecheck/security — exit-code judged)
        // or threshold-based (coverage — measured % vs threshold). Exactly one.
        if (!hasCommand && !hasThreshold)
          throw new Error(`quality_gates[${i}] needs a non-empty "command" (exit-code judged) or a numeric "threshold" (coverage gate)`);
        if (hasThreshold && (g.threshold < 0 || g.threshold > 100))
          throw new Error(`quality_gates[${i}].threshold must be a coverage percentage between 0 and 100`);
        if ('required' in g && typeof g.required !== 'boolean')
          throw new Error(`quality_gates[${i}].required must be a boolean if present (defaults to true)`);
      });
    } else {
      // Non-blocking nudge: code-quality gates are how Aitri verifies the code is
      // well-built, not just that tests pass. Absent ≠ invalid (additive contract).
      process.stderr.write(
        `[aitri] Note: no quality_gates declared in the manifest. Tests verify behavior; ` +
        `quality_gates verify the code is well-built (lint, type-check, security). Consider ` +
        `adding the gates your stack supports — e.g. { "name": "lint", "command": "<linter>", "required": true }.\n`
      );
    }

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

  buildBriefing({ dir, inputs, feedback, failingTests, artifactsBase, bestPractices, scopeVerb = '', scopeArg = '' }) {
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

    return render('phases/build', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      DEBUG: debug,
      FR_SNAPSHOT: frSnapshot,
      REQUIREMENTS_JSON: extractRequirements(inputs['01_REQUIREMENTS.json']),
      // Full design, not head(…,200): the developer IMPLEMENTS from this spec, so
      // truncating it silently dropped late sections (Deployment Architecture, Risk
      // Analysis) on any complete design past 200 lines (audit Tier-4). It is a
      // single bounded artifact that already passed the Phase 2 gate.
      SYSTEM_DESIGN: inputs['02_SYSTEM_DESIGN.md'] || '',
      TEST_CASES_JSON: inputs['03_TEST_CASES.json'],
      TC_LOCK: tcIds,
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
      TDD_RECOMMENDATION: tddRec,
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
