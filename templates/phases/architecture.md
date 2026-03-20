# Phase 2 — System Architecture

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

{{#IF_UX_SPEC}}
## UX/UI Specification (01_UX_SPEC.md — read-only context)
{{UX_SPEC}}
{{/IF_UX_SPEC}}

## Output: `{{ARTIFACTS_BASE}}/02_SYSTEM_DESIGN.md`
Required sections — use these EXACT names as `##` level-2 headers (aitri complete 2 validates by exact match):
1. `## Executive Summary` — tech choices with justification
2. `## System Architecture` — ASCII/Mermaid diagram + components
3. `## Data Model` — schema with field constraints; for frontend-only apps: localStorage/file structure
4. `## API Design` — for backend apps: all endpoints (method, path, auth, request/response, errors); for frontend-only apps: internal module/package API (exported function and class signatures in the language's idiomatic style)
5. `## Security Design` — auth, input validation, security headers, XSS/injection mitigations
6. `## Performance & Scalability` — caching, query optimization, size bounds
7. `## Deployment Architecture` — environments, containers, CI/CD
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
  An empty section or missing section is rejected by aitri complete 2.

## Architectural Decision Records (ADRs)
For every significant tech choice, write an ADR using this format:

  ADR-XX: <title>
  Context: <why this decision is needed>
  Option A: <name> — <tradeoffs>
  Option B: <name> — <tradeoffs>
  Decision: <chosen option> — <reason>
  Consequences: <what this enables, what it constrains>

Minimum ADRs required: database choice, frontend framework/approach, state management, deployment target.
Rule: each ADR must evaluate ≥2 options. An ADR with a single option is rejected.

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
7. Run: aitri complete 2

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
Next: aitri complete 2   →   aitri approve 2
```

## Human Review — Before approving phase 2
  [ ] All 9 required sections are present with exact header names (Executive Summary, System Architecture, Data Model, API Design, Security Design, Performance & Scalability, Deployment Architecture, Risk Analysis, Technical Risk Flags)
  [ ] Technical Risk Flags: read each [RISK] flag — do you accept the mitigation proposed? If severity is critical or high, have a plan before proceeding
  [ ] Tech stack is compatible with constraints and technology_preferences from requirements
  [ ] Every significant decision has an ADR with ≥2 options evaluated
  [ ] Data model covers all persistence FRs
  [ ] API design covers all integration and logic FRs
  [ ] no_go_zone items from Phase 1 are NOT introduced in the architecture
  [ ] Failure blast radius documented for at least 2 critical components
