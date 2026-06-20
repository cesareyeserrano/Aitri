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
5. Re-run only the failing TCs to confirm the fix before calling aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4
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

Test naming convention (REQUIRED for aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}} auto-detection):
  1. Test name MUST start with TC id:  it('TC-XXX: description of what is tested', ...)
  2. Test body MUST include marker:     // @aitri-tc TC-XXX

aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}} parses TC-XXX patterns directly from runner output:
  - node:test / mocha / TAP: ✔/✖ TC-XXX — auto-detected
  - Vitest:                  run with --reporter verbose — ✓/× TC-XXX detected automatically
  - Jest:                    run with --verbose flag     — ✓/✕ TC-XXX detected automatically
  - pytest:                  run with -v flag            — PASSED/FAILED TC-XXX detected automatically
  - Go:                      run with -v flag            — `--- PASS/FAIL/SKIP: TestTC_XXX` detected automatically (underscore in Go func names is normalized to dash → canonical TC-XXX)
  - Rust / other:            ensure TC-XXX appears in test output line (test name or log)
Marker comment: use your language's line comment style (// @aitri-tc TC-XXX for JS/Go/Java, # @aitri-tc TC-XXX for Python/Ruby/Shell)
Tests not matching TC-XXX: naming are auto-classified as skip — verify-complete rejects 0 passing tests.
{{/IF_TC_LOCK}}

## Code Standards (mandatory)
- Standard doc format for your language on every function (JSDoc, Python docstrings, godoc, Rustdoc, Javadoc, etc.) — at minimum: parameters, return value, thrown exceptions
- File header: Module, Purpose, Dependencies
- Zero hardcoded values — all config via env vars
- Error handling: input validation + async try-catch + HTTP errors
- Follow EXACT tech stack from System Design
- Traceability headers on key functions: /** @aitri-trace FR-ID: FR-001, US-ID: US-001, AC-ID: AC-001, TC-ID: TC-001 */
- Traces live in SOURCE, never in shipped public output: any asset served verbatim to end users (public HTML/CSS/JS, browser-rendered templates, static files) must NOT contain @aitri-trace comments, FR/UX/TC IDs, internal decision comments, or leftover debug logging (console.log/print). Keep traces in server-side/source files, or strip comments in a build step before serving — leaked traces hand the project's internal requirements map to anyone who views source.
- Test paths and fixtures: use relative paths or `os.tmpdir()` — no hardcoded absolute paths with usernames or machine-specific routes

## CI/CD Deliverable (mandatory when NFR requires it)
If `01_REQUIREMENTS.json` contains an NFR for CI/CD (category: "CI/CD" or keyword "pipeline" or "continuous integration"):
- Create `.github/workflows/ci.yml` (GitHub Actions) or equivalent for the declared CI platform
- The workflow MUST: (1) trigger on push and pull_request to the main branch, (2) install dependencies, (3) run the exact `test_runner` command from this manifest, (4) run the project's declared e2e runner as a separate step if one is configured (otherwise omit the e2e step — do not invent a runner the project does not use)
- Include `.github/workflows/ci.yml` in `implementation_files` in the manifest
- If CI/CD NFR is MUST priority and you cannot create the workflow → declare it as technical debt with reason

## Technical Definition of Done
You MUST verify ALL of the following before calling aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4:
  [ ] Linter/type checks pass (zero errors) — AND declared in manifest `quality_gates` so aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}} enforces them mechanically, not on the honor system
  [ ] Tests pass — no failures, no skipped tests (use test_runner from manifest)
  [ ] technical_debt in manifest is complete — every simplification is declared
  [ ] All files listed in files_created exist on disk
  [ ] No TODO/FIXME/PLACEHOLDER comments remain in production code
  [ ] .env.example includes all required environment variables

If any item above fails, fix it before completing. Calling aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4 with a failing checklist item is a defect.

## Self-Evaluation Checklist — FR types
For each MUST FR, confirm:
  [ ] type UX:          responsive layout implemented — not just functional HTML, passes 375px viewport
  [ ] type persistence: real DB or file storage — not in-memory variable or JSON mock
  [ ] type security:    real token validation — not mock/skip/hardcoded bypass
  [ ] type reporting:   chart/graph library rendering — not plain HTML table substitution

## Technical Debt Declaration (MANDATORY in manifest)
In 04_BUILD_REPORT.json, you MUST declare every simplification made vs. the MUST requirements:
  "technical_debt": [
    { "fr_id":"FR-003", "substitution":"HTML table instead of Chart.js graph",
      "reason":"library conflict", "effort_to_fix":"medium" }
  ]
→ Empty array [] is valid ONLY if zero substitutions were made.
→ Undeclared substitutions will fail compliance review in Phase 5.

## Output
- Source code: for a new project, {{DIR}}/src/; for a change to an existing codebase, its existing source layout — put the real paths in `files_modified`, do not relocate code into `src/` to match this default.
- Tests: {{DIR}}/tests/ (or the project's existing test location)
- {{DIR}}/<package descriptor matching your stack> (package.json, pyproject.toml, go.mod, Cargo.toml, pom.xml, etc.); a {{DIR}}/.env.example when the project uses env-based config (skip it if there is none, or if its absence is recorded in technical_debt)
- Manifest: {{ARTIFACTS_BASE}}/04_BUILD_REPORT.json — this is the EXACT required schema; match it field-for-field.
  { files_created:["path/string", …], files_modified:["path/string", …], setup_commands:[], environment_variables:[{name, default}],
    technical_debt:[{fr_id, substitution, reason, effort_to_fix:"low|medium|high"}],
    test_runner: "<exact command matching your stack>",
    test_files: ["<test files containing @aitri-tc markers>"],
    quality_gates:[{name, command, required, timeout_ms?}] }
  files_created / files_modified / test_files are FLAT arrays of string paths — NOT objects. Write
    ["src/foo.ts", "tests/foo.test.ts"], never [{path:"src/foo.ts", type:…}]. The substitution text goes
    in the field named `substitution` (not `description`).
  setup_commands and environment_variables are optional fields. When the project has none, you may either include them as empty arrays `[]` or omit the keys entirely — the validator accepts both forms (alpha.9). technical_debt is required, even if empty.
  test_runner: the exact command that runs your suite (e.g. "npm test", "pytest -v",
    "go test ./... -v", "cargo test", "dotnet test --logger trx"). aitri does NOT learn a
    parser per stack — your runner reports results one of three universal ways; pick whichever
    it supports:
    1. STDOUT marker — the test prints its TC id with a pass/fail glyph (name the test after the
       TC id, e.g. function/method contains TC_006h…). Native for most JS/Go/Python runners.
    2. RESULTS FILE — the runner writes JUnit-XML or TRX; run aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}}
       --results <file-or-dir>. JUnit-XML is near-universal (most runners emit it natively or via a
       reporter); TRX is the .NET form. You MUST pass --results explicitly — aitri does not hunt the
       tree for result files (a stray/stale file could otherwise credit a false PASS). Point it at the
       dir (e.g. --results TestResults/) and aitri reads the newest file the run wrote. This is the
       path for any stack the stdout convention does not fit.
    3. EVIDENCE — if neither fits, record each result against a file:
       aitri tc verify <TC> --result pass|fail --evidence <path>.
  test_files: every file that contains @aitri-tc markers — required for aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}}
  Feature sub-pipelines (aitri feature verify-run <name>): the runner executes with the FEATURE
    directory ({{FEATURES_DIR}}/<name>/) as its working directory, and test_runner / test_files are resolved
    relative to it — NOT the project root. Most features extend root code whose tests, config, and
    node_modules live at the project root, so point the runner back there explicitly, e.g.
    "vitest run --root ../.. tests/<name>", "pytest -v ../../tests/<name>", or "go test ../../...".
    A feature that is fully self-contained under {{FEATURES_DIR}}/<name>/ needs no prefix.
  quality_gates: the code-quality checks Aitri runs and gates on, BEYOND tests. Tests prove the
    behavior works; quality_gates prove the code is well-built. Declare the gates your stack supports —
    Aitri runs each `command` and judges it by exit code (0 = pass). `required: true` (the default)
    BLOCKS Phase 5 on failure; set `required: false` for advisory gates you are adopting gradually.
    Declare ONLY tools the project actually has configured — do not invent a linter the project does
    not use. The kinds of gate that matter on any stack: a linter, a type-checker (if typed), and a
    security scanner — declare each as the exact command your stack runs it with (e.g. {name:"lint",
    command:"eslint ."} or {name:"typecheck", command:"mypy src"} or {name:"security",
    command:"gosec ./...", required:false}). Whatever the language, the rule is the same: name the
    real command, Aitri judges it by exit code.
    Coverage gate: declare {name:"coverage", threshold:80} (a numeric threshold instead of a command).
      verify-run measures line coverage (stack-aware: node/go/pytest/jest/vitest — the coverage tool
      must be in the project's deps) and the gate passes when measured ≥ threshold. required defaults true.
    Mutation gate (fake-pass protection): a passing test can still be FAKE — mocks or weak assertions
      let code "pass" without exercising real behavior, so a suite can be green while the feature is
      dead. A mutation tool breaks your real code on purpose and re-runs the tests; a surviving mutant
      means a test never actually checked that code. It is the ONLY mechanical check for this. If your
      stack has a tool (Stryker for JS/.NET, pitest for Java, mutmut/cosmic-ray for Python, infection for
      PHP), declare it: {name:"mutation", command:"<tool>", required, timeout_ms:1800000}. Mutation is
      SLOW — set timeout_ms above the default (300000 = 5 min) or Aitri will kill it mid-run. Configure
      the tool's OWN score threshold so it exits non-zero below it — Aitri gates by exit code, it does
      not parse the score (no parser-per-tool). No mutation tool for your stack → skip it; verify-run
      notes the absence once but never blocks on it.
    timeout_ms (any command gate): optional per-gate timeout in ms (default 300000 = 5 min). Raise it for
      gates that legitimately run long — mutation, full integration/e2e suites — so a slow-but-correct gate
      is not killed and mis-reported as a failure.
    If the project genuinely has no quality tooling, omit quality_gates — but prefer wiring at least a
    linter, because Aitri's promise is well-built code, not only passing tests.
    Security gate: if 01_REQUIREMENTS.json declares security NFRs, a security gate is EXPECTED — wire
    the scanner your stack supports or, when none exists for the stack, a project script of exit-code
    checks (secrets grep, exposed-docs probe, headers check). Omitting it on a
    project with declared security NFRs requires a one-line reason in technical_debt — security
    promises without a mechanical re-check are honor-system only.

{{#IF_BEST_PRACTICES}}
{{BEST_PRACTICES}}
{{/IF_BEST_PRACTICES}}

## Instructions
1. Phase skeleton: create all file structure and module interfaces
2. Phase persistence/integrations: implement DB layer, APIs, storage
3. Phase hardening: error handling, validation, boundary cases
4. Add @aitri-trace headers to key functions
5. Verify Technical Definition of Done checklist
6. Save manifest (with technical_debt) to: {{ARTIFACTS_BASE}}/04_BUILD_REPORT.json
7. Present the Delivery Summary below to the user
8. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4

## Delivery Summary
After saving all files + 04_BUILD_REPORT.json, present this report to the user:

```
─── Phase 4 Complete — Implementation ────────────────────────
Files created:   [N] — [list src files]
Test files:      [N] — framework: [framework from System Design] · command: [test_runner]
@aitri-trace:    [N] functions tagged

Technical debt ([N] items):
  - [substitution 1] — [brief reason]
  - [substitution 2] — [brief reason]
  (list all; "none" only if genuinely zero)

Environment variables required: [N] — [list names]
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} 4   →   aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}}   →   aitri {{SCOPE_VERB}}verify-complete{{SCOPE_ARG}}
```

{{#IF_TDD_RECOMMENDATION}}
{{TDD_RECOMMENDATION}}
{{/IF_TDD_RECOMMENDATION}}

## Human Review — Before approving phase 4
  [ ] All files listed in files_created exist on disk
  [ ] technical_debt is complete — every simplification named, no generic entries like "none" or "n/a"
  [ ] No TODO/FIXME/PLACEHOLDER in production code
  [ ] .env.example covers all environment_variables listed in manifest
  [ ] @aitri-trace headers on key functions reference real FR/US/AC/TC IDs
  [ ] No @aitri-trace, internal comments, or console.log in publicly-served assets — grep the served HTML/CSS/JS output for "aitri-trace": must return nothing
  [ ] Tech stack matches 02_SYSTEM_DESIGN.md exactly — no unrequested substitutions
  [ ] Open each file in test_files[]: verify every TC assertion tests REAL behavior — not assert.ok(true), assert.equal(1,1), or constant expressions
  [ ] aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}} assertion density warnings reviewed — investigate any TC with ≤1 assertion
  [ ] If CI/CD NFR exists: .github/workflows/ci.yml created and listed in implementation_files
  [ ] No test fixture uses hardcoded absolute paths — all paths relative or os.tmpdir()
