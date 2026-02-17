# Aitri: Progress Checklist

Check items as they are completed to prevent context drift.

## 1) Governance Foundation
- [x] CLI-first model documented
- [x] Spec-driven philosophy documented
- [x] Human supervision contract documented
- [x] Agent operating contract documented
- [x] Execution guardrails documented (anti-drift / anti-impulsive-change)

## 2) Docs vs Implementation Alignment
- [x] Help/README reflect real CLI commands
- [x] Documented flags exist in CLI (or were removed from docs)
- [x] CI uses the real command interface (no invalid assumptions)
- [x] Expected outputs of `status` and `validate` are documented and verified

## 3) SDLC Personas
- [x] Discovery persona complete
- [x] Discovery persona optimized with confidence gate
- [x] Product persona complete
- [x] Architect persona available
- [x] Security persona available
- [x] Developer persona complete
- [x] QA persona complete
- [x] UX/UI persona available (for user-facing features)
- [x] Personas explicitly integrated into templates/flow
- [x] Persona interaction flow documented (role boundaries + multi-pass)

## 4) Validation Quality
- [x] Placeholder blocking baseline
- [x] FR -> US minimum rule
- [x] US -> TC minimum rule
- [x] FR -> TC rule when applicable
- [x] Coverage report clarity by gap type
- [x] Stable machine-readable mode for CI

## 5) Operational Reliability
- [x] Smoke tests for core commands
- [x] Consistent exit codes across all commands
- [x] Non-interactive mode defined for CI/agents
- [x] `status` reliability improved to reduce false positives

## 6) Supervised Build/Deploy Assistance
- [x] Build-assist workflow defined
- [x] Local deployment plan template
- [x] Production-assist deployment plan template
- [x] Rollback/fallback checklist
- [x] Post-deploy evidence documented

## 7) Skill Packaging and Distribution
- [x] Codex skill contract updated
- [x] Claude skill contract updated
- [x] OpenCode skill adapter added
- [x] Agent UI metadata files (`agents/openai.yaml`) included
- [x] Skill packaging/install guide documented

## 8) Ready for V1 Close
- [x] Core stable on new and existing repositories
- [x] Validation reliable in real cases
- [x] Documentation sufficient for continuity without original author
- [x] Agent skills execute flow without bypassing gates

## 9) Adoption Onboarding
- [x] Zero-to-first-run guide published (global + project + skill)
- [x] Skill bootstrap clarified for empty repositories (`resume -> init -> resume`)
- [x] Troubleshooting includes real user-reported setup issues
- [x] Checkpoint and resume protocol documented for abrupt interruptions

## 10) Next Improvement Backlog
- [x] Brutal-feedback findings captured as actionable backlog
- [x] Prioritized epics and user stories documented
- [x] Next-target strategy aligned with backlog source of truth
- [x] Persona output enforcement moved from soft guidance to CLI gates
- [x] Explicit handoff/go commands implemented (`aitri handoff`, `aitri go`)
- [x] Explicit resume shortcut command implemented (`aitri resume`)
- [x] 5-minute reproducible demo path published
- [x] Runtime verification command implemented (`aitri verify`)
- [x] Handoff/go runtime verification gates implemented
- [x] Brownfield path mapping implemented (`aitri.config.json`)
- [x] Managed-go policy checks implemented (dependency/policy drift)
- [x] Static insight UI output available (`aitri status --ui`)
- [x] Confidence score model integrated into status output
- [x] Section-level staged retrieval implemented for discover/plan
- [x] Optional semantic-lite retrieval implemented for advanced large-context workflows

## 11) Maintainability Growth Control
- [x] Split high-complexity `cli/index.js` paths into command-level modules (`discover`, `plan`, `validate`, runtime/persona helper modules)
- [x] Continue modularization for remaining `cli/index.js` command paths (`verify`, `policy`, `handoff`, `go`, `resume`)
- [x] Split `tests/smoke/cli-smoke.test.mjs` into domain-focused smoke suites
- [x] Define and enforce line-count budgets for core source/test files
- [x] Add CI warning/block policy for files over growth thresholds
- [x] Document file-growth dashboard/check report in contributor workflow

## 12) E2E Audit Stabilization (2026-02-16)
- [x] Audit report published with Impacto/Severidad/Valor/Riesgo (`docs/feedback/AUDITORIA_E2E_2026-02-16.md`)
- [x] Strategy updated with stabilization window and no-feature rule (`docs/STRATEGY_EXECUTION.md`)
- [x] Docs index updated with E2E audit reference (`docs/README.md`)
- [x] H-001 closed: block path traversal via `--feature` and enforce write containment
- [x] H-002 closed: `validate` enforces `discovery` + `plan` presence for persona gates
- [x] H-003 closed: `go` blocks or requires explicit override when policy drift checks are limited (non-git)
- [x] H-004 closed: `status --feature` deterministic in multi-feature repositories
- [x] H-005 closed: `verify` execution hardened (timeout/command controls)
- [x] H-006 closed: plan retrieval mode output is consistent
- [x] Critical closure gate complete (H-001/H-002/H-003)
- [x] Post-remediation verification rerun complete (`npm run test:smoke`, `npm run demo:5min`)

## 13) Production Quality Feedback Integration (2026-02-16)
- [x] Feedback assessment documented (`docs/feedback/PRODUCTION_QUALITY_FEEDBACK_ASSESSMENT_2026-02-16.md`)
- [x] Strategy synchronized with post-stabilization quality-hardening phase (`docs/STRATEGY_EXECUTION.md`)
- [x] Backlog synchronized with domain-quality scope (`backlog/aitri-core/backlog.md`)
- [x] Q-001 ready: domain-aware quality profiles defined and testable
- [x] Q-002 ready: asset strategy baseline enforced in planning outputs
- [x] Q-003 ready: story/AC quality contract (specific actor + Gherkin) enforced in validation
- [x] Q-004 ready: `verify` runtime hardening complete
- [x] Q-005 decision closed: brownfield extension accepted/deferred with rationale
- [x] Phase G can start (only after Critical Stabilization Window gate is complete)

## 14) Gate Ownership and CI Closure Controls (2026-02-16)
- [x] Single release gate file published (`docs/quality/STABILIZATION_RELEASE_GATE_2026-02-16.md`)
- [x] Owner and target date assigned for H-001..H-006
- [x] Owner and target date assigned for Q-001..Q-005
- [x] CI workflow publishes stabilization-gate snapshot for visibility
- [x] CI blocker for critical findings active (not only smoke/file-growth)
- [x] Release gate status moved from OPEN to CLOSED with evidence

## 15) Software Factory Transformation (Phase H)

### H.1: Real Content Generation
- [x] `cli/commands/spec-parser.js` created: extracts actors, FRs, ACs, edge cases, tech stack from spec
- [x] `cli/commands/content-generator.js` created: generates concrete backlogs and tests from parsed spec
- [x] `cli/commands/discovery-plan-validate.js` modified: uses content-generator instead of placeholder templates
- [x] `aitri plan` backlog output has zero `FR-?`, `AC-?`, `<actor>` placeholders
- [x] Generated test cases have concrete Given/When/Then from spec ACs
- [x] Architecture section uses detected tech stack for specific component names
- [x] Smoke tests verify real content generation

### H.2: Scaffold Post-Go
- [x] `cli/commands/scaffold.js` created: generates project skeleton and test stubs
- [x] `core/templates/scaffold/` created with per-stack templates
- [x] `aitri scaffold` command routed in `cli/index.js`
- [x] `cli/config.js` extended with scaffold output paths
- [x] Scaffold generates executable test stubs for each TC-* with TC header comments
- [x] Scaffold generates interface stubs for each FR with traceability
- [x] Scaffold generates stack-appropriate config files
- [x] `scaffold` blocked if `go` has not been completed
- [x] Smoke tests verify scaffold generation
- [x] File-growth budgets added for new files

### H.3: Implementation Orchestration
- [x] `cli/commands/implement.js` created: generates per-story briefs
- [x] `aitri implement` command routed in `cli/index.js`
- [x] Implementation briefs include complete context per US-*
- [x] IMPLEMENTATION_ORDER.md generated with dependency-ordered stories
- [x] `adapters/claude/SKILL.md` updated with post-go workflow
- [x] `adapters/codex/SKILL.md` updated with post-go workflow
- [x] `adapters/opencode/SKILL.md` updated with post-go workflow
- [x] Smoke tests verify implementation brief generation

### H.4: Closed-Loop Verification
- [x] `cli/commands/tc-scanner.js` created: maps TC-* markers to test files
- [x] `cli/commands/runtime.js` enhanced: TC mapping, FR/US coverage reporting
- [x] Enhanced verify reports tcCoverage, frCoverage, usCoverage
- [x] Confidence score incorporates TC coverage
- [x] Backward compatible: existing verify unchanged for pre-scaffold projects
- [x] Smoke tests verify TC mapping and coverage reporting

### H.5: Delivery Gate
- [x] `cli/commands/deliver.js` created: final delivery gate
- [x] `aitri deliver` command routed in `cli/index.js`
- [x] `cli/config.js` extended with delivery threshold config
- [x] `cli/commands/status.js` extended with post-go states
- [x] `deliver` blocks when FRs are uncovered or TCs failing
- [x] Delivery report generated (JSON + markdown)
- [x] Status reports post-go states correctly
- [x] Smoke tests verify delivery gate behavior
- [x] Full E2E test: draft → approve → discover → plan → validate → verify → go → scaffold → implement → verify → deliver

## 16) Requirement Source Integrity (2026-02-17)
- [x] Product narrative updated: Aitri transforms user requirements into verified software (not docs-only)
- [x] Non-invention guardrail documented in architecture and execution guardrails
- [x] Draft generation updated to avoid inferred requirement injection in non-interactive guided mode
- [x] Guided draft flow requires explicit user-provided core requirement fields
- [x] Approve gate blocks inferred requirement markers (`Aitri suggestion (auto-applied)`)
- [x] Regression test module added (`tests/regression`)
- [x] Regression script added (`npm run test:regression`)
- [x] CI runs regression suite in addition to smoke suite

## 17) Feedback Closure 0.2.24 (2026-02-17)
- [x] Security hardening: auto-checkpoint command execution moved to argv-based git calls
- [x] Config hardening: unsafe path metacharacters rejected in `aitri.config.json` mapping
- [x] Multi-feature fix: `handoff` and `go` honor explicit `--feature` context
- [x] Init UX improvement: `--project` added and `docs/project.json` generated
- [x] Demo reliability fix: `demo:5min` no longer fails due to unresolved edge placeholders
- [x] Maintainability gate fix: `cli/index.js` reduced below strict hard budget
- [x] Regression coverage added for security/path validation, multi-feature flow, and init project profile
- [x] Feedback closure report published (`docs/feedback/AITRI_0.2.24_FEEDBACK_CLOSURE_2026-02-17.md`)
- [x] Interactive-first guidance restored in onboarding docs; `--non-interactive --yes` reserved for CI/automation only
