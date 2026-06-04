# Phase 1 — PM Analysis

> **Industry document type:** this artifact (`01_REQUIREMENTS.json`) is the project's **Product Requirements Document (PRD / SRS)**. When you summarise it to the user, call it the PRD.

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

{{#IF_CURRENT_REQUIREMENTS}}
## Current Requirements — SSoT for this re-run
01_REQUIREMENTS.json already exists from a prior Phase 1 run. This is the **single source of truth** — IDEA.md is no longer relevant for this iteration. Your task is to **refine, correct, or extend** the FRs below based on the feedback (if any), NOT to regenerate from scratch and NOT to prune FRs that grew organically beyond the original brief.

```json
{{CURRENT_REQUIREMENTS}}
```

**Rules for re-runs:**
- Preserve every FR id from the current artifact unless explicitly removed via feedback. Renumbering breaks downstream traces (TCs, compliance entries).
- Add new FRs only if feedback explicitly demands new behavior or you discover a gap relative to the existing FR set.
- The `original_brief` field (if present) is historical context only — never use it as an authority for what FRs should exist today.
- Skip the IDEA.md Pre-flight below — it does not apply on re-runs.
{{/IF_CURRENT_REQUIREMENTS}}

{{#IF_DISCOVERY_MD}}
## Discovery (00_DISCOVERY.md — Phase 0 handoff)
This is the approved discovery output: the problem definition, target users, success criteria, and explicit out-of-scope boundaries. Treat it as primary source alongside IDEA.md — derive FRs/NFRs that serve the success criteria and respect the out-of-scope boundaries. Do not re-open settled scope decisions.
```
{{DISCOVERY_MD}}
```
{{/IF_DISCOVERY_MD}}

{{#IF_IDEA_MD}}
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
With exactly 1 FAIL → proceed but document the gap in `idea_gaps`.

## Seed-Input Elicitation — Confirm, do NOT silently infer (D1)

The five criteria above are the **Tier-A ground-truth inputs**: the things only the
human knows and that, if wrong, poison every downstream artifact. You cannot reliably
infer them from the codebase or from your own judgement — getting them from the human
is the single highest-value action in the whole pipeline.

For each Tier-A field — **problem, users, baseline, success_metric, no_go_zone** — do this:
1. If IDEA.md, the user, or context the user **designated** (the `idea_context/` folder, a path they gave) states it concretely → it is **confirmed**. Context you **found on your own** (a folder you discovered by scanning the project, not one the user pointed you to) does NOT ground `confirmed` — treat it as `assumed` and confirm its source with the user first; it could be stale or the wrong material.
2. If it is blank, vague, or you are filling it from inference → **do NOT silently write it.**
   Ask the user a direct, specific question to confirm or correct it. One field at a time.
3. If the user is unavailable or declines, you may proceed by marking it **assumed** — but
   then it MUST be recorded as a tracked gap (see provenance contract below). An assumed
   ground-truth input is a visible risk, never a silent guess.

Do not collapse this into zero questions. Inferring everything and asking nothing is the
failure mode this protocol exists to prevent.
{{/IF_IDEA_MD}}

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
  constraints:[], technology_preferences:[],
  idea_provenance: { problem:"confirmed|assumed", users:"confirmed|assumed", baseline:"confirmed|assumed", success_metric:"confirmed|assumed", no_go_zone:"confirmed|assumed" },
  idea_gaps: ["<field>: why it was assumed and what to confirm with the owner"] }

## Seed-Input Provenance Contract (D2 — enforced on a fresh Phase 1)

`idea_provenance` is **required on a fresh seed** (the first Phase 1, before approval).
Declare each Tier-A field as `"confirmed"` (the user stated or approved it) or `"assumed"`
(you inferred it). Rules the gate enforces — `aitri complete 1` blocks otherwise:
  - All five keys (problem, users, baseline, success_metric, no_go_zone) must be present and valid.
  - Every `"assumed"` field MUST have a matching `idea_gaps` entry whose text starts with the
    field key, e.g. `"baseline: no current metric in IDEA.md — confirm with owner"`.
  - Never label a field `"confirmed"` that the user did not actually confirm. The gate cannot
    detect a false "confirmed" — that is on your integrity, and it defeats the entire purpose.
On a re-run after Phase 1 is approved, the seed is sealed: the gate is skipped and you refine
FRs as usual (idea_provenance is historical at that point).

## Requirement Depth Protocol
Before writing any FR, work through this decomposition for the product in IDEA.md:
1. **Screens / surfaces** — list every distinct screen, modal, or major UI surface
2. **User actions** — for each screen: list every action a user can perform (clicks, form submissions, navigation)
3. **System states** — for every I/O action: loading, success, error, and empty/zero-data states
4. **Auth + permissions** — who can do what; what happens when an unauthorized user attempts an action
5. **Async operations** — for every network call or background job: during, on success, on failure
6. **Edge cases** — empty inputs, max-length inputs, duplicate submissions, concurrent operations

Each item above that is not in no_go_zone is a candidate FR. If you don't write an FR for it, put it in no_go_zone with a reason. A screen with no FR is a gap. A user action with no FR is a gap.

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
- Min 5 FRs — non-trivial products have 8-15 MUST FRs. If you have fewer than 8 MUSTs, revisit the Depth Protocol above
- Every MUST FR must have ≥1 linked user story. For projects with multiple personas, write one story per persona that interacts with that FR
- MUST FRs of type security, persistence, logic, or reporting: ≥2 distinct acceptance_criteria — one for the happy path, one for a failure or boundary condition
- Every user story linked to a MUST FR must have ≥1 acceptance_criteria entry in Given/When/Then format
  Given: concrete system state | When: exact action or input | Then: verifiable assertion with specific value
- user_personas: infer from IDEA.md — who uses this product, their tech level, goal, and pain point
  If IDEA.md doesn't specify, use the most likely real user (not "general user")
- Min 3 NFRs — cover ALL applicable operational categories below. If a category does not apply, declare it explicitly with a reason (do NOT silently omit):
    **Observability** — applies to: any HTTP server or daemon process
      NFR minimum: every request logs [timestamp] METHOD /path STATUS to stdout/stderr
    **CI/CD** — applies to: any project with a test suite
      NFR minimum: pipeline runs the full declared test suite — including any e2e runner the project uses — on every push to the main branch
    **Security** — applies to: any project that handles user input, authentication/authorization, secrets or credentials, personal/sensitive data, or network-exposed endpoints.
      Decide explicitly — does security apply? If YES, add ≥1 security NFR covering the relevant surface (authn/authz, input validation, secret handling, transport/data protection). If NO, state why in one line (e.g. "offline single-user tool — no network, no secrets, no PII"). Do NOT leave security unaddressed by omission.
      NFR minimum (API / endpoints with path or input parameters that read filesystem, DB, or execute commands): accepted values are restricted to a whitelist of allowed directories or resources — blocking `..` alone is insufficient
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

### Regression boundary (feature-specific — the one axis a greenfield project lacks)
A feature MODIFIES a live system. If the seed has a **Must Not Break** section, turn EACH item into a **regression NFR**: `{ id: "NFR-…", category: "Regression", priority: "MUST", requirement: "<the existing behavior to protect>", acceptance_criteria: "<observable: how a test confirms it still works>" }`. Because it is `priority: "MUST"`, Phase 3 must generate a test for it (and verify-run runs it), so the pipeline fails loudly if the feature breaks existing behavior. Also use the **Touch Points** to scope which existing FRs you are extending vs leaving alone — do not silently re-implement what already works.
{{/IF_PARENT_REQUIREMENTS}}

## Instructions
1. Confirm the five Tier-A inputs with the user (Seed-Input Elicitation above) and set `idea_provenance` honestly — ask before assuming; record every assumption in `idea_gaps`
2. Declare no_go_zone (≥3 items) before writing any FR
3. Identify North Star KPI + JTBD + guardrail metric
4. Work through the Requirement Depth Protocol — enumerate screens, actions, states, auth, async, edge cases
5. Generate complete 01_REQUIREMENTS.json
6. Before saving — run this completeness self-check:
   - Every screen identified has ≥1 FR or is in no_go_zone
   - Every MUST FR has ≥1 linked user story
   - MUST FRs of type security/persistence/logic/reporting each have ≥2 ACs
   - idea_provenance has all five Tier-A keys; every "assumed" is carried in idea_gaps
7. Save to: {{ARTIFACTS_BASE}}/01_REQUIREMENTS.json
8. Present the Delivery Summary below to the user
9. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 1

## Delivery Summary
After saving 01_REQUIREMENTS.json, present this report to the user:

```
─── Phase 1 Complete — Requirements ─────────────────────────
Functional Requirements:  [N] MUST · [N] SHOULD · [N] COULD
Non-functional:           [N]
User stories:             [N] ([N] MUST FRs covered)
North Star KPI:           [value]
JTBD:                     [statement]

Seed-input provenance:    [N] confirmed · [N] assumed
  Assumed (confirm before approving):
    - [field]: [why assumed — what to ask the owner]
  (omit this block if all five are confirmed)

No-go zone ([N] items):
  - [item 1]
  - [item 2]
  (list all)

Assumptions flagged: [N] — review before approving
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 1   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} 1
```

## Human Review — Before approving phase 1
  [ ] idea_provenance reflects reality — every "confirmed" field was actually confirmed by you, not the agent's guess
  [ ] Every "assumed" Tier-A field is one you accept proceeding on (or correct it and re-run)
  [ ] no_go_zone has ≥3 explicit, specific items (not generic filler)
  [ ] Every MUST FR has type AND at least one acceptance_criteria with a concrete metric
  [ ] acceptance_criteria for UX/visual/audio FRs contain real measurements (px, ms, %, fps)
  [ ] user_personas reflect real users — not "general user" — with a real goal and pain_point
  [ ] No FR invents scope beyond what the input artifact (IDEA.md on first run, or 01_REQUIREMENTS.json on re-run) implies
  [ ] North Star KPI, JTBD, and guardrail metric are identified in project_summary
  [ ] Operational NFRs covered: observability, CI/CD, security, healthcheck — or explicitly declared "not applicable" with reason
  [ ] Security applicability decided explicitly — a security NFR exists, OR a one-line reason states why security does not apply (never left unaddressed by omission)
