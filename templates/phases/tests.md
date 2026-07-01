# Phase 3 — QA Test Design

> **Industry document type:** this artifact (`03_TEST_CASES.json`) is the project's **Test Plan**. Call it the test plan when you summarise it to the user.

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

## Requirements
```json
{{REQUIREMENTS_JSON}}
```

> user_stories above include acceptance_criteria with Given/When/Then per AC id — use these to populate user_story_id, ac_id, and to write SPEC-SEALED test cases.
> no_go_zone above lists what is explicitly out of scope — do NOT write test cases for these items.
> **Adoption audit (brownfield):** if `idea_context/ADOPTION_AUDIT.md` is present, read it before designing tests — its findings name the existing behavior, integration seams, and regression risks the change must not break. Turn each Must-Not-Break / regression risk it records into a concrete negative or edge test case (a `category: "Regression"` NFR is a hard MUST and needs the full happy/edge/negative set).

## System Design (architecture + API) — design your tests against this contract
The interface, data model, and integration seams below are the approved contract. Your integration and e2e tests MUST exercise the real interface the design declares — in the form this stack uses (HTTP endpoints, function/class signatures, CLI commands, or protocol messages) — and your test data MUST match the Data Model. Do not invent an interface the design does not define, and do not leave a declared interface or integration seam untested.
{{SYSTEM_DESIGN}}

## TC ID naming convention
- Canonical shape: `TC[-NAMESPACE]*-<digits><suffix>` — namespace segments are letters only, digits and suffix sit in the LAST segment.
- Happy-path TCs: suffix ID with `h` — e.g., `TC-001h: user logs in with valid credentials`
- Failure/negative TCs: suffix ID with `f` — e.g., `TC-001f: login rejected when password is wrong`
- Edge cases: any other suffix — e.g., `TC-001e`
- Namespaced (feature sub-pipelines, multi-area projects): keep the suffix on the LAST segment.
  - ✅ `TC-FE-001h`, `TC-API-USER-010f`, `TC-E2E-007e`
  - ❌ `TC-FE001h` (digits glued to namespace letter — verify-run cannot parse)
  - ❌ `TC-E01` (no separator between namespace and digits, no suffix — silently dropped to skipped_no_marker)
- **Gate**: `aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 3` requires every FR to have ≥1 TC id ending in `h` and ≥1 ending in `f`

## Output: `{{ARTIFACTS_BASE}}/03_TEST_CASES.json`
Schema:
{ test_plan: { strategy, coverage_goal: "<the project's own target, e.g. 80% — your call, nothing keys off this value>", test_types: ["unit","integration","e2e"] },
  test_cases: [{
    id: "TC-001h",
    requirement_id: "FR-001",
    user_story_id: "US-001",
    ac_id: "AC-001",
    title: "Login — valid credentials returns JWT",
    type: "unit",
    scenario: "happy_path",
    priority: "high",
    preconditions: [],
    given: "user exists with email=test@example.com, password=Test1234!",
    when: "POST /auth/login { email: 'test@example.com', password: 'Test1234!' }",
    then: "response status 200, body contains { token: <JWT string>, expiresIn: 3600 }",
    steps: ["POST /auth/login with valid email + password"],
    expected_result: "Returns 200 + JWT token",
    test_data: {}
  }] }

## Hard gates — `aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 3` REJECTS the artifact without these
Scan this before writing. These are mechanical (validated by exit code, not advisory). The sections below explain the *why*; this is the *what*:
- `test_plan` object present (strategy, coverage_goal, test_types).
- Every test case carries ALL of: `id`, `requirement_id` (or `frs[]`), `user_story_id`, `ac_id`, `type`, `scenario`, `given`, `when`, `then`, `expected_result`.
- `type` is EXACTLY one of `unit` | `integration` | `e2e` — no `ui`, `performance`, `security`, etc. (security/UX are expressed via `requirement_id` + the type-coverage rules below, not the `type` enum).
- `scenario` is EXACTLY one of `happy_path` | `edge_case` | `negative`.
- **TC id suffix ↔ scenario** (there is NO `n` suffix): `happy_path` → id ends in `h`; `negative` → id ends in `f`; `edge_case` → id ends in `e`.
- Each `requirement_id`/`frs[]` target has **≥3 test cases**, including **≥1 `happy_path` (id …h)** and **≥1 `negative` (id …f)**.
- **≥2 critical-flow test cases.** If the surface has a UI (any FR of type `ux`/`visual`/`audio`), these must be `type: "e2e"`. If it is **backend-only** (no UX/visual/audio FR), API-level `type: "integration"` tests count as critical-flow coverage — label them `integration` (do NOT mislabel them `e2e` to clear the gate).
- `requirement_id` is a single id — never comma-separated (use `frs: [...]` for multi-FR).
- `requirement_id`/`frs[]` and `user_story_id` reference real ids in `01_REQUIREMENTS.json`.
- `expected_result` is specific — not `"works"`, `"passes"`, `"is correct"`.
- `ac_id`: required **only when** `01_REQUIREMENTS.json` provides structured acceptance criteria — i.e. `user_stories[].acceptance_criteria` are `{ id, text }` objects. Then every TC must carry an `ac_id` matching one of those ids (the value is cross-validated; the error lists the valid ids). If Phase 1's acceptance_criteria are plain strings with no ids, `ac_id` is **optional** — traceability still holds via `requirement_id` + `user_story_id` (both always required). Do NOT invent an `ac_id` format: use an id that exists in `01_REQUIREMENTS.json`, or omit it when none exist.

## Given/When/Then — SPEC-SEALED rule
Every test case MUST include `given`, `when`, `then` fields with concrete, verifiable values.
"Concrete" means: actual values, HTTP status codes, field names, data structures — not abstract descriptions.

  ❌ given: "a valid user exists"            → ✅ given: "user with email=alice@example.com exists in DB"
  ❌ when: "user submits valid form data"     → ✅ when: "POST /register { email: 'alice@example.com', password: 'Pass1!' }"
  ❌ then: "user is registered successfully"  → ✅ then: "status 201, localStorage key 'userId' is set, redirect to /dashboard"
  ❌ given: "the app has data"               → ✅ given: "localStorage contains 3 movement entries totaling $120"
  ❌ then: "chart renders correctly"          → ✅ then: "canvas element visible, legend shows 3 categories, no console errors"

SPEC-SEALED: a test case where given/when/then contain abstract language is equivalent to no test case.

## Type Coverage Matrix
For each FR, declare which test levels are required before writing test cases:

  | FR     | Unit  | Integration | E2E   |
  |--------|-------|-------------|-------|
  | FR-001 | MUST  | SHOULD      | -     |
  | FR-002 | MUST  | -           | MUST  |

Rules:
  - MUST: this level is required for the FR to be considered tested
  - SHOULD: recommended but not blocking
  - -: not applicable for this FR type
  - FR type UX/visual/audio: E2E is always MUST
  - FR type persistence: Integration is always MUST (in-memory tests don't count)
  - FR type security: Unit AND Integration are both MUST
  - FR type logic: Unit is always MUST

Include the coverage matrix as `type_coverage_matrix` field in the JSON output.

## Test Portability Rule
Test setup, fixtures, and file paths MUST be relative to the project (`process.cwd()`, `path.join(__dirname, ...)`, env vars) or use generated temp dirs (`os.tmpdir()`).
Hardcoded absolute paths containing usernames or machine-specific routes (`/Users/name/...`, `C:\Users\name\...`) are invalid — tests must run on any machine without modification.
If a test requires a file, create it in setup using `os.tmpdir()` and clean up in teardown.

## Behavior vs Implementation Rule
Tests MUST verify observable behavior, not implementation details.
A test that reads source code as a string to check a constant value tests the implementation — not what it produces.

  ❌ `assert(src.includes('ZOOM_STEP = 0.10'))` → tests the code, not the zoom
  ✅ Click zoom-in, assert viewport scale changed by ~10% → tests the behavior

  ❌ `assert(src.includes('autoungrabify: true'))` → tests config, not behavior
  ✅ Attempt to drag a node, assert it did not move → tests the behavior

If a behavior is genuinely hard to verify observationally → document it as `"manual verification required"` in `preconditions`, do NOT create an implementation test as substitute.

## Rules
- Every **MUST** FR/NFR gets min 3 test cases: one happy_path, one edge_case, one negative (the gate hard-blocks a MUST requirement with no TC; SHOULD/NICE FRs are recommended but only warned, not blocked). An NFR with `category: "Regression"` counts as MUST here **even if it has no `priority` field** — give each regression NFR the full happy/edge/negative set too
- Min 2 critical-flow test cases — `type: "e2e"` for a UI surface, or `type: "integration"` for a backend-only surface (no UX/visual/audio FR); each assigned to a single requirement_id
- Steps specific enough for a developer to implement directly
- E2E tests MUST embed the canonical TC-XXX prefix in the assertion or function name so the runner output is parseable: e.g. `test('TC-XXX: description', ...)` for Playwright/Vitest/Jest, `func TestTC_XXX_description` for Go, `def test_tc_xxx_description` for pytest. The exact runner is whatever the project declares — `aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}} --e2e` reads the runner output and matches on the TC id, not the framework
- Go test functions MUST use the canonical TC-XXX id with underscores as separators because Go syntax forbids `-` in identifiers: `func TestTC_NS_001h(t *testing.T)`. The `Test` prefix is mandatory. aitri normalizes underscores to dashes on parse — canonical id stored in `03_TEST_CASES.json` stays `TC-NS-001h`. Run `go test -v` so passes are visible in output

## Mandatory gates by FR type (test LEVEL of implementation, not just presence)
- FR type UX:          must include test for responsive layout at 375px viewport AND visual component rendering
- FR type visual:      must include test at each breakpoint declared in acceptance_criteria (e.g. 375px, 768px, 1440px)
- FR type audio:       must include test that audio fires within the ms threshold declared in acceptance_criteria
- FR type persistence: must include test that data survives process restart — NOT in-memory/variable storage
- FR type security:    must include ≥3 distinct failure modes per security NFR — not just the most obvious one. For an FR that exposes a runtime attack surface (input handling, auth, file access) these are attack vectors (examples by control type below). For a security-RELEVANT config or migration change (rewiring SSO, bumping a security package, removing a legacy auth path) they are the failure modes of THAT change — e.g. scope violation, a dangling reference after removal, a prerelease/downgraded dependency slipping through. Examples by control type:
    Filesystem/path access: (1) traversal `../../etc/passwd`, (2) direct absolute path `/etc/hosts`, (3) symlink outside allowed dir, (4) URL-encoded `%2e%2e%2f` if applicable
    API input validation:   (1) extreme value (max-length string, max integer), (2) wrong type (null, array where string expected), (3) special character (`;DROP TABLE`, `<script>`, `\x00`)
    Authentication:         (1) wrong credentials, (2) expired token, (3) valid token from a different user (horizontal authorization)
    Also: must include test that expired/invalid token returns 401 AND protected route rejects unauthenticated request
- FR type reporting:   must include test that chart/graph component renders with real data (not placeholder/empty state)
- FR type logic:       must include boundary value test AND a test with production-scale data volume

## Specificity rule — expected_result must survive mutation

A test is only valuable if it fails when the behavior it covers breaks.
For every test case, ask: "If I delete or invert the core logic this test verifies, does this test fail?"
If the answer is "maybe not", make expected_result more specific.

**Negative tests (scenario: negative)**
  ❌ expected_result: "login fails"                          → passes even if 500 is returned instead of 401
  ✅ expected_result: "HTTP 401, body: { code: 'INVALID_CREDENTIALS' }"
  ❌ expected_result: "returns an error"
  ✅ expected_result: "HTTP 403 Forbidden, no user data in response body"

**Logic tests (type: unit — calculations, rules, transformations)**
  ❌ expected_result: "returns the total"                    → passes even if wrong value returned
  ✅ expected_result: "returns 42.50 — items [10, 20, 12.50] with 2-decimal precision"
  ❌ expected_result: "discount applied correctly"
  ✅ expected_result: "price reduced from $100 to $85 (15% discount rule applied)"

**Persistence tests (type: integration — storage, databases)**
  ❌ expected_result: "data is saved"                        → passes even if save is a silent no-op
  ✅ expected_result: "GET /users/123 returns same payload after process restart"
  ❌ expected_result: "record exists in database"
  ✅ expected_result: "SELECT COUNT(*) WHERE id=123 returns 1 after POST /users"

**Security tests (type: security — auth, validation)**
  ❌ expected_result: "unauthorized request is rejected"     → passes even if 500 returned
  ✅ expected_result: "HTTP 401 with WWW-Authenticate header, no user data in response body"

**Qualitative FRs (UX/visual/audio) — copy metric directly from acceptance_criteria**
  ❌ expected_result: "component renders"
  ✅ expected_result: "component renders at 375px viewport, animation completes in ≤200ms"
  ❌ expected_result: "audio plays"
  ✅ expected_result: "audio plays within 100ms of trigger with no gap on loop"

**All types — the expected_result must verify what its acceptance criterion NAMES, not an easier neighbour.**
Cross-check every test against its linked AC (`ac_id`): the expected_result must assert the SAME observable the AC states — derive it from the AC, do not substitute a weaker proxy that happens to be easier to write. A specific, mutation-resistant result that verifies the *wrong* thing is still a coverage gap, and a passing run then certifies a requirement that was never tested.
  ❌ AC "exports a valid PDF containing every invoice line item" → expected_result: "a .pdf file exists in ./out"
  ✅ expected_result: "./out/invoice-123.pdf opens as valid PDF and contains all 3 line items from order 123"
This is the one check Aitri cannot make for you: it verifies that the `ac_id` link exists, never that the test honours it. Taking the easy path here passes every gate and ships an untested requirement.

{{#IF_UX_SPEC}}
## UX Spec — Additional TC Requirements

01_UX_SPEC.md is present. The following TCs are required in addition to the FR-level coverage above:

**Component state TCs** — for every component in the Component Inventory:
- Loading state: component shows skeleton/spinner while data is pending
- Error state: component shows a specific error message AND a recovery action (not just "Error occurred")
- Empty state: component shows a guidance message when no content exists (not a blank area)

These TCs must reference the UX FR that owns the component in `requirement_id` and use `type: "e2e"`.

**Mobile behavior TCs** — for every screen declared in User Flows:
- At least one TC verifying layout and interaction at 375px viewport
- `expected_result` must reference the spec's declared mobile behavior — not "renders correctly"

**Design token compliance** — at least one TC verifying:
- Primary text contrast ratio meets the value declared in Design Tokens (≥4.5:1 against its background)
- All interactive elements in the spec meet the declared touch target size

These TCs use `type: "e2e"` and `scenario: "happy_path"` unless testing a failure condition.

**Declared-design fidelity TCs** — turn the design the spec DECLARES into verifiable cases (the state, mobile, and contrast TCs above do NOT cover these, and a structural-only suite passes over a UI that ignores the design):
- **Semantic appearance rules** — wherever the spec says appearance carries meaning (e.g. a value shown in a danger/success color to signal a threshold crossed), a TC that asserts the rendered element actually uses that treatment under the triggering condition. Assert the rendered element's actual styling/state (computed style, applied class, or the platform's equivalent), not merely that the element exists.
- **Declared affordances** — for each interactive affordance the spec names (expand/collapse controls, hover or row actions, reorder handles, …), a TC that the affordance is present and performs its declared action.
- **Key interactions in User Flows** — for each flow step that changes what is shown (expand a group, reveal row actions, switch a view), a TC exercising it end to end against the spec's stated result — not "renders correctly".

These verify the DESIGN the spec describes; structural layout/state/token TCs do not. Use `type: "e2e"`.

## UX Spec (for reference)
{{UX_SPEC}}
{{/IF_UX_SPEC}}

{{#IF_BEST_PRACTICES}}
{{BEST_PRACTICES}}
{{/IF_BEST_PRACTICES}}

## Instructions
1. Build Type Coverage Matrix for all FRs
2. Write test cases with concrete Given/When/Then (SPEC-SEALED)
3. Generate complete 03_TEST_CASES.json
4. Save to: {{ARTIFACTS_BASE}}/03_TEST_CASES.json
5. Present the Delivery Summary below to the user
6. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 3

## Delivery Summary
After saving 03_TEST_CASES.json, present this report to the user:

```
─── Phase 3 Complete — Test Cases ────────────────────────────
Total TCs:       [N] — happy: [N] · edge: [N] · negative: [N]
FR coverage:     [N]/[N] MUST FRs covered
E2E tests:       [N] — targeting: [list flows]

Coverage by FR:
  [FR-ID]: [N] TCs — [h/f/e breakdown]
  (list all MUST FRs)

FRs with gaps (< 3 TCs): [list or "none"]
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 3   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} 3
```

## Optional — independent edge-case sweep
If subagents are available, consider one tasked only with finding the cases you *didn't* write: the negative input, the boundary, the attack vector behind a security NFR. It reports gaps; you decide which become TCs. Optional and token-costing — the operator decides.

## Human Review — Before approving phase 3
  [ ] Every MUST FR has ≥3 test cases (happy path, edge case, negative)
  [ ] At least 2 e2e tests targeting critical user flows
  [ ] given/when/then use concrete values — no "valid data", "correct input", or abstractions
  [ ] user_story_id and ac_id in each TC reference real IDs from 01_REQUIREMENTS.json
  [ ] No test cases written for items declared in no_go_zone
  [ ] Type Coverage Matrix is present and FR types have correct required levels
  [ ] Every FR has at least one TC id ending in `h` (happy path) and one ending in `f` (failure)
  [ ] Negative TCs: expected_result includes specific error code/message — not just "fails" or "returns error"
  [ ] Mutation check: if the core logic of each TC were deleted, would the test catch it?
  [ ] Security NFRs: each has ≥3 distinct attack vectors covered (not just the obvious one)
  [ ] No fixture or setup uses hardcoded absolute paths — all paths are relative or use os.tmpdir()
  [ ] No test verifies source code values as strings — all tests verify observable behavior
