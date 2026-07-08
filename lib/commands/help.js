/**
 * Module: Command — help
 * Purpose: Print usage, commands, phases, and workflow to stdout.
 *
 * Two levels (UX-PRO-0707 2.2): the bare `aitri help` prints a SHORT overview (banner +
 * where-to-start + the main loop + phase table + a pointer); `aitri help --all` prints the
 * full reference (every section); `aitri help <command>` prints just the section that
 * documents that command. The 137-line monolith used to print regardless of the argument —
 * `help init` was silently ignored.
 */

import { useColor, divider } from '../format.js';

// Which help section documents each command — powers `aitri help <command>`.
const COMMAND_SECTION = {
  resume: 'start', status: 'start',
  init: 'setup', wizard: 'setup', adopt: 'setup',
  'run-phase': 'pipeline', complete: 'pipeline', approve: 'pipeline', reject: 'pipeline', rehash: 'pipeline', review: 'pipeline',
  'verify-run': 'testing', 'verify-complete': 'testing', verify: 'testing',
  tc: 'tracking', bug: 'tracking', backlog: 'tracking', audit: 'tracking', export: 'tracking',
  checkpoint: 'session', validate: 'session', reconcile: 'session',
  feature: 'features',
};

export function cmdHelp({ VERSION, args = [] }) {
  // Color only in an interactive terminal (NO_COLOR-aware) — piped/agent-read help
  // must not carry ANSI escape codes. When off, every code is '' so the banner and
  // section headers render as plain text.
  const on    = useColor();
  const steel = on ? '\x1b[38;5;75m'  : '';
  const fire  = on ? '\x1b[38;5;208m' : '';
  const ember = on ? '\x1b[38;5;166m' : '';
  const dim   = on ? '\x1b[2m'        : '';
  const bold  = on ? '\x1b[1m'        : '';
  const reset = on ? '\x1b[0m'        : '';
  const bar   = `${dim}${divider(60)}${reset}`;

  const argList = Array.isArray(args) ? args : [];
  const wantAll = argList.includes('--all');
  const topic   = argList.find(a => a && !a.startsWith('-'));   // e.g. `help init`

  const banner = `
${steel}   █████╗ ██╗████████╗██████╗ ██╗${reset}
${steel}  ██╔══██╗██║╚══██╔══╝██╔══██╗██║${reset}
${fire}  ███████║██║   ██║   ██████╔╝██║${reset}
${ember}  ██╔══██║██║   ██║   ██╔══██╗██║${reset}
${fire}  ██║  ██║██║   ██║   ██║  ██║██║${reset}
${steel}  ╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝${reset}

${fire}  ⚒  The Harness for Rigorous Agentic Engineering  v${VERSION}${reset}
${dim}  Idea → Spec → Tests → Code → Deploy${reset}
`;

  const start = `${bold}LOST? START HERE${reset}
  ${fire}aitri resume${reset} [--full]   → pipeline state, last action, exact next step (--full: detailed briefing)
  ${fire}aitri status${reset}          → compact pipeline overview (--json for machine-readable)`;

  const how = `${bold}HOW IT WORKS${reset}
  Aitri generates briefings for your AI agent — it does not write code itself.
  The loop is always:  run-phase → agent writes artifact → complete → approve → next phase`;

  const setup = `${bold}SETUP${reset}
  aitri init                           Initialize project — creates IDEA.md (seed brief), spec/ (artifacts),
                                       idea_context/ (drop assets/mockups/PDFs here — auto-listed in briefings),
                                       and per-agent instruction files (CLAUDE.md, GEMINI.md, .codex/, .github/ …)
  aitri wizard [--depth quick|standard|deep]   Interview mode → fills IDEA.md interactively
  aitri adopt                          Guided front door for an existing project → scaffolds IDEA.md + idea_context/ and guides you
  aitri adopt scan                     Existing project → audit + adoption plan (your objective, or stabilization)
  aitri adopt apply                    Apply scan plan → initialize pipeline
  aitri adopt --upgrade                Sync .aitri state with current CLI version (version mismatch fix)
  aitri adopt --upgrade --dry-run      Preview migrations without writing artifacts or mutating .aitri
  aitri adopt --upgrade --layout       Migrate a flat project to the contained aitri/ layout (human terminal; add --dry-run to preview)`;

  const pipeline = `${bold}PIPELINE  (the main loop)${reset}
  aitri run-phase <phase>              Generate briefing for your agent
  aitri run-phase <phase> --feedback "..."   Re-run with rejection feedback applied
  aitri run-phase discovery --guided   Interactive discovery interview (TTY)
  aitri complete <phase>               Validate artifact written by agent
  aitri complete <phase> --check       Dry-run validation (no state written)
  aitri approve <phase>                Approval gate — interactive checklist in a terminal; in agent mode it RECORDS the
                                       approval + a ⏸ CHECKPOINT to relay (human confirmation still pending). Set
                                       "humanApprovalGate": true in .aitri to hard-stop agent-mode approvals.
  aitri approve <phase> --show         Print the full artifact content before the checklist (review, not just the summary)
  aitri reject <phase> --feedback "..."  Reject → agent must redo the phase
  aitri rehash <phase>                 Update stored hash to match current artifact (no cascade) — escape hatch for legacy hash drift when content matches HEAD

  Phases (name or number both work) — ${steel}industry document type${reset}:
  ${dim}[opt]${reset} discovery  → 00_DISCOVERY.md            ${steel}Product Discovery / Problem Statement${reset}
        requirements (1)  → 01_REQUIREMENTS.json       ${steel}Product Requirements Document (PRD / SRS)${reset}
  ${dim}[opt]${reset} ux         → 01_UX_SPEC.md              ${steel}UX / Design Spec${reset}
        architecture (2)  → 02_SYSTEM_DESIGN.md        ${steel}Technical Design Document (TRD / SDD)${reset}
        tests        (3)  → 03_TEST_CASES.json         ${steel}Test Plan${reset}
        build        (4)  → src/ + 04_BUILD_REPORT.json    ${steel}Build Report${reset}
  ${dim}[opt]${reset} review     → 04_CODE_REVIEW.md          ${steel}Code Review${reset} ${dim}(run via 'aitri review', before verify-run)${reset}
        ── verify ──
        deploy       (5)  → 05_TRACEABILITY.json       ${steel}Traceability / Compliance Report${reset}`;

  const testing = `${bold}TESTING GATE${reset}
  aitri verify-run [--cmd "..."]       Run actual tests → auto-parse TC results
  aitri verify-run --coverage-threshold N   Also measure line coverage; warn below N% (node/go/pytest/jest/vitest)
  aitri verify-complete                Gate: TCs pass + FR coverage → unlocks deploy

  If pytest silently skips all tests:
    Check test_runner in 04_BUILD_REPORT.json
    Use --cmd ".venv/bin/pytest tests/ -v" if project has a virtualenv`;

  const tracking = `${bold}TRACKING${reset}
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
  aitri audit requirements             Idea→FR completeness audit (did a client need get dropped?)
  aitri audit security                 Adversarial security audit — code, repo, deployed surface

  aitri export traceability [--out f]  Render the traceability matrix (requirement × test cases × pass/fail × compliance) as readable Markdown — for product/QA, no JSON`;

  const session = `${bold}SESSION${reset}
  aitri checkpoint [--context "..."]   Save session context (auto-read by resume)
  aitri checkpoint --name <label>      Save named snapshot to checkpoints/
  aitri checkpoint --list              List saved snapshots
  aitri validate [--explain] [--ci]    Validate all artifacts at once (--explain: per-artifact detail; --ci: exit non-zero if not deployable)
  aitri reconcile                      Classify code changes made outside the pipeline
  aitri reconcile --init               Stamp a baseline (brownfield — Phase 4 approved pre-v0.1.80)`;

  const features = `${bold}FEATURES  (sub-pipeline for a specific feature)${reset}
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
  aitri feature status    <name>`;

  const modes = `${bold}INTERACTIVE vs AGENT MODE${reset}
  Most commands behave identically whether a human or an agent runs them.
  These behave differently when there is no TTY (agent / CI):
    approve            Always prints the artifact summary + Human Review checklist.
                       Proceeds by default, but agent mode prints a ⏸ PIPELINE CHECKPOINT
                       (approval recorded, human review pending) — relay it, do not auto-chain.
                       A TTY (human) approval prints the direct next-action instruction.
    approve (drift)    Always blocks in agent mode — a human must re-approve.
    reconcile --resolve, rehash   Block in agent mode (human confirmation required).
  Opt-in gates for larger projects (set in .aitri; default off, all projects valid):
    "humanApprovalGate": true   approve blocks in agent mode — a human must run it.
    "strictAssertions":  true   verify-complete blocks on ≤1-assertion test cases.`;

  const agents = `${bold}AGENTS${reset}
  Works with any agent that reads stdout and writes files:
  Claude Code · Codex · Gemini CLI · GitHub Copilot · Opencode (via AGENTS.md)`;

  const SECTIONS = { start, setup, pipeline, testing, tracking, session, features, modes, agents };
  const boxed = (body) => `${bar}\n${body}\n${bar}`;

  // `aitri help <command>` → just the section that documents it.
  if (topic && !wantAll) {
    const key = COMMAND_SECTION[topic];
    if (key && SECTIONS[key]) {
      console.log(banner);
      console.log(boxed(SECTIONS[key]));
      console.log(`\n${dim}Full reference: aitri help --all${reset}`);
      return;
    }
    // Unknown topic: fall through to the short overview with a note.
    console.log(banner);
    console.log(`  No dedicated help for "${topic}". Overview below — 'aitri help --all' lists everything.\n`);
    console.log(boxed(start));
    console.log(boxed(how));
    console.log(boxed(pipeline));
    console.log(`\n${dim}Full reference: aitri help --all  ·  one command: aitri help <command>${reset}`);
    return;
  }

  console.log(banner);

  if (wantAll) {
    // Full reference — every section (superset of the short form; the pre-2.2 output).
    for (const body of [start, how, setup, pipeline, testing, tracking, session, features, modes, agents]) {
      console.log(boxed(body));
    }
    return;
  }

  // Default: SHORT overview — enough to start and run the loop, plus pointers.
  console.log(boxed(start));
  console.log(boxed(how));
  console.log(boxed(setup));
  console.log(boxed(pipeline));
  console.log(
    `\n  ${bold}More:${reset}  aitri help --all           full reference (testing, tracking, session, features, agent-mode)\n` +
    `        aitri help <command>       details for one command\n`
  );
}
