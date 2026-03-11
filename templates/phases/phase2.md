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

## Output: `{{DIR}}/02_SYSTEM_DESIGN.md`
Required sections — use these EXACT names as `##` level-2 headers (aitri complete 2 validates by exact match):
1. `## Executive Summary` — tech choices with justification
2. `## System Architecture` — ASCII/Mermaid diagram + components
3. `## Data Model` — schema with field constraints; for frontend-only apps: localStorage structure
4. `## API Design` — for backend apps: all endpoints (method, path, auth, request/response, errors); for frontend-only apps: internal JS module API (exported function signatures)
5. `## Security Design` — auth, input validation, security headers, XSS/injection mitigations
6. `## Performance & Scalability` — caching, query optimization, size bounds
7. `## Deployment Architecture` — environments, containers, CI/CD
8. `## Risk Analysis` — top 3-5 risks + mitigation; ADRs belong here

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

## Rules
- Every FR-* and NFR-* must be addressed
- All tech choices must be justified with specific versions
- Honor the no_go_zone from 01_REQUIREMENTS.json — do not introduce components that were declared out of scope

## Instructions
1. Write ADRs for all major tech decisions (≥2 options each)
2. Document failure blast radius for critical components
3. Verify traceability checklist before saving
4. Generate complete 02_SYSTEM_DESIGN.md
5. Save to: {{DIR}}/02_SYSTEM_DESIGN.md
6. Run: aitri complete 2

## Human Review — Before approving phase 2
  [ ] All 8 required sections are present with exact header names (Executive Summary, System Architecture, Data Model, API Design, Security Design, Performance & Scalability, Deployment Architecture, Risk Analysis)
  [ ] Tech stack is compatible with constraints and technology_preferences from requirements
  [ ] Every significant decision has an ADR with ≥2 options evaluated
  [ ] Data model covers all persistence FRs
  [ ] API design covers all integration and logic FRs
  [ ] no_go_zone items from Phase 1 are NOT introduced in the architecture
  [ ] Failure blast radius documented for at least 2 critical components
