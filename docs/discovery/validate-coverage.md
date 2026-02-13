# Discovery: validate-coverage

STATUS: DRAFT

## 1. Problem Statement
Derived from approved spec:

---

# AF-SPEC: validate-coverage

STATUS: APPROVED
## 1. Context
Aitri currently validates structural traceability (presence of IDs like FR-*, US-*, TC-*), but it does not enforce coverage consistency between spec, backlog, and tests.

We need stronger coverage validation to prevent partially implemented or untested Functional Rules from reaching implementation phase.

---

## 2. Actors
- Product Owner
- Developer
- QA Engineer
- AI Agent (Codex / Claude using Aitri)

## 3. Functional Rules (traceable)

- FR-1: The `aitri validate` command MUST verify that every Functional Rule (FR-*) defined in the approved spec is referenced by at least one User Story (US-*).
- FR-2: The `aitri validate` command MUST verify that every Functional Rule (FR-*) defined in the approved spec is referenced by at least one Test Case (TC-*).
- FR-3: The command MUST fail validation if any Functional Rule in the approved spec is not referenced in backlog or tests.
- FR-4: The validation output MUST clearly list missing coverage items.

## 4. Edge Cases
- Spec contains no FR-* entries.
- Backlog contains FR references not present in the spec.
- Tests reference non-existent FR IDs.

## 5. Failure Conditions
- Approved spec file is missing.
- Backlog file is missing.
- Tests file is missing.
- Parsing errors when scanning IDs.

## 6. Non-Functional Requirements
- Validation must complete in under 1 second for small/medium projects.
- Output must be human-readable and concise.
- No file modifications should occur during validation.

## 7. Security Considerations
- Validation must not execute arbitrary file content.
- File reads must be restricted to project-local artifacts.
- No external network calls are permitted.

## 8. Out of Scope
- Automatic fixing of missing references.
- Refactoring backlog or tests content automatically.

## 9. Acceptance Criteria (Given/When/Then)

- AC-1: Given an approved spec with FR-1 and FR-2, when only FR-1 is referenced in backlog and tests, then validation fails and reports FR-2 as uncovered.
- AC-2: Given all FR-* entries are referenced in both backlog and tests, when validation runs, then validation passes.
- AC-3: Given missing artifacts (spec/backlog/tests), when validation runs, then validation fails with a clear error message.

---

Now refine: what problem are we solving and why now?

## 2. Scope
### In scope
-

### Out of scope
-

## 3. Actors & User Journeys
Actors:
-

Primary journey:
-

## 4. Architecture (Architect Persona)
- Components:
-
- Data flow:
-
- Key decisions:
-
- Risks:
-

## 5. Security (Security Persona)
- Threats:
-
- Controls required:
-
- Validation rules:
-

## 6. Backlog Outline
Epic:
-

User stories:
1.
2.
3.

## 7. Test Strategy
- Smoke tests:
-
- Functional tests:
-
- Security tests:
-
- Edge cases:
-