# Phase 5 — Deployment

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

## Implementation Manifest
```json
{{MANIFEST_JSON}}
```

## Test Results (source of truth for compliance levels)
```json
{{TEST_RESULTS_JSON}}
```

## Files to create
- {{DIR}}/DEPLOYMENT.md — prerequisites, dev setup, prod deploy, rollback, health checks
- {{DIR}}/Dockerfile — correct base image, multi-stage, non-root user, HEALTHCHECK
- {{DIR}}/docker-compose.yml — all services, ${ENV_VAR} substitution, health checks
- {{DIR}}/.env.example — all required env vars with example values
- {{DIR}}/05_PROOF_OF_COMPLIANCE.json
  REQUIRED fields — validator will reject if any are missing:
    "project":                string  — project name
    "version":                string  — e.g. "1.0.0"
    "phases_completed":       array   — e.g. [1, 2, 3, 4, 5]
    "overall_status":         string  — "compliant" | "partial" | "draft"
    "requirement_compliance": array   — one entry per FR/NFR (see below)
  Each compliance entry: { "id":"FR-001", "title":"...", "level":"...", "evidence":"..." }
  Optional: "technical_debt_inherited": [copy from 04_IMPLEMENTATION_MANIFEST.json]

## Compliance level — assign based on Test Results fr_coverage above:
  covered + zero debt        → "complete" or "production_ready"
  covered + declared debt    → "partial"
  uncovered                  → "functionally_present"
  not implemented at all     → "placeholder"
→ Do NOT default to production_ready. Let test results drive the level.
→ "placeholder" is honest but BLOCKS the pipeline — it forces a real decision before shipping.

## Instructions
1. Create all deployment files
2. Assign compliance level per FR using fr_coverage from Test Results
3. Copy technical_debt from 04_IMPLEMENTATION_MANIFEST.json into technical_debt_inherited
4. Save 05_PROOF_OF_COMPLIANCE.json to: {{DIR}}/05_PROOF_OF_COMPLIANCE.json
5. Run: aitri complete 5
6. Document setup commands in DEPLOYMENT.md — do NOT run npm install or start the app

## Human Review — Before approving phase 5
  [ ] Compliance levels match fr_coverage from test results — no manual upgrades without evidence
  [ ] No FR has compliance level "placeholder" (pipeline blocks if present)
  [ ] technical_debt_inherited copied accurately from Phase 4 manifest
  [ ] Dockerfile present, uses multi-stage build, non-root user, HEALTHCHECK
  [ ] DEPLOYMENT.md includes rollback procedure and health check endpoints
  [ ] overall_status is honest — "compliant" only when all MUST FRs are complete or production_ready
