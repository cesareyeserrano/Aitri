# Plan: ci-cd-foundation

STATUS: DRAFT

## 1. Intent (from approved spec)
- Retrieval mode: section-level

### Context snapshot
- Aitri currently has a basic CI workflow but no explicit CD/release workflow. The project needs deterministic quality checks on pull requests and a controlled release path for npm publication with traceable safeguards.

### Actors snapshot
- Maintainer: approves releases and manages repository secrets.
- Contributor: opens pull requests and receives CI feedback.
- GitHub Actions: executes CI and release workflows.

### Functional rules snapshot
- On every pull request and push to `main`, CI must run install + smoke tests and fail the run if checks fail.
- CI must validate Aitri CLI behavior via machine-readable commands (`status --json`, `validate --json` on an example fixture).
- Release workflow must execute only on semantic version tags (`vX.Y.Z`).
- Release workflow must rerun quality checks before publish.
- Release workflow must publish the npm package only when authentication token is configured.
- Release workflow must attach a GitHub Release entry for published versions.

### Acceptance criteria snapshot
- Given a pull request, when CI runs, then smoke tests and Aitri JSON validations pass before merge.
- Given a push to `main`, when CI runs, then the same quality checks execute and report status.
- Given tag `vX.Y.Z` and valid `NPM_TOKEN`, when release workflow runs, then package is published to npm.
- Given tag `vX.Y.Z`, when release workflow completes, then a GitHub Release is created for that version.

### Security snapshot
- npm authentication must be handled only through GitHub Actions secrets (`NPM_TOKEN`) and never committed to the repo.
- Release permission scope must be restricted to workflow-required permissions only.
- CD path must require explicit maintainer-controlled tag creation.

### Out-of-scope snapshot
- Multi-environment runtime deployment (staging/production infra).
- Canary or progressive rollout strategies.
- Container image build/publish.

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
- Core rule to preserve: On every pull request and push to `main`, CI must run install + smoke tests and fail the run if checks fail.

### Constraints and dependencies
- Constraints: Constraints to be refined during planning
- Dependencies: Dependencies to be refined during planning

### Success metrics
- Baseline and target to be confirmed in product review

### Key assumptions
- Assumptions pending explicit validation

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
- Address user pain by enforcing: On every pull request and push to `main`, CI must run install + smoke tests and fail the run if checks fail.
- Secondary value from supporting rule: CI must validate Aitri CLI behavior via machine-readable commands (`status --json`, `validate --json` on an example fixture).

### Success metric
- Primary KPI: Baseline and target to be confirmed in product review
- Ship only if metric has baseline and target.

### Assumptions to validate
- Assumptions pending explicit validation
- Validate dependency and constraint impact before implementation start.
- Discovery rigor policy: Before broad implementation, re-run discovery in standard/deep mode if assumptions remain unresolved.

## 5. Architecture (Architect Persona)
### Components
- Client or entry interface for ci-cd-foundation.
- Application service implementing FR traceability.
- Persistence/integration boundary for state and external dependencies.

### Data flow
- Request enters through interface layer.
- Application service validates input, enforces rules, and coordinates dependencies.
- Results are persisted and returned with deterministic error handling.

### Key decisions
- Preserve spec traceability from FR/AC to backlog/tests.
- Keep interfaces explicit to reduce hidden coupling.
- Prefer observable failure modes over silent degradation.

### Risks & mitigations
- Dependency instability risk: add timeouts/retries and fallback behavior.
- Constraint mismatch risk: validate assumptions before rollout.
- Scope drift risk: block changes outside approved spec.

### Observability (logs/metrics/tracing)
- Logs: authentication and error events with correlation IDs.
- Metrics: success rate, latency, and failure-rate by endpoint/use case.
- Tracing: end-to-end request trace across internal and external calls.

## 6. Security (Security Persona)
### Threats
-

### Required controls
-

### Validation rules
-

### Abuse prevention / rate limiting (if applicable)
-

## 7. UX/UI Review (UX/UI Persona, if user-facing)
### Primary user flow
-

### Key states (empty/loading/error/success)
-

### Accessibility baseline
-

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
