# Plan: proof-integrity

STATUS: DRAFT

## 1. Intent (from approved spec)
- Retrieval mode: section-level

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

### Acceptance criteria snapshot
- Given a contract that contains `return { ok: true, fr: "FR-1", input }` without any `input.` property access, when `aitri prove --feature <name>` runs, then that FR appears as `trivial_contract` and proof `ok` is `false`.
- Given a contract that conditionally returns based on `input.somePath`, when `aitri prove` runs, then that FR is NOT flagged as trivial contract.
- Given a proof record with a `trivial_contract` entry, when `aitri audit --feature <name>` runs, then a `[HIGH]` finding appears for that contract.
- Given `aitri contractgen --feature <name>` runs, when the Developer persona task is printed, then the output explicitly states that contracts returning `ok: true` without reading `input` properties are invalid.
- Given `aitri prove` completes with trivial contracts present, when output is displayed, then trivial contract FRs appear under a distinct `[TRIVIAL CONTRACT]` label separate from proven/unproven sections.

### Security snapshot
- Contract file content is read and regex-tested only — no execution during heuristic check

### Out-of-scope snapshot
- Full AST-based static analysis of contracts
- Detecting other categories of invalid contracts (infinite loops, missing error handling)
- Auto-fixing trivial contracts

### Retrieval metadata
- Retrieval mode: section-level
- Retrieved sections: 1. Context, 2. Actors, 3. Functional Rules, 7. Security Considerations, 8. Out of Scope, 9. Acceptance Criteria
- Summary:
-
- Success looks like:
-

## 2. Discovery Review (Discovery Persona)
### Problem framing
- Problem stated in approved spec context
- Core rule to preserve: `aitri prove` must detect contracts that return `{ ok: true }` without reading any property from the `input` parameter and mark those FRs as `trivial_contract` in the proof record. Detection heuristic: the contract function body contains `return { ok: true` and does not contain any reference to `input.` (property access on input) A `trivial_contract` FR is not counted as proven — it is reported separately The proof `ok` field must be `false` if any FR has a `trivial_contract` verdict

### Constraints and dependencies
- Constraints: Constraints identified in approved spec
- Dependencies: Dependencies identified in approved spec

### Success metrics
- Acceptance criteria defined in approved spec

### Key assumptions
- Assumptions embedded in approved spec scope

### Discovery rigor profile
- Discovery interview mode: quick
- Planning policy: Plan a constrained first slice and keep assumptions explicit.
- Follow-up gate: Before broad implementation, re-run discovery in standard/deep mode if assumptions remain unresolved.

## 3. Scope
### In scope
-

### Out of scope
-

## 4. Product Review (Product Persona)
### Business value
- Address user pain by enforcing: `aitri prove` must detect contracts that return `{ ok: true }` without reading any property from the `input` parameter and mark those FRs as `trivial_contract` in the proof record. Detection heuristic: the contract function body contains `return { ok: true` and does not contain any reference to `input.` (property access on input) A `trivial_contract` FR is not counted as proven — it is reported separately The proof `ok` field must be `false` if any FR has a `trivial_contract` verdict
- Secondary value from supporting rule: `aitri audit` Layer 1 (pipeline compliance) must flag trivial contracts as `HIGH` findings. Finding message: `<contract-file> — contract always returns ok:true without reading input (trivial contract — proof invalid)` Triggered when `proof-of-compliance.json` contains any `trivial_contract` entry, or when contract files are scanned directly and match the heuristic

### Success metric
- Primary KPI: Acceptance criteria defined in approved spec
- Ship only if metric has baseline and target.

### Assumptions to validate
- Assumptions embedded in approved spec scope
- Validate dependency and constraint impact before implementation start.
- Discovery rigor policy: Before broad implementation, re-run discovery in standard/deep mode if assumptions remain unresolved.

## 5. Architecture (Architect Persona)
### Components
- CLI command parser
- Command handler service
- Module: proof-integrity-service

### Data flow
- Operator executes command with validated inputs.
- Service layer enforces FR logic and delegates to adapters.
- Result is persisted/emitted with deterministic status and error text.

### Key decisions
- Keep FR to implementation traceability explicit by preserving story and TC identifiers.
- Use Node.js CLI modules aligned with detected stack (Node.js CLI).
- Favor deterministic error paths over silent fallback behavior.

### Risks & mitigations
- Spec-to-code drift risk: enforce FR/US/TC traces in generated artifacts.
- Integration fragility risk: isolate external calls behind adapters with clear contracts.
- Scope drift risk: block changes not linked to approved FR/AC entries.

### Observability (logs/metrics/tracing)
- Structured command logs with feature and story IDs.
- Metrics for command success/failure and runtime duration.
- Trace markers for dependency boundaries.

### Domain quality profile
- Domain: CLI/Automation (cli)
- Stack constraint: Use structured command modules and formatted terminal output (for example chalk/ora or equivalent patterns).
- Forbidden defaults: Unstructured raw console output as final UX baseline.

## 6. Security (Security Persona)
### Threats
- Review spec for domain-specific threat model.
- Derived from spec security section: - Contract file content is read and regex-tested only — no execution during heuristic check

### Required controls
- - Contract file content is read and regex-tested only — no execution during heuristic check

### Validation rules
- Security controls must be verified before delivery gate.

## 7. UX/UI Review (UX/UI Persona, if user-facing)
### Primary user flow
- Flow must be explicit and testable.

### Key states (empty/loading/error/success)
- Define deterministic behavior for empty/loading/error/success states.

### Accessibility baseline
- Keyboard and screen-reader baseline for user-facing interactions.

### Asset and placeholder strategy
- Define output templates/examples and fallback text for non-interactive logs.
- Avoid default primitive-only output when domain requires visual fidelity.

## 8. Backlog
> Create as many epics/stories as needed. Do not impose artificial limits.

### Epics
- Epic 1:
  - Outcome:
  - Notes:
- Epic 2:
  - Outcome:
  - Notes:

### User Stories
For each story include clear Acceptance Criteria (Given/When/Then).

#### Story:
- As a <actor>, I want <capability>, so that <benefit>.
- Acceptance Criteria:
  - Given ..., when ..., then ...
  - Given ..., when ..., then ...

(repeat as needed)

## 9. Test Cases (QA Persona)
> Create as many test cases as needed. Include negative and edge cases.

### Functional
1.
2.

### Negative / Abuse
1.
2.

### Security
1.
2.

### Edge cases
1.
2.

## 10. Implementation Notes (Developer Persona)
- Suggested sequence:
-
- Dependencies:
-
- Rollout / fallback:
-
