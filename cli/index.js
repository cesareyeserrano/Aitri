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
import { runScaffoldCommand } from "./commands/scaffold.js";
import { CONFIG_FILE, loadAitriConfig, resolveProjectPaths } from "./config.js";
import { normalizeFeatureName } from "./lib.js";
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
    noBuild: false, noVerify: false, dryRun: false,
    verifyCmd: null,
    discoveryDepth: null,
    retrievalMode: null,
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

Other: preview, status, resume
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
    // Raw mode — use template with idea injected into context
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const templatePath = path.resolve(cliDir, "..", "core", "templates", "af_spec.md");
    if (!fs.existsSync(templatePath)) {
      console.log(`Template not found at: ${templatePath}`);
      console.log("Make sure Aitri repo has core/templates/af_spec.md");
      process.exit(EXIT_ERROR);
    }
    const template = fs.readFileSync(templatePath, "utf8");
    specContent = template.replace(
      "## 1. Context\nDescribe the problem context.",
      `## 1. Context\n${idea}\n\n---\n\n(Complete all requirement sections with explicit user-provided requirements before approve.)`
    );
    specContent = `${specContent}\n## 10. Requirement Source Statement\n- Requirements must be provided explicitly by the user.\n- Aitri does not invent requirements.\n`;
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
  const project = getProjectContextOrExit();
  const rawFeatureInput = String(options.feature || options.positional[0] || "").trim();
  let feature = normalizeFeatureName(rawFeatureInput);
  if (rawFeatureInput && !feature) {
    console.log("Invalid feature name. Use kebab-case (example: user-login).");
    process.exit(EXIT_ERROR);
  }
  if (!feature && !options.nonInteractive) {
    const prompted = await ask("Feature name to approve (kebab-case): ");
    feature = normalizeFeatureName(prompted);
    if (!feature && String(prompted || "").trim()) {
      console.log("Invalid feature name. Use kebab-case (example: user-login).");
      process.exit(EXIT_ERROR);
    }
  }
  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  const draftsFile = project.paths.draftSpecFile(feature);
  const approvedDir = project.paths.specsApprovedDir;
  const approvedFile = project.paths.approvedSpecFile(feature);

  if (!fs.existsSync(draftsFile)) {
    console.log(`Draft spec not found: ${path.relative(process.cwd(), draftsFile)}`);
    process.exit(EXIT_ERROR);
  }

  const content = fs.readFileSync(draftsFile, "utf8");
  const issues = [];

  // Must contain STATUS: DRAFT
  if (!/^STATUS:\s*DRAFT\s*$/m.test(content)) {
    issues.push("Spec must contain `STATUS: DRAFT`.");
  }

  // Functional Rules check (supports FR-* traceable format and legacy numbered rules)
  const rulesMatch =
    content.match(/## 3\. Functional Rules \(traceable\)([\s\S]*?)(\n##\s|\s*$)/) ||
    content.match(/## 3\. Functional Rules([\s\S]*?)(\n##\s|\s*$)/);

  if (!rulesMatch) {
    issues.push("Missing section: `## 3. Functional Rules`.");
  } else {
    const body = rulesMatch[1] || "";
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);

    const hasFR = lines.some(l => /^[-*]\s*FR-\d+\s*:\s*\S+/i.test(l));
    const hasLegacyNumbered = lines.some(l => /^\d+\.\s+\S+/.test(l));

    const meaningful = lines.some(l => {
      const cleaned = l
        .replace(/^[-*]\s*/, "")
        .replace(/^FR-\d+\s*:\s*/i, "")
        .replace(/^\d+\.\s+/, "")
        .trim();
      if (cleaned.length < 8) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<verifiable rule>/i.test(cleaned)) return false;
      if (/<[a-z\s]+>/i.test(cleaned) && cleaned.replace(/<[^>]+>/g, "").trim().length < 8) return false;
      return true;
    });

    if (!(hasFR || hasLegacyNumbered) || !meaningful) {
      issues.push("Functional Rules must include at least one meaningful rule using `- FR-1: ...` (preferred) or legacy `1. ...` format. Replace all <placeholder> tokens with real content.");
    }
  }

  // Security check
  const secMatch = content.match(/## 7\. Security Considerations([\s\S]*?)(\n##\s|\s*$)/);
  if (!secMatch) {
    issues.push("Missing section: `## 7. Security Considerations`.");
  } else {
    const lines = secMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const meaningful = lines.some(l => {
  const cleaned = l.replace(/^[-*]\s*/, "").trim();
  if (cleaned.length < 5) return false;
  if (cleaned.includes("<") && cleaned.includes(">")) return false;
  return true;
});
    if (!meaningful) {
      issues.push("Security Considerations must include at least one meaningful bullet.");
    }
  }

  // Acceptance Criteria check
  const acMatch = content.match(/## 9\. Acceptance Criteria([\s\S]*?)(\n##\s|\s*$)/);
  if (!acMatch) {
    issues.push("Missing section: `## 9. Acceptance Criteria`.");
  } else {
    const acLines = acMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const acMeaningful = acLines.some(l => {
      const cleaned = l
        .replace(/^[-*]\s*/, "")
        .replace(/^AC-\d+\s*:\s*/i, "")
        .trim();
      if (cleaned.length < 8) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<context>/i.test(cleaned) || /<action>/i.test(cleaned) || /<expected>/i.test(cleaned)) return false;
      if (/<[a-z\s]+>/i.test(cleaned) && cleaned.replace(/<[^>]+>/g, "").trim().length < 8) return false;
      return true;
    });
    if (!acMeaningful) {
      issues.push("Acceptance Criteria must include at least one meaningful criterion. Replace all <placeholder> tokens (e.g. <context>, <action>, <expected>) with real content.");
    }
  }

  // Actors check (section 2)
  const actorsMatch = content.match(/## 2\. Actors([\s\S]*?)(\n##\s|\s*$)/);
  if (!actorsMatch) {
    issues.push("Missing section: `## 2. Actors`.");
  } else {
    const actorLines = actorsMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const actorMeaningful = actorLines.some(l => {
      const cleaned = l.replace(/^[-*]\s*/, "").trim();
      if (cleaned.length < 3) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<actor>/i.test(cleaned) || /<role>/i.test(cleaned)) return false;
      return true;
    });
    if (!actorMeaningful) {
      issues.push("Actors section must list at least one real actor/role. Replace all <placeholder> tokens with real content.");
    }
  }

  // Edge Cases check (section 4)
  const edgeMatch = content.match(/## 4\. Edge Cases([\s\S]*?)(\n##\s|\s*$)/);
  if (!edgeMatch) {
    issues.push("Missing section: `## 4. Edge Cases`.");
  } else {
    const edgeLines = edgeMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const edgeMeaningful = edgeLines.some(l => {
      const cleaned = l.replace(/^[-*]\s*/, "").trim();
      if (cleaned.length < 8) return false;
      if (/^<.*>$/.test(cleaned)) return false;
      if (/<[a-z\s]+>/i.test(cleaned) && cleaned.replace(/<[^>]+>/g, "").trim().length < 8) return false;
      return true;
    });
    if (!edgeMeaningful) {
      issues.push("Edge Cases must include at least one meaningful scenario. Replace all <placeholder> tokens with real content.");
    }
  }

  // Asset strategy check for visual/game/web domains
  const contextMatch = content.match(/## 1\. Context([\s\S]*?)(\n##\s|\s*$)/);
  const contextText = contextMatch ? contextMatch[1].toLowerCase() : "";
  const fullLower = content.toLowerCase();
  const isVisualDomain = /\b(game|juego|sprite|canvas|webgl|three\.?js|phaser|godot|unity|animation|visual|graphic|ui\s*design|web\s*app|frontend|pixel|tilemap|asset|artwork|render)\b/.test(contextText) ||
    /\b(game|juego|sprite|canvas|webgl|three\.?js|phaser)\b/.test(fullLower);

  if (isVisualDomain) {
    const hasAssetSection = /##\s*\d*\.?\s*(Assets|Asset Strategy|Visual Assets|Art Direction|Resource Requirements)/i.test(content);
    const hasAssetMention = /\b(sprite|texture|image|sound|audio|music|font|tileset|asset|artwork|art\s*style|resolution|pixel\s*art|3d\s*model)\b/i.test(content);
    if (!hasAssetSection && !hasAssetMention) {
      issues.push("This spec describes a visual/game project but has no asset strategy. Add a section describing required assets (sprites, sounds, art style, etc.) or reference them in Functional Rules.");
    }
  }

  if (/Aitri suggestion \(auto-applied\)/i.test(content) || /Technology source:\s*Aitri suggestion/i.test(content)) {
    issues.push("Requirements source integrity: this draft contains AI-inferred requirement hints. Replace them with explicit user-provided requirements before approve.");
  }

  if (issues.length > 0 && !options.nonInteractive) {
    // Interactive correction mode
    console.log("APPROVE GATE — issues found:");
    issues.forEach((issue, idx) => console.log(`  ${idx + 1}. ${issue}`));
    console.log("\nAitri can help you fix these now.\n");

    let updatedContent = content;
    let fixedCount = 0;

    for (const issue of issues) {
      if (issue.includes("Functional Rules")) {
        const answer = await ask("Enter a functional rule (e.g., 'The system must validate user input before processing'): ");
        if (answer.trim()) {
          const frLine = `- FR-1: ${answer.trim()}`;
          updatedContent = updatedContent.replace(
            /## 3\. Functional Rules[^\n]*\n([\s\S]*?)(\n##)/,
            `## 3. Functional Rules (traceable)\n${frLine}\n$2`
          );
          fixedCount++;
        }
      } else if (issue.includes("Security Considerations")) {
        const answer = await ask("Enter a security consideration (e.g., 'Sanitize all user input to prevent injection'): ");
        if (answer.trim()) {
          updatedContent = updatedContent.replace(
            /## 7\. Security Considerations\n([\s\S]*?)(\n##)/,
            `## 7. Security Considerations\n- ${answer.trim()}\n$2`
          );
          fixedCount++;
        }
      } else if (issue.includes("Acceptance Criteria")) {
        const answer = await ask("Enter an acceptance criterion (Given [context], when [action], then [result]): ");
        if (answer.trim()) {
          updatedContent = updatedContent.replace(
            /## 9\. Acceptance Criteria[^\n]*\n([\s\S]*?)(\n##|$)/,
            `## 9. Acceptance Criteria\n- AC-1: ${answer.trim()}\n$2`
          );
          fixedCount++;
        }
      } else if (issue.includes("Actors")) {
        const answer = await ask("Who uses this system? (e.g., 'End user', 'Admin'): ");
        if (answer.trim()) {
          if (actorsMatch) {
            updatedContent = updatedContent.replace(
              /## 2\. Actors\n([\s\S]*?)(\n##)/,
              `## 2. Actors\n- ${answer.trim()}\n$2`
            );
          } else {
            updatedContent = updatedContent.replace(
              /## 3\./,
              `## 2. Actors\n- ${answer.trim()}\n\n## 3.`
            );
          }
          fixedCount++;
        }
      } else if (issue.includes("Edge Cases")) {
        const answer = await ask("Enter an edge case (what could go wrong?): ");
        if (answer.trim()) {
          if (edgeMatch) {
            updatedContent = updatedContent.replace(
              /## 4\. Edge Cases\n([\s\S]*?)(\n##)/,
              `## 4. Edge Cases\n- ${answer.trim()}\n$2`
            );
          } else {
            updatedContent = updatedContent.replace(
              /## 5\./,
              `## 4. Edge Cases\n- ${answer.trim()}\n\n## 5.`
            );
            if (!updatedContent.includes("## 4. Edge Cases")) {
              updatedContent = updatedContent.replace(
                /## 7\./,
                `## 4. Edge Cases\n- ${answer.trim()}\n\n## 7.`
              );
            }
          }
          fixedCount++;
        }
      } else if (issue.includes("asset strategy") || issue.includes("visual/game")) {
        console.log("This project needs a resource/asset strategy.");
        console.log("  a) I have my own resources");
        console.log("  b) Generate programmatic placeholders");
        console.log("  c) Search for free resources online");
        console.log("  d) I have an account/service");
        const answer = (await ask("Resource strategy (a/b/c/d): ")).trim().toLowerCase();
        let strategy = "Generate programmatic placeholders only.";
        if (answer === "a" || answer.startsWith("a")) {
          strategy = "User provides own resources. Agent must ask for resource paths.";
        } else if (answer === "c" || answer.startsWith("c")) {
          strategy = "Agent should search for free/open-licensed resources online.";
        } else if (answer === "d" || answer.startsWith("d")) {
          const svc = await ask("  Which service? (e.g., itch.io, Unsplash): ");
          strategy = `User has account on: ${svc || "external service"}.`;
        }
        updatedContent += `\n## 10. Resource Strategy\n- ${strategy}\n`;
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      fs.writeFileSync(draftsFile, updatedContent, "utf8");
      console.log(`\nFixed ${fixedCount} issue(s) in ${path.relative(process.cwd(), draftsFile)}.`);
      console.log(`Run again: aitri approve --feature ${feature}`);
    } else {
      console.log(`\nNo fixes applied. Edit manually: ${path.relative(process.cwd(), draftsFile)}`);
      console.log(`Then run: aitri approve --feature ${feature}`);
    }
    process.exit(EXIT_ERROR);
  }

  if (issues.length > 0) {
    // Non-interactive mode — just report
    console.log("GATE FAILED:");
    issues.forEach(i => console.log("- " + i));
    console.log(`\nFix: ${path.relative(process.cwd(), draftsFile)}`);
    console.log(`Run: aitri approve --feature ${feature}`);
    process.exit(EXIT_ERROR);
  }

  const plan = [
    `Move: ${path.relative(process.cwd(), draftsFile)} → ${path.relative(process.cwd(), approvedFile)}`
  ];

  console.log("PLAN:");
  plan.forEach(p => console.log("- " + p));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
  }

  fs.mkdirSync(approvedDir, { recursive: true });

  const updated = content.replace(/^STATUS:\s*DRAFT\s*$/m, "STATUS: APPROVED");
  fs.writeFileSync(approvedFile, updated, "utf8");
  fs.unlinkSync(draftsFile);

  console.log("Spec approved successfully.");
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "approve",
    feature
  }));
  await exitWithFlow({ code: EXIT_OK, command: cmd, options, feature });
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
  const code = await runPreviewCommand({
    options, getProjectContextOrExit,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "scaffold" || cmd === "implement") {
  if (!wantsJson(options, options.positional)) console.log(`DEPRECATION: \`aitri ${cmd}\` is deprecated. Use \`aitri build\` instead.`);
  const handler = cmd === "scaffold" ? runScaffoldCommand : runImplementCommand;
  const code = await handler({
    options, getProjectContextOrExit, getStatusReportOrExit,
    confirmProceed, printCheckpointSummary, runAutoCheckpoint,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "deliver") {
  const code = await runDeliverCommand({
    options, getProjectContextOrExit, getStatusReportOrExit, confirmProceed,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
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
  const code = await runResumeCommand({
    options,
    getStatusReportOrExit,
    toRecommendedCommand,
    confirmResume,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "handoff") {
  const code = runHandoffCommand({
    options,
    getStatusReportOrExit,
    toRecommendedCommand,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "go") {
  const code = await runGoCommand({
    options,
    getStatusReportOrExit,
    toRecommendedCommand,
    getProjectContextOrExit,
    confirmProceed,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
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

if (cmd === "features") {
  const code = runFeaturesCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "next") {
  const code = await runNextCommand({ options, ask, getProjectContextOrExit, confirmProceed, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

console.log("Unknown command.");
process.exit(EXIT_ERROR);
