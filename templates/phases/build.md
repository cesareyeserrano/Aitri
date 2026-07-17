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
5. Re-run the failing TCs to iterate on the fix — then run the FULL suite green before calling aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4 (one completion bar: the Definition of Done below; a targeted re-run is a debugging step, not the exit criterion)
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
{{#IF_UX_SPEC}}
## UX / Design Spec — the approved visual contract (implement it, don't just pass the TCs)
This is the design the product was approved against. The structural test cases below verify layout and
behavior — they do **NOT** guarantee visual fidelity. Build to THIS spec: apply the declared semantic
color rules (where appearance carries meaning), the named component affordances (expand/collapse,
hover/row actions, reorder handles, etc.), and the interactions in the User Flows. If it references
mockups/visual assets in `idea_context/`, those are the pixel reference — open them; tokens alone are
not the design. A UI that passes every TC but ignores this spec is a failed build.
{{UX_SPEC}}
{{/IF_UX_SPEC}}
{{CONTEXT_ASSETS}}
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

{{#IF_PLAN_FIRST}}
## Plan-First Build Protocol (mandatory on a fresh build — debug re-entry skips it)
Phase 4 is the longest phase, and "build everything, then show a finished whole" is its failure mode: the human's first chance to correct arrives when correction is most expensive, and a new session re-enters the phase with no execution structure. Work in visible increments instead:

1. **Before writing any code, write `{{ARTIFACTS_BASE}}/BUILD_PLAN.md`** — a WORKING file, not a pipeline artifact (nothing validates it; it exists for you and the human). **If BUILD_PLAN.md already exists (a feedback iteration or a resumed session), UPDATE it — do not rewrite it from scratch or reset done epics to pending; adjust only what the feedback/new context changes.**
   Group the **user stories** into **epics** — each epic is one coherent, shippable slice of the product (a feature area), defined by the US it delivers. The FRs and TCs on an epic are DERIVED references (each US's `requirement_id` → its FRs → their TCs), listed by id only — the plan never restates their content (the artifacts hold it). **Cover the whole TC set:** a TC unreachable through any US — a US-less FR's TC, an NFR's TC — still needs a home: assign it to the epic it naturally belongs with (or the final epic). The plan is complete when every TC id in `03_TEST_CASES.json` appears in exactly one epic's `Makes pass`; a TC in no epic is a TC nobody schedules until the end. NFRs are never a grouping axis (they hang off no US), but their TCs are scheduled like any other. Use THIS exact skeleton for every epic, in this order, with these field names — do not rename them run to run:

     ## Epic <N> — <feature-area name>   [status: pending | in-progress | done]
       Delivers:    US-0xx, US-0yy          (the user stories this epic ships — the deliverable)
       FRs:         FR-0xx, FR-0yy          (derived from each US's requirement_id)
       Makes pass:  TC-0xx, TC-0yy          (those FRs' test cases — the epic's done criterion)
       Build steps: skeleton → persistence/integrations → hardening
       Why here:    <one line — what this epic unblocks / why it is ordered here>

   - Order the epics by dependency (what unblocks what); the one-line "Why here" states the rationale.
   - **The epic count comes from the product, not from the protocol.** A small increment (a feature pipeline, a handful of US) is ONE epic — its plan is a six-line note and there are no intermediate boundaries. Do not manufacture granularity to look thorough.
2. **Present the plan to the user in conversation before implementing** — a short summary: the epics, the order, the US each delivers, why (on a feedback iteration, present only what changed and which epics it re-opens). This is an advisory checkpoint (no Aitri gate); incorporate their corrections into BUILD_PLAN.md before starting.
3. **Implement epic by epic.** Within EACH epic follow the build steps: skeleton → persistence/integrations → hardening. The steps are per-epic — an epic is not done at "skeleton"; the product is not built as one project-wide skeleton pass.
4. **An epic is `done` only when its `Makes pass` TCs run green.** Writing the test code for the epic's TCs is PART of the epic (no new TC ids — the set is `03_TEST_CASES.json`'s, per the test-authorship rules in this briefing); run them with the project's test runner — the one you will declare in the manifest — before flipping the status. At each epic boundary, update the epic's status in BUILD_PLAN.md, then checkpoint:
   - **When a human operator is present in the conversation:** pause and present the boundary as a verifiable partial delivery — the test run OUTPUT for the epic's TCs (not a narrative summary), how to see/run what was built, and what comes next. This is where the human acts on real results early instead of discovering at the end what should have been adjusted. Incorporate corrections before continuing.
   - **In an autonomous/CI run:** record the same evidence note (TC run result included) in BUILD_PLAN.md and continue — do not stall waiting for input that cannot come.
   - **Correction routing:** an implementation-level correction (within the approved spec) → apply it and note it in the plan. A correction that CHANGES the spec (new behavior, changed requirement, dropped scope) → do NOT silently absorb it: route it through the pipeline (`aitri run-phase requirements` or `aitri feature init`). Be honest about the cost: re-opening Phase 1 cascade-invalidates ux/2/3/4/5 — approvals and hashes are wiped and each phase re-runs/re-approves before the build resumes. **After ANY upstream re-open, re-run `aitri {{SCOPE_VERB}}run-phase{{SCOPE_ARG}} 4` for a fresh briefing — never resume from this briefing + the old BUILD_PLAN.md** (a Phase-3 re-run can change the TC set; stale epic/TC keys silently diverge).
5. **On resuming a session mid-build: read BUILD_PLAN.md FIRST** — it is the execution state this briefing does not carry. Continue from the first non-`done` epic.
{{/IF_PLAN_FIRST}}

## Code Standards (mandatory)
- Standard doc format for your language on every function (JSDoc, Python docstrings, godoc, Rustdoc, Javadoc, etc.) — at minimum: parameters, return value, thrown exceptions
- File header: Module, Purpose, Dependencies
- Zero hardcoded config values — route them through the project's declared config mechanism (env vars, config file, flags); when the project uses env-based config, all of it via env vars
- Error handling: input validation + async try-catch + HTTP errors
- Follow EXACT tech stack from System Design
- Traceability headers on key functions: /** @aitri-trace FR-ID: FR-001, US-ID: US-001, AC-ID: AC-001, TC-ID: TC-001 */
- Traces live in SOURCE, never in shipped public output: any asset served verbatim to end users (public HTML/CSS/JS, browser-rendered templates, static files) must NOT contain @aitri-trace comments, FR/UX/TC IDs, internal decision comments, or leftover debug logging (console.log/print). Keep traces in server-side/source files, or strip comments in a build step before serving — leaked traces hand the project's internal requirements map to anyone who views source.
- Test paths and fixtures: use relative paths or `os.tmpdir()` — no hardcoded absolute paths with usernames or machine-specific routes

## CI/CD Deliverable (mandatory when NFR requires it)
If `01_REQUIREMENTS.json` contains an NFR for CI/CD (category: "CI/CD" or keyword "pipeline" or "continuous integration"):
- Create the CI pipeline config for the platform the project declares (e.g. .github/workflows/ci.yml on GitHub Actions, .gitlab-ci.yml on GitLab, azure-pipelines.yml on Azure DevOps) — never a dead workflow for a platform the repo does not use
- The workflow MUST: (1) trigger on push and pull_request to the main branch, (2) install dependencies, (3) run the exact `test_runner` command from this manifest, (4) run the project's declared e2e runner as a separate step if one is configured (otherwise omit the e2e step — do not invent a runner the project does not use)
- Include that CI config file in `files_created` in the manifest
- If CI/CD NFR is MUST priority and you cannot create the workflow → declare it as technical debt with reason

## Technical Definition of Done
You MUST verify ALL of the following before calling aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4:
  [ ] Linter/type checks pass (zero errors) — AND declared in manifest `quality_gates` so aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}} enforces them mechanically, not on the honor system
  [ ] Tests pass — no failures, no skipped tests (use test_runner from manifest)
  [ ] technical_debt in manifest is complete — every simplification is declared
  [ ] All files listed in files_created exist on disk
  [ ] No TODO/FIXME/PLACEHOLDER comments remain in production code
  [ ] When the project uses env-based config: .env.example includes all required environment variables (skip if none — or record its absence in technical_debt)

If any item above fails, fix it before completing. Calling aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4 with a failing checklist item is a defect.

## Self-Evaluation Checklist — FR types
For each MUST FR, confirm:
  [ ] type UX:          layout implemented at the declared medium — responsive web passes its declared viewports (375px default); a fixed-medium surface renders correctly at ITS medium — not just functional HTML
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
    quality_gates:[{name, command, required, timeout_ms?}], test_runner_timeout_ms? }
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
    These three channels (plus the auto-detected e2e runner) are the ONLY sources of TC credit.
    A quality_gates command is judged by exit code — its output is never parsed for TC ids. If some
    tests live under a separate runner (e.g. component tests via their own npm script declared as a
    gate), either fold them into test_runner (one command that runs everything), point --results at
    their JUnit-XML output, or their TCs will report as skipped and block verify-complete.
  test_runner_timeout_ms (optional): a per-project ceiling in ms for how long the whole test run may
    take before verify-run kills it as hung (default 900000 = 15 min). It is a hang-catcher, not a
    speed target — leave it out unless your suite legitimately runs long (large integration/e2e/.NET
    suites), then RAISE it. A run killed at this limit is reported "did not finish" and does NOT fail
    the suite — so setting it too low only produces a confusing "raise the timeout", never a false pass.
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
      Threshold mode only works when test_runner IS the runner invocation itself. If test_runner is an
      npm-script wrapper ("npm run test:full" — Aitri cannot see inside the script) or chains runners
      ("vitest run && playwright test" — the coverage flag would land on the wrong command), Aitri cannot
      instrument it: declare the coverage gate in COMMAND mode instead — {name:"coverage",
      command:"<your coverage command>", required:true} — configure the tool's own threshold so it exits
      non-zero below it, and Aitri gates by exit code like any other gate.
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
    Smoke gate (the app actually runs): tests passing green proves the units behave — it does NOT
    prove the assembled product boots and serves. A suite can be fully green while the running app
    returns an error on every entry point on first launch (a bad config, a broken bootstrap, an
    incompatible runtime) — nothing in the test run ever started the real product. If your target is
    a long-running process that serves requests (web app, HTTP API, backend service), declare a smoke
    gate: {name:"smoke", command:"<start the app, hit its key entry points, fail on a server error>",
    timeout_ms:120000}. The command boots the product and asserts its key entry points respond
    without server errors — use whatever your stack runs it with (e.g. a script that starts the
    server and curls the main routes asserting no 5xx, or the project's e2e/health-check runner).
    The command must be a SINGLE executable or script file (e.g. ./smoke.sh) — gates run WITHOUT a
    shell, so an inline chain like "npm start && curl ..." will NOT work: the && is passed as a
    literal argument and only the first program runs. Put the boot-and-probe steps in a script and
    point the gate's command at it.
    This is the one gate that catches "green tests, dead app". A library, CLI, or batch job has
    nothing to boot — skip it for those (do NOT invent a server where there is none). Set timeout_ms
    high enough for the app to come up.

{{#IF_BEST_PRACTICES}}
{{BEST_PRACTICES}}
{{/IF_BEST_PRACTICES}}

{{#IF_PLAN_FIRST}}
## Instructions
1. Write {{ARTIFACTS_BASE}}/BUILD_PLAN.md and present the plan to the user (Plan-First Build Protocol above) — before any code
2. Implement epic by epic; within each epic: skeleton → persistence/integrations → hardening
3. At each epic boundary: run the epic's `Makes pass` TCs (green = done), update BUILD_PLAN.md, checkpoint with the human when present — test output first (record-and-continue when autonomous)
4. Add @aitri-trace headers to key functions
5. Verify Technical Definition of Done checklist
6. Save manifest (with technical_debt) to: {{ARTIFACTS_BASE}}/04_BUILD_REPORT.json
7. Present the Delivery Summary below to the user
8. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4
{{/IF_PLAN_FIRST}}
{{#IF_DEBUG}}
## Instructions (debug re-entry)
1. Apply the Debug protocol at the top — minimal fixes, no re-planning, do NOT rewrite working code
2. Keep @aitri-trace headers intact on anything you touch
3. Run the FULL suite green (the Definition of Done), then update the manifest if files changed
4. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 4
{{/IF_DEBUG}}

## Delivery Summary
After saving all files + 04_BUILD_REPORT.json, present this report to the user:

```
─── Phase 4 Complete — Implementation ────────────────────────
{{#IF_PLAN_FIRST}}Build plan:      BUILD_PLAN.md — [N] epics, all done (each with its Makes-pass TCs green) · checkpoints presented: [N] (the full trail for approve 4)
{{/IF_PLAN_FIRST}}Files created:   [N] — [list src files]
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

## Optional — adversarial pass before you report the build done
Before you report this build complete, if your environment supports independent subagents, spawn one told to **break** what you just built — not to validate it. Point it at the diff: find the requirement you implemented *wrong* (not just untested), the assertion that passes without exercising real behavior, the untested path, the edge that crashes, the thing that's green but never actually runs. **Self-review shares the blind spot that wrote the code; an independent pass does not — and green tests are not a substitute** (the worst defects live in untested paths). Then verify the adversary's load-bearing claims against the code yourself before acting on them. This costs extra tokens and is the operator's call: skip it for trivial changes, **accumulate small ones and review the batch**, but do not skip it for anything with real blast-radius (logic, a gate, a schema, a new surface). This is advisory — Aitri cannot run or gate on it; it is the single practice that most catches what "all tests pass" misses.

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
  [ ] If CI/CD NFR exists: the declared CI platform's pipeline config created and listed in files_created
  [ ] No test fixture uses hardcoded absolute paths — all paths relative or os.tmpdir()
