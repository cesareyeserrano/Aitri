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

## Your task

Read the project files listed above and produce two files.

---

### File 1: `{{PROJECT_DIR}}/ADOPTION_SCAN.md`

Complete technical audit. The human will read this before running `aitri adopt apply`.

Required sections:

#### Stack
Single line: language · framework · test runner (e.g. "Node.js · Express · Jest")

#### Priority Actions
List in priority order. Rate each: CRITICAL / HIGH / MEDIUM / LOW.
Be specific — name files, patterns, exact gaps.
Example: "CRITICAL: .env committed — add to .gitignore immediately and rotate credentials"
This section comes first so the human sees the most important issues immediately.

#### Technical Health Report

**Code Quality**
- TODO/FIXME/HACK count and what they imply about code maturity
- Rushed code, workarounds, or unresolved design decisions
- Dead code, commented-out blocks, placeholder logic

**Test Health**
- What is tested vs what is not
- Test quality: meaningful assertions or trivial/always-pass?
- Empty or skip-heavy test files and what they imply
- Missing test scenarios for critical paths

**Documentation**
- README completeness: setup, usage, architecture, deployment
- Missing docs: API reference, CONTRIBUTING.md, architecture diagrams
- .env.example: present and complete, partial, or missing
- Inline code documentation: are public APIs documented?

**Security Posture**
- .env files committed to repository (credential exposure risk)
- Hardcoded credential patterns found
- .gitignore gaps that expose sensitive data
- Auth/authorization quality, input validation, rate limiting — present or absent?

**Infrastructure & Operational Readiness**
- Dockerfile quality: multi-stage build? non-root user? HEALTHCHECK?
- CI/CD coverage: what exists, what's missing (lint, test, deploy)?
- Dependency management: lockfile present? deps pinned?
- Health check endpoints, observability, logging

---

### File 2: `{{PROJECT_DIR}}/IDEA.md`

This is the input to Phase 1 (Requirements). The PM agent will read this and produce
`01_REQUIREMENTS.json` defining exactly what stabilization work needs to happen.

Write it as a concrete, specific brief — not a summary of problems, but a description
of the work to be done:

```
# [Project Name] — Adoption Stabilization

## What this project does
[2-3 sentences: what problem it solves, who uses it, what it currently does.
Write as the original author would have described it.]

## Stabilization goals
[Bullet list of specific, concrete things needed to make this project stable,
maintainable, and production-ready. Based on the scan findings.

Be specific — name files, patterns, exact gaps:
  GOOD: "Add unit tests for src/auth.js and src/payment.js — both handle
         critical auth and billing flows with zero test coverage"
  BAD:  "Improve test coverage"

  GOOD: "Remove hardcoded DB password in config/database.js line 12,
         add DATABASE_URL to .env.example and load via process.env"
  BAD:  "Fix security issues"

Only include things that are genuinely necessary for the project to be stable.
Do not invent problems that are not supported by the scan findings.]

## Out of scope
[What is NOT part of this stabilization — product features, new functionality,
performance optimizations that are not blocking stability.]
```

---

## Rules
- ADOPTION_SCAN.md: based on actual signals and code you read — no generic boilerplate
- IDEA.md: stabilization goals must be specific and backed by scan findings
- Save ADOPTION_SCAN.md to: `{{PROJECT_DIR}}/ADOPTION_SCAN.md`
- Save IDEA.md to: `{{PROJECT_DIR}}/IDEA.md`
- Do NOT create any other files

## Instructions
1. Read the key files in the File Structure above (entry points, routes, models, tests, config)
2. Analyze the pre-scanned Technical Health Signals
3. Produce ADOPTION_SCAN.md (complete diagnostic with Priority Actions first)
4. Produce IDEA.md (specific stabilization brief for Phase 1)
5. Tell the user: "Scan complete. Review ADOPTION_SCAN.md — when ready: aitri adopt apply"
