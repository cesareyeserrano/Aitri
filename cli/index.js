#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getStatusReport, runStatus } from "./commands/status.js";
import {
  runDiscoverCommand,
  runPlanCommand,
  runValidateCommand
} from "./commands/discovery-plan-validate.js";
import { runDeliverCommand } from "./commands/deliver.js";
import { runImplementCommand } from "./commands/implement.js";
import { runCompletionGuide } from "./commands/post-delivery.js";
import {
  runGoCommand,
  runHandoffCommand,
  runPolicyCommand,
  runResumeCommand,
  runVerifyCommand
} from "./commands/runtime-flow.js";
import { runScaffoldCommand } from "./commands/scaffold.js";
import { CONFIG_FILE, loadAitriConfig, resolveProjectPaths } from "./config.js";
import { normalizeFeatureName } from "./lib.js";

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
  if (nextStep === "ready_for_human_approval") return "aitri handoff";
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

function getStatusReportOrExit() {
  try {
    return getStatusReport({ root: process.cwd() });
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid ${CONFIG_FILE}`;
    console.log(message);
    process.exit(EXIT_ERROR);
  }
}

function shellEscapeSingle(value) {
  return String(value).replace(/'/g, "'\\''");
}

function runGit(cmd, cwd) {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return { ok: true, out };
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    return { ok: false, out: "", err: stderr || "git command failed" };
  }
}

function runGitRaw(cmd, cwd) {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, out };
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    return { ok: false, out: "", err: stderr || "git command failed" };
  }
}

function sanitizeTagPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function runAutoCheckpoint({ enabled, phase, feature }) {
  if (!enabled) return { performed: false, reason: "disabled" };
  const cwd = process.cwd();

  const inside = runGit("git rev-parse --is-inside-work-tree", cwd);
  if (!inside.ok || inside.out !== "true") {
    return { performed: false, reason: "not_git_repo" };
  }

  const project = getProjectContextOrExit();
  const managed = Object.values(project.config.paths).map((p) => shellEscapeSingle(p));
  const addPaths = managed.join(" ");
  const add = runGit(`git add -- ${addPaths}`, cwd);
  if (!add.ok) return { performed: false, reason: "git_add_failed", detail: add.err };

  const hasChanges = runGit("git diff --cached --name-only", cwd);
  if (!hasChanges.ok) return { performed: false, reason: "git_diff_failed", detail: hasChanges.err };
  if (!hasChanges.out) return { performed: false, reason: "no_changes" };

  const label = feature || "project";
  const message = `checkpoint: ${label} ${phase}`;
  const commit = runGit(`git commit -m '${shellEscapeSingle(message)}'`, cwd);
  if (!commit.ok) return { performed: false, reason: "git_commit_failed", detail: commit.err };

  const head = runGit("git rev-parse --short HEAD", cwd);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const tagName = `aitri-checkpoint/${sanitizeTagPart(label)}-${sanitizeTagPart(phase)}-${ts}`;
  const tag = runGit(`git tag '${shellEscapeSingle(tagName)}' HEAD`, cwd);

  const tags = runGit("git tag --list 'aitri-checkpoint/*' --sort=-creatordate", cwd);
  if (tags.ok) {
    const list = tags.out.split("\n").map((t) => t.trim()).filter(Boolean);
    list.slice(AUTO_CHECKPOINT_MAX).forEach((oldTag) => {
      runGit(`git tag -d '${shellEscapeSingle(oldTag)}'`, cwd);
    });
  }

  return {
    performed: true,
    commit: head.ok ? head.out : null,
    tag: tag.ok ? tagName : null,
    max: AUTO_CHECKPOINT_MAX
  };
}

function printCheckpointSummary(result) {
  if (result.performed) {
    console.log(`Auto-checkpoint saved${result.commit ? `: ${result.commit}` : ""}`);
    console.log(`Checkpoint retention: last ${result.max}`);
    return;
  }
  if (result.reason === "disabled") {
    console.log("Auto-checkpoint disabled for this run.");
    return;
  }
  if (result.reason === "not_git_repo") {
    console.log("Auto-checkpoint skipped: not a git repository.");
    console.log("Tip: initialize git to enable checkpoints (`git init && git add -A && git commit -m \"baseline\"`).");
    return;
  }
  if (result.reason !== "no_changes") {
    console.log(`Auto-checkpoint skipped: ${result.reason}${result.detail ? ` (${result.detail})` : ""}`);
  }
}

async function confirmProceed(opts) {
  if (opts.yes) return true;
  if (opts.nonInteractive) return null;
  while (true) {
    const answer = (await ask("Proceed with this plan? Type 'y' to continue or 'n' to cancel: ")).toLowerCase();
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Invalid input. Please type 'y' or 'n'.");
  }
}

async function confirmResume(opts) {
  if (opts.yes) return true;
  if (opts.nonInteractive) return null;
  while (true) {
    const answer = (await ask("Checkpoint found. Continue from checkpoint? Type 'y' to continue or 'n' to stop: ")).toLowerCase();
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Invalid input. Please type 'y' or 'n'.");
  }
}

async function confirmYesNo(question, defaultYes = true) {
  while (true) {
    const answer = (await ask(question)).trim().toLowerCase();
    if (!answer) return defaultYes;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Invalid input. Please type 'y' or 'n'.");
  }
}

function parseRecommendedCommandTokens(recommendedCommand) {
  const raw = String(recommendedCommand || "").trim();
  if (!raw || /<[^>]+>/.test(raw)) return null;
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens[0] === "aitri") {
    tokens.shift();
  }
  if (tokens.length === 0) return null;
  return tokens;
}

function shouldOfferAutoAdvance({ code, command, options }) {
  if (code !== EXIT_OK) return false;
  if (!options || options.autoAdvance === false) return false;
  if (options.nonInteractive || options.yes) return false;
  if (wantsJson(options, options.positional) || wantsUi(options, options.positional)) return false;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  if (command === "help") return false;
  return true;
}

async function maybePromptAndAdvance({ code, command, options, feature = null }) {
  if (!shouldOfferAutoAdvance({ code, command, options })) {
    return code;
  }

  let report;
  try {
    report = getStatusReport({
      root: process.cwd(),
      feature: feature || options.feature || null
    });
  } catch {
    return code;
  }

  let recommended = report.recommendedCommand || toRecommendedCommand(report.nextStep);
  if (command === "handoff" && report.nextStep === "ready_for_human_approval") {
    // handoff already confirmed readiness; next operational step is explicit go/no-go.
    recommended = "aitri go";
  }
  if (!recommended) return code;

  const nextTokens = parseRecommendedCommandTokens(recommended);
  const isSameCommand = Boolean(nextTokens && nextTokens[0] === command);

  console.log("\nAitri guide:");
  console.log(`- Current state: ${report.nextStep || "unknown"}`);
  console.log(`- Recommended next step: ${recommended}`);
  if (report.nextStepMessage) {
    console.log(`- Why: ${report.nextStepMessage}`);
  }

  if (report.nextStep === "delivery_complete") {
    return runCompletionGuide({
      report,
      root: process.cwd(),
      cliPath: fileURLToPath(import.meta.url),
      confirmYesNo,
      baseCode: code
    });
  }

  if (!nextTokens) {
    console.log(`- Continue manually with: ${recommended}`);
    return code;
  }

  if (isSameCommand) {
    console.log(`- Continue manually with: ${recommended}`);
    return code;
  }

  // After implement, the agent/human must write actual code before verify can pass.
  // Do NOT auto-advance past this point — the test stubs fail by design.
  if (command === "implement") {
    console.log("\n⚒ IMPLEMENTATION REQUIRED:");
    console.log("- Aitri generated implementation briefs. Now YOU (or your AI agent) must write the actual code.");
    console.log("- Read: docs/implementation/<feature>/IMPLEMENTATION_ORDER.md");
    console.log("- For each US-* brief, implement the code that satisfies the acceptance criteria.");
    console.log("- Test stubs are in tests/<feature>/generated/ — they FAIL until you write real logic.");
    console.log("- After implementing each story, run: aitri verify");
    return code;
  }

  const proceed = await confirmYesNo("Run this next step now? (Y/n): ", true);
  if (!proceed) {
    console.log(`Stopped. Continue later with: ${recommended}`);
    return code;
  }

  const cliPath = fileURLToPath(import.meta.url);
  const printable = `aitri ${nextTokens.join(" ")}`;
  console.log(`Running next step: ${printable}`);

  const run = spawnSync(process.execPath, [cliPath, ...nextTokens], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env }
  });

  if (typeof run.status === "number") {
    return run.status;
  }

  if (run.error instanceof Error) {
    console.log(`Auto-advance failed: ${run.error.message}`);
  } else {
    console.log("Auto-advance failed.");
  }
  return EXIT_ERROR;
}

async function exitWithFlow({ code, command, options, feature = null }) {
  const finalCode = await maybePromptAndAdvance({ code, command, options, feature });
  process.exit(finalCode);
}

function printGuidedDraftWizard() {
  console.log("\nGuided Draft Wizard (English prompts)");
  console.log("Answer briefly. Aitri will transform your answers into the draft context.");
  console.log("Aitri will ask for technology preferences and can suggest a baseline stack.");
  console.log("Example feature name: user-login\n");
}

function detectTechInText(text) {
  const value = (text || "").toLowerCase();
  const known = [
    "react", "next.js", "nextjs", "vue", "angular", "svelte",
    "node", "node.js", "express", "nestjs", "fastify",
    "python", "fastapi", "django", "flask",
    "java", "spring", "spring boot",
    "go", "golang", "rust", "php", "laravel",
    "postgres", "postgresql", "mysql", "mongodb", "sqlite",
    "redis", "graphql"
  ];

  const found = known.filter((k) => value.includes(k));
  if (found.length === 0) return null;
  return [...new Set(found)].join(", ");
}

function suggestStackFromSummary(text) {
  const value = (text || "").toLowerCase();
  if (/\b(cli|terminal|command line)\b/.test(value)) {
    return "Node.js CLI";
  }
  if (/\b(mobile|ios|android|app)\b/.test(value)) {
    return "React Native + Node.js API + PostgreSQL";
  }
  if (/\b(ai|llm|rag|assistant|chatbot)\b/.test(value)) {
    return "Python (FastAPI) + PostgreSQL + Redis";
  }
  if (/\b(api|backend|service)\b/.test(value)) {
    return "Node.js (Express) + PostgreSQL";
  }
  if (/\b(web|dashboard|portal|frontend|ui)\b/.test(value)) {
    return "React + Node.js API + PostgreSQL";
  }
  return "Node.js (Express) + PostgreSQL";
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

Workflow (Aitri guides you through each step):
  1. aitri init         Set up project structure
  2. aitri draft        Describe what you want to build (guided wizard)
  3. aitri approve      Quality gate — validates your spec is complete
  4. aitri discover     Generate discovery analysis
  5. aitri plan         Generate plan, backlog, and test cases
  6. aitri validate     Check traceability (FR → US → TC)
  7. aitri verify       Run tests and persist evidence
  8. aitri policy       Check dependency and security policy
  9. aitri handoff      Summarize readiness for implementation
  10. aitri go          Approve implementation start (human decision)
  11. aitri scaffold    Generate project skeleton and test stubs
  12. aitri implement   Generate implementation briefs per story
      [WRITE CODE]     You or your AI agent implements each story
  13. aitri verify      Confirm all tests pass
  14. aitri deliver     Final delivery gate

Other:
  aitri status         Show current state and next step
  aitri resume         Resume from last checkpoint

Common options:
  --feature, -f <name>   Specify feature name
  --yes, -y              Auto-confirm prompts
  --raw                  Use free-form draft instead of guided wizard
  --json, -j             Machine-readable output`);

  if (advanced) {
    console.log(`
Advanced options:
  --idea <text>          Idea text for non-interactive draft
  --verify-cmd <cmd>     Explicit runtime verification command
  --discovery-depth <d>  Discovery depth: quick | standard | deep
  --retrieval-mode <m>   Retrieval mode: section | semantic
  --ui                   Generate status insight page
  --no-open              Don't auto-open status page
  --no-auto-advance      Disable auto-advance to next step
  --strict-policy        Require git for policy checks
  --non-interactive      Suppress all prompts (CI/pipeline mode)
  --no-checkpoint        Disable auto-checkpoint
  --format <type>        Output format (json)`);
  } else {
    console.log(`
Run \`aitri help --advanced\` for all options.`);
  }

  console.log("");
  process.exit(EXIT_OK);
}

if (cmd === "init") {
  const project = getProjectContextOrExit();
  showBanner();
  const initDirs = [
    project.paths.specsDraftsDir,
    project.paths.specsApprovedDir,
    project.paths.backlogRoot,
    project.paths.testsRoot,
    project.paths.docsRoot
  ];

  console.log("PLAN:");
  initDirs.forEach((dir) => console.log("- Create: " + path.relative(process.cwd(), dir)));
  if (project.config.loaded) {
    console.log(`- Config: ${project.config.file}`);
  }

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
  }

  initDirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

  console.log("Project initialized by Aitri ⚒️");
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "init",
    feature: "project"
  }));
  await exitWithFlow({ code: EXIT_OK, command: cmd, options });
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
    const summary = idea || await ask("1) What do you want to build? (1-2 lines): ");
    const actor = await ask("2) Who uses it? (example: customer, admin, player): ");
    const outcome = await ask("3) What should happen when it works? (expected outcome): ");
    const inScope = await ask("4) What's included? (main things in scope): ");
    const outOfScope = await ask("5) What's excluded? (out of scope, optional): ");

    const detectedTech = detectTechInText(summary);
    const suggestedStack = suggestStackFromSummary(summary);
    const techPrompt = detectedTech
      ? `6) Tech detected: ${detectedTech}. Press Enter to confirm, or type replacement: `
      : `6) Preferred stack? Suggested: ${suggestedStack}. Press Enter to accept or type replacement: `;
    const technology = await ask(techPrompt);
    const resolvedTech = technology || detectedTech || suggestedStack;

    console.log("\nNow let's define the key rules and quality criteria.");
    console.log("Tip: be specific. Aitri uses these to generate tests and validate delivery.\n");

    const fr1 = await ask("7) Main functional rule (what MUST the system do?): ");
    const fr2 = await ask("8) Second rule (optional, press Enter to skip): ");

    const edge1 = await ask("9) An edge case to consider (what could go wrong?): ");

    const sec1 = await ask("10) A security consideration (access control, input validation, etc.): ");

    const ac1 = await ask("11) Acceptance criterion — complete the sentence:\n   Given [context], when [action], then [result]: ");

    // Detect if domain needs resource strategy
    const domainText = (summary + " " + outcome + " " + inScope).toLowerCase();
    const needsResources = /\b(game|juego|sprite|canvas|webgl|ui|dashboard|web\s*app|mobile|imagen|image|audio|sound|animation|video|icon|logo|font|theme|css|design)\b/.test(domainText);

    let resourceStrategy = "";
    if (needsResources) {
      console.log("\nAitri detected this project may need external resources (images, sounds, styles, etc.).");
      console.log("  a) I have my own resources (I'll provide them)");
      console.log("  b) Generate programmatic placeholders (code-only, no external files)");
      console.log("  c) Search for free resources online (the agent will search)");
      console.log("  d) I have an account/service for resources");
      const resourceAnswer = (await ask("12) Resource strategy (a/b/c/d): ")).trim().toLowerCase();
      if (resourceAnswer === "a" || resourceAnswer.startsWith("a")) {
        resourceStrategy = "User provides own resources. Agent must ask for resource paths before implementation.";
      } else if (resourceAnswer === "c" || resourceAnswer.startsWith("c")) {
        resourceStrategy = "Agent should search for free/open-licensed resources online before implementation.";
      } else if (resourceAnswer === "d" || resourceAnswer.startsWith("d")) {
        const service = await ask("    Which service? (e.g., itch.io, OpenGameArt, Unsplash, Figma): ");
        resourceStrategy = `User has account on: ${service || "external service"}. Agent should use this source for resources.`;
      } else {
        resourceStrategy = "Generate programmatic placeholders only. No external resource files required.";
      }
    }

    wizardSections = {
      context: [
        summary || "TBD",
        "",
        `Primary actor: ${actor || "TBD"}`,
        `Expected outcome: ${outcome || "TBD"}`,
        `In scope: ${inScope || "TBD"}`,
        `Out of scope: ${outOfScope || "Not specified"}`,
        `Technology: ${resolvedTech}`
      ].join("\n"),
      actors: actor ? `- ${actor}` : "- End user",
      functionalRules: [
        fr1 ? `- FR-1: ${fr1}` : null,
        fr2 ? `- FR-2: ${fr2}` : null
      ].filter(Boolean).join("\n") || "- FR-1: TBD (define during review)",
      edgeCases: edge1 ? `- ${edge1}` : "- TBD (define during review)",
      security: sec1 ? `- ${sec1}` : "- TBD (define during review)",
      acceptanceCriteria: ac1 ? `- AC-1: ${ac1}` : "- AC-1: TBD (define during review)",
      resourceStrategy
    };

    idea = wizardSections.context;

  } else if (options.guided && options.nonInteractive) {
    // Non-interactive guided — minimal enrichment from --idea
    if (!idea) {
      console.log("In non-interactive mode, provide --idea \"<summary>\".");
      process.exit(EXIT_ERROR);
    }
    const detectedTech = detectTechInText(idea);
    const suggestedStack = suggestStackFromSummary(idea);
    idea = [
      `Summary: ${idea}`,
      "Primary actor: TBD",
      "Expected outcome: TBD",
      "In scope: TBD",
      "Out of scope: Not specified",
      `Technology preference: ${detectedTech || suggestedStack}`,
      `Technology source: ${detectedTech ? "Requirement-defined (auto-detected)" : "Aitri suggestion (auto-applied)"}`
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
      `- ${wizardSections.context.includes("Out of scope:") ? "See context above" : "TBD"}`,
      "",
      "## 9. Acceptance Criteria",
      wizardSections.acceptanceCriteria
    ];
    if (wizardSections.resourceStrategy) {
      parts.push("", "## 10. Resource Strategy", `- ${wizardSections.resourceStrategy}`);
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
      `## 1. Context\n${idea}\n\n---\n\n(Assumptions and details will be refined during review.)`
    );
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
  const code = await runDiscoverCommand({
    options,
    ask,
    getProjectContextOrExit,
    confirmProceed,
    printCheckpointSummary,
    runAutoCheckpoint,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "plan") {
  const code = await runPlanCommand({
    options,
    ask,
    getProjectContextOrExit,
    confirmProceed,
    printCheckpointSummary,
    runAutoCheckpoint,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "verify") {
  const code = await runVerifyCommand({
    options,
    getProjectContextOrExit,
    ask,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "scaffold") {
  const code = await runScaffoldCommand({
    options,
    getProjectContextOrExit,
    getStatusReportOrExit,
    confirmProceed,
    printCheckpointSummary,
    runAutoCheckpoint,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "implement") {
  const code = await runImplementCommand({
    options,
    getProjectContextOrExit,
    getStatusReportOrExit,
    confirmProceed,
    printCheckpointSummary,
    runAutoCheckpoint,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "deliver") {
  const code = await runDeliverCommand({
    options,
    getProjectContextOrExit,
    getStatusReportOrExit,
    confirmProceed,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "policy") {
  const code = runPolicyCommand({
    options,
    getProjectContextOrExit,
    getStatusReportOrExit,
    exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR }
  });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "validate") {
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

console.log("Unknown command.");
process.exit(EXIT_ERROR);
