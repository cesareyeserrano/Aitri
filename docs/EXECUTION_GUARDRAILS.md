# Aitri: Execution Guardrails

## Purpose
Define strict rules that protect Aitri from scope drift, rushed changes, and inconsistent execution across sessions.

This document is intentionally conservative. It is designed to protect project integrity even when priorities change quickly.

## Rule Hierarchy
When rules conflict, use this order:
1. Safety and human control
2. Approved scope and traceability
3. Reliability and reproducibility
4. Speed

## Non-Negotiable Guardrails
1. No implementation without an approved spec.
2. No release claim without passing validation and evidence.
3. No scope expansion without explicit scope update in docs.
4. No silent quality downgrade (tests, validation, traceability, docs).
5. No destructive action without explicit human approval.

## Caprice Firewall (Anti-Impulsive Change Protocol)
Any request that changes scope, quality bar, or architecture direction must pass all steps below before implementation:
1. State the requested change in one sentence.
2. State impact in three lines:
   - what is gained
   - what is lost
   - what risk increases
3. Update scope/governance docs first:
   - `docs/SCOPE_V1.md`
   - `docs/STRATEGY_EXECUTION.md`
   - `docs/PROGRESS_CHECKLIST.md`
4. Reconfirm execution with explicit human approval.

If any step is missing, stop and do not implement.

## Quality Floor (Cannot Be Lowered Without Explicit Override)
The following are minimum quality requirements:
- Traceability: FR -> US -> TC
- Placeholder blocking in validation
- Clear status output with next-step guidance
- Machine-readable output for CI-critical commands
- Documented human approval before implementation/deployment actions

## Controlled Override Protocol
Overrides are allowed only when explicitly requested by the human owner and must be recorded.

Required format:
- Reason for override
- Scope and duration (temporary or permanent)
- Risks accepted
- Rollback condition

Required docs update:
- Add a note in `docs/STRATEGY_EXECUTION.md` under risks/decisions.
- Update `docs/PROGRESS_CHECKLIST.md` with a follow-up item.

## Session Start Contract (for agents)
At the start of every session:
1. Read `docs/README.md`
2. Read `docs/EXECUTION_GUARDRAILS.md`
3. Run `aitri status`
4. Report current state and next recommended step

## Session End Contract (for agents)
Before ending a substantial work block:
1. Report what changed
2. Report which checklist items moved
3. Report unresolved risks or open decisions
4. Confirm whether docs and code are still aligned

## Definition of Drift
Drift exists if any of the following is true:
- Docs describe behavior not present in CLI
- CLI behavior is not reflected in docs
- CI assumes interfaces that do not exist
- Personas/checklists are declared but not integrated into workflow

When drift is detected, drift resolution becomes the top priority.
