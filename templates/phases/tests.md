# Phase 3 — QA Test Design

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

## System Design (architecture + API)
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
{ test_plan: { strategy, coverage_goal: "80%", test_types: ["unit","integration","e2e"] },
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

## Schema contract — CRITICAL
- `requirement_id` MUST be a single FR id (e.g. "FR-001") — NEVER comma-separated ("FR-001,FR-002")
- `type` MUST be exactly one of: "unit" | "integration" | "e2e" — this is how aitri counts E2E tests
- `scenario` (separate field) is where you classify: "happy_path" | "edge_case" | "negative"
- `test_plan` is required — the artifact is invalid without it
- `given`, `when`, `then` are required fields — abstract values fail SPEC-SEALED rule

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
- Every FR-* gets min 3 test cases: one happy_path, one edge_case, one negative
- Min 2 test cases with type "e2e" — each assigned to a single requirement_id
- Steps specific enough for a developer to implement directly
- E2E tests run via Playwright MUST follow the same TC-XXX: naming: test('TC-XXX: description', ...)
  This allows aitri {{SCOPE_VERB}}verify-run{{SCOPE_ARG}} --e2e to auto-detect them from Playwright output

## Mandatory gates by FR type (test LEVEL of implementation, not just presence)
- FR type UX:          must include test for responsive layout at 375px viewport AND visual component rendering
- FR type visual:      must include test at each breakpoint declared in acceptance_criteria (e.g. 375px, 768px, 1440px)
- FR type audio:       must include test that audio fires within the ms threshold declared in acceptance_criteria
- FR type persistence: must include test that data survives process restart — NOT in-memory/variable storage
- FR type security:    must include ≥3 distinct attack vectors per security NFR — not just the most obvious one. Examples by control type:
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
