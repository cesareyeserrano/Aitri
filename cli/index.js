#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { getStatusReport, runStatus } from "./commands/status.js";
import {
  runDiscoverCommand,
  runPlanCommand,
  runValidateCommand
} from "./commands/discovery-plan-validate.js";
import { runDeliverCommand } from "./commands/deliver.js";
import { runImplementCommand } from "./commands/implement.js";
import { runInitCommand } from "./commands/init.js";
import { runCompletionGuide } from "./commands/post-delivery.js";
import {
  runGoCommand,
  runHandoffCommand,
  runPolicyCommand,
  runResumeCommand,
  runVerifyCommand
} from "./commands/runtime-flow.js";
import { runBuildCommand } from "./commands/build.js";
import { runPreviewCommand } from "./commands/preview.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runUpgradeCommand } from "./commands/upgrade.js";
import { runFeaturesCommand, runNextCommand } from "./commands/features.js";
import { runAmendCommand } from "./commands/amend.js";
import { runFeedbackCommand } from "./commands/feedback.js";
import { runTriageCommand } from "./commands/triage.js";
import { runRoadmapCommand } from "./commands/roadmap.js";
import { runChangelogCommand } from "./commands/changelog.js";
import { runApproveCommand } from "./commands/approve.js";
import { runHooksCommand } from "./commands/hooks.js";
import { runCiCommand } from "./commands/ci.js";
import { runSpecImproveCommand } from "./commands/spec-improve.js";
import { runExecuteCommand } from "./commands/execute.js";
import { runScaffoldCommand } from "./commands/scaffold.js";
import { runCheckpointCommand, runCheckpointShowCommand } from "./commands/checkpoint.js";
import { runVerifyIntentCommand } from "./commands/verify-intent.js";
import { runVerifyCoverageCommand } from "./commands/verify-coverage.js";
import { runDiffCommand } from "./commands/diff.js";
import { runAdoptCommand } from "./commands/adopt.js";
import { CONFIG_FILE, loadAitriConfig, resolveProjectPaths } from "./config.js";
import { normalizeFeatureName, smartExtractSpec } from "./lib.js";
import {
  confirmProceed as confirmProceedSession,
  confirmResume as confirmResumeSession,
  confirmYesNo as confirmYesNoSession,
  runAutoCheckpoint as runAutoCheckpointSession,
  printCheckpointSummary,
  exitWithFlow as exitWithFlowSession
} from "./commands/session-control.js";

function showBanner() {
  const iron = "\x1b[38;5;24m";      // dark iron gray
  const fire = "\x1b[38;5;208m";     // forge orange
  const ember = "\x1b[38;5;196m";    // deep red
  const reset = "\x1b[0m";

  console.log(`
${iron}   █████╗ ██╗████████╗██████╗ ██╗${reset}
${iron}  ██╔══██╗██║╚══██╔══╝██╔══██╗██║${reset}
${fire}  ███████║██║   ██║   ██████╔╝██║${reset}
${ember}  ██╔══██║██║   ██║   ██╔══██╗██║${reset}
${fire}  ██║  ██║██║   ██║   ██║  ██║██║${reset}
${iron}  ╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝${reset}

${fire}⚒ Spec-Driven Development Engine.${reset}
${iron}Aitri designed by César Augusto Reyes${reset}
`);
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function askRequired(question) {
  while (true) {
    const value = await ask(question);
    if (String(value || "").trim()) return value.trim();
    console.log("This field is required. Aitri cannot infer requirements.");
  }
}

function parseArgs(argv) {
  const parsed = {
    json: false,
    ui: false,
    openUi: true,
    format: null,
    autoCheckpoint: true,
    autoAdvance: true,
    nonInteractive: false,
    strictPolicy: false,
    guided: true,
    raw: false,
    yes: false,
    idea: null,
    feature: null,
    project: null,
    story: null,
    noBuild: false, noVerify: false, dryRun: false, verify: false, note: null, source: null, ref: null,
    verifyCmd: null,
    discoveryDepth: null,
    retrievalMode: null,
    depth: null, action: null, port: 4173,
    aiBacklog: null, aiTests: null, aiArchitecture: null,
    proposed: null,
    positional: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json" || arg === "-j") {
      parsed.json = true;
    } else if (arg === "--ui") {
      parsed.ui = true;
    } else if (arg === "--no-open") {
      parsed.openUi = false;
    } else if (arg === "--no-auto-advance") {
      parsed.autoAdvance = false;
    } else if (arg === "--no-checkpoint") {
      parsed.autoCheckpoint = false;
    } else if (arg === "--format") {
      parsed.format = (argv[i + 1] || "").trim().toLowerCase();
      i += 1;
    } else if (arg.startsWith("--format=")) {
      parsed.format = arg.slice("--format=".length).trim().toLowerCase();
    } else if (arg === "--non-interactive") {
      parsed.nonInteractive = true;
    } else if (arg === "--strict-policy") {
      parsed.strictPolicy = true;
    } else if (arg === "--guided") {
      parsed.guided = true;
    } else if (arg === "--raw") {
      parsed.guided = false;
      parsed.raw = true;
    } else if (arg === "--yes" || arg === "-y") {
      parsed.yes = true;
    } else if (arg === "--idea") {
      parsed.idea = (argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--idea=")) {
      parsed.idea = arg.slice("--idea=".length).trim();
    } else if (arg === "--feature" || arg === "-f") {
      parsed.feature = (argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--feature=")) {
      parsed.feature = arg.slice("--feature=".length).trim();
    } else if (arg === "--project") {
      parsed.project = (argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--project=")) {
      parsed.project = arg.slice("--project=".length).trim();
    } else if (arg === "--story" || arg === "-s") {
      parsed.story = (argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--story=")) {
      parsed.story = arg.slice("--story=".length).trim();
    } else if (arg === "--no-build") { parsed.noBuild = true;
    } else if (arg === "--no-verify") { parsed.noVerify = true;
    } else if (arg === "--dry-run") { parsed.dryRun = true;
    } else if (arg === "--note") { parsed.note = (argv[i + 1] || "").trim(); i += 1;
    } else if (arg === "--source") { parsed.source = (argv[i + 1] || "").trim(); i += 1;
    } else if (arg === "--ref") { parsed.ref = (argv[i + 1] || "").trim(); i += 1;
    } else if (arg === "--verify-cmd") {
      parsed.verifyCmd = (argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--verify-cmd=")) {
      parsed.verifyCmd = arg.slice("--verify-cmd=".length).trim();
    } else if (arg === "--discovery-depth") {
      parsed.discoveryDepth = (argv[i + 1] || "").trim().toLowerCase();
      i += 1;
    } else if (arg.startsWith("--discovery-depth=")) {
      parsed.discoveryDepth = arg.slice("--discovery-depth=".length).trim().toLowerCase();
    } else if (arg === "--retrieval-mode") {
      parsed.retrievalMode = (argv[i + 1] || "").trim().toLowerCase();
      i += 1;
    } else if (arg.startsWith("--retrieval-mode=")) {
      parsed.retrievalMode = arg.slice("--retrieval-mode=".length).trim().toLowerCase();
    } else if (arg === "--depth") { parsed.depth = (argv[i+1]||"").trim(); i+=1;
    } else if (arg === "--action") { parsed.action = (argv[i+1]||"").trim(); i+=1;
    } else if (arg === "--port") { parsed.port = parseInt(argv[i+1]||"4173",10); i+=1;
    } else if (arg === "--no-test") { parsed.noTest = true;
    } else if (arg === "--verify") { parsed.verify = true;
    } else if (arg === "--hook") { parsed.hook = (argv[i+1]||"").trim(); i+=1;
    } else if (arg === "--provider") { parsed.provider = (argv[i+1]||"").trim(); i+=1;
    } else if (arg === "--all") { parsed.all = true;
    } else if (arg === "--ai-backlog") { parsed.aiBacklog = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--ai-backlog=")) { parsed.aiBacklog = arg.slice("--ai-backlog=".length).trim();
    } else if (arg === "--ai-tests") { parsed.aiTests = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--ai-tests=")) { parsed.aiTests = arg.slice("--ai-tests=".length).trim();
    } else if (arg === "--ai-architecture") { parsed.aiArchitecture = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--ai-architecture=")) { parsed.aiArchitecture = arg.slice("--ai-architecture=".length).trim();
    } else if (arg === "--proposed") { parsed.proposed = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--proposed=")) { parsed.proposed = arg.slice("--proposed=".length).trim();
    } else {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}

function wantsJson(options, positional = []) {
  if (options.json) return true;
  if ((options.format || "").toLowerCase() === "json") return true;
  return positional.some((p) => p.toLowerCase() === "json");
}

function wantsUi(options, positional = []) {
  if (options.ui) return true;
  if ((options.format || "").toLowerCase() === "ui") return true;
  return positional.some((p) => p.toLowerCase() === "ui");
}

function toRecommendedCommand(nextStep) {
  if (!nextStep) return null;
  if (nextStep === "ready_for_human_approval") return "aitri go";
  return nextStep;
}

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_ABORTED = 2;
const AUTO_CHECKPOINT_MAX = 10;

function getProjectContextOrExit() {
  try {
    const config = loadAitriConfig(process.cwd());
    const paths = resolveProjectPaths(process.cwd(), config.paths);
    return { config, paths };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid ${CONFIG_FILE}`;
    console.log(message);
    process.exit(EXIT_ERROR);
  }
}

function getStatusReportOrExit(feature = null) {
  try {
    return getStatusReport({ root: process.cwd(), feature });
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid ${CONFIG_FILE}`;
    console.log(message);
    process.exit(EXIT_ERROR);
  }
}

function runAutoCheckpoint({ enabled, phase, feature }) {
  return runAutoCheckpointSession({
    enabled,
    phase,
    feature,
    getProjectContextOrExit,
    autoCheckpointMax: AUTO_CHECKPOINT_MAX,
    cwd: process.cwd()
  });
}

async function confirmProceed(opts) {
  return confirmProceedSession({ options: opts, ask });
}

async function confirmResume(opts) {
  return confirmResumeSession({ options: opts, ask });
}

async function exitWithFlow({ code, command, options, feature = null }) {
  await exitWithFlowSession({
    code,
    command,
    options,
    feature,
    getStatusReport,
    toRecommendedCommand,
    wantsJson,
    wantsUi,
    runCompletionGuide,
    confirmYesNoFn: ({ question, defaultYes = true }) => confirmYesNoSession({ ask, question, defaultYes }),
    cliPath: fileURLToPath(import.meta.url),
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR }
  });
}

function printGuidedDraftWizard() {
  console.log("\nGuided Draft Wizard (English prompts)");
  console.log("Answer explicitly. Aitri structures your inputs but does not invent requirements.");
  console.log("All requirements in the draft must be provided by you.");
  console.log("Example feature name: user-login\n");
}

const cmd = process.argv[2];
const options = parseArgs(process.argv.slice(3));

if (cmd === "--version" || cmd === "-v") {
  const pkgPath = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  console.log(`aitri v${pkg.version}`);
  process.exit(EXIT_OK);
}

if (!cmd || cmd === "help") {
  showBanner();
  const advanced = process.argv.includes("--advanced");
  console.log(`
Aitri ⚒️  — Spec-driven software factory

Workflow:
  1. aitri init       Initialize project structure
  2. aitri draft      Capture requirements into a draft spec
  3. aitri approve    Quality gate — validate spec completeness
  4. aitri plan       Discovery interview + plan + backlog + tests
  5. aitri go         Validate + policy + human approval gate
  6. aitri build      Per-story: scaffold + brief + verify [--story US-N]
     [WRITE CODE]    You or your AI agent implements each story
  7. aitri deliver    Release tag + build artifact

Other: preview, status, resume, checkpoint, verify-intent, spec-improve, diff, adopt, upgrade
Still work (deprecated): discover, validate, handoff, scaffold, implement, verify, policy

Common options:
  --feature, -f <name>   Specify feature name
  --yes, -y              Auto-confirm prompts
  --json, -j             Machine-readable output`);

  if (advanced) {
    console.log(`
Advanced options:
  --idea <text>          Idea text for non-interactive draft
  --story, -s <US-N>     Target a single story (build)
  --no-verify            Skip verification step (build)
  --no-build             Skip build command (deliver)
  --verify-cmd <cmd>     Explicit runtime verification command
  --discovery-depth <d>  Discovery depth: quick | standard | deep
  --retrieval-mode <m>   Retrieval mode: section | semantic
  --project <name>       Specify project name (init metadata)
  --raw                  Use free-form draft instead of guided wizard
  --ui                   Generate status insight page
  --non-interactive      Suppress all prompts (CI/pipeline mode)
  --no-checkpoint        Disable auto-checkpoint`);
  } else {
    console.log(`
Run \`aitri help --advanced\` for all options.`);
  }

  console.log("");
  process.exit(EXIT_OK);
}

if (cmd === "init") {
  const code = await runInitCommand({
    options,
    ask,
    showBanner,
    getProjectContextOrExit,
    confirmProceed,
    runAutoCheckpoint,
    printCheckpointSummary,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}
 
if (cmd === "draft") {
  const project = getProjectContextOrExit();
  // We expect to run this from a project repo, not from the Aitri repo
  const rawFeatureInput = String(options.feature || options.positional[0] || "").trim();
  let feature = normalizeFeatureName(rawFeatureInput);
  if (rawFeatureInput && !feature) {
    console.log("Invalid feature name. Use kebab-case (example: user-login).");
    process.exit(EXIT_ERROR);
  }
  if (!feature && !options.nonInteractive) {
    const prompted = await ask("Feature name in kebab-case (example: user-login): ");
    feature = normalizeFeatureName(prompted);
    if (!feature && String(prompted || "").trim()) {
      console.log("Invalid feature name. Use kebab-case (example: user-login).");
      process.exit(EXIT_ERROR);
    }
  }
  if (!feature) {
    console.log("Feature name is required. Use kebab-case (example: user-login).");
    process.exit(EXIT_ERROR);
  }

  let idea = options.idea || "";
  let wizardSections = null;

  if (options.guided && !options.nonInteractive) {
    // Full guided wizard — produces complete spec sections
    printGuidedDraftWizard();
    const summary = idea || await askRequired("1) What do you want to build?\n   Example: \"A zombie survival game with waves, power-ups, and a scoring system\"\n   > ");
    const actor = await askRequired("2) Who uses it?\n   Example: \"Player\", \"Admin\", \"Support agent\"\n   > ");
    const outcome = await askRequired("3) What should happen when it works?\n   Example: \"Player can survive zombie waves, collect power-ups, and see their score\"\n   > ");
    const inScope = await askRequired("4) What's included?\n   Example: \"Game mechanics, scoring, 3 zombie types, health system\"\n   > ");
    const outOfScope = await ask("5) What's excluded? (optional, press Enter to skip)\n   Example: \"Multiplayer, leaderboard server, account system\"\n   > ");
    const technology = await ask("6) Preferred stack (optional):\n   Example: \"React + Node.js + PostgreSQL\"\n   > ");
    const resolvedTech = technology || "Not specified by user.";

    console.log("\nNow let's define the key rules and quality criteria.");
    console.log("Tip: be specific. Aitri uses these to generate tests and validate delivery.\n");

    const fr1 = await askRequired("7) Main functional rule — what MUST the system do?\n   Example: \"The system must spawn a new zombie wave every 30 seconds with increasing difficulty\"\n   > ");
    const fr2 = await ask("8) Second rule (optional, press Enter to skip)\n   Example: \"The system must save the player's high score locally\"\n   > ");

    const edge1 = await askRequired("9) An edge case — what could go wrong or be unexpected?\n   Example: \"Player dies while a power-up animation is active\"\n   > ");

    const sec1 = await askRequired("10) A security consideration\n   Example: \"Sanitize user input in the score submission form\"\n   > ");

    const ac1 = await askRequired("11) Acceptance criterion — describe a testable scenario:\n   Example: \"Given a player with full health, when hit by a zombie, then health decreases by 20\"\n   > ");
    const resourceStrategy = await ask("12) Resource strategy (optional):\n   Example: \"Assets provided by user in /assets\" or \"No external assets required\"\n   > ");

    wizardSections = {
      context: [
        summary || "TBD",
        "",
        `Primary actor: ${actor || "TBD"}`,
        `Expected outcome: ${outcome || "TBD"}`,
        `In scope: ${inScope || "TBD"}`,
        `Out of scope: ${outOfScope || "Not specified by user."}`,
        `Technology: ${resolvedTech}`,
        "Requirement source: Provided explicitly by user in guided draft."
      ].join("\n"),
      actors: `- ${actor}`,
      functionalRules: [
        `- FR-1: ${fr1}`,
        fr2 ? `- FR-2: ${fr2}` : null
      ].filter(Boolean).join("\n"),
      edgeCases: `- ${edge1}`,
      security: `- ${sec1}`,
      acceptanceCriteria: `- AC-1: ${ac1}`,
      outOfScope: outOfScope || "Not specified by user.",
      resourceStrategy: resourceStrategy.trim()
    };

    idea = wizardSections.context;

  } else if (options.guided && options.nonInteractive) {
    // Non-interactive guided — no inferred requirements.
    if (!idea) {
      console.log("In non-interactive mode, provide --idea \"<summary>\".");
      process.exit(EXIT_ERROR);
    }
    if (idea.trim().length < 15) {
      console.log("Idea is too short. Provide at least 15 characters describing what you want to build.");
      console.log("Example: --idea \"A REST API for tracking expense entries with validation and audit logs\"");
      process.exit(EXIT_ERROR);
    }
    idea = [
      `Summary (provided by user): ${idea}`,
      "Requirement source: provided explicitly by user via --idea.",
      "No inferred requirements were added by Aitri."
    ].join("\n");
  } else {
    // Raw mode (--raw): free-form idea text
    if (!idea && !options.nonInteractive) {
      idea = await ask("Describe the idea in 1-3 lines: ");
    }
  }
  if (!idea) {
    console.log("Idea is required. Provide --idea in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  const outDir = project.paths.specsDraftsDir;
  const outFile = project.paths.draftSpecFile(feature);

  const plan = [
    `Create: ${path.relative(process.cwd(), outDir)}`,
    `Create: ${path.relative(process.cwd(), outFile)}`
  ];

  console.log("PLAN:");
  plan.forEach((p) => console.log("- " + p));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
  }

  fs.mkdirSync(outDir, { recursive: true });

  let specContent;
  if (wizardSections) {
    // Generate complete spec from wizard answers — no template placeholders
    const parts = [
      `# AF-SPEC: ${feature}`,
      "",
      "STATUS: DRAFT",
      "",
      "## 1. Context",
      wizardSections.context,
      "",
      "## 2. Actors",
      wizardSections.actors,
      "",
      "## 3. Functional Rules (traceable)",
      wizardSections.functionalRules,
      "",
      "## 4. Edge Cases",
      wizardSections.edgeCases,
      "",
      "## 5. Failure Conditions",
      "- TBD (refine during review)",
      "",
      "## 6. Non-Functional Requirements",
      "- TBD (refine during review)",
      "",
      "## 7. Security Considerations",
      wizardSections.security,
      "",
      "## 8. Out of Scope",
      `- ${wizardSections.outOfScope}`,
      "",
      "## 9. Acceptance Criteria",
      wizardSections.acceptanceCriteria,
      "",
      "## 10. Requirement Source Statement",
      "- All requirements in this draft were provided explicitly by the user.",
      "- Aitri structured the content and did not invent requirements."
    ];
    if (wizardSections.resourceStrategy) {
      parts.push("", "## 11. Resource Strategy", `- ${wizardSections.resourceStrategy}`);
    }
    parts.push("");
    specContent = parts.join("\n");
  } else {
    // Raw mode — smart extraction when idea is detailed, template fallback otherwise
    const rawIdea = String(options.idea || idea || "");
    const extracted = smartExtractSpec(rawIdea);
    const cliDir = path.dirname(fileURLToPath(import.meta.url));

    if (extracted.confidence !== "low") {
      // Pre-fill sections from the idea — only mark genuinely unknown things
      const parts = [
        `# AF-SPEC: ${feature}`, "", "STATUS: DRAFT", "",
        "## 1. Context",
        `Summary (provided by user): ${rawIdea}`,
        "Requirement source: provided explicitly by user via --idea.", "",
        "## 2. Actors",
        extracted.actors || "- [CLARIFY: Who are the primary actors/users of this system?]", "",
        "## 3. Functional Rules (traceable)",
        extracted.frs || "- FR-1: [CLARIFY: List the functional rules as verifiable statements]", "",
        "## 4. Edge Cases",
        "- [CLARIFY: What happens with invalid inputs, empty states, or concurrent requests?]", "",
        "## 5. Failure Conditions",
        "- [CLARIFY: How should the system behave when things go wrong?]", "",
        "## 6. Non-Functional Requirements",
        extracted.nfrs || "- [CLARIFY: Performance, scalability, or technology constraints]", "",
        "## 7. Security Considerations",
        extracted.security || "- [CLARIFY: Authentication, authorization, and input validation requirements]", "",
        "## 8. Out of Scope",
        "- [CLARIFY: What is explicitly excluded from this version?]", "",
        "## 9. Acceptance Criteria (Given/When/Then)",
        "- AC-1: Given <context>, when <action>, then <expected outcome>.", "",
        "## 10. Requirement Source Statement",
        "- Requirements provided explicitly by the user via --idea.",
        `- Aitri extracted ${extracted.frs ? "functional rules" : "context"} from the brief. Verify and complete placeholders before approve.`,
        ""
      ];
      specContent = parts.join("\n");
      console.log(`Smart extraction: ${extracted.confidence} confidence — ${extracted.frs ? "FRs pre-filled" : "context captured"}. Complete [CLARIFY] sections before approve.`);
    } else {
      const templatePath = path.resolve(cliDir, "..", "core", "templates", "af_spec.md");
      if (!fs.existsSync(templatePath)) {
        console.log(`Template not found at: ${templatePath}`);
        process.exit(EXIT_ERROR);
      }
      const template = fs.readFileSync(templatePath, "utf8");
      specContent = template.replace(
        "## 1. Context\nDescribe the problem context.",
        `## 1. Context\n${idea}\n\n---\n\n(Complete all requirement sections with explicit user-provided requirements before approve.)`
      );
      specContent = `${specContent}\n## 10. Requirement Source Statement\n- Requirements must be provided explicitly by the user.\n- Aitri does not invent requirements.\n`;
    }
  }

  fs.writeFileSync(outFile, specContent, "utf8");

  console.log(`Draft spec created: ${path.relative(process.cwd(), outFile)}`);
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "draft",
    feature
  }));
  console.log(`Next recommended command: aitri approve --feature ${feature}`);
  await exitWithFlow({ code: EXIT_OK, command: cmd, options, feature });
}

if (cmd === "approve") {
  const code = await runApproveCommand({ options, ask, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }, exitWithFlow });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "discover") {
  const code = await runDiscoverCommand({ options, ask, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "plan") {
  const code = await runPlanCommand({ options, ask, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "verify") {
  const code = await runVerifyCommand({ options, getProjectContextOrExit, ask, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "build") {
  const code = await runBuildCommand({ options, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "preview") {
  const code = await runPreviewCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "scaffold" || cmd === "implement") {
  if (!wantsJson(options, options.positional)) console.log(`DEPRECATION: \`aitri ${cmd}\` is deprecated. Use \`aitri build\` instead.`);
  const handler = cmd === "scaffold" ? runScaffoldCommand : runImplementCommand;
  const code = await handler({ options, getProjectContextOrExit, getStatusReportOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "deliver") {
  const code = await runDeliverCommand({ options, getProjectContextOrExit, getStatusReportOrExit, confirmProceed, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "policy") {
  if (!wantsJson(options, options.positional)) console.log("DEPRECATION: `aitri policy` is deprecated. Policy checks run inside `aitri go`.");
  const code = runPolicyCommand({
    options, getProjectContextOrExit, getStatusReportOrExit,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "validate") {
  if (!wantsJson(options, options.positional)) console.log("DEPRECATION: `aitri validate` is deprecated. Validation runs inside `aitri go`.");
  const code = await runValidateCommand({
    options,
    ask,
    getProjectContextOrExit,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "status") {
  try {
    const ok = runStatus({
      json: wantsJson(options, options.positional),
      ui: wantsUi(options, options.positional),
      openUi: options.openUi,
      root: process.cwd(),
      feature: options.feature
    });
    if (!ok) process.exit(EXIT_ERROR);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid ${CONFIG_FILE}`;
    console.log(message);
    process.exit(EXIT_ERROR);
  }
  await exitWithFlow({ code: EXIT_OK, command: cmd, options });
}

if (cmd === "resume") {
  const code = await runResumeCommand({ options, getStatusReportOrExit, toRecommendedCommand, confirmResume, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "handoff") {
  const code = runHandoffCommand({ options, getStatusReportOrExit, toRecommendedCommand, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "go") {
  const code = await runGoCommand({ options, getStatusReportOrExit, toRecommendedCommand, getProjectContextOrExit, confirmProceed, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "doctor") {
  const code = runDoctorCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "upgrade") {
  const code = await runUpgradeCommand({ options, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "adopt") {
  const code = await runAdoptCommand({ options, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "features") {
  const code = runFeaturesCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "next") {
  const code = await runNextCommand({ options, ask, getProjectContextOrExit, confirmProceed, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "amend") {
  const code = await runAmendCommand({ options, ask, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "feedback") {
  const code = await runFeedbackCommand({ options, ask, askRequired, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "triage") {
  const code = await runTriageCommand({ options, ask, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "roadmap") {
  const code = runRoadmapCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "changelog") {
  const code = runChangelogCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "hooks") {
  const code = await runHooksCommand({ options, getProjectContextOrExit, confirmProceed, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "ci") {
  const code = await runCiCommand({ options, getProjectContextOrExit, confirmProceed, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "spec-improve") {
  const code = await runSpecImproveCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "execute") {
  const code = await runExecuteCommand({ options, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "verify-intent") {
  const code = await runVerifyIntentCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  process.exit(code);
}

if (cmd === "verify-coverage") {
  const code = runVerifyCoverageCommand({ options, getProjectContextOrExit, getStatusReportOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  process.exit(code);
}

if (cmd === "diff") {
  const code = runDiffCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  process.exit(code);
}

if (cmd === "checkpoint") {
  const subCmd = options.positional[0];
  let code;
  if (subCmd === "show") {
    code = runCheckpointShowCommand({ exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  } else {
    code = runCheckpointCommand({ options, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  }
  process.exit(code);
}

console.log("Unknown command.");
process.exit(EXIT_ERROR);
