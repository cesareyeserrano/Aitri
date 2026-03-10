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

  console.log(`COMMANDS:
  aitri init                            Initialize project (creates IDEA.md)
  aitri run-phase <1-5>                 Output phase briefing to stdout
  aitri run-phase <1-5> --feedback ""   Re-run with feedback
  aitri complete <1-5>                  Record artifact saved
  aitri approve <1-5>                   Approve phase output
  aitri reject <1-5> --feedback ""      Reject with feedback
  aitri verify                          Output test execution briefing
  aitri verify-complete                 Gate: all TCs pass + FR coverage → unlocks Phase 5
  aitri status                          Show pipeline status
  aitri validate                        Validate all artifacts

PHASES:
  1. PM Analysis          → 01_REQUIREMENTS.json
  2. System Architecture  → 02_SYSTEM_DESIGN.md
  3. QA Test Design       → 03_TEST_CASES.json
  4. Implementation       → src/ + tests/ + 04_IMPLEMENTATION_MANIFEST.json
  ✦  VERIFY              → 04_TEST_RESULTS.json  (required gate before Phase 5)
  5. Deployment           → Dockerfile + docker-compose + 05_PROOF_OF_COMPLIANCE.json

WORKFLOW:
  1. aitri init                (creates IDEA.md)
  2. Edit IDEA.md              (describe your project)
  3. aitri run-phase 1         (agent generates requirements)
  4. aitri complete 1          (verify artifact saved)
  5. aitri approve 1           (or: aitri reject 1 --feedback "...")
  6. Repeat 3-5 for phases 2-4
  7. aitri verify              (agent runs tests → saves 04_TEST_RESULTS.json)
  8. aitri verify-complete     (gate: all tests pass + FR coverage confirmed)
  9. aitri run-phase 5         (deployment — unlocked after verify)
  10. App running on localhost

AGENTS:
  Claude Code, Codex, Gemini Code, Opencode — any bash-capable agent
`);
}
