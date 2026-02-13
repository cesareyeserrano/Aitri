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
- [x] Product persona complete
- [x] Architect persona available
- [x] Security persona available
- [x] Developer persona complete
- [x] QA persona complete
- [x] UX/UI persona available (for user-facing features)
- [x] Personas explicitly integrated into templates/flow

## 4) Validation Quality
- [x] Placeholder blocking baseline
- [x] FR -> US minimum rule
- [x] US -> TC minimum rule
- [x] FR -> TC rule when applicable
- [ ] Coverage report clarity by gap type
- [x] Stable machine-readable mode for CI

## 5) Operational Reliability
- [ ] Smoke tests for core commands
- [ ] Consistent exit codes across all commands
- [x] Non-interactive mode defined for CI/agents
- [x] `status` reliability improved to reduce false positives

## 6) Supervised Build/Deploy Assistance
- [ ] Build-assist workflow defined
- [ ] Local deployment plan template
- [ ] Production-assist deployment plan template
- [ ] Rollback/fallback checklist
- [ ] Post-deploy evidence documented

## 7) Ready for V1 Close
- [ ] Core stable on new and existing repositories
- [ ] Validation reliable in real cases
- [ ] Documentation sufficient for continuity without original author
- [ ] Agent skills execute flow without bypassing gates
