/**
 * Module: Phase review — Code Review
 * Purpose: Independent Code Reviewer persona. Reviews implementation against requirements and test specs.
 * Artifact: 04_CODE_REVIEW.md
 * Optional phase — run between Phase 4 approve and aitri verify.
 */

import { ROLE, CONSTRAINTS, REASONING } from '../personas/reviewer.js';
import { render } from '../prompts/render.js';
import { head } from './context.js';

export default {
  num: 'review',
  name: 'Code Review',
  persona: 'Code Reviewer',
  artifact: '04_CODE_REVIEW.md',
  inputs: ['01_REQUIREMENTS.json', '03_TEST_CASES.json', '04_IMPLEMENTATION_MANIFEST.json'],

  extractContext: (content) => head(content, 80),

  validate(content) {
    if (content.split('\n').length < 20)
      throw new Error('04_CODE_REVIEW.md too short — a credible review requires at least 20 lines');
    const VERDICTS = ['PASS', 'CONDITIONAL_PASS', 'FAIL'];
    if (!VERDICTS.some(v => content.includes(v)))
      throw new Error(`04_CODE_REVIEW.md missing verdict — must include PASS, CONDITIONAL_PASS, or FAIL`);
    if (!/^##\s+.*Issue/mi.test(content))
      throw new Error('04_CODE_REVIEW.md missing ## Issues section');
    if (!/^##\s+.*Verdict/mi.test(content))
      throw new Error('04_CODE_REVIEW.md missing ## Verdict section');
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, scopeVerb = '', scopeArg = '' }) {
    let manifest = {};
    try { manifest = JSON.parse(inputs['04_IMPLEMENTATION_MANIFEST.json']); } catch {}

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
