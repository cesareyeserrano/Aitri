# Aitri Evolution Backlog

## 🟢 Ready for Implementation

- **[EVO-001] Refactor: Auditor Mode for Content Generator**
    - **Source:** docs/feedback/ARCHITECTURAL_FEEDBACK.md#1.1
    - **Priority:** High
    - **Context:** Decouple rigid logic from CLI. Allow LLM to generate content.
    - **Acceptance:** `content-generator.js` accepts raw JSON from agent instead of hardcoded rules.

- **[EVO-002] Feature: Semantic Validation Gate**
    - **Source:** docs/feedback/ARCHITECTURAL_FEEDBACK.md#1.2
    - **Priority:** Medium
    - **Context:** Add `verify-intent` command to check if US satisfies FR intent using LLM.
    - **Acceptance:** Command exists and calls `ai-client` with spec context.

- **[EVO-003] Architecture: State-Aware Context Engine**
    - **Source:** docs/feedback/ARCHITECTURAL_FEEDBACK.md#1.4
    - **Priority:** Medium
    - **Context:** Manage incremental updates (Backlog Delta).
    - **Acceptance:** Aitri can diff current backlog vs. proposed changes.

- **[EVO-004] Doc: Vision Alignment Update**
    - **Source:** docs/feedback/VISION_ALIGNMENT.md
    - **Priority:** Low
    - **Context:** Update `architecture.md` and guides to reflect "Bolt.new with Discipline" vision.
    - **Acceptance:** Docs reflect agent-centric workflow.

- **[EVO-006] Scaffold: Automated Contract-Test Linkage**
    - **Source:** docs/feedback/TEST_DRIVE_FEEDBACK.md#1.4
    - **Priority:** Medium
    - **Context:** Scaffolded tests should automatically import the relevant contract.
    - **Acceptance:** Tests are ready to implement logic without manual imports.

## 🟡 In Progress

- **[EVO-001] Refactor: Auditor Mode for Content Generator** — Phase 3 pending
    - **Phase 1 DONE:** `auditBacklog()`, `auditTests()`, `auditAgentContent()` exported. 8 unit tests.
    - **Phase 2 DONE:** `--ai-backlog` + `--ai-tests` flags in `aitri plan`. 2 regression tests. 133/133 green.
    - **Phase 3:** Deprecate `infer*` heuristic functions. Mark as legacy. Full agent-authored path.

## 🔴 Done

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
