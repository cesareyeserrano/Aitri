# Code Review — Independent Review

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

## Files to review (from 04_IMPLEMENTATION_MANIFEST.json)
{{FILE_LIST}}

## Declared technical debt
{{DEBT_LIST}}

## Requirements
```json
{{REQUIREMENTS_JSON}}
```

## Test Specs
```json
{{TEST_CASES_JSON}}
```

## Review Protocol
1. Read every file listed above — do not skip any
2. For each MUST FR: find the implementation, compare against AC and TCs
3. For each security FR: read the actual auth/validation code — no assumptions
4. For each technical_debt entry: verify the substitution matches what is actually in the code
5. Write ## Issues Found — list each issue with FR-ID, TC-ID, file, line range, and what is wrong
6. Write ## FR Coverage — one row per FR: status (implemented|partial|missing|substituted)
7. Write ## Verdict — PASS | CONDITIONAL_PASS | FAIL with justification
8. Save to: {{DIR}}/04_CODE_REVIEW.md
9. Run: aitri complete review

## Output: `{{DIR}}/04_CODE_REVIEW.md`
Required sections:
  ## Issues Found       — one entry per gap (empty section if none)
  ## FR Coverage        — table with FR-ID, implementation status, TC-ID
  ## Verdict            — PASS | CONDITIONAL_PASS | FAIL + justification

## Human Review — Before approving code review
  [ ] Reviewer read every file in files_created — not just spot-checked
  [ ] Every MUST FR has a coverage row
  [ ] Every issue references a specific FR-ID and file/line
  [ ] Verdict is consistent with the issues listed
  [ ] No undeclared substitutions in the code vs technical_debt
