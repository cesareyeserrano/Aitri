# Backlog: aitri-core-next

## Epic 1: Enforce Persona Outputs in Engine
- Objective:
  - Reduce dependence on agent discipline by enforcing persona contracts through CLI behavior.

### US-1
- As a maintainer, I want persona-required sections validated in generated artifacts, so that outputs are consistent without manual policing.
- Trace: FR-1, AC-1

### US-2
- As a maintainer, I want missing critical persona outputs to block progression to next command, so that weak artifacts do not pass silently.
- Trace: FR-1, AC-2

## Epic 2: Stronger Discovery and Planning Signal
- Objective:
  - Increase depth and quality of generated discovery/plan artifacts.

### US-3
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

## Acceptance Criteria (Next Improvement Scope)
- AC-1: Persona-required fields are machine-checked for at least Discovery/Product/Architect outputs.
- AC-2: `plan` blocks when critical discovery confidence is Low or required sections are missing.
- AC-3: Guided discovery captures users, JTBD, constraints, dependencies, success metrics, assumptions, and confidence in all flows.
- AC-4: Generated plan/backlog/tests contain fewer unresolved placeholders and stronger traceable defaults.
- AC-5: Explicit handoff command(s) exist (`aitri handoff` and/or `aitri go`) with clear no-go/go behavior.
- AC-6: Resume shortcut exists and maps to checkpoint decision + next step deterministically.
- AC-7: Demo script runs end-to-end in a clean repo in <= 5 minutes. [DONE]
- AC-8: README and docs separate "default quick path" from "advanced operations path".
