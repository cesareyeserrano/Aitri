# Aitri Adopt Scan — Project Analysis

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

## Project: `{{PROJECT_DIR}}`

### File Structure
```
{{FILE_TREE}}
```

{{#IF_PKG_JSON}}
### package.json
```json
{{PKG_JSON}}
```
{{/IF_PKG_JSON}}

{{#IF_README}}
### README
{{README}}
{{/IF_README}}

{{#IF_TEST_SUMMARY}}
### Test Files Found
{{TEST_SUMMARY}}
{{/IF_TEST_SUMMARY}}

---

## Technical Health Signals (pre-scanned)

### Code Quality Markers (TODO/FIXME/HACK)
{{CODE_QUALITY}}

### .gitignore Coverage
{{GITIGNORE}}

### Environment & Secrets
{{ENV_FILES}}

### Hardcoded Credential Signals
{{SECRET_SIGNALS}}

### Infrastructure Readiness
{{INFRA}}

### Test Health
{{TEST_HEALTH}}

---

## Output: `{{PROJECT_DIR}}/ADOPTION_PLAN.md`
Required sections (in order):

### 1. ## Project Summary
One to three paragraphs: what problem this solves, who uses it, what it does.
This becomes the project's IDEA.md — write it as the original author would have described the idea.

### 2. ## Stack
Single line: language · framework · test runner (e.g. "Go · HTMX · go test")

### 3. ## Inferred Artifacts
For each Aitri artifact, mark [x] if you can produce it from existing code, [ ] if not:
```
- [x] 01_REQUIREMENTS.json      — <one-line reason>
- [x] 02_SYSTEM_DESIGN.md       — <one-line reason>
- [ ] 03_TEST_CASES.json         — <one-line reason it's missing>
- [ ] 04_IMPLEMENTATION_MANIFEST.json — <one-line reason>
```

### 4. ## Completed Phases
JSON array of phase keys that have inferrable artifacts (numbers 1-5, or "discovery"/"ux"):
```json
["1", "2"]
```
Leave as `[]` if nothing is inferrable.

### 5. ## Gaps
Bullet list of what is missing, ambiguous, or would need manual work. Be specific.

### 6. ## Adoption Decision
Single line: `ready` or `blocked` — one-line reason.
Use `blocked` only if the Project Summary itself cannot be written from available information.

### 7. ## Technical Health Report
Deep technical audit based on the pre-scanned signals above AND your own reading of the code.
Be specific, actionable, and ruthlessly honest. Structure as:

#### Code Quality
- TODO/FIXME/HACK count and what they imply about code maturity
- Evidence of rushed code, workarounds, or unresolved design decisions
- Dead code, commented-out blocks, or placeholder logic

#### Test Health
- Test coverage assessment (what is tested vs what is not)
- Test quality: are assertions meaningful, or are they trivial/always-pass?
- Empty or skip-heavy test files and what they imply
- Missing test scenarios for critical paths

#### Documentation
- README completeness: does it cover setup, usage, architecture, and deployment?
- Missing docs: API reference, DEPLOYMENT.md, CONTRIBUTING.md, architecture diagrams
- .env.example: present and complete, partial, or missing entirely
- Inline code documentation: are public functions/APIs documented?

#### Security Posture
- .env files committed to repository (credential exposure risk)
- Hardcoded credential patterns found
- .gitignore gaps that expose sensitive data
- Authentication/authorization implementation quality (from code reading)
- Input validation, CSRF protection, rate limiting — present or absent?

#### Infrastructure & Operational Readiness
- Dockerfile quality: multi-stage build? non-root user? HEALTHCHECK?
- CI/CD coverage: what pipelines exist, what's missing (lint, test, deploy)?
- Dependency management: lockfile present? deps pinned?
- Health check endpoints, observability, logging

#### Technical Debt Summary
- Top 3-5 most critical debt items with estimated impact
- Risk areas: components most likely to cause production incidents

#### Priority Actions
Rate each action: CRITICAL / HIGH / MEDIUM / LOW
List actions in priority order. Be specific — name files, patterns, exact gaps.
Example: "CRITICAL: .env committed — add to .gitignore immediately and rotate any exposed credentials"

## Rules
- Every [x] artifact must be backed by evidence you actually read — not assumed
- Completed Phases must match the [x] items in Inferred Artifacts exactly
- Technical Health Report must be based on actual signals — not generic boilerplate
- Priority Actions must be specific and actionable — no vague "improve test coverage"
- Do NOT create any other files — only ADOPTION_PLAN.md

## Instructions
1. Read the files listed in File Structure above (focus on entry points, routes, models, tests, config)
2. Analyze the pre-scanned Technical Health Signals above
3. Generate complete ADOPTION_PLAN.md following the format above
4. Save to: {{PROJECT_DIR}}/ADOPTION_PLAN.md
5. Determine entry phase and run the appropriate apply command:

```
Phase N = the first Aitri phase that needs to be run for this project.

  Project has no prior specs or design → aitri adopt apply --from 1
  Project has requirements docs only   → aitri adopt apply --from 2
  Project has requirements + design    → aitri adopt apply --from 3
  Project has code but no formal tests → aitri adopt apply --from 4
  Project has code + tests, needs CI   → aitri adopt apply --from 5

  --from N marks phases 1 through N-1 as completed and enters the pipeline at Phase N.
  ADOPTION_PLAN.md is still used for IDEA.md content — keep it accurate.
```

6. Tell the user which command to run and why (reference the Technical Health findings).
