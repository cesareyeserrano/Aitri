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
6. No invented requirements: Aitri and agents must not create requirements not explicitly provided by the user.

## Stabilization Freeze Rule (Closed 2026-02-16)
Historical rule (now closed):
- No new feature work until critical closure of H-001/H-002/H-003.
- Closure status and evidence are tracked in:
  - `docs/quality/STABILIZATION_RELEASE_GATE_2026-02-16.md`
  - `docs/feedback/AUDITORIA_E2E_2026-02-16.md`

## Caprice Firewall (Anti-Impulsive Change Protocol)
Any request that changes scope, quality bar, or architecture direction must pass all steps below before implementation:
1. State the requested change in one sentence.
2. State impact in three lines:
   - what is gained
   - what is lost
   - what risk increases
3. Update scope/governance docs first:
   - `docs/architecture.md`
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

## Quality Profile Override Protocol (Phase G)
When domain quality profiles are introduced (web/game/cli), overrides must remain controlled.

Required format:
- Profile selected and profile overridden
- Reason and scope (feature-only or project-wide)
- Duration (temporary/permanent)
- Risks accepted
- Rollback condition

Required docs update:
- Add override record in `docs/quality/STABILIZATION_RELEASE_GATE_2026-02-16.md` (or successor gate file).
- Mirror follow-up item in `docs/PROGRESS_CHECKLIST.md`.

Anti-bloat condition:
- Overrides cannot introduce ROI/business-management layers in this cycle.
- Scope stays in Spec/Execution quality.

## Session Start Contract (for agents)
At the start of every session:
1. Read `docs/README.md`
2. Read `docs/EXECUTION_GUARDRAILS.md`
3. Run `aitri resume` (or `aitri resume json` in automation)
4. If checkpoint confirmation is requested, ask user whether to continue from checkpoint
5. Report current state and next recommended step

## Runtime Sequence Contract (for agents)
Use the following sequence and do not skip gates:

### Pre-Go Phase (Governance)
1. `aitri resume`
2. `aitri init` (if structure is missing)
3. `aitri draft`
4. human review
5. `aitri approve`
6. `aitri discover`
7. `aitri plan`
8. persona refinement as needed
9. `aitri validate`
10. `aitri verify`
11. `aitri policy`
12. `aitri handoff`
13. human GO/NO-GO decision
14. `aitri go` (only after GO)

### Post-Go Phase (Factory Execution)
15. `aitri scaffold` — generate project skeleton and executable test stubs
16. `aitri implement` — receive ordered implementation briefs
17. Implement each US-* brief in order specified by IMPLEMENTATION_ORDER.md
18. After each US-*: `aitri verify` to confirm TC-* coverage
19. Repeat 17-18 until all stories are implemented
20. `aitri deliver` — final delivery gate (all FRs covered, all TCs passing)

Post-go rules:
- Do not change implementation order without spec update
- Do not modify scaffold interface signatures without spec update
- Run `aitri verify` after every story implementation, not just at the end
- If `aitri deliver` fails, fix the issues and re-run — do not bypass

## Mandatory Stop Conditions
Stop and ask for direction when any of these is true:

### Pre-Go Conditions
- approved spec is missing
- `validate` fails
- unresolved placeholders exist
- inferred or auto-generated requirements are detected without explicit user confirmation
- required artifacts are missing
- requested action violates documented scope
- deployment target or risk is ambiguous
- `verify` or `policy` fails

### Post-Go Conditions (Factory)
- `scaffold` has not been run before attempting `implement`
- `implement` has not been run before attempting story implementation
- `verify` fails after implementing a story — stop and fix before next story
- implementation order differs from IMPLEMENTATION_ORDER.md without spec update
- interface contract from scaffold has been changed without spec approval
- `deliver` gate fails — do not ship, resolve issues first

## Validation Floor Contract
`validate`/`verify`/`policy` must guarantee at minimum:

### Pre-Go Validation
- approved spec, backlog, and tests exist
- placeholder blocking stays enforced
- FR/US/TC structure and coverage are checked
- persona gates remain enforced for Discovery/Product/Architect outputs
- runtime verification evidence exists, is passing, and not stale
- managed-go policy checks pass (dependency drift + forbidden imports/paths)

### Post-Go Validation (Factory)
- `verify` (enhanced) maps executed tests to TC-* declarations
- every TC-* in tests.md must have a corresponding executable test file
- FR coverage: every FR-* from spec has at least one passing TC
- US coverage: every US-* from backlog has all associated TCs passing
- `deliver` enforces configurable confidence threshold (default 0.85)
- delivery gate blocks when any FR is uncovered or any TC is failing

## Session End Contract (for agents)
Before ending a substantial work block:
1. Report what changed
2. Report which checklist items moved
3. Report unresolved risks or open decisions
4. Confirm whether docs and code are still aligned
5. Recommend a checkpoint commit command

## Checkpoint Discipline
Checkpoint frequency:
- After each major phase (`draft`, `approve`, `discover`, `plan`, `validate`)
- After `scaffold` and `implement` (post-go phases)
- After each US-* story implementation completes and `verify` passes
- Before stopping a session with unmerged progress

Checkpoint command:
```bash
git add -A && git commit -m "checkpoint: <feature> <phase>"
```

Fallback when commit is not possible:
```bash
git stash push -m "checkpoint: <feature> <phase>"
```

Recovery anchor:
- Always resume with `aitri resume` (or `aitri resume json` for automation) and follow the recommended command.

## Definition of Drift
Drift exists if any of the following is true:
- Docs describe behavior not present in CLI
- CLI behavior is not reflected in docs
- CI assumes interfaces that do not exist
- Personas/checklists are declared but not integrated into workflow

When drift is detected, drift resolution becomes the top priority.
