# Phase 1 — PM Analysis

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

## IDEA.md
```
{{IDEA_MD}}
```

## IDEA.md Pre-flight Evaluation — Do This Before Writing Any Requirements

Evaluate IDEA.md against these 5 criteria. Report PASS or FAIL for each explicitly.
If 2 or more criteria FAIL → do NOT write 01_REQUIREMENTS.json.
Instead, report which criteria failed, why each matters, and instruct the user: "Run `aitri wizard` to complete IDEA.md before Phase 1."

1. **Concrete problem statement** — Does it name a specific, observable problem with context?
   - FAIL: "improve the system", "build an app", "make something useful" — one sentence with no context for why this problem exists now
   - PASS: describes observable friction, a failing process, or a metric not being met — with enough context to derive ≥3 distinct FRs

2. **Users with role and usage context** — Who uses this and in what situation?
   - FAIL: "users", "people", "the team", a role without usage context
   - PASS: role + usage situation + inferable technical level ("developers managing multiple Aitri projects from CLI")

3. **Current state / pain documented** — How is this solved today? What is lost without it?
   - FAIL: absent, or "there is no solution" with no further detail
   - PASS: describes the current workaround, measurable cost, or frequency of the problem

4. **At least one measurable success criterion** — Is there an observable condition that defines "this works"?
   - FAIL: "that it works well", "that it's fast", "that users are happy" — anything unverifiable without mind-reading
   - PASS: metric with threshold, binary observable condition, or Given/When/Then with concrete values

5. **At least one no-go zone item** — What is explicitly NOT included in this version?
   - FAIL: absent, or "anything is possible", or "whatever the team decides"
   - PASS: any explicit exclusion with a reason ("no authentication — local access only in v1")

**Blocking rule:** 2+ criteria FAIL → stop, report gaps, do not write artifact.
With exactly 1 FAIL → proceed but document the gap in `project_summary.idea_gaps`.

---

## Output: `{{ARTIFACTS_BASE}}/01_REQUIREMENTS.json`
Schema: { project_name, project_summary,
  functional_requirements: [{
    id:"FR-001", title, description, priority:"MUST|SHOULD|NICE",
    type:"UX|persistence|security|reporting|logic",
    acceptance_criteria:["measurable metric — e.g. passes mobile viewport test"],
    implementation_level:"present|functional|complete|production_ready"
  }],
  user_personas: [{role:"End User", tech_level:"low|mid|high", goal:"...", pain_point:"..."}],
  user_stories: [{
    id:"US-001", requirement_id:"FR-001", as_a:"...", i_want:"...", so_that:"...",
    acceptance_criteria:[{id:"AC-001", given:"concrete system state", when:"exact action or input", then:"verifiable assertion with specific value"}]
  }],
  non_functional_requirements: [{id:"NFR-001", category:"Performance|Security|Reliability|Scalability|Usability", requirement, acceptance_criteria}],
  no_go_zone: ["item — what is explicitly out of scope and why"],
  constraints:[], technology_preferences:[] }

## No-go zone (mandatory)
Before listing any FR, declare ≥3 items that are explicitly OUT OF SCOPE for this delivery.
The no_go_zone field must be populated — an empty array is a scope defect.
Examples of what belongs here:
  - "No backend server — frontend-only, no Node/Python/Go process"
  - "No authentication — no login, no sessions, no user accounts"
  - "No database — localStorage or in-memory only"
  - "No third-party API calls — no external HTTP requests at runtime"
  - "No mobile native build — web browser only"
Derive the no-go zone from: (a) explicit constraints in IDEA.md, (b) what the idea does NOT mention, (c) common scope creep patterns for this type of product.

## Product Analysis Vector
Before writing FRs, identify:
  - North Star KPI: the single metric that defines success (e.g. "user records first movement within 60s of opening app")
  - JTBD (Jobs To Be Done): what job does the user hire this product to do? (e.g. "track daily spend without opening a bank app")
  - Top guardrail metric: what must NOT get worse (e.g. "load time must stay ≤2s even with 365 days of data")
Include these as comments in project_summary or as a separate "product_analysis" field.

## Rules
- Min 5 FRs, each with at least 1 user story
- Every user story linked to a MUST FR must have ≥1 acceptance_criteria entry in Given/When/Then format
  Given: concrete system state | When: exact action or input | Then: verifiable assertion with specific value
- user_personas: infer from IDEA.md — who uses this product, their tech level, goal, and pain point
  If IDEA.md doesn't specify, use the most likely real user (not "general user")
- Min 3 NFRs — cover ALL applicable operational categories below. If a category does not apply, declare it explicitly with a reason (do NOT silently omit):
    **Observability** — applies to: any HTTP server or daemon process
      NFR minimum: every request logs [timestamp] METHOD /path STATUS to stdout/stderr
    **CI/CD** — applies to: any project with a test suite
      NFR minimum: pipeline runs the full test suite (including E2E if playwright.config.js exists) on every push to the main branch
    **API security** — applies to: any endpoint with path or input parameters that reads filesystem, DB, or executes commands
      NFR minimum: accepted values are restricted to a whitelist of allowed directories or resources — blocking `..` alone is insufficient
    **Healthcheck** — applies to: any project with Docker or server deployment
      NFR minimum: GET /health returns 200 when the process is alive
- Every MUST FR must have a type (UX|persistence|security|reporting|logic)
- acceptance_criteria must be measurable by type:
    UX         → "passes mobile viewport at 375px", "animation completes in ≤200ms", "contrast ≥4.5:1"
    visual     → "component renders at 375px/768px/1440px", "color contrast ≥4.5:1", "layout matches spec at each breakpoint"
    audio      → "sound plays within ≤100ms of trigger", "volume normalized to ≤-14 LUFS", "no audio gap on loop"
    persistence → "data survives process restart", "query returns correct record after write"
    security   → "returns 401 on invalid token", "rejects SQL injection input"
    reporting  → "chart renders with ≥10 data points", "export generates valid CSV"
    logic      → "calculation returns expected value for edge case X"
- CRITICAL — qualitative attributes (UX/visual/audio) MUST be operationalized by YOU into measurable criteria:
    ❌ "the UI looks nice"         → ✅ "layout visible without scroll at 375px viewport"
    ❌ "immersive sound design"    → ✅ "audio plays within 100ms of trigger, loop has no gap"
    ❌ "smooth animations"         → ✅ "transition completes in ≤200ms, no jank at 60fps"
    Aitri does not define aesthetic values — you define them, Aitri enforces that they exist.

{{#IF_PARENT_REQUIREMENTS}}
## Existing Requirements — do NOT duplicate
This is a feature addition to an existing project. The following requirements already exist.
Generate ONLY NEW FRs and user stories for this feature. Do not restate, paraphrase, or
reuse IDs from the list below.

```json
{{PARENT_REQUIREMENTS}}
```
{{/IF_PARENT_REQUIREMENTS}}

## Instructions
1. Declare no_go_zone (≥3 items) before writing any FR
2. Identify North Star KPI + JTBD + guardrail metric
3. Generate complete 01_REQUIREMENTS.json
4. Save to: {{ARTIFACTS_BASE}}/01_REQUIREMENTS.json
5. Present the Delivery Summary below to the user
6. Run: aitri complete 1

## Delivery Summary
After saving 01_REQUIREMENTS.json, present this report to the user:

```
─── Phase 1 Complete — Requirements ─────────────────────────
Functional Requirements:  [N] MUST · [N] SHOULD · [N] COULD
Non-functional:           [N]
North Star KPI:           [value]
JTBD:                     [statement]

No-go zone ([N] items):
  - [item 1]
  - [item 2]
  (list all)

Assumptions flagged: [N] — review before approving
──────────────────────────────────────────────────────────────
Next: aitri complete 1   →   aitri approve 1
```

## Human Review — Before approving phase 1
  [ ] no_go_zone has ≥3 explicit, specific items (not generic filler)
  [ ] Every MUST FR has type AND at least one acceptance_criteria with a concrete metric
  [ ] acceptance_criteria for UX/visual/audio FRs contain real measurements (px, ms, %, fps)
  [ ] user_personas reflect real users — not "general user" — with a real goal and pain_point
  [ ] No FR invents scope beyond what IDEA.md implies
  [ ] North Star KPI, JTBD, and guardrail metric are identified in project_summary
  [ ] Operational NFRs covered: observability, CI/CD, API security, healthcheck — or explicitly declared "not applicable" with reason
