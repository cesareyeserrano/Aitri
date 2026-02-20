# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(none)_

## 🟡 In Progress

_(none)_

## 🔴 Done

- **[EVO-009] Enhancement: Version-Aware Project Migration (`aitri upgrade` v2)**
    - **Status:** DONE. `semverLt()`, `readProjectVersion()`, `readAppliedMigrations()`, `stampProjectVersion()` added to `upgrade.js`. `sinceVersion` field on migrations. `NOTIFY-NEW-COMMANDS-0.5.0` (atomic, writes `docs/UPGRADE-NOTES-v0.5.0.md`). Idempotent via `migrationsApplied` in `project.json`. 142/142 green.

- **[EVO-008] Feature: Project Adoption (`aitri adopt`) — All Phases DONE**
    - **Status:** DONE.
    - Phase 1 (`quick`): stack detection (node/python/go/rust/java), folder conventions, entry points, test file count, README, gap analysis, `docs/adoption-manifest.json`, proposed `aitri.config.json`. `--dry-run` supported. NEVER modifies source files.
    - Phase 2 (`standard`): LLM infers top 1–3 features → `specs/drafts/<feature>.md` (DRAFT) + `docs/discovery/<feature>.md`. Bounded context (README + entry point). Never overwrites approved specs. Graceful errors.
    - Phase 3 (`deep`): Scans existing test files; extracts test names (node/python/go patterns); builds `tests/<feature>/tests.md` with TC-* stubs and Trace placeholders; writes verified `aitri.config.json` if path overrides needed. Requires at least one approved spec.
    - Exports: `writeDraftSpec`, `writeDiscoveryDoc`, `extractTestNames`, `buildTestsMapping`, `writeTestsMapping`, `buildVerifiedConfig`.
    - 16 regression tests (5 Phase 1 + 4 Phase 2 + 7 Phase 3). 158/158 green.

- **[EVO-004] Doc: Vision Alignment Update**
    - **Status:** DONE. `docs/architecture.md` reframed for agent-centric workflow. `GETTING_STARTED.md` updated with Auditor Mode section. `docs/guides/AGENT_INTEGRATION_GUIDE.md` created.

- **[EVO-006] Scaffold: Automated Contract-Test Linkage**
    - **Status:** DONE. `parseTestCases` extracts FR-* refs; `buildContractImports` generates per-stack import statements. Templates updated with `{{CONTRACT_IMPORT}}`. 5 unit tests. 142/142 green.

- **[EVO-003] Architecture: State-Aware Context Engine**
    - **Status:** DONE. `aitri diff --feature <name> --proposed <file>` implemented. 4 regression tests. 137/137 green.

- **[EVO-001] Refactor: Auditor Mode for Content Generator**
    - **Phase 1 DONE:** `auditBacklog()`, `auditTests()`, `auditAgentContent()` exported. 8 unit tests.
    - **Phase 2 DONE:** `--ai-backlog` + `--ai-tests` flags in `aitri plan`. 2 regression tests. 133/133 green.
    - **Phase 3 DONE:** `inferBenefit`, `inferCapability`, `normalizeActor`, `toGherkin`, `fallbackActor` marked `@deprecated`. Legacy path documented in `generatePlanArtifacts`. 133/133 green.

- **[EVO-002] Feature: Semantic Validation Gate**
    - **Source:** docs/feedback/ARCHITECTURAL_FEEDBACK.md#1.2
    - **Status:** DONE. `aitri verify-intent` implemented. 4 regression tests. 123/123 green.

- **[EVO-007] Parser: Flexible Spec Heading Numbering**
    - **Source:** docs/feedback/TEST_DRIVE_FEEDBACK.md#1.2
    - **Status:** DONE. approve.js matches sections by name, number prefix optional. 119/119 green.

- **[EVO-005] Scanner Robustness: Relax TC Marker Regex**
    - **Source:** docs/feedback/TEST_DRIVE_FEEDBACK.md#1.3
    - **Priority:** High
    - **Context:** Allow `// TC-1` without mandatory colon.
    - **Status:** DONE. Verified with smoke tests.

- **[EVO-META] Self-Evolution System: Relay Protocol**
    - **Source:** User Feedback (Session 2026-02-18)
    - **Priority:** Critical
    - **Context:** Implement Checkpoint & Backlog for zero context-loss between agent sessions.
    - **Status:** DONE. `aitri checkpoint` command implemented. 119/119 tests green.
