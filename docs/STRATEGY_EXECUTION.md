# Aitri: Execution Strategy

## Strategic Direction
Aitri should remain the practical SDLC operating layer for terminal-based AI coding workflows.

Priority order:
1. Discipline and reliability
2. Traceability and auditability
3. Agent portability and skill packaging
4. Supervised implementation/deployment assistance
5. Optional intelligence upgrades

## Execution Philosophy
- Governance before autonomy
- Determinism before complexity
- Reproducible CLI behavior before integrations
- Human supervision at every irreversible step

## Phase Status

### Phase A: Harden the Core
Status: COMPLETE
- docs/implementation/CI alignment complete
- persona model complete
- command contract stabilized
- discovery persona added and discover interview depth increased
- persona interaction boundaries documented to reduce role overlap

### Phase B: Validation Maturity
Status: COMPLETE (persona-gated baseline)
- FR -> US, FR -> TC, US -> TC checks
- machine-readable validation output
- typed gap reporting in JSON
- persona gates for Discovery/Product/Architect outputs

### Phase C: Agent Runtime Stability
Status: COMPLETE (baseline)
- non-interactive command mode
- consistent exit codes
- smoke tests in CI
- checkpoint/resume protocol documented for session continuity

### Phase D: Supervised Build/Deploy Assistance
Status: COMPLETE (baseline docs)
- runbook and templates defined
- human approval checkpoints documented

### Phase E: Skill Packaging and Distribution
Status: COMPLETE (baseline)
- adapter skills for Codex/Claude/OpenCode
- `agents/openai.yaml` metadata files
- packaging and install guide added
- zero-to-first-run onboarding guide added (global/project/skill)

### Phase F: Strategic Feedback Intake (February 2026)
Status: IN PROGRESS
- runtime verification loop delivered (`aitri verify`)
- brownfield mapping delivered (`aitri.config.json`)
- managed-go policy checks delivered (deterministic scan model)
- confidence score delivered in `status` output (weighted spec/runtime model)
- static insight UI delivered (`status --ui`)
- section-level retrieval delivered for discover/plan
- optional semantic-lite retrieval delivered for advanced mode

## Next Targets (v1.0.x)
1. Deepen discovery-to-plan signal quality and reduce scaffold noise.
2. Split docs into default quick path vs advanced operations path.
3. Improve semantic retrieval quality beyond heuristic matching (optional advanced mode).
4. Control monolith growth in CLI/runtime reporting modules through bounded modularization.
5. Add file-size budgets and CI alerts for uncontrolled growth in core files.

## Maintainability Watchlist (Baseline: 2026-02-15)
- `cli/index.js`: 2409 lines
- `cli/commands/status.js`: 854 lines
- `tests/smoke/cli-smoke.test.mjs`: 1244 lines

Control policy to implement:
- Soft warning threshold: 900 lines per source file.
- Hard warning threshold: 1200 lines per source file.
- Test suite split threshold: 700 lines per test file.
- CI should emit a warning when thresholds are exceeded and require explicit override notes for further growth.

Backlog source of truth:
- `backlog/aitri-core/backlog.md`

## Operating Metrics
- Workflow completion rate (`draft -> validate`)
- Validation failure categories (missing, placeholder, structure, coverage)
- Runtime verification pass rate and stale-verification rate
- Rework rate caused by specification gaps
- Workflow violations caught by gates

## Risk Register
- Scope inflation without discipline value
- Drift between docs and implementation
- Over-automation reducing human control
- Platform-specific behavior divergence across agents

## Decision Rule
If a proposal does not improve at least one of these, defer it:
- traceability
- reliability
- auditability
- controlled execution speed
