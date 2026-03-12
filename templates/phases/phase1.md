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
- Min 3 NFRs
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
5. Run: aitri complete 1

## Human Review — Before approving phase 1
  [ ] no_go_zone has ≥3 explicit, specific items (not generic filler)
  [ ] Every MUST FR has type AND at least one acceptance_criteria with a concrete metric
  [ ] acceptance_criteria for UX/visual/audio FRs contain real measurements (px, ms, %, fps)
  [ ] user_personas reflect real users — not "general user" — with a real goal and pain_point
  [ ] No FR invents scope beyond what IDEA.md implies
  [ ] North Star KPI, JTBD, and guardrail metric are identified in project_summary
