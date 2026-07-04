# Phase 5 — Deployment

> **Industry document type:** this artifact (`05_TRACEABILITY.json`) is the project's **Traceability / Compliance Report**. Call it the traceability report when you summarise it to the user.

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

## Requirements
```json
{{REQUIREMENTS_JSON}}
```

## System Design (architecture + stack)
{{SYSTEM_DESIGN}}

## Build Report
```json
{{MANIFEST_JSON}}
```

## Test Results (source of truth for compliance levels)
```json
{{TEST_RESULTS_JSON}}
```

## Files to create
- {{DIR}}/DEPLOYMENT.md — prerequisites, dev setup, prod deploy, rollback, health checks
- {{DIR}}/.env.example — all required env vars with example values (only if the project uses env vars)
- **Deployment packaging — match the deployment model declared in `02_SYSTEM_DESIGN.md` (`## Deployment Architecture`). Do NOT default to Docker.**
    - Containerized → {{DIR}}/Dockerfile (correct base image, multi-stage, non-root user, HEALTHCHECK) + {{DIR}}/docker-compose.yml (all services, ${ENV_VAR} substitution, health checks)
    - Binary / native → build/release steps documented in DEPLOYMENT.md; no Dockerfile
    - Package / library → publish config (e.g. package manifest, registry metadata); no Dockerfile
    - Serverless → function bundle + infra config for the declared platform
    - Static / host → build output + host config
  → If System Design does not declare containerized deployment, do NOT create Dockerfile/docker-compose.
- {{ARTIFACTS_BASE}}/05_TRACEABILITY.json
  REQUIRED fields — validator will reject if any are missing:
    "project":                string  — project name
    "version":                string  — e.g. "1.0.0"
    "phases_completed":       array   — e.g. [1, 2, 3, 4, 5]
    "overall_status":         string  — EXACTLY one of "compliant" | "partial" | "draft" (the validator rejects anything else). This is the TOP-LEVEL roll-up — do NOT use a per-requirement compliance `level` value here (e.g. "complete"/"production_ready" are levels, not statuses).
    "requirement_compliance": array   — one entry per FR/NFR (see below)
  Each compliance entry: { "id":"FR-001", "title":"...", "level":"...", "evidence":"..." }
  ⚠ Field MUST be "id" — NOT "fr_id". 04_TEST_RESULTS.json uses "fr_id" internally; this file uses "id". Do not copy the field name from test results.
  Optional: "technical_debt_inherited": [copy from 04_BUILD_REPORT.json]

## Compliance level — assign based on Test Results fr_coverage above:
  covered + zero debt        → "complete" or "production_ready"
  covered + declared debt    → "partial"
  uncovered                  → "functionally_present"
  not implemented at all     → "placeholder"
→ Do NOT default to production_ready. Let test results drive the level.
→ "placeholder" is honest but BLOCKS the pipeline — it forces a real decision before shipping.

## CI/CD Verification
If `01_REQUIREMENTS.json` contains a CI/CD NFR:
1. Check if a workflow file exists (`.github/workflows/*.yml` or equivalent CI config)
2. If it exists: read the file and verify — (a) trigger fires on push/pull_request to main branch, (b) installs dependencies, (c) runs the same `test_runner` command declared in the manifest, (d) runs the project's declared e2e runner if one is configured (e.g. invoking `playwright test` when `playwright.config.js` exists, or the equivalent for whatever framework System Design declares)
3. Report any gap as a compliance entry with level "partial" and evidence listing what is missing
4. If the workflow file does not exist and CI/CD NFR is MUST → compliance level is "functionally_present" (pipeline defined but not wired)

## Instructions
1. Create all deployment files
2. Assign compliance level per FR using fr_coverage from Test Results
3. Copy technical_debt from 04_BUILD_REPORT.json into technical_debt_inherited
4. Save 05_TRACEABILITY.json to: {{ARTIFACTS_BASE}}/05_TRACEABILITY.json
5. Document setup commands in DEPLOYMENT.md — do NOT install dependencies or start the app as part of deploy verification
6. Present the Delivery Summary below to the user
7. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 5

## Delivery Summary
After saving all deployment files + 05_TRACEABILITY.json, present this report to the user:

```
─── Phase 5 Complete — Deployment ────────────────────────────
Deployment files:  [list: Dockerfile, docker-compose.yml, DEPLOYMENT.md, etc.]
Overall status:    [compliant | partial | draft]

FR compliance (list the problems FIRST — the body warns against defaulting to production_ready):
  MUST:   [N] placeholder · [N] functionally_present · [N] partial · [N] complete · [N] production_ready
  SHOULD: [N] partial · [N] complete/production_ready
  (list any placeholder FRs — these block the pipeline)

Technical debt inherited: [N] items from Phase 4
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 5   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} 5   →   DONE
```

## Human Review — Before approving phase 5
  [ ] Compliance levels match fr_coverage from test results — no manual upgrades without evidence
  [ ] No FR has compliance level "placeholder" (pipeline blocks if present)
  [ ] technical_debt_inherited copied accurately from Phase 4 manifest
  [ ] Deployment packaging matches the model declared in 02_SYSTEM_DESIGN.md — if containerized: Dockerfile (multi-stage, non-root, HEALTHCHECK) + docker-compose present; if not: the declared artifact (binary/package/serverless/static) is built and documented, and no stray Dockerfile was invented
  [ ] DEPLOYMENT.md includes rollback procedure and health check endpoints
  [ ] overall_status is honest — "compliant" only when all MUST FRs are complete or production_ready
  [ ] If CI/CD NFR exists: workflow file verified — trigger, dependency install, test command, and any declared e2e runner step all checked
