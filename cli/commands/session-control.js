import { spawnSync } from "node:child_process";

function runGitArgs(args, cwd) {
  const run = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = String(run.stdout || "");
  const stderr = String(run.stderr || "");
  if (run.status === 0) {
    return { ok: true, out: stdout.trim(), raw: stdout };
  }
  return { ok: false, out: "", raw: "", err: stderr.trim() || "git command failed" };
}

function sanitizeTagPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function runAutoCheckpoint({
  enabled,
  phase,
  feature,
  getProjectContextOrExit,
  autoCheckpointMax = 10,
  cwd = process.cwd()
}) {
  if (!enabled) return { performed: false, reason: "disabled" };

  const inside = runGitArgs(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok || inside.out !== "true") {
    return { performed: false, reason: "not_git_repo" };
  }

  const project = getProjectContextOrExit();
  const managedPaths = Object.values(project.config.paths).map((p) => String(p).trim()).filter(Boolean);
  const add = runGitArgs(["add", "--", ...managedPaths], cwd);
  if (!add.ok) return { performed: false, reason: "git_add_failed", detail: add.err };

  const hasChanges = runGitArgs(["diff", "--cached", "--name-only"], cwd);
  if (!hasChanges.ok) return { performed: false, reason: "git_diff_failed", detail: hasChanges.err };
  if (!hasChanges.out) return { performed: false, reason: "no_changes" };

  const label = feature || "project";
  const message = `checkpoint: ${label} ${phase}`;
  const commit = runGitArgs(["commit", "-m", message], cwd);
  if (!commit.ok) return { performed: false, reason: "git_commit_failed", detail: commit.err };

  const head = runGitArgs(["rev-parse", "--short", "HEAD"], cwd);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const tagName = `aitri-checkpoint/${sanitizeTagPart(label)}-${sanitizeTagPart(phase)}-${ts}`;
  const tag = runGitArgs(["tag", tagName, "HEAD"], cwd);

  const tags = runGitArgs(["tag", "--list", "aitri-checkpoint/*", "--sort=-creatordate"], cwd);
  if (tags.ok) {
    const list = tags.out.split("\n").map((t) => t.trim()).filter(Boolean);
    list.slice(autoCheckpointMax).forEach((oldTag) => {
      runGitArgs(["tag", "-d", oldTag], cwd);
    });
  }

  return {
    performed: true,
    commit: head.ok ? head.out : null,
    tag: tag.ok ? tagName : null,
    max: autoCheckpointMax
  };
}

export function printCheckpointSummary(result) {
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

export async function confirmProceed({ options, ask }) {
  if (options.yes) return true;
  if (options.nonInteractive) return null;
  while (true) {
    const answer = (await ask("Proceed with this plan? Type 'y' to continue or 'n' to cancel: ")).toLowerCase();
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Invalid input. Please type 'y' or 'n'.");
  }
}

export async function confirmResume({ options, ask }) {
  if (options.yes) return true;
  if (options.nonInteractive) return null;
  while (true) {
    const answer = (await ask("Checkpoint found. Continue from checkpoint? Type 'y' to continue or 'n' to stop: ")).toLowerCase();
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Invalid input. Please type 'y' or 'n'.");
  }
}

export async function confirmYesNo({ ask, question, defaultYes = true }) {
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

function shouldOfferAutoAdvance({ code, command, options, wantsJson, wantsUi, processObj, exitOk }) {
  if (code !== exitOk) return false;
  if (!options || options.autoAdvance === false) return false;
  if (options.nonInteractive || options.yes) return false;
  if (wantsJson(options, options.positional) || wantsUi(options, options.positional)) return false;
  if (!processObj.stdin.isTTY || !processObj.stdout.isTTY) return false;
  if (command === "help") return false;
  return true;
}

export async function maybePromptAndAdvance({
  code,
  command,
  options,
  feature = null,
  getStatusReport,
  toRecommendedCommand,
  wantsJson,
  wantsUi,
  runCompletionGuide,
  confirmYesNoFn,
  cliPath,
  exitCodes,
  processObj = process
}) {
  if (!shouldOfferAutoAdvance({
    code,
    command,
    options,
    wantsJson,
    wantsUi,
    processObj,
    exitOk: exitCodes.OK
  })) {
    return code;
  }

  let report;
  try {
    report = getStatusReport({
      root: processObj.cwd(),
      feature: feature || options.feature || null
    });
  } catch {
    return code;
  }

  let recommended = report.recommendedCommand || toRecommendedCommand(report.nextStep);
  if (command === "handoff" && report.nextStep === "ready_for_human_approval") {
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
      root: processObj.cwd(),
      cliPath,
      confirmYesNo: (question, defaultYes = true) => confirmYesNoFn({ question, defaultYes }),
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

  if (command === "implement") {
    console.log("\n⚒ IMPLEMENTATION REQUIRED:");
    console.log("- Aitri generated implementation briefs. Now YOU (or your AI agent) must write the actual code.");
    console.log("- Read: docs/implementation/<feature>/IMPLEMENTATION_ORDER.md");
    console.log("- For each US-* brief, implement the code that satisfies the acceptance criteria.");
    console.log("- Test stubs are in tests/<feature>/generated/ — they FAIL until you write real logic.");
    console.log("- After implementing each story, run: aitri verify");
    return code;
  }

  const proceed = await confirmYesNoFn({
    question: "Run this next step now? (Y/n): ",
    defaultYes: true
  });
  if (!proceed) {
    console.log(`Stopped. Continue later with: ${recommended}`);
    return code;
  }

  const printable = `aitri ${nextTokens.join(" ")}`;
  console.log(`Running next step: ${printable}`);

  const run = spawnSync(processObj.execPath, [cliPath, ...nextTokens], {
    cwd: processObj.cwd(),
    stdio: "inherit",
    env: { ...processObj.env }
  });

  if (typeof run.status === "number") {
    return run.status;
  }

  if (run.error instanceof Error) {
    console.log(`Auto-advance failed: ${run.error.message}`);
  } else {
    console.log("Auto-advance failed.");
  }
  return exitCodes.ERROR;
}

export async function exitWithFlow({
  code,
  command,
  options,
  feature = null,
  getStatusReport,
  toRecommendedCommand,
  wantsJson,
  wantsUi,
  runCompletionGuide,
  confirmYesNoFn,
  cliPath,
  exitCodes,
  processObj = process
}) {
  const finalCode = await maybePromptAndAdvance({
    code,
    command,
    options,
    feature,
    getStatusReport,
    toRecommendedCommand,
    wantsJson,
    wantsUi,
    runCompletionGuide,
    confirmYesNoFn,
    cliPath,
    exitCodes,
    processObj
  });
  processObj.exit(finalCode);
}
