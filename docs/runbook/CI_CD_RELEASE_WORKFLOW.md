# CI/CD and Release Workflow

## Purpose
Define the baseline CI and release process for Aitri and provide a reusable path for projects that adopt Aitri.

## Scope
- Repository-level automation for Aitri itself.
- Manual baseline templates for adopter projects.

## Aitri Repository Workflows
- `.github/workflows/aitri.yml`
  - Triggers: pull request, push to `main`, manual dispatch.
  - Gates: deterministic install, smoke tests, `aitri status --json`, example `aitri validate --json`.
- `.github/workflows/release.yml`
  - Trigger: semantic tags `vX.Y.Z`.
  - Gates: deterministic install, smoke tests, JSON checks, version/tag parity.
  - Publish: npm (`NPM_TOKEN` secret) and GitHub Release notes.

## Maintainer Setup
1. Configure repository secret `NPM_TOKEN` with npm publish permissions.
2. Protect `main`: require pull requests and status checks from CI workflow.
3. Release only through semantic tags matching `package.json` version.

## Release Procedure
1. Update version in `package.json` (for example `0.2.23`).
2. Validate locally:
   - `npm run test:smoke`
   - `npm run demo:5min`
3. Commit and push to `main` through pull request.
4. Create and push tag:
   - `git tag v0.2.23`
   - `git push origin v0.2.23`
5. Confirm release workflow completed:
   - npm package published
   - GitHub Release created

## Adopter Projects (Current Baseline)
Aitri currently documents project CI/CD as a manual baseline.

Use these templates as starting points:
- `docs/templates/ci/github-actions-node-ci.template.yml`
- `docs/templates/ci/github-actions-node-release.template.yml`

Planned improvement:
- Add a dedicated Aitri command to scaffold project-level CI/CD automatically.
