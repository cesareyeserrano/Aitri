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

### File 1: `{{PROJECT_DIR}}/ADOPTION_AUDIT.md`

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

#### Conventions Observed

The project's established standards — what future code (especially feature increments) should MATCH. Read the actual code and record:
- **UI standards** (if the product has a graphical surface): the design tokens in use (colors, type, spacing — actual values, not impressions), the recurring components and their structure (cards, tables, panels — name them and where they live), layout conventions.
- **Code standards**: module/folder structure, naming conventions, recurring patterns (error handling, data access, state management, API shape).

Two rules keep this section honest:
- **Conventions are standards to follow, NOT defects to copy.** EXCLUDE anything flagged in Priority Actions — a flagged anti-pattern is a defect to fix. If something is both widespread and flagged, it lives under Priority Actions only.
- Record what the code DOES, with file references — not what a style guide claims. An unwritten convention the code follows consistently is exactly what this section exists to capture.

Aitri injects this section into feature sub-pipeline briefings as the parent product's standard when the root project has no approved UX spec — write it so a feature author who has never seen the codebase would build a conforming increment.

---

### File 2: `{{PROJECT_DIR}}/IDEA.md`

This is the input to Phase 1 (Requirements). The PM agent will read this and produce
`01_REQUIREMENTS.json` defining exactly what adoption work needs to happen.

**First, establish the adoption objective.** If `IDEA.md` ALREADY EXISTS, the operator created it
(via `aitri adopt`) to state their objective — treat it as their PURE intent: read it, audit the
code focused on it, and do NOT overwrite or rewrite it (the only file you author here is
ADOPTION_AUDIT.md). If `IDEA.md` does NOT exist: when the operator has stated a specific objective
(a migration, a feature, a refactor, a security fix), frame the brief around achieving THAT, grounded
in the audit above; when there is no specific objective, default to whole-project stabilization (the
Priority Actions become the goals). Say which one it is in the title.

Write it as a concrete, specific brief — not a summary of problems, but a description
of the work to be done:

```
# [Project Name] — Adoption: [the specific objective, e.g. "Migrate auth to v17" — or "Stabilization" if none]

## Problem
[What this adoption sets out to do and why it matters. For a specific objective: what the objective
is and the gap it closes. For stabilization: the critical gaps to fix. Ground it in the scan findings.
2-4 sentences — a coherent statement of the work, not a list of all problems.]

## Target Users
[Who maintains and deploys this project. e.g.: "The development team maintaining
and deploying [project name]. Primarily developers contributing to the codebase
and operators running it in production."]

## Business Rules
[Constraints that bound the work. Derive from scan findings and the objective.
Examples:
  - Must not break existing functionality or passing tests
  - For stabilization: no new product features — stabilization only
  - For a specific objective: list what must NOT break while pursuing it (each becomes a regression boundary in Phase 1)
  - Env vars must use [pattern found in project] — no hardcoded values
  - [Any specific constraint from the project's deployment or security model]]

## Success Criteria
[Specific, verifiable outcomes. Based on Priority Actions from ADOPTION_AUDIT.md.
Be specific — name files and patterns:
  GOOD: "All Priority Actions marked HIGH in ADOPTION_AUDIT.md are resolved:
         .env.example exists with all 5 required vars; go vet runs in CI"
  BAD:  "Project is stable"

  GOOD: "src/auth.js and src/payment.js have unit tests covering critical paths"
  BAD:  "Test coverage improved"

Only include criteria that are directly verifiable from the scan findings.]
```

---

## Rules
- ADOPTION_AUDIT.md: based on actual signals and code you read — no generic boilerplate
- IDEA.md: adoption goals must be specific and backed by scan findings
- Save ADOPTION_AUDIT.md to: `{{PROJECT_DIR}}/ADOPTION_AUDIT.md`
- Save IDEA.md to `{{PROJECT_DIR}}/IDEA.md` ONLY if it does not already exist — never overwrite the operator's objective
- Do NOT create any other files

## Instructions
1. Read the key files in the File Structure above (entry points, routes, models, tests, config)
2. Analyze the pre-scanned Technical Health Signals
3. Produce ADOPTION_AUDIT.md (complete diagnostic with Priority Actions first)
4. Produce IDEA.md (specific adoption brief for Phase 1) — unless it already exists, then leave it as-is (it is the operator's objective)
5. Tell the user: "Scan complete. Review ADOPTION_AUDIT.md — when ready: aitri adopt apply"
