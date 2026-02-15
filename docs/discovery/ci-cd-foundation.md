# Discovery: ci-cd-foundation

STATUS: DRAFT

## 1. Problem Statement
Derived from approved spec retrieval snapshot:
- Retrieval mode: section-level
- Retrieved sections: 1. Context, 2. Actors, 3. Functional Rules, 7. Security Considerations, 8. Out of Scope, 9. Acceptance Criteria

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

### Security snapshot
- npm authentication must be handled only through GitHub Actions secrets (`NPM_TOKEN`) and never committed to the repo.
- Release permission scope must be restricted to workflow-required permissions only.
- CD path must require explicit maintainer-controlled tag creation.

### Out-of-scope snapshot
- Multi-environment runtime deployment (staging/production infra).
- Canary or progressive rollout strategies.
- Container image build/publish.

Refined problem framing:
- What problem are we solving? Problem stated in approved spec context
- Why now? Baseline and target to be confirmed in product review

## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- Users defined in approved spec

- Jobs to be done:
- Deliver capability described in approved spec

- Current pain:
- Problem stated in approved spec context

- Constraints (business/technical/compliance):
- Constraints to be refined during planning

- Dependencies:
- Dependencies to be refined during planning

- Success metrics:
- Baseline and target to be confirmed in product review

- Assumptions:
- Assumptions pending explicit validation

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
