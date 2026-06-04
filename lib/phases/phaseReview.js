/**
 * Module: Phase review — Code Review
 * Purpose: Independent Code Reviewer persona. Reviews implementation against requirements and test specs.
 * Artifact: 04_CODE_REVIEW.md
 * Optional phase — run between Phase 4 approve and aitri verify.
 */

import { ROLE, CONSTRAINTS, REASONING } from '../personas/reviewer.js';
import { render } from '../prompts/render.js';
import { head } from './context.js';

/**
 * Extract the code-review verdict from 04_CODE_REVIEW.md.
 *
 * Reads the `## Verdict` section specifically (not the whole doc) so the verdict
 * word in prose or the Issues list does not false-match, and strips bracketed
 * placeholders like `[PASS | CONDITIONAL_PASS | FAIL]`. Precedence FAIL >
 * CONDITIONAL_PASS > PASS — the worst stated verdict wins.
 *
 * @param {string} content
 * @returns {'PASS'|'CONDITIONAL_PASS'|'FAIL'|null}
 */
export function extractReviewVerdict(content) {
  if (typeof content !== 'string') return null;
  let section = content;
  const heading = content.match(/^##\s+.*Verdict.*$/mi);
  if (heading) {
    const rest = content.slice(heading.index + heading[0].length);
    const next = rest.search(/^##\s+/m);
    section = next === -1 ? rest : rest.slice(0, next);
  }
  let cleaned = section.replace(/\[[^\]]*\]/g, ' '); // drop bracketed placeholder menus
  // Also drop the UN-bracketed menu the briefing prints (`PASS | CONDITIONAL_PASS
  // | FAIL`): 2+ verdict tokens joined by `|` is the unfilled template, not a
  // chosen verdict — left in, worst-precedence below would read it as a phantom
  // FAIL. A real verdict followed by prose ("FAIL — because the PASS criteria…")
  // is not pipe-joined, so it survives and is read correctly.
  cleaned = cleaned.replace(/\b(?:PASS|CONDITIONAL_PASS|FAIL)(?:\s*\|\s*(?:PASS|CONDITIONAL_PASS|FAIL))+/gi, ' ');
  // Case-insensitive: a lowercase `fail` is a real FAIL and MUST be caught — the
  // reviewGate would otherwise silently let a real FAIL through (normalize to upper).
  if (/\bFAIL\b/i.test(cleaned)) return 'FAIL';
  if (/\bCONDITIONAL_PASS\b/i.test(cleaned)) return 'CONDITIONAL_PASS';
  if (/\bPASS\b/i.test(cleaned)) return 'PASS';
  return null;
}

export default {
  num: 'review',
  name: 'Code Review',
  persona: 'Code Reviewer',
  artifact: '04_CODE_REVIEW.md',
  inputs: ['01_REQUIREMENTS.json', '03_TEST_CASES.json', '04_BUILD_REPORT.json'],

  extractContext: (content) => head(content, 80),

  extractVerdict: extractReviewVerdict,

  validate(content) {
    if (content.split('\n').length < 20)
      throw new Error('04_CODE_REVIEW.md too short — a credible review requires at least 20 lines');
    if (!/^##\s+.*Issue/mi.test(content))
      throw new Error('04_CODE_REVIEW.md missing ## Issues section');
    if (!/^##\s+.*Verdict/mi.test(content))
      throw new Error('04_CODE_REVIEW.md missing ## Verdict section');
    // Use the SAME extractor the reviewGate consumes (extractReviewVerdict) — a
    // raw `content.includes('PASS')` substring scan accepted a prose mention or
    // the unfilled placeholder menu as a "verdict", and disagreed with the gate
    // on the same file. Require a real, chosen verdict in the ## Verdict section.
    if (!extractReviewVerdict(content))
      throw new Error(
        '04_CODE_REVIEW.md has no clear verdict — write exactly one of PASS, ' +
        'CONDITIONAL_PASS, or FAIL on its own line under ## Verdict (not the ' +
        'placeholder menu "PASS | CONDITIONAL_PASS | FAIL").'
      );
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, scopeVerb = '', scopeArg = '' }) {
    let manifest = {};
    try { manifest = JSON.parse(inputs['04_BUILD_REPORT.json']); } catch {}

    const fileList = manifest.files_created?.map(f => `  - ${f}`).join('\n') || '  (no files listed in manifest)';
    const debtList = manifest.technical_debt?.length
      ? manifest.technical_debt.map(d => `  - ${d.fr_id}: ${d.substitution}`).join('\n')
      : '  (none declared)';

    return render('phases/phaseReview', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      FILE_LIST: fileList,
      DEBT_LIST: debtList,
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      TEST_CASES_JSON: inputs['03_TEST_CASES.json'],
      DIR: dir,
      ARTIFACTS_BASE: artifactsBase || dir,
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
