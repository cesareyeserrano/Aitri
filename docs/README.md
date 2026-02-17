# Aitri Docs: Index and Source of Truth

Use this folder as the official reference for product intent, governance, execution, and release discipline.

## Recommended Reading Order
1. `docs/architecture.md` - product model, principles, operating contract
2. `docs/EXECUTION_GUARDRAILS.md` - anti-drift and anti-impulsive-change rules
3. `docs/STRATEGY_EXECUTION.md` - strategy and evolution phases
4. `docs/guides/GETTING_STARTED.md` - end-to-end onboarding from zero installation
5. `docs/PROGRESS_CHECKLIST.md` - closure checklist for ongoing tracking
6. `docs/guides/SKILL_PACKAGING_AND_INSTALL.md` - skill packaging and installation guide
7. `docs/guides/FILE_GROWTH_POLICY.md` - budget thresholds and warning/block policy
8. `docs/quality/STABILIZATION_RELEASE_GATE_2026-02-16.md` - single closure dashboard (owners, dates, gate status, CI blocker status)
9. `docs/runbook/SESSION_CHECKPOINT_AND_RESUME.md` - interruption-safe checkpoint and resume protocol
10. `docs/runbook/DEMO_5_MINUTES.md` - reproducible <=5 minute end-to-end demo
11. `docs/runbook/PERSONA_INTERACTION_FLOW.md` - role boundaries and multi-pass persona flow
12. `docs/runbook/BUILD_DEPLOY_ASSIST_WORKFLOW.md` - supervised build/deploy-assist flow
13. `docs/release/DOCS_VERSION_TRACK.md` - version-by-version documentation changelog and audit trail
14. `backlog/aitri-core/backlog.md` - prioritized next-improvement backlog
15. `docs/templates/deploy/` - deployment plan/checklist templates
16. `docs/feedback/STRATEGIC_FEEDBACK_2026-02.md` - audited strategic feedback with implementation verdicts
17. `docs/feedback/MAINTAINABILITY_GROWTH_AUDIT_2026-02-15.md` - baseline growth audit and modularization controls
18. `docs/feedback/AUDITORIA_E2E_2026-02-16.md` - E2E audit findings (Impacto/Severidad/Valor/Riesgo) and stabilization gate (no new features until critical closure)
19. `docs/feedback/PRODUCTION_QUALITY_FEEDBACK_ASSESSMENT_2026-02-16.md` - assessment of governance-to-production-quality feedback and integrated pending-closure plan
20. `docs/feedback/AITRI_0.2.24_FEEDBACK_CLOSURE_2026-02-17.md` - closure matrix for 0.2.24 feedback (hallazgo/impacto/severidad/afectacion/valor) and implementation evidence

## Purpose
Preserve continuity across time, contributors, and agent platforms.
Protect requirement source integrity: requirements/spec statements must be user-provided, not invented by agents.

If implementation and docs diverge, fix the divergence explicitly before continuing roadmap work.
