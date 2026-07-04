/**
 * Module: Phase 5 — Deployment
 * Purpose: DevOps Engineer persona. Creates deployment config and compliance proof.
 * Artifact: 05_TRACEABILITY.json + Dockerfile + docker-compose.yml
 */

import fs from 'fs';
import { extractRequirementsForCompliance, extractTestResults } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/devops.js';
import { render } from '../prompts/render.js';
import { artifactPath, readArtifactFile, verifyResultsBinding } from '../state.js';
import { isMustRequirement, HIGH_COMPLIANCE_LEVELS, EVIDENCE_OK_STATUSES } from '../requirements.js';

export default {
  num: 5,
  alias: 'deploy',
  name: 'Deployment',
  persona: 'DevOps Engineer',
  artifact: '05_TRACEABILITY.json',
  // 03_TEST_CASES.json is intentionally NOT listed: Phase 5 cross-references test
  // evidence only through 04_TEST_RESULTS.json (which already carries the per-TC results),
  // and the briefing inputs are kept minimal. The validate() cross-checks read
  // 01_REQUIREMENTS.json + 04_TEST_RESULTS.json directly, not via this inputs list.
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md', '04_BUILD_REPORT.json', '04_TEST_RESULTS.json'],

  extractContext: (content) => content,

  validate(content, { dir, config } = {}) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('05_TRACEABILITY.json is not valid JSON — check that the agent did not wrap output in markdown fences or add trailing commas.');
    }
    const missing = ['project', 'version', 'phases_completed', 'requirement_compliance', 'overall_status']
      .filter(k => !d[k]);
    if (missing.length) throw new Error(`TRACEABILITY (05_TRACEABILITY.json) missing fields: ${missing.join(', ')}`);
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
        try { reqs = JSON.parse(readArtifactFile(reqPath)); } catch { /* malformed — skip */ }
        if (reqs?.functional_requirements || reqs?.non_functional_requirements) {
          // Every MUST requirement needs a compliance entry. NFRs are first-class
          // (the briefing has a whole CI/CD-NFR compliance block), so a priority:MUST
          // NFR omitted from requirement_compliance must also be caught — it was not
          // (audit Tier-2): the check only scanned functional_requirements.
          // isMustRequirement also covers regression NFRs (category:"Regression")
          // without priority (REG-GATE-0621) — consistent with the Phase-3 forced-TC gate.
          const mustFRIds = [
            ...(reqs.functional_requirements     || []),
            ...(reqs.non_functional_requirements || []),
          ].filter(isMustRequirement).map(r => r.id);
          const coveredIds = new Set(d.requirement_compliance.map(r => r.id).filter(Boolean));
          const uncovered = mustFRIds.filter(id => !coveredIds.has(id));
          if (uncovered.length > 0)
            throw new Error(
              `${uncovered.length} MUST requirement(s) not found in requirement_compliance:\n` +
              uncovered.map(id => `  ${id}`).join('\n') + '\n' +
              `  Every MUST requirement (FR or NFR) must have a compliance entry in 05_TRACEABILITY.json.`
            );
        }
      }

      // D1 (rc.13): a compliance level of complete/production_ready must be backed
      // by test evidence — the FR's fr_coverage status must be "covered" (a verified manual
      // TC is recorded status:"pass" → "covered"; a pending "manual" is not acceptable evidence).
      // Claim-vs-evidence consistency: a green proof must not over-claim past what the
      // tests show. Only flags when the evidence exists and contradicts (conservative).
      const resPath = artifactPath(dir, config || {}, '04_TEST_RESULTS.json');
      if (fs.existsSync(resPath)) {
        // Run-binding re-check (UPLAN-0703 B3): the compliance proof is built on the results
        // file — if it was edited after the last verify-run, the evidence this phase attests to
        // is untrustworthy. Refuse to validate a traceability record over a tampered results file
        // (only when a stamp exists; a stamp-less pre-rc.129 project is not blocked here — the
        // deploy gate's B1 check owns that path).
        if (config && verifyResultsBinding(dir, config) === 'mismatch')
          throw new Error(
            '04_TEST_RESULTS.json was edited after the last verify-run (results-hash mismatch) — ' +
            'the compliance proof in 05_TRACEABILITY.json cannot be trusted over a tampered results file. ' +
            'Re-run aitri verify-run to regenerate it from a real execution, then re-derive Phase 5.'
          );
        let results;
        try { results = JSON.parse(readArtifactFile(resPath)); } catch { /* malformed — skip */ }
        const covByFr = new Map((results?.fr_coverage || []).map(fr => [fr.fr_id, fr.status]));
        const overclaim = d.requirement_compliance.filter(r =>
          HIGH_COMPLIANCE_LEVELS.has(r.level) && covByFr.has(r.id) && !EVIDENCE_OK_STATUSES.has(covByFr.get(r.id))
        );
        if (overclaim.length > 0)
          throw new Error(
            `${overclaim.length} compliance entr(ies) claim a level above their test evidence:\n` +
            overclaim.map(r => `  ${r.id}: level="${r.level}" but fr_coverage status="${covByFr.get(r.id)}"`).join('\n') + '\n' +
            `  "complete"/"production_ready" require fr_coverage status "covered" (a pending "manual" is not evidence — verify it with 'aitri tc verify').\n` +
            `  Lower the level to match the evidence, or add the missing passing tests and re-run verify-run.`
          );
      }
    }
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, scopeVerb = '', scopeArg = '' }) {
    return render('phases/deploy', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      REQUIREMENTS_JSON: extractRequirementsForCompliance(inputs['01_REQUIREMENTS.json']),
      SYSTEM_DESIGN: inputs['02_SYSTEM_DESIGN.md'],
      MANIFEST_JSON: inputs['04_BUILD_REPORT.json'],
      TEST_RESULTS_JSON: extractTestResults(inputs['04_TEST_RESULTS.json']),
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
