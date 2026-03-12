# Phase 4 — Implementation

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

{{#IF_DEBUG}}
## Debug Mode — Fix Failing Tests
You are re-entering Phase 4 because the following tests failed:
{{DEBUG}}

Debug protocol — follow this order, do NOT rewrite working code:
1. For each failing TC: read its given/when/then in Test Specs below — that is the contract
2. Find the exact function/handler responsible for that TC
3. Identify the gap: what the code does vs what 'then' requires
4. Write the minimal fix — one function, one file if possible
5. Re-run only the failing TCs to confirm the fix before calling aitri complete 4
{{/IF_DEBUG}}

{{#IF_FR_SNAPSHOT}}
## Requirements Snapshot (Anti-Drift Reference)
This is a quick reference — full requirements follow below. When in doubt, this list is the ground truth.
{{FR_SNAPSHOT}}
{{/IF_FR_SNAPSHOT}}

## Requirements
```json
{{REQUIREMENTS_JSON}}
```

> no_go_zone above lists what is explicitly out of scope — do NOT implement these items even if they seem implied.

## System Design
{{SYSTEM_DESIGN}}

## Test Specs — implement exactly to these
```json
{{TEST_CASES_JSON}}
```

> Each TC above contains given/when/then — these are the acceptance specs your code must satisfy.
> Write code so that running each TC's 'when' on a system in state 'given' produces exactly 'then'.

{{#IF_TC_LOCK}}
## Test Authorship Lock
You MUST implement tests for EXACTLY these TC ids — no more, no fewer:
{{TC_LOCK}}

PROHIBITED: creating new TC ids, renaming existing ones, or skipping any of the above.

Test naming convention (REQUIRED for aitri verify-run auto-detection):
  1. Test name MUST start with TC id:  it('TC-XXX: description of what is tested', ...)
  2. Test body MUST include marker:     // @aitri-tc TC-XXX

aitri verify-run parses TC-XXX patterns directly from runner output:
  - node:test / mocha / TAP: ✔/✖ TC-XXX — auto-detected
  - Vitest:                  run with --reporter verbose — ✓/× TC-XXX detected automatically
  - Jest:                    run with --verbose flag     — ✓/✕ TC-XXX detected automatically
Tests not matching TC-XXX: naming are auto-classified as skip — verify-complete rejects 0 passing tests.
{{/IF_TC_LOCK}}

## Code Standards (mandatory)
- JSDoc on every function: @param, @returns, @throws
- File header: Module, Purpose, Dependencies
- Zero hardcoded values — all config via env vars
- Error handling: input validation + async try-catch + HTTP errors
- Follow EXACT tech stack from System Design
- Traceability headers on key functions: /** @aitri-trace FR-ID: FR-001, US-ID: US-001, AC-ID: AC-001, TC-ID: TC-001 */

## Technical Definition of Done
You MUST verify ALL of the following before calling aitri complete 4:
  [ ] Linter/type checks pass (npm run lint or equivalent — zero errors)
  [ ] Tests pass (npm test or equivalent — no failures, no skipped tests)
  [ ] technical_debt in manifest is complete — every simplification is declared
  [ ] All files listed in files_created exist on disk
  [ ] No TODO/FIXME/PLACEHOLDER comments remain in production code
  [ ] .env.example includes all required environment variables

If any item above fails, fix it before completing. Calling aitri complete 4 with a failing checklist item is a defect.

## Self-Evaluation Checklist — FR types
For each MUST FR, confirm:
  [ ] type UX:          responsive layout implemented — not just functional HTML, passes 375px viewport
  [ ] type persistence: real DB or file storage — not in-memory variable or JSON mock
  [ ] type security:    real token validation — not mock/skip/hardcoded bypass
  [ ] type reporting:   chart/graph library rendering — not plain HTML table substitution

## Technical Debt Declaration (MANDATORY in manifest)
In 04_IMPLEMENTATION_MANIFEST.json, you MUST declare every simplification made vs. the MUST requirements:
  "technical_debt": [
    { "fr_id":"FR-003", "substitution":"HTML table instead of Chart.js graph",
      "reason":"library conflict", "effort_to_fix":"medium" }
  ]
→ Empty array [] is valid ONLY if zero substitutions were made.
→ Undeclared substitutions will fail compliance review in Phase 5.

## Output
- Source code: {{DIR}}/src/
- Tests: {{DIR}}/tests/
- {{DIR}}/package.json (or equivalent) + {{DIR}}/.env.example
- Manifest: {{ARTIFACTS_BASE}}/04_IMPLEMENTATION_MANIFEST.json
  { files_created:[], setup_commands:[], environment_variables:[{name, default}],
    technical_debt:[{fr_id, substitution, reason, effort_to_fix:"low|medium|high"}],
    test_runner: "npm test",
    test_files: ["tests/unit.test.js"] }
  test_runner: the exact command to run all tests (e.g. "npm test", "node --test tests/", "vitest run --reporter verbose", "jest --verbose")
  test_files: every file that contains @aitri-tc markers — required for aitri verify-run

{{#IF_BEST_PRACTICES}}
{{BEST_PRACTICES}}
{{/IF_BEST_PRACTICES}}

## Instructions
1. Phase skeleton: create all file structure and module interfaces
2. Phase persistence/integrations: implement DB layer, APIs, storage
3. Phase hardening: error handling, validation, boundary cases
4. Add @aitri-trace headers to key functions
5. Verify Technical Definition of Done checklist
6. Save manifest (with technical_debt) to: {{ARTIFACTS_BASE}}/04_IMPLEMENTATION_MANIFEST.json
7. Run: aitri complete 4

## Human Review — Before approving phase 4
  [ ] All files listed in files_created exist on disk
  [ ] technical_debt is complete — every simplification named, no generic entries like "none" or "n/a"
  [ ] No TODO/FIXME/PLACEHOLDER in production code
  [ ] .env.example covers all environment_variables listed in manifest
  [ ] @aitri-trace headers on key functions reference real FR/US/AC/TC IDs
  [ ] Tech stack matches 02_SYSTEM_DESIGN.md exactly — no unrequested substitutions
  [ ] Open each file in test_files[]: verify every TC assertion tests REAL behavior — not assert.ok(true), assert.equal(1,1), or constant expressions
  [ ] aitri verify-run assertion density warnings reviewed — investigate any TC with ≤1 assertion
