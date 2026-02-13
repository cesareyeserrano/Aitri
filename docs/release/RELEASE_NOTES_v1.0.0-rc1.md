# Aitri v1.0.0-rc1 Release Notes

## Release Date
2026-02-13

## Summary
`v1.0.0-rc1` marks the first release candidate of Aitri as a stable, CLI-first, spec-driven SDLC core with enforced traceability and supervised execution contracts for human + agent workflows.

## Highlights
- Stable spec-driven core command set:
  - `init`, `draft`, `approve`, `discover`, `plan`, `validate`, `status`
- Machine-readable command output for automation:
  - `status --json`
  - `validate --json`
- Non-interactive execution contract for CI/agents:
  - `--non-interactive`
  - `--yes` for write commands
  - `--feature` for explicit feature targeting
- Consistent exit code model:
  - `0` success
  - `1` error
  - `2` user-aborted action
- Baseline traceability and coverage validation:
  - FR -> US
  - FR -> TC
  - US -> TC
  - placeholder blocking

## Documentation and Governance
- Source-of-truth docs index and anti-drift rules:
  - `docs/README.md`
  - `docs/EXECUTION_GUARDRAILS.md`
- Agent execution contract:
  - `docs/AGENT_EXECUTION_CHECKLIST.md`
- Build/deploy supervised runbook and templates:
  - `docs/runbook/BUILD_DEPLOY_ASSIST_WORKFLOW.md`
  - `docs/templates/deploy/*`
- V1 closeout evidence:
  - `docs/release/V1_CLOSEOUT_RC1.md`

## Personas Included
- Product
- Architect
- Developer
- QA
- Security
- UX/UI (optional for user-facing features)

## Quality and Validation Evidence
- Smoke suite passes (`6/6`):
  - `npm run test:smoke`
- Existing project validation passes on example:
  - `examples/validate-coverage`

## Known Open Item (Non-Blocking RC1)
- Improve coverage report clarity by gap type (tracked in `docs/PROGRESS_CHECKLIST.md`).

## Upgrade Notes
- For CI/agent runs, use non-interactive mode:
  - `aitri <command> --non-interactive --yes ...` (for write commands)
- Use `--feature` for deterministic command targeting.

## Recommended Next Milestone
- Finalize coverage report gap typing and publish final `v1.0.0`.
