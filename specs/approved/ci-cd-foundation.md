# AF-SPEC: CI/CD Foundation

STATUS: APPROVED
## 1. Context
Aitri currently has a basic CI workflow but no explicit CD/release workflow. The project needs deterministic quality checks on pull requests and a controlled release path for npm publication with traceable safeguards.

## 2. Actors
- Maintainer: approves releases and manages repository secrets.
- Contributor: opens pull requests and receives CI feedback.
- GitHub Actions: executes CI and release workflows.
- npm registry: receives published package artifacts.

## 3. Functional Rules (traceable)
- FR-1: On every pull request and push to `main`, CI must run install + smoke tests and fail the run if checks fail.
- FR-2: CI must validate Aitri CLI behavior via machine-readable commands (`status --json`, `validate --json` on an example fixture).
- FR-3: Release workflow must execute only on semantic version tags (`vX.Y.Z`).
- FR-4: Release workflow must rerun quality checks before publish.
- FR-5: Release workflow must publish the npm package only when authentication token is configured.
- FR-6: Release workflow must attach a GitHub Release entry for published versions.

## 4. Edge Cases
- npm token missing in repository secrets.
- Tag exists but does not match semantic version format.
- Transient npm publish conflicts (version already published).
- Smoke tests pass but example validation fails.

## 5. Failure Conditions
- Any CI check step fails.
- `aitri validate --json` fails in the example project.
- npm publish command exits non-zero.
- Release artifact creation fails.

## 6. Non-Functional Requirements
- Deterministic execution on `ubuntu-latest` with pinned Node major version.
- Fast feedback on PRs (single CI job baseline).
- Machine-readable CLI outputs in CI logs.
- Minimal release blast radius via tag-based triggering.

## 7. Security Considerations
- npm authentication must be handled only through GitHub Actions secrets (`NPM_TOKEN`) and never committed to the repo.
- Release permission scope must be restricted to workflow-required permissions only.
- CD path must require explicit maintainer-controlled tag creation.

## 8. Out of Scope
- Multi-environment runtime deployment (staging/production infra).
- Canary or progressive rollout strategies.
- Container image build/publish.

## 9. Acceptance Criteria (Given/When/Then)
- AC-1: Given a pull request, when CI runs, then smoke tests and Aitri JSON validations pass before merge.
- AC-2: Given a push to `main`, when CI runs, then the same quality checks execute and report status.
- AC-3: Given tag `vX.Y.Z` and valid `NPM_TOKEN`, when release workflow runs, then package is published to npm.
- AC-4: Given tag `vX.Y.Z`, when release workflow completes, then a GitHub Release is created for that version.
