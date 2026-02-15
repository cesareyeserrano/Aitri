# Maintainability Growth Audit (2026-02-15)

## Scope
This audit identifies files with uncontrolled growth risk and records baseline metrics before modularization work.

## Baseline Metrics (line count)
- `cli/index.js`: 2409
- `tests/smoke/cli-smoke.test.mjs`: 1244
- `cli/commands/status.js`: 854
- `docs/guides/GETTING_STARTED.md`: 279
- `README.md`: 268

## Baseline Metrics (historical churn: added/deleted)
- `cli/index.js`: +2704 / -300
- `tests/smoke/cli-smoke.test.mjs`: +1193 / -0
- `cli/commands/status.js`: +898 / -96

## Risk Assessment
- `cli/index.js`: High risk (single-file command router + feature logic concentration).
- `tests/smoke/cli-smoke.test.mjs`: High risk (slow triage and merge conflicts as new cases accumulate).
- `cli/commands/status.js`: Medium-to-high risk (status, confidence, UI rendering, checkpoint, and verification logic in one file).
- Docs files are growing but currently not in critical-risk range.

## Files That Should Not Continue Growing as Monoliths
- `cli/index.js`
- `tests/smoke/cli-smoke.test.mjs`
- `cli/commands/status.js`

## Planned Controls
- Split command handlers from `cli/index.js` into bounded modules.
- Split smoke tests by domain (`status`, `verify`, `policy`, `workflow`).
- Add growth budgets and CI checks.

Traceability:
- `backlog/aitri-core/backlog.md` -> Epic 10 (`US-19`, `US-20`, `US-21`)
- `docs/PROGRESS_CHECKLIST.md` -> Section 11
