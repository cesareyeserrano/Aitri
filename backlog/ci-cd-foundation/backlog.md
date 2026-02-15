# Backlog: ci-cd-foundation

## Epics
- EP-1: Deterministic CI quality gate for pull requests and main branch
  - Notes: Standardize deterministic install and CLI JSON validation coverage.
  - Trace: FR-1, FR-2, FR-4, AC-1, AC-2
- EP-2: Controlled release automation for npm and GitHub Release
  - Notes: Tag-gated publish with explicit version guard and secret-based auth.
  - Trace: FR-3, FR-5, FR-6, AC-3, AC-4

## User Stories

### US-1
- As a contributor, I want CI to run deterministic quality checks on pull requests and pushes to `main`, so that broken changes are blocked before merge.
- Trace: FR-1, FR-2, FR-4, AC-1, AC-2
- Acceptance Criteria:
  - Given a pull request, when GitHub Actions runs, then install, smoke tests, and Aitri JSON validation pass for success status.
  - Given a push to `main`, when GitHub Actions runs, then the same checks are executed with identical failure behavior.

### US-2
- As a maintainer, I want a tag-triggered release workflow, so that npm publication and GitHub release creation are controlled and repeatable.
- Trace: FR-3, FR-5, FR-6, AC-3, AC-4
- Acceptance Criteria:
  - Given a `vX.Y.Z` tag and configured `NPM_TOKEN`, when release workflow runs, then package publish succeeds.
  - Given a release run, when publish succeeds, then a GitHub Release is created with generated notes.
