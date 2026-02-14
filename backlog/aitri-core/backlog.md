# Backlog: aitri-core-next

## Epic 1: Enforce Persona Outputs in Engine
- Objective:
  - Reduce dependence on agent discipline by enforcing persona contracts through CLI behavior.

### US-1 [DONE]
- As a maintainer, I want persona-required sections validated in generated artifacts, so that outputs are consistent without manual policing.
- Trace: FR-1, AC-1

### US-2 [DONE]
- As a maintainer, I want missing critical persona outputs to block progression to next command, so that weak artifacts do not pass silently.
- Trace: FR-1, AC-2

## Epic 2: Stronger Discovery and Planning Signal
- Objective:
  - Increase depth and quality of generated discovery/plan artifacts.

### US-3 [DONE]
- As a user, I want discovery interviews to collect deeper contextual evidence, so that plan quality improves from first pass.
- Trace: FR-2, AC-3

### US-4
- As a user, I want plan outputs to minimize generic scaffold text, so that artifacts are immediately actionable.
- Trace: FR-2, AC-4

## Epic 3: Clear Handoff to Implementation
- Objective:
  - Remove ambiguity after `ready_for_human_approval`.

### US-5
- As a user, I want a short explicit command-level handoff mode, so that transition to implementation is unambiguous.
- Trace: FR-3, AC-5

### US-6
- As a user, I want a short resume mode for new sessions, so that continuation starts from the correct checkpoint with minimal prompt text.
- Trace: FR-3, AC-6

## Epic 4: Product Proof and Adoption
- Objective:
  - Improve perceived professionalism and practical trust quickly.

### US-7 [DONE]
- As a new adopter, I want a 5-minute reproducible demo that shows value end-to-end, so that I can evaluate Aitri fast.
- Trace: FR-4, AC-7

### US-8
- As a team lead, I want a default path vs advanced path docs split, so that onboarding is short while advanced depth remains available.
- Trace: FR-4, AC-8

## Epic 5: Runtime Verification Loop
- Objective:
  - Close the gap between documented traceability and executable behavior.

### US-9 [DONE]
- As a maintainer, I want `aitri verify` to execute project tests with deterministic output, so that runtime evidence becomes part of quality gates.
- Trace: FR-5, AC-9

### US-10 [DONE]
- As a reviewer, I want handoff/go to require successful verification evidence, so that implementation cannot progress on unverified runtime behavior.
- Trace: FR-5, AC-10

## Epic 6: Brownfield Adoption via Semantic Mapping
- Objective:
  - Make Aitri usable in existing repositories without forced folder migration.

### US-11 [DONE]
- As a team using an existing codebase, I want configurable path mapping (`aitri.config.json`), so that Aitri can bind to current project structures.
- Trace: FR-6, AC-11

### US-12 [DONE]
- As a maintainer, I want config validation and fallback defaults, so that mapping errors are explicit and safe.
- Trace: FR-6, AC-12

## Epic 7: Managed Implementation Mode
- Objective:
  - Reduce implementation drift after `go` with lightweight deterministic controls.

### US-13 [DONE]
- As a maintainer, I want a managed-go mode with policy checks, so that forbidden architectural/dependency drift is caught before commit/handoff.
- Trace: FR-7, AC-13

### US-14 [DONE]
- As a reviewer, I want dependency drift and policy violations surfaced in machine-readable output, so that CI and humans can block unsafe progression.
- Trace: FR-7, AC-14

## Epic 8: Insight Dashboard and Confidence Score
- Objective:
  - Provide business + technical visibility without abandoning CLI-first principles.

### US-15 [DONE]
- As a stakeholder, I want `aitri status --ui` static output, so that project health is visible without manual parsing.
- Trace: FR-8, AC-15

### US-16 [DONE]
- As a maintainer, I want a weighted confidence score (spec integrity + runtime verification), so that release readiness is objectively measurable.
- Trace: FR-8, AC-16

## Epic 9: Scalable Context Retrieval (Staged)
- Objective:
  - Improve artifact quality in large projects while controlling complexity.

### US-17
- As an agent operator, I want section-level retrieval before full-file loading, so that planning and refinement stay coherent in large scopes.
- Trace: FR-9, AC-17

### US-18
- As a maintainer, I want optional local semantic indexing in advanced mode, so that retrieval quality scales without mandatory cloud services.
- Trace: FR-9, AC-18

## Acceptance Criteria (Next Improvement Scope)
- AC-1: Persona-required fields are machine-checked for at least Discovery/Product/Architect outputs. [DONE]
- AC-2: `plan` blocks when critical discovery confidence is Low or required sections are missing. [DONE]
- AC-3: Guided discovery captures users, JTBD, constraints, dependencies, success metrics, assumptions, and confidence in all flows. [DONE]
- AC-4: Generated plan/backlog/tests contain fewer unresolved placeholders and stronger traceable defaults.
- AC-5: Explicit handoff command(s) exist (`aitri handoff` and/or `aitri go`) with clear no-go/go behavior.
- AC-6: Resume shortcut exists and maps to checkpoint decision + next step deterministically.
- AC-7: Demo script runs end-to-end in a clean repo in <= 5 minutes. [DONE]
- AC-8: README and docs separate "default quick path" from "advanced operations path".
- AC-9: `aitri verify` executes runtime checks and returns machine-readable verification evidence. [DONE]
- AC-10: `handoff`/`go` can be blocked when runtime verification is missing or failing. [DONE]
- AC-11: `aitri.config.json` path mapping supports specs/backlog/tests/docs for brownfield projects. [DONE]
- AC-12: Invalid mapping configuration fails fast with explicit diagnostics and safe defaults. [DONE]
- AC-13: Managed-go mode enforces deterministic policy checks before progression. [DONE]
- AC-14: Dependency/policy drift output is machine-readable for CI gating. [DONE]
- AC-15: `aitri status --ui` generates static visibility output for non-technical stakeholders. [DONE]
- AC-16: Confidence score model is documented and includes runtime + spec inputs. [DONE]
- AC-17: Section-level retrieval is used before raw full-document loading in large workflows.
- AC-18: Optional local semantic indexing is available in advanced mode.
