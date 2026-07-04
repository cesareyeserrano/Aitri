# Phase 2 — System Architecture

> **Industry document type:** this artifact (`02_SYSTEM_DESIGN.md`) is the project's **Technical Design Document (TRD / SDD)**. Title the document `# Technical Design Document (TRD / SDD)` and call it the TRD when you summarise it to the user.

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

## Requirements (01_REQUIREMENTS.json)
```json
{{REQUIREMENTS_JSON}}
```

{{#IF_PROJECT_SUMMARY}}
## Product intent (project_summary — North Star KPI · JTBD · guardrail metric)
Design the architecture to SERVE these — every load-bearing trade-off (storage, caching, sync model, latency budget) should be justifiable against the North Star and must not violate the guardrail:
```
{{PROJECT_SUMMARY}}
```
{{/IF_PROJECT_SUMMARY}}

## Constraint check — confirm BEFORE designing
The architecture is shaped by constraints that are **expensive to change after the design**. For each category below: if `01_REQUIREMENTS.json` (`constraints` / `technology_preferences`) already states it, **USE it — do NOT re-ask**. If a category is **missing or vague**, confirm it with the user **before** designing, and mark anything you had to assume.
- **Tech stack / languages** · **Infrastructure / hosting** · **Budget / cost** · **Timeline / deadline** · **Existing systems to integrate** · **Security / compliance**

Do not invent a constraint the project did not state — but do not silently design past a missing one either. Just-in-time: confirm the gap now, here, where it bites.

**Adoption audit (if present).** If an `ADOPTION_AUDIT.md` is among the context files (`idea_context/`), this is a change to an existing system: factor its findings — blast radius, risks, what must not break — into the design, and make the preservation contract (Data Model / API Design sections) concrete against them.

{{#IF_UX_SPEC}}
## UX/UI Specification (01_UX_SPEC.md — the approved design your architecture MUST support)
This UX spec is approved — design the system to support it, do not treat it as decoration:
- **Data Model** must hold every entity, field, and state the screens display.
- **API Design** must expose an operation for every user action in the User Flows — no action without a backing endpoint/signature.
- **System Architecture** must account for the interaction patterns the design implies (real-time, offline, optimistic update, pagination).
An architecture that omits a data field or endpoint the UX requires is a design gap — reconcile it here, or raise the conflict in `## Technical Risk Flags`.

{{UX_SPEC}}
{{/IF_UX_SPEC}}
{{CONTEXT_ASSETS}}
## Output: `{{ARTIFACTS_BASE}}/02_SYSTEM_DESIGN.md`
Required sections — use these EXACT names as `##` level-2 headers (aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 2 validates by exact match):
1. `## Executive Summary` — tech choices with justification
2. `## System Architecture` — ASCII/Mermaid diagram + components
3. `## Data Model` — schema with field constraints; for frontend-only apps: localStorage/file structure. For a change to an existing system: the **preservation contract** — the existing schema/data that must NOT change — plus only the delta this work introduces.
4. `## API Design` — for backend apps: all endpoints (method, path, auth, request/response, errors); for frontend-only apps: internal module/package API (exported function and class signatures in the language's idiomatic style). For a change to an existing system: document the **contract being preserved** (the public surface that must stay compatible) and only the endpoints/signatures that change.
5. `## Security Design` — auth, input validation, security headers, XSS/injection mitigations
6. `## Performance & Scalability` — caching, query optimization, size bounds
7. `## Deployment Architecture` — **state the deployment model explicitly** (containerized / binary or native / package or library / serverless / static host); environments; CI/CD. Phase 5 reads this to decide what to package — do NOT default to containers unless the stack and FRs call for them.
8. `## Risk Analysis` — top 3-5 risks + mitigation; ADRs belong here
9. `## Technical Risk Flags` — output of stack × requirements analysis (see instructions below)

## Technical Risk Flag Analysis (MANDATORY)
Before writing any section, analyze the chosen stack against ALL FRs (especially MUST) and ALL NFRs.
Your job here is not to present options — you have already decided. Your job is to surface any technical
incompatibility, performance mismatch, or architectural tension that the human must know before approving.

For each detected risk, write a flag in `## Technical Risk Flags` using this format:

  [RISK] <title>
  Conflict: <FR-id or NFR-id> requires <X>, but <stack component> has <limitation Y>
  Mitigation: <how you address it, or why you accept the risk>
  Severity: critical | high | medium | low

Patterns to actively check — do not skip any:
- Concurrency / real-time NFRs vs. single-threaded or blocking runtimes
- Scale NFRs (users, throughput, latency SLA) vs. chosen DB or runtime characteristics
- Offline-first / PWA FRs vs. server-rendered-only or stateless frameworks
- Compliance FRs (GDPR, HIPAA, SOC2) vs. cloud regions, third-party services, or data residency
- Mobile FRs vs. web-only frameworks
- Full-text search FRs vs. databases without native search
- File storage FRs vs. stateless or ephemeral deployment targets
- High-availability NFRs vs. single-instance databases or no-failover deployments
- Strict latency NFRs vs. ORMs with N+1 query risk or cold-start environments

If after thorough analysis zero incompatibilities exist:
  Write: `None detected — <one sentence justifying why the stack is compatible with all constraints.>`
  `aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 2` mechanically checks: all required sections present, the Technical Risk Flags body is non-empty, and the doc is ≥40 lines. Section depth and a real justification are verified by the human reviewer at approve, not auto-detected — write them in good faith, not to beat the gate.

## Architectural Decision Records (ADRs)
For every significant tech choice, write an ADR using this format:

  ADR-XX: <title>
  Context: <why this decision is needed>
  Option A: <name> — <tradeoffs>
  Option B: <name> — <tradeoffs>
  Decision: <chosen option> — <reason>
  Consequences: <what this enables, what it constrains>

Minimum ADRs: one per significant technology choice the stack ACTUALLY involves — e.g. data storage, UI/frontend approach, state management, deployment target — including ONLY those that apply. (A CLI, library, or embedded project has no frontend ADR; an in-memory tool has no database ADR. Do not invent a decision for a layer the project does not have.)
Rule: each ADR must evaluate ≥2 options — a single-option ADR is not a real decision. (ADR content is human-reviewed at approve; `complete 2` does not parse ADRs, so this is a discipline the reviewer enforces, not the gate. Write them honestly.)

## Failure Blast Radius
For each critical component (database, auth layer, external APIs, background jobs), document:
  - What breaks if this component fails
  - What the user sees (error message, blank screen, stale data, etc.)
  - Recovery path (retry, fallback, manual intervention)

Format:
  Component: <name>
  Blast radius: <what stops working>
  User impact: <what user experiences>
  Recovery: <how system recovers>

## Traceability Checklist
Before completing this phase, verify:
  [ ] Every FR-* in requirements is addressed by at least one component
  [ ] Every NFR-* has a corresponding design decision (caching, rate limiting, TLS, etc.)
  [ ] Every ADR has ≥2 options
  [ ] no_go_zone items from Phase 1 are not present in the architecture
  [ ] Failure blast radius documented for ≥2 critical components
  [ ] Technical Risk Flags section is complete — flags declared or "None detected" with justification

## Rules
- Every FR-* and NFR-* must be addressed
- All tech choices must be justified with specific versions
- Honor the no_go_zone from 01_REQUIREMENTS.json — do not introduce components that were declared out of scope

{{#IF_BEST_PRACTICES}}
{{BEST_PRACTICES}}
{{/IF_BEST_PRACTICES}}

## Instructions
1. Write ADRs for all major tech decisions (≥2 options each)
2. Document failure blast radius for critical components
3. Verify traceability checklist before saving
4. Generate complete 02_SYSTEM_DESIGN.md
5. Save to: {{ARTIFACTS_BASE}}/02_SYSTEM_DESIGN.md
6. Present the Delivery Summary below to the user
7. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 2

## Delivery Summary
After saving 02_SYSTEM_DESIGN.md, present this report to the user:

```
─── Phase 2 Complete — System Architecture ───────────────────
Stack:      [frontend] · [backend] · [database] · [infra]

ADRs ([N] decisions):
  - [decision title 1] → chose [option]
  - [decision title 2] → chose [option]
  (list all)

Data model:  [N] entities — [list names]
API:         [N] endpoints — [list key ones]
Security:    [auth method] · [key controls]

Technical Risk Flags: [N flags | "None detected"]
  - [flag title] — severity: [critical|high|medium|low]
  (list all; "None detected" only if stack is fully compatible)

Top risks:
  - [risk 1]
  - [risk 2]
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 2   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} 2
```

## Optional — adversarial pass before you report the design done
Before you report this design complete, if your environment supports independent subagents, consider spawning one told to **refute** the design you just wrote — not to validate it. Point it at 02_SYSTEM_DESIGN.md plus the requirements, with these attack vectors: find the MUST FR that has no home in any component or flow (join every FR to the design element that realizes it — the one with no join is the dropped one); the unstated assumption the design silently depends on (an implicit data shape, an implicit service, an implicit scale); the contradiction with the UX spec or a context asset; the NFR promise (latency, security, availability) the design never answers; the invented constraint — a technology or pattern no FR/NFR asked for. **Self-review shares the blind spot that wrote the design; an independent pass does not.** Then verify the adversary's load-bearing claims against the actual documents yourself before acting on them. This costs extra tokens and is the operator's call: skip it for a trivial design, but do not skip it when the design carries real blast-radius (many MUST FRs, security surface, a stack decision that is expensive to reverse). Advisory — Aitri cannot run or gate on it; a design defect caught here costs a markdown edit, the same defect caught at build costs a re-implementation.

## Human Review — Before approving phase 2
  [ ] All 9 required sections are present with exact header names (Executive Summary, System Architecture, Data Model, API Design, Security Design, Performance & Scalability, Deployment Architecture, Risk Analysis, Technical Risk Flags)
  [ ] Technical Risk Flags: read each [RISK] flag — do you accept the mitigation proposed? If severity is critical or high, have a plan before proceeding
  [ ] Tech stack is compatible with constraints and technology_preferences from requirements
  [ ] Every significant decision has an ADR with ≥2 options evaluated
  [ ] Data model covers all persistence FRs
  [ ] API design covers all integration and logic FRs
  [ ] no_go_zone items from Phase 1 are NOT introduced in the architecture
  [ ] Failure blast radius documented for at least 2 critical components
