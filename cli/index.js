#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { getStatusReport, runStatus } from "./commands/status.js";
import {
  runDiscoverCommand,
  runPlanCommand
} from "./commands/discovery-plan-validate.js";
import { runValidateCommand } from "./commands/validate.js";
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
import { runDraftCommand } from "./commands/draft.js";
import { runProveCommand } from "./commands/prove.js";
import { runTestgenCommand } from "./commands/testgen.js";
import { runContractgenCommand } from "./commands/contractgen.js";
import { runAuditCommand } from "./commands/audit.js";
import { runServeCommand } from "./commands/serve.js";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE, loadAitriConfig, resolveProjectPaths } from "./config.js";
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
    noBuild: false, noVerify: false, noTest: false, dryRun: false, verify: false, note: null, source: null, ref: null,
    verifyCmd: null,
    discoveryDepth: null,
    retrievalMode: null,
    depth: null, action: null, port: 4173,
    aiBacklog: null, aiTests: null, aiArchitecture: null,
    proposed: null,
    tc: null,
    fr: null,
    input: null,
    force: false,
    mutate: false,
    noAi: false,
    entry: null,
    open: false,
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
    } else if (arg === "--tc") { parsed.tc = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--tc=")) { parsed.tc = arg.slice("--tc=".length).trim();
    } else if (arg === "--fr") { parsed.fr = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--fr=")) { parsed.fr = arg.slice("--fr=".length).trim();
    } else if (arg === "--input") { parsed.input = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--input=")) { parsed.input = arg.slice("--input=".length).trim();
    } else if (arg === "--force") { parsed.force = true;
    } else if (arg === "--mutate") { parsed.mutate = true;
    } else if (arg === "--no-ai") { parsed.noAi = true;
    } else if (arg === "--entry") { parsed.entry = (argv[i+1]||"").trim(); i+=1;
    } else if (arg.startsWith("--entry=")) { parsed.entry = arg.slice("--entry=".length).trim();
    } else if (arg === "--open") { parsed.open = true;
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

Other: preview, status, resume, checkpoint, verify-intent, spec-improve, diff, adopt, upgrade, audit, serve
Still work (deprecated): discover, validate, handoff, scaffold, implement, verify, policy

Common options:
  --feature, -f <name>   Specify feature name
  --yes, -y              Auto-confirm prompts
  --json, -j             Machine-readable output`);

  if (advanced) {
    console.log(`
Advanced options:
  --idea <text>          Idea text for non-interactive draft
  --input <file>         Structured feature input file (FEATURE_INPUT_TEMPLATE.md)
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
  const code = await runDraftCommand({ options, ask, askRequired, getProjectContextOrExit, confirmProceed, printCheckpointSummary, runAutoCheckpoint, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR, ABORTED: EXIT_ABORTED } });
  await exitWithFlow({ code, command: cmd, options });
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

if (cmd === "prove") {
  const code = await runProveCommand({ options, getProjectContextOrExit, getStatusReportOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "testgen") {
  const code = await runTestgenCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "contractgen") {
  const code = await runContractgenCommand({ options, getProjectContextOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "audit") {
  const code = await runAuditCommand({ options, getProjectContextOrExit, ask, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
  await exitWithFlow({ code, command: cmd, options });
}

if (cmd === "serve") {
  const code = await runServeCommand({ options, getProjectContextOrExit, getStatusReportOrExit, exitCodes: { OK: EXIT_OK, ERROR: EXIT_ERROR } });
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
