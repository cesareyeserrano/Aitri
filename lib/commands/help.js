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
  aitri init                                         Initialize project (creates IDEA.md)
  aitri run-phase <phase>                            Print briefing for your agent
  aitri run-phase <phase> --feedback "..."           Re-run with feedback applied
  aitri complete <phase>                             Validate artifact + record as done
  aitri complete <phase> --check                     Dry-run validation (no state written)
  aitri approve <phase>                              Approve phase (human checklist required)
  aitri reject <phase> --feedback "..."              Reject with feedback → re-run briefing
  aitri verify-run [--cmd "npm test"]                  Run actual tests → output for agent to map TCs
  aitri verify-complete                                Gate: all TCs pass + FR coverage → unlocks Phase 5
  aitri wizard [--depth quick|standard|deep]    Interactive interview → fills IDEA.md from your answers
  aitri run-phase discovery --guided            Interview → injects answers into discovery briefing
  aitri adopt scan                              Scan project → briefing for agent → ADOPTION_SCAN.md + IDEA.md
  aitri adopt apply                             Read IDEA.md → confirm → initialize
  aitri adopt --upgrade                         Sync state from existing Aitri artifacts (non-destructive)
  aitri resume                                  Full session briefing — pipeline state, FRs, test coverage, next action
  aitri checkpoint [--context "..."]             Save session context to .aitri (auto-read by resume)
  aitri checkpoint --name <label>               Also save resume snapshot to checkpoints/
  aitri checkpoint --list                       List saved checkpoints
  aitri status                                  Show pipeline status
  aitri validate                                Validate all artifacts
  aitri normalize                               Detect + classify code changes outside pipeline
  aitri backlog                                 List open backlog items
  aitri backlog add --title "..." --priority P1|P2|P3 --problem "..." [--fr FR-001]
  aitri backlog done <id>                       Close a backlog item
  aitri bug list                                List active bugs (open/in-fix)
  aitri bug add --title "..." [--severity critical|high|medium|low] [--fr FR-XXX]
               [--tc TC-NNN] [--phase N] [--steps "..."] [--expected "..."] [--actual "..."]
               [--environment "..."] [--evidence "path"] [--reported-by "name"]
  aitri bug fix <BG-NNN> [--tc TC-NNN]         Mark bug as fixed (links optional TC for auto-verify)
  aitri bug verify <BG-NNN>                    Mark bug as verified (manual confirmation)
  aitri bug close <BG-NNN>                     Archive bug
  aitri audit                               On-demand code & architecture audit → AUDIT_REPORT.md
  aitri audit plan                          Read AUDIT_REPORT.md → propose aitri bug/backlog actions

PHASES:
  Phase names (use the name or number — both work):

  Optional phases and their dependencies:
  ◦ discovery  Problem Definition   → 00_DISCOVERY.md   (needs: IDEA.md only)
  ◦ ux         UX/UI Specification  → 01_UX_SPEC.md     (needs: requirements approved)
  ◦ review     Code Review          → 04_CODE_REVIEW.md (needs: build approved — run before verify)

  Core pipeline:
  requirements  (1)  → 01_REQUIREMENTS.json
  architecture  (2)  → 02_SYSTEM_DESIGN.md
  tests         (3)  → 03_TEST_CASES.json
  build         (4)  → src/ + tests/ + 04_IMPLEMENTATION_MANIFEST.json
  ✦  verify          → 04_TEST_RESULTS.json  (required gate before deploy)
  deploy        (5)  → Dockerfile + docker-compose + 05_PROOF_OF_COMPLIANCE.json

WORKFLOW:
  Resuming an existing session? Run: aitri resume  → shows pipeline state + next action

  1. aitri init                         → creates IDEA.md, idea/ (assets), spec/ (artifacts)
     Fill in IDEA.md — or run: aitri wizard  to be guided through it
     Drop mockups/PDFs/Figma exports in idea/ — referenced automatically in every briefing
  [optional] aitri run-phase discovery
             agent saves 00_DISCOVERY.md → aitri complete discovery → aitri approve discovery
  2. aitri run-phase requirements        → agent reads briefing, saves 01_REQUIREMENTS.json
  3. aitri complete requirements         → validates artifact (must pass before approve)
  4. aitri approve requirements          → or: aitri reject requirements --feedback "..."
  [optional] aitri run-phase ux          → requires 01_REQUIREMENTS.json
             agent saves 01_UX_SPEC.md → aitri complete ux → aitri approve ux
  5. Repeat run-phase / complete / approve for: architecture, tests, build
  [optional] aitri run-phase review      → independent agent reviews code vs requirements
             agent saves 04_CODE_REVIEW.md → aitri complete review → aitri approve review
  6. aitri verify-run                    → Aitri runs actual tests, agent maps TCs to results
  7. aitri verify-complete               → gate: all tests pass + FR coverage confirmed
  8. aitri run-phase deploy              → agent saves deployment config
  9. aitri complete deploy → approve deploy  → done

FEATURE WORKFLOW:
  Use "aitri feature" to scope a new feature on an existing Aitri project.
  aitri feature init <name>                  → creates features/<name>/ with its own pipeline
  aitri feature run-phase <name> <phase>     → briefing scoped to feature (injects parent FRs)
  aitri feature complete <name> <phase>      → validate feature artifact
  aitri feature approve <name> <phase>       → approve feature phase

AGENTS:
  Claude Code, Codex, Gemini Code, Opencode — any agent that can read stdout and write files
`);
}
