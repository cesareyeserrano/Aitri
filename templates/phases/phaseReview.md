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

## Files to review (from 04_BUILD_REPORT.json)
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
7. Write ## Verdict — put the chosen verdict ALONE on the first line under the heading (exactly one of: PASS, CONDITIONAL_PASS, FAIL), then the justification below it. Do NOT leave the menu of options in the file. Example:
   ```
   ## Verdict
   CONDITIONAL_PASS
   FR-003 is functionally present but its error path is untested — fix before approving.
   ```
   (`reviewGate`, if enabled, blocks Phase 5 on a FAIL written here.)
8. Save to: {{ARTIFACTS_BASE}}/04_CODE_REVIEW.md
9. Present the Delivery Summary below to the user
10. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} review

## Delivery Summary
After saving 04_CODE_REVIEW.md, present this report to the user:

```
─── Code Review Complete ─────────────────────────────────────
Verdict:        [PASS | CONDITIONAL_PASS | FAIL]
FR coverage:    [N]/[N] MUST FRs reviewed

Issues found ([N]):
  CRITICAL: [N]  — [list titles or "none"]
  WARNING:  [N]  — [list titles or "none"]
  INFO:     [N]

[If CONDITIONAL_PASS or FAIL — list what must be fixed before approving]
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} review   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} review
```

## Output: `{{ARTIFACTS_BASE}}/04_CODE_REVIEW.md`
Required sections:
  ## Issues Found       — one entry per gap (empty section if none)
  ## FR Coverage        — table with FR-ID, implementation status, TC-ID
  ## Verdict            — the chosen verdict alone on its first line (PASS / CONDITIONAL_PASS / FAIL), justification below

## Optional — independent adversarial pass
If your environment supports independent subagents (e.g. a separate agent/session told to *break* this code, not validate it), consider one before approving. Prompt it to refute: find the untested path, the false-passing assertion, the edge that crashes. Self-review shares the blind spot that wrote the code; an independent pass does not. This costs extra tokens and is the operator's call — skip it for trivial changes.

## Human Review — Before approving code review
  [ ] Reviewer read every file in files_created — not just spot-checked
  [ ] Every MUST FR has a coverage row
  [ ] Every issue references a specific FR-ID and file/line
  [ ] Verdict is consistent with the issues listed
  [ ] No undeclared substitutions in the code vs technical_debt
