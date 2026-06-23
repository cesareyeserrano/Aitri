/**
 * Module: Command — help
 * Purpose: Print usage, commands, phases, and workflow to stdout.
 */

export function cmdHelp({ VERSION }) {
  const steel = '\x1b[38;5;75m';
  const fire  = '\x1b[38;5;208m';
  const ember = '\x1b[38;5;166m';
  const dim   = '\x1b[2m';
  const bold  = '\x1b[1m';
  const reset = '\x1b[0m';
  const bar   = `${dim}${'─'.repeat(60)}${reset}`;

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

  console.log(`${bar}
${bold}LOST? START HERE${reset}
  ${fire}aitri resume${reset} [--full]   → pipeline state, last action, exact next step (--full: detailed briefing)
  ${fire}aitri status${reset}          → compact pipeline overview (--json for machine-readable)
${bar}

${bold}HOW IT WORKS${reset}
  Aitri generates briefings for your AI agent — it does not write code itself.
  The loop is always:  run-phase → agent writes artifact → complete → approve → next phase
${bar}

${bold}SETUP${reset}
  aitri init                           Initialize project — creates IDEA.md (seed brief), spec/ (artifacts),
                                       idea_context/ (drop assets/mockups/PDFs here — auto-listed in briefings),
                                       and per-agent instruction files (CLAUDE.md, GEMINI.md, .codex/, .github/ …)
  aitri wizard [--depth quick|standard|deep]   Interview mode → fills IDEA.md interactively
  aitri adopt                          Guided front door for an existing project → scaffolds IDEA.md + idea_context/ and guides you
  aitri adopt scan                     Existing project → audit + adoption plan (your objective, or stabilization)
  aitri adopt apply                    Apply scan plan → initialize pipeline
  aitri adopt --upgrade                Sync .aitri state with current CLI version (version mismatch fix)
  aitri adopt --upgrade --dry-run      Preview migrations without writing artifacts or mutating .aitri
  aitri adopt --upgrade --layout       Migrate a flat project to the contained aitri/ layout (human terminal; add --dry-run to preview)
${bar}

${bold}PIPELINE  (the main loop)${reset}
  aitri run-phase <phase>              Generate briefing for your agent
  aitri run-phase <phase> --feedback "..."   Re-run with rejection feedback applied
  aitri run-phase discovery --guided   Interactive discovery interview (TTY)
  aitri complete <phase>               Validate artifact written by agent
  aitri complete <phase> --check       Dry-run validation (no state written)
  aitri approve <phase>                Human approval gate (interactive checklist)
  aitri reject <phase> --feedback "..."  Reject → agent must redo the phase
  aitri rehash <phase>                 Update stored hash to match current artifact (no cascade) — escape hatch for legacy hash drift when content matches HEAD

  Phases (name or number both work) — ${steel}industry document type in cyan${reset}:
  ${dim}[opt]${reset} discovery  → 00_DISCOVERY.md            ${steel}Product Discovery / Problem Statement${reset}
        requirements (1)  → 01_REQUIREMENTS.json       ${steel}Product Requirements Document (PRD / SRS)${reset}
  ${dim}[opt]${reset} ux         → 01_UX_SPEC.md              ${steel}UX / Design Spec${reset}
        architecture (2)  → 02_SYSTEM_DESIGN.md        ${steel}Technical Design Document (TRD / SDD)${reset}
        tests        (3)  → 03_TEST_CASES.json         ${steel}Test Plan${reset}
        build        (4)  → src/ + 04_BUILD_REPORT.json    ${steel}Build Report${reset}
  ${dim}[opt]${reset} review     → 04_CODE_REVIEW.md          ${steel}Code Review${reset} ${dim}(run via 'aitri review', before verify-run)${reset}
        ── verify ──
        deploy       (5)  → 05_TRACEABILITY.json       ${steel}Traceability / Compliance Report${reset}
${bar}

${bold}TESTING GATE${reset}
  aitri verify-run [--cmd "..."]       Run actual tests → auto-parse TC results
  aitri verify-run --coverage-threshold N   Also measure line coverage; warn below N% (node/go/pytest/jest/vitest)
  aitri verify-complete                Gate: TCs pass + FR coverage → unlocks deploy

  If pytest silently skips all tests:
    Check test_runner in 04_BUILD_REPORT.json
    Use --cmd ".venv/bin/pytest tests/ -v" if project has a virtualenv
${bar}

${bold}TRACKING${reset}
  aitri tc verify <TC-ID> --result pass|fail --notes "..."
                                       Record result of a manual TC (automation: manual)
                                       Counts toward total pass score — run after verify-run

  aitri bug list                       Active bugs
  aitri bug add --title "..." [--severity critical|high|medium|low] [--fr FR-XXX] [--tc TC-NNN]
  aitri bug fix <BG-NNN>               Mark fixed
  aitri bug verify <BG-NNN>            Confirm fix verified
  aitri bug close <BG-NNN>             Archive

  aitri backlog                        Open backlog items
  aitri backlog add --title "..." --priority P1|P2|P3 --problem "..."
                    [--files/--behavior/--decisions/--acceptance "..."]
  aitri backlog show <id>              Show one item in full detail
  aitri backlog done <id>

  aitri audit                          On-demand audit → AUDIT_REPORT.md
  aitri audit plan                     Propose bug/backlog actions from audit findings
  aitri audit coverage                 Idea→FR completeness audit (did a client need get dropped?)
  aitri audit security                 Adversarial security audit — code, repo, deployed surface
${bar}

${bold}SESSION${reset}
  aitri checkpoint [--context "..."]   Save session context (auto-read by resume)
  aitri checkpoint --name <label>      Save named snapshot to checkpoints/
  aitri checkpoint --list              List saved snapshots
  aitri validate [--explain]           Validate all artifacts at once (--explain: per-artifact detail)
  aitri reconcile                      Classify code changes made outside the pipeline
  aitri reconcile --init               Stamp a baseline (brownfield — Phase 4 approved pre-v0.1.80)
${bar}

${bold}FEATURES  (sub-pipeline for a specific feature)${reset}
  aitri feature init <name>            Create features/<name>/ with its own pipeline
  aitri feature run-phase <name> <phase>
  aitri feature complete  <name> <phase>
  aitri feature approve   <name> <phase>
  aitri feature reject    <name> <phase> --feedback "..."
  aitri feature rehash    <name> <phase>
  aitri feature verify-run      <name>
  aitri feature verify-complete <name>
  aitri feature tc        <name> verify|mark-manual ...
  aitri feature bug       <name> add|fix|verify|close|list ...
  aitri feature backlog   <name> add|list|show|done ...
  aitri feature checkpoint <name> [--context "..."] [--name ...] [--list]
  aitri feature status    <name>
${bar}

${bold}INTERACTIVE vs AGENT MODE${reset}
  Most commands behave identically whether a human or an agent runs them.
  These behave differently when there is no TTY (agent / CI):
    approve            Always prints the artifact summary + Human Review checklist.
                       Proceeds by default; a human-review checkpoint either way.
    approve (drift)    Always blocks in agent mode — a human must re-approve.
    reconcile --resolve, rehash   Block in agent mode (human confirmation required).
  Opt-in gates for larger projects (set in .aitri; default off, all projects valid):
    "humanApprovalGate": true   approve blocks in agent mode — a human must run it.
    "strictAssertions":  true   verify-complete blocks on ≤1-assertion test cases.
${bar}

${bold}AGENTS${reset}
  Works with any agent that reads stdout and writes files:
  Claude Code · Codex · Gemini CLI · GitHub Copilot · Opencode (via AGENTS.md)
`);
}
