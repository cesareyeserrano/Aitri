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
- Requirement source integrity before generation: user provides requirements, Aitri structures/validates

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
Status: COMPLETE (stabilization remediation closed)
- runtime verification loop delivered (`aitri verify`)
- brownfield mapping delivered (`aitri.config.json`)
- managed-go policy checks delivered (deterministic scan model)
- confidence score delivered in `status` output (weighted spec/runtime model)
- static insight UI delivered (`status --ui`)
- section-level retrieval delivered for discover/plan
- optional semantic-lite retrieval delivered for advanced mode
- command modularization delivered for discovery/plan/validate/runtime/persona flows
- command modularization completed for verify/policy/resume/handoff/go flows
- smoke suite modularization delivered (domain-focused split under `tests/smoke/cli-smoke-*.test.mjs`)
- file-growth budgets and warning/block policy defined (`check:file-growth` + strict mode)
- E2E audit findings documented (`docs/feedback/AUDITORIA_E2E_2026-02-16.md`)
- production-quality feedback assessment documented (`docs/feedback/PRODUCTION_QUALITY_FEEDBACK_ASSESSMENT_2026-02-16.md`)
- 0.2.24 feedback closure documented with impact/severity/value matrix (`docs/feedback/AITRI_0.2.24_FEEDBACK_CLOSURE_2026-02-17.md`)

## Critical Stabilization Window (Post-Audit: 2026-02-16)
Status: CLOSED (2026-02-16)

Execution rule:
- No new feature work until critical findings are verified as closed.
- Critical closure gate: H-001, H-002, H-003.
- Source of truth for findings: `docs/feedback/AUDITORIA_E2E_2026-02-16.md`.
- Source of truth for remediation tasks: `backlog/aitri-core/backlog.md` (Epic 11).
- Source of truth for gate status/owners/target dates: `docs/quality/STABILIZATION_RELEASE_GATE_2026-02-16.md`.

Priority remediation order:
1. H-001: Path traversal via `--feature` (write containment breach)
2. H-002: `validate` passes without `discovery`/`plan` (persona gate bypass)
3. H-003: `go` allowed outside git when policy drift checks are limited
4. H-004: `status` feature ambiguity in multi-feature repositories
5. H-005: `verify` shell execution surface without timeout guard
6. H-006: retrieval-mode inconsistency in generated plan docs

## Phase G: Production Quality Hardening (Post-Stabilization)
Status: COMPLETE (baseline delivered for Q-001/Q-002/Q-003)
- domain-aware quality profiles for web/game/cli flows (with explicit override contract)
- asset strategy baseline to avoid low-fidelity "toy output" defaults
- stronger user-story/AC quality gates (specific actor + Given/When/Then contract)
- runtime hardening follow-up for `verify` execution semantics
- brownfield extensions deferred (baseline sufficient)

## Phase H: Software Factory Transformation
Status: IN PROGRESS

### Purpose
Transform Aitri from a governance/documentation engine into a complete software factory with closed delivery cycle. The factory produces functional, verified software — not just documentation artifacts.

### Factory Model
- Aitri = plant engineer (directs, validates, certifies)
- AI agents (Claude, Codex, OpenCode) = workers (implement following Aitri's briefs)
- Closed cycle: `idea → spec → plan → scaffold → implement → verify → deliver`

### Sub-Phase H.1: Real Content Generation (eliminate placeholders)
Status: PENDING
Dependency: None (foundational)
Scope:
- New module `spec-parser.js`: extract structured data from approved spec (actors, FRs, ACs, edge cases, tech stack)
- New module `content-generator.js`: generate concrete backlogs and tests from parsed spec data
- Modify `discovery-plan-validate.js`: replace placeholder templates with real content generation
- Backlogs generated with real actors, real FR traces, concrete Given/When/Then from ACs
- Tests generated with concrete TC cases derived from ACs, edge cases, and security notes
- Architecture section uses detected tech stack and quality domain for specific components

Closure criteria:
- `aitri plan` produces backlog with zero `FR-?`, `AC-?`, `<actor>` placeholders
- Generated stories use actors from the approved spec
- Generated TCs have concrete Given/When/Then from spec ACs
- Architecture section names real components based on detected stack

### Sub-Phase H.2: Scaffold Post-Go
Status: PENDING
Dependency: H.1 (spec-parser.js)
Scope:
- New module `scaffold.js`: generate project structure, executable test stubs, interface contracts
- New scaffold templates in `core/templates/scaffold/` per tech stack
- New CLI command `aitri scaffold` (gated: requires `go` completion)
- Config extension for scaffold output paths

Closure criteria:
- `aitri scaffold` generates project directory structure matching plan architecture
- Executable test stubs exist for each TC-* with correct framework (node:test, pytest, go test)
- Interface stubs exist for each FR with function signatures and JSDoc/docstring traceability
- Base config files generated matching detected tech stack
- Command blocked if `go` has not been completed

### Sub-Phase H.3: Implementation Orchestration
Status: PENDING
Dependency: H.1, H.2
Scope:
- New module `implement.js`: generate per-story implementation briefs for AI agents
- Dependency ordering logic (topological sort from plan notes + heuristic)
- Output: per-US brief markdown + master IMPLEMENTATION_ORDER.md
- Adapter SKILL.md updates with post-go workflow

Closure criteria:
- `aitri implement` generates one brief per US-* with complete context
- Briefs include scaffold references, TC references, contract constraints, quality constraints
- IMPLEMENTATION_ORDER.md lists stories in correct dependency order
- Adapter SKILL.md files document full factory workflow

### Sub-Phase H.4: Closed-Loop Verification
Status: PENDING
Dependency: H.2 (tc-scanner needs scaffold)
Scope:
- New module `tc-scanner.js`: scan generated test files for TC-* markers
- Enhance `runtime.js`: add TC mapping, FR coverage, US coverage to verification results
- Enhanced confidence score incorporating TC coverage
- Backward compatible: existing verify behavior preserved when no scaffold exists

Closure criteria:
- `aitri verify` reports which TCs are declared, executable, passing, failing, missing
- FR coverage reported: total vs covered vs uncovered
- US coverage reported: fully verified vs partial vs unverified
- Confidence score incorporates TC coverage data
- Existing verify behavior unchanged for pre-scaffold projects

### Sub-Phase H.5: Delivery Gate
Status: PENDING
Dependency: H.4
Scope:
- New module `deliver.js`: final delivery gate command
- Gates: all FRs covered, all TCs passing, confidence threshold met, policy checks pass, no placeholders
- Output: delivery evidence (JSON + markdown report)
- Config extension for delivery threshold
- Status command extended with post-go states

Closure criteria:
- `aitri deliver` blocks when any FR is uncovered or any TC is failing
- Configurable confidence threshold (default 0.85)
- Delivery report includes FR matrix, TC summary, timeline, confidence score
- Status command reports post-go states (scaffold_pending → implement_pending → verify_pending → deliver_pending)

### Implementation Order
```
H.1 spec-parser.js → content-generator.js → modify discovery-plan-validate.js
  ↓
H.2 scaffold.js + templates → index.js routing → config.js paths
  ↓
H.4 tc-scanner.js → modify runtime.js
  ↓
H.3 implement.js → index.js routing → SKILL.md updates
  ↓
H.5 deliver.js → config.js delivery → status.js new states
```

CI enforcement status:
- Critical-finding gate blocking in CI: ACTIVE (owner: Aitri Core Team (CI/Infra)).
- Current CI enforces smoke + file-growth + critical-gate blocker and publishes stabilization-gate snapshot visibility.
- Blocking behavior is implemented via `scripts/check-critical-gate.mjs`.

## Next Targets (v1.0.x)
1. Complete Phase H: Software Factory Transformation (closed delivery cycle).
2. Eliminate all placeholder content in generated artifacts (real actors, real FRs, real TCs).
3. Deliver scaffold command that produces executable project skeletons.
4. Deliver implement command that generates AI-agent-ready implementation briefs.
5. Close verification loop: TC-to-executable mapping with FR coverage reporting.
6. Deliver gate command that certifies readiness with confidence threshold.
7. Update all adapter SKILL.md files with complete factory workflow.
8. Continue modularization for heavyweight report surfaces under bounded modules.
9. Maintain and tune integrated file-growth checks in CI as core files evolve.

## Maintainability Watchlist (Baseline: 2026-02-16)

### Existing files
- `cli/index.js`: 798 lines (budget: soft 850, hard 1000)
- `cli/commands/runtime-flow.js`: 311 lines (budget: soft 450, hard 650)
- `cli/commands/status.js`: 926 lines (budget: soft 900, hard 1200)
- `cli/commands/discovery-plan-validate.js`: 865 lines (budget: soft 800, hard 1000)
- `tests/smoke/cli-smoke-workflow.test.mjs`: 562 lines (budget: soft 550, hard 700)
- `tests/smoke/cli-smoke-runtime-policy.test.mjs`: 398 lines (budget: soft 400, hard 550)
- `tests/smoke/cli-smoke-validation.test.mjs`: 491 lines (budget: soft 350, hard 500)
- `tests/smoke/cli-smoke-foundation.test.mjs`: 258 lines (budget: soft 350, hard 500)

### New files (Phase H)
- `cli/commands/spec-parser.js`: ~250 lines (budget: soft 300, hard 400)
- `cli/commands/content-generator.js`: ~400 lines (budget: soft 450, hard 600)
- `cli/commands/scaffold.js`: ~500 lines (budget: soft 550, hard 700)
- `cli/commands/implement.js`: ~450 lines (budget: soft 500, hard 650)
- `cli/commands/tc-scanner.js`: ~200 lines (budget: soft 250, hard 350)
- `cli/commands/deliver.js`: ~300 lines (budget: soft 350, hard 500)

Control policy (defined):
- Budget source: `docs/quality/file-size-budgets.json`
- Check command (warn-only): `npm run check:file-growth`
- Check command (strict block): `npm run check:file-growth:strict`
- CI policy implementation (`.github/workflows/aitri.yml`): warning report on soft overruns, blocking gate on hard overruns/invalid entries, explicit rationale required for soft-overrun growth.

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
- Feature-input traversal causing writes outside project boundaries
- False-ready progression due to incomplete validation/runtime context
- "Toy code" output risk when quality constraints are underspecified
- Spec parsing fragility: spec format variations may cause incomplete extraction (mitigation: graceful fallback with explicit "missing" markers)
- Tech stack detection accuracy: keyword matching may misidentify stack (mitigation: `--stack` override flag and interactive confirmation)
- TC-to-test mapping accuracy: depends on comment conventions in generated files (mitigation: scaffold generates standardized TC headers)
- Post-go state machine complexity: 4 new states increase status logic (mitigation: states are linear, reducing combinatorial risk)
- Factory scope creep: risk of Aitri becoming a full IDE/PM suite (mitigation: strict anti-bloat rule, Aitri directs AI agents, does not replace them)

## Decision Rule
If a proposal does not improve at least one of these, defer it:
- traceability
- reliability
- auditability
- controlled execution speed
