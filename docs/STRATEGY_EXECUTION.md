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

## Reference Alignment
Aitri is inspired by skill-based SDLC systems such as `sdlc-studio`, adapted to a stricter spec-driven CLI contract.

Reference:
- https://github.com/DarrenBenson/sdlc-studio

## Phase Status

### Phase A: Harden the Core
Status: COMPLETE
- docs/implementation/CI alignment complete
- persona model complete
- command contract stabilized
- discovery persona added and discover interview depth increased

### Phase B: Validation Maturity
Status: COMPLETE (baseline)
- FR -> US, FR -> TC, US -> TC checks
- machine-readable validation output
- typed gap reporting in JSON

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

## Next Targets (v1.0.x)
1. Add optional machine-readable `status` gap categorization parity with validate.
2. Add additional regression tests for edge validation cases.
3. Publish `v1.0.0-rc2` or `v1.0.0` based on release confidence.
4. Add onboarding examples for multi-feature repos.

## Operating Metrics
- Workflow completion rate (`draft -> validate`)
- Validation failure categories (missing, placeholder, structure, coverage)
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
