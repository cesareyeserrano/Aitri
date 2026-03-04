# Discovery: proof-integrity

STATUS: DRAFT

## 1. Problem Statement
Derived from approved spec retrieval snapshot:
- Retrieval mode: section-level
- Retrieved sections: 1. Context, 2. Actors, 3. Functional Rules, 7. Security Considerations, 8. Out of Scope, 9. Acceptance Criteria

### Context snapshot
- Add detection of trivial contracts — contracts that always return `{ ok: true }` without reading any property of the `input` object — in `aitri prove`, `aitri audit`, and `contractgen` persona task output. A trivial contract makes proof-of-compliance structurally invalid: the test always passes regardless of the real system's behavior.
- Requirement source: provided explicitly by user (EVO-062 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

### Actors snapshot
- Aitri CLI user: runs `aitri prove` and `aitri audit` to verify feature delivery
- AI agent: generates contract implementations via `aitri contractgen`

### Functional rules snapshot
- `aitri prove` must detect contracts that return `{ ok: true }` without reading any property from the `input` parameter and mark those FRs as `trivial_contract` in the proof record.
- `aitri audit` Layer 1 (pipeline compliance) must flag trivial contracts as `HIGH` findings.
- `aitri contractgen` persona task output must include an explicit instruction against trivial contracts.
- `aitri prove` must display `trivial_contract` FRs distinctly in its output — separate from `proven` and `unproven`.

### Security snapshot
- Contract file content is read and regex-tested only — no execution during heuristic check

### Out-of-scope snapshot
- Full AST-based static analysis of contracts
- Detecting other categories of invalid contracts (infinite loops, missing error handling)
- Auto-fixing trivial contracts

Refined problem framing:
- What problem are we solving? Problem stated in approved spec context
- Why now? Acceptance criteria defined in approved spec

## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- Users defined in approved spec

- Jobs to be done:
- Deliver capability described in approved spec

- Current pain:
- Problem stated in approved spec context

- Constraints (business/technical/compliance):
- Constraints identified in approved spec

- Dependencies:
- Dependencies identified in approved spec

- Success metrics:
- Acceptance criteria defined in approved spec

- Assumptions:
- Assumptions embedded in approved spec scope

- Interview mode:
- quick

## 3. Scope
### In scope
- Approved spec functional scope

### Out of scope
- Anything not explicitly stated in approved spec

## 4. Actors & User Journeys
Actors:
- Users defined in approved spec

Primary journey:
- Primary journey derived from approved spec context

## 5. Architecture (Architect Persona)
- Components:
-
- Data flow:
-
- Key decisions:
-
- Risks:
-

## 6. Security (Security Persona)
- Threats:
-
- Controls required:
-
- Validation rules:
-

## 7. Backlog Outline
Epic:
-

User stories:
1.
2.
3.

## 8. Test Strategy
- Smoke tests:
-
- Functional tests:
-
- Security tests:
-
- Edge cases:
-

## 9. Discovery Confidence
- Confidence:
-

- Reason:
-

- Evidence gaps:
-

- Handoff decision:
-
