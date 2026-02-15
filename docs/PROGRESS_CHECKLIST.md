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
