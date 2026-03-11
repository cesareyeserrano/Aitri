/**
 * Module: Phase review — Code Review
 * Purpose: Independent Code Reviewer persona. Reviews implementation against requirements and test specs.
 * Artifact: 04_CODE_REVIEW.md
 * Optional phase — run between Phase 4 approve and aitri verify.
 */

import { ROLE, CONSTRAINTS, REASONING } from '../personas/reviewer.js';

export default {
  name: 'Code Review',
  persona: 'Code Reviewer',
  artifact: '04_CODE_REVIEW.md',
  inputs: ['01_REQUIREMENTS.json', '03_TEST_CASES.json', '04_IMPLEMENTATION_MANIFEST.json'],

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

  buildBriefing({ dir, inputs, feedback }) {
    let manifest = {};
    try { manifest = JSON.parse(inputs['04_IMPLEMENTATION_MANIFEST.json']); } catch {}

    const fileList = manifest.files_created?.map(f => `  - ${f}`).join('\n') || '  (no files listed in manifest)';
    const debtList = manifest.technical_debt?.length
      ? manifest.technical_debt.map(d => `  - ${d.fr_id}: ${d.substitution}`).join('\n')
      : '  (none declared)';

    return [
      `# Code Review — Independent Review`,
      `${ROLE}`,
      `\n## Constraints\n${CONSTRAINTS}`,
      `\n## How to reason\n${REASONING}`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      `\n## Files to review (from 04_IMPLEMENTATION_MANIFEST.json)`,
      fileList,
      `\n## Declared technical debt`,
      debtList,
      `\n## Requirements\n\`\`\`json\n${inputs['01_REQUIREMENTS.json']}\n\`\`\``,
      `\n## Test Specs\n\`\`\`json\n${inputs['03_TEST_CASES.json']}\n\`\`\``,
      `\n## Review Protocol`,
      `1. Read every file listed above — do not skip any`,
      `2. For each MUST FR: find the implementation, compare against AC and TCs`,
      `3. For each security FR: read the actual auth/validation code — no assumptions`,
      `4. For each technical_debt entry: verify the substitution matches what is actually in the code`,
      `5. Write ## Issues Found — list each issue with FR-ID, TC-ID, file, line range, and what is wrong`,
      `6. Write ## FR Coverage — one row per FR: status (implemented|partial|missing|substituted)`,
      `7. Write ## Verdict — PASS | CONDITIONAL_PASS | FAIL with justification`,
      `8. Save to: ${dir}/04_CODE_REVIEW.md`,
      `9. Run: aitri complete review`,
      `\n## Output: \`${dir}/04_CODE_REVIEW.md\``,
      `Required sections:`,
      `  ## Issues Found       — one entry per gap (empty section if none)`,
      `  ## FR Coverage        — table with FR-ID, implementation status, TC-ID`,
      `  ## Verdict            — PASS | CONDITIONAL_PASS | FAIL + justification`,
      `\n## Human Review — Before approving code review`,
      `  [ ] Reviewer read every file in files_created — not just spot-checked`,
      `  [ ] Every MUST FR has a coverage row`,
      `  [ ] Every issue references a specific FR-ID and file/line`,
      `  [ ] Verdict is consistent with the issues listed`,
      `  [ ] No undeclared substitutions in the code vs technical_debt`,
    ].join('\n');
  },
};
