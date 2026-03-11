/**
 * Module: Command — help
 * Purpose: Print usage, commands, phases, and workflow to stdout.
 */

export function cmdHelp({ VERSION }) {
  const steel = '\x1b[38;5;75m';
  const fire  = '\x1b[38;5;208m';
  const ember = '\x1b[38;5;166m';
  const dim   = '\x1b[2m';
  const reset = '\x1b[0m';

  console.log(`
${steel}   █████╗ ██╗████████╗██████╗ ██╗${reset}
${steel}  ██╔══██╗██║╚══██╔══╝██╔══██╗██║${reset}
${fire}  ███████║██║   ██║   ██████╔╝██║${reset}
${ember}  ██╔══██║██║   ██║   ██╔══██╗██║${reset}
${fire}  ██║  ██║██║   ██║   ██║  ██║██║${reset}
${steel}  ╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝${reset}

${fire}  ⚒  Spec-Driven Development Engine  v${VERSION}${reset}
${dim}  Idea → Spec → Tests → Code → Deploy${reset}
${steel}  Designed by César Augusto Reyes${reset}
`);

  console.log(`HOW IT WORKS:
  Aitri is a briefing engine — it does not run code or call agents directly.
  Each "run-phase" prints a structured briefing to stdout.
  Your AI agent reads the briefing and creates the required artifact.
  Once the artifact is saved, run "complete" to validate it, then "approve" to unlock the next phase.

COMMANDS:
  aitri init                                    Initialize project (creates IDEA.md)
  aitri run-phase <1-5|ux|discovery|review>            Print briefing for your agent
  aitri run-phase <1-5|ux|discovery|review> --feedback Re-run with feedback applied
  aitri complete <1-5|ux|discovery|review>             Validate artifact + record as done
  aitri approve <1-5|ux|discovery|review>              Approve phase (human checklist required)
  aitri reject <1-5|ux|discovery|review> --feedback "" Reject with feedback → re-run briefing
  aitri verify-run [--cmd "npm test"]                  Run actual tests → output for agent to map TCs
  aitri verify-complete                                Gate: all TCs pass + FR coverage → unlocks Phase 5
  aitri status                                  Show pipeline status
  aitri validate                                Validate all artifacts

PHASES:
  Optional phases and their dependencies:
  ◦ discovery  Problem Definition   → 00_DISCOVERY.md   (needs: IDEA.md only)
  ◦ ux         UX/UI Specification  → 01_UX_SPEC.md     (needs: 01_REQUIREMENTS.json — run after Phase 1)
  ◦ review     Code Review          → 04_CODE_REVIEW.md (needs: Phase 4 approved — run before verify)

  Core pipeline:
  1. PM Analysis          → 01_REQUIREMENTS.json
  2. System Architecture  → 02_SYSTEM_DESIGN.md
  3. QA Test Design       → 03_TEST_CASES.json
  4. Implementation       → src/ + tests/ + 04_IMPLEMENTATION_MANIFEST.json
  ✦  VERIFY              → 04_TEST_RESULTS.json  (required gate before Phase 5)
  5. Deployment           → Dockerfile + docker-compose + 05_PROOF_OF_COMPLIANCE.json

WORKFLOW:
  1. aitri init                    → creates IDEA.md (fill it in)
  [optional] aitri run-phase discovery
             agent saves 00_DISCOVERY.md → aitri complete discovery → aitri approve discovery
  2. aitri run-phase 1             → agent reads briefing, saves 01_REQUIREMENTS.json
  3. aitri complete 1              → validates artifact (must pass before approve)
  4. aitri approve 1               → or: aitri reject 1 --feedback "..."
  [optional] aitri run-phase ux    → requires 01_REQUIREMENTS.json
             agent saves 01_UX_SPEC.md → aitri complete ux → aitri approve ux
  5. Repeat run-phase / complete / approve for phases 2, 3, 4
  [optional] aitri run-phase review → independent agent reviews code vs requirements
             agent saves 04_CODE_REVIEW.md → aitri complete review → aitri approve review
  6. aitri verify-run              → Aitri runs actual tests, agent maps TCs to results
  7. aitri verify-complete         → gate: all tests pass + FR coverage confirmed
  8. aitri run-phase 5             → agent saves deployment config
  9. aitri complete 5 → approve 5  → done

AGENTS:
  Claude Code, Codex, Gemini Code, Opencode — any agent that can read stdout and write files
`);
}
