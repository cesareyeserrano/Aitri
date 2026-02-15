# Test Cases: ci-cd-foundation

## Functional

### TC-1
- Title: CI workflow enforces deterministic quality checks on pull_request and main push
- Trace: US-1, FR-1, FR-2, FR-4, AC-1, AC-2
- Steps:
  1) Given workflow dispatch on pull request or push to `main`
  2) When job executes `npm ci`, smoke tests, and Aitri JSON checks
  3) Then run succeeds only if all checks pass; otherwise job fails

## Negative / Abuse

### TC-2
- Title: Release workflow fails when tag version does not match package version
- Trace: US-2, FR-3, FR-5
- Steps:
  1) Given tag `vX.Y.Z` where `X.Y.Z` differs from `package.json` version
  2) When release workflow reaches version guard step
  3) Then workflow exits non-zero and publish is not attempted

## Security

### TC-3
- Title: Release publish requires npm token secret
- Trace: US-2, FR-5
- Steps:
  1) Given release workflow without `NPM_TOKEN`
  2) When publish step runs
  3) Then npm authentication fails and package is not published

## Edge Cases

### TC-4
- Title: Semver tag triggers release and creates GitHub release notes
- Trace: US-2, FR-3, FR-6, AC-4
- Steps:
  1) Given valid tag `vX.Y.Z` and successful publish
  2) When release workflow runs `action-gh-release`
  3) Then GitHub Release is created with generated notes for the tag
