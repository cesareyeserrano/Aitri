import fs from "node:fs";
import path from "node:path";
import { CONFIG_FILE } from "../config.js";
import { evaluatePolicyChecks, resolveVerifyFeature, runVerification } from "./runtime.js";
import { normalizeFeatureName } from "../lib.js";
import { collectValidationIssues } from "./validate.js";

function wantsJson(options, positional = []) {
  if (options.json) return true;
  if ((options.format || "").toLowerCase() === "json") return true;
  return positional.some((p) => p.toLowerCase() === "json");
}

function writeVerificationEvidence(project, feature, result) {
  const evidenceDir = project.paths.docsVerificationDir;
  const evidenceFile = project.paths.verificationFile(feature);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(evidenceFile, JSON.stringify({
    schemaVersion: 1,
    ...result,
    evidenceFile: path.relative(process.cwd(), evidenceFile)
  }, null, 2), "utf8");

  return {
    ...result,
    evidenceFile: path.relative(process.cwd(), evidenceFile)
  };
}

function printVerificationResult(payload) {
  if (payload.ok) {
    console.log("VERIFICATION PASSED ✅");
    console.log(`- Feature: ${payload.feature}`);
    console.log(`- Command: ${payload.command}`);
    console.log(`- Evidence: ${payload.evidenceFile}`);
    if (payload.stdoutTail) console.log(`- Output (tail):\n${payload.stdoutTail}`);
    return;
  }

  console.log("VERIFICATION FAILED ❌");
  console.log(`- Feature: ${payload.feature}`);
  console.log(`- Command: ${payload.command || "(not detected)"}`);
  console.log(`- Evidence: ${payload.evidenceFile}`);
  console.log(`- Reason: ${payload.reason}`);
  if (payload.stderrTail) console.log(`- Error (tail):\n${payload.stderrTail}`);
  if (Array.isArray(payload.suggestions) && payload.suggestions.length > 0) {
    console.log("- Suggested fixes:");
    payload.suggestions.forEach((item) => console.log(`  - ${item}`));
  }

  console.log("\nNext recommended step:");
  if (payload.reason === "no_test_command") {
    console.log("- Add a runtime test command in package.json.");
    console.log("- Recommended update: scripts.test:aitri = \"node --test\".");
    console.log(`- Run: aitri verify --feature ${payload.feature}`);
    console.log("- If tests are not ready yet: aitri verify --verify-cmd \"<command>\".");
    return;
  }
  if (payload.reason === "invalid_verify_command") {
    console.log("- Fix command syntax and run verify again.");
    console.log(`- Run: aitri verify --feature ${payload.feature} --verify-cmd \"<command>\"`);
    return;
  }
  console.log(`- Run: aitri verify --feature ${payload.feature}`);
}

function canUseInteractiveRecovery(options, jsonOutput, ask) {
  return Boolean(
    !jsonOutput &&
    !options.nonInteractive &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    typeof ask === "function"
  );
}

async function askYesNo(ask, question, defaultYes = true) {
  while (true) {
    const answer = String(await ask(question)).trim().toLowerCase();
    if (!answer) return defaultYes;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    console.log("Invalid input. Please type 'y' or 'n'.");
  }
}

function ensureVerifyScript(root) {
  const packageJsonFile = path.join(root, "package.json");
  let pkg = {};
  if (fs.existsSync(packageJsonFile)) {
    try {
      pkg = JSON.parse(fs.readFileSync(packageJsonFile, "utf8"));
    } catch {
      return {
        ok: false,
        reason: "invalid_package_json",
        file: path.relative(root, packageJsonFile)
      };
    }
  } else {
    const fallbackName = normalizeFeatureName(path.basename(root)) || "aitri-project";
    pkg = { name: fallbackName, private: true };
  }

  const scripts = (pkg && typeof pkg.scripts === "object" && pkg.scripts) ? { ...pkg.scripts } : {};
  const existing = String(scripts["test:aitri"] || "").trim();
  if (existing) {
    return {
      ok: true,
      changed: false,
      file: path.relative(root, packageJsonFile),
      command: existing
    };
  }

  scripts["test:aitri"] = "node --test";
  pkg.scripts = scripts;
  fs.writeFileSync(packageJsonFile, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return {
    ok: true,
    changed: true,
    file: path.relative(root, packageJsonFile),
    command: scripts["test:aitri"]
  };
}

export async function runVerifyCommand({
  options,
  getProjectContextOrExit,
  ask,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const verifyPositional = [...options.positional];
  const jsonOutput = wantsJson(options, verifyPositional);
  if (verifyPositional.length > 0 && verifyPositional[verifyPositional.length - 1].toLowerCase() === "json") {
    verifyPositional.pop();
  }

  let feature = null;
  try {
    feature = resolveVerifyFeature({ ...options, positional: verifyPositional }, process.cwd());
  } catch (error) {
    const msg = error instanceof Error ? error.message : `Invalid ${CONFIG_FILE}`;
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature: null, issues: [msg] }, null, 2));
    } else {
      console.log(msg);
    }
    return ERROR;
  }
  if (!feature) {
    const msg = "Feature name is required. Use --feature <name> or ensure an approved spec exists.";
    if (jsonOutput) {
      console.log(JSON.stringify({
        ok: false,
        feature: null,
        issues: [msg]
      }, null, 2));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const result = runVerification({
    root: process.cwd(),
    feature,
    verifyCmd: options.verifyCmd
  });
  let payload = writeVerificationEvidence(project, feature, result);

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return payload.ok ? OK : ERROR;
  }

  printVerificationResult(payload);

  if (
    !payload.ok &&
    payload.reason === "no_test_command" &&
    canUseInteractiveRecovery(options, jsonOutput, ask)
  ) {
    const shouldFix = await askYesNo(
      ask,
      "Would you like Aitri to configure package.json with scripts.test:aitri = \"node --test\" now? (Y/n): ",
      true
    );

    if (shouldFix) {
      const update = ensureVerifyScript(process.cwd());
      if (!update.ok) {
        console.log(`Auto-fix failed: ${update.reason}.`);
        console.log(`Fix ${update.file} manually, then run: aitri verify --feature ${feature}`);
        return ERROR;
      }
      if (update.changed) {
        console.log(`Auto-fix applied: ${update.file} updated with scripts.test:aitri.`);
      } else {
        console.log(`Auto-fix skipped: ${update.file} already has scripts.test:aitri.`);
      }

      const rerun = await askYesNo(ask, "Run verify again now? (Y/n): ", true);
      if (rerun) {
        const retry = runVerification({
          root: process.cwd(),
          feature,
          verifyCmd: options.verifyCmd
        });
        payload = writeVerificationEvidence(project, feature, retry);
        printVerificationResult(payload);
      } else {
        console.log(`Stopped. Continue later with: aitri verify --feature ${feature}`);
      }
    } else {
      console.log(`Stopped. Continue later with: aitri verify --feature ${feature}`);
    }
  }

  return payload.ok ? OK : ERROR;
}

export function runPolicyCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const policyPositional = [...options.positional];
  const jsonOutput = wantsJson(options, policyPositional);
  if (policyPositional.length > 0 && policyPositional[policyPositional.length - 1].toLowerCase() === "json") {
    policyPositional.pop();
  }

  const project = getProjectContextOrExit();
  const rawFeature = String(options.feature || policyPositional[0] || "").trim();
  let feature = normalizeFeatureName(rawFeature);
  if (rawFeature && !feature) {
    const msg = "Invalid feature name. Use kebab-case (example: user-login).";
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature: null, issues: [msg] }, null, 2));
    } else {
      console.log(msg);
    }
    return ERROR;
  }
  if (!feature) {
    const report = getStatusReportOrExit();
    feature = report.approvedSpec.feature || null;
  }

  if (!feature) {
    const msg = "Feature name is required. Use --feature <name> or ensure an approved spec exists.";
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, feature: null, issues: [msg] }, null, 2));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const payload = evaluatePolicyChecks({
    root: process.cwd(),
    feature,
    project
  });

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (payload.ok) {
    console.log("POLICY PASSED ✅");
    console.log(`- Feature: ${payload.feature}`);
    console.log(`- Evidence: ${payload.evidenceFile}`);
    if (payload.warnings.length > 0) {
      payload.warnings.forEach((warning) => console.log(`- Warning: ${warning}`));
    }
  } else {
    console.log("POLICY FAILED ❌");
    console.log(`- Feature: ${payload.feature}`);
    console.log(`- Evidence: ${payload.evidenceFile}`);
    payload.issues.forEach((issue) => console.log(`- ${issue}`));
  }

  return payload.ok ? OK : ERROR;
}

export async function runResumeCommand({
  options,
  getStatusReportOrExit,
  toRecommendedCommand,
  confirmResume,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const report = getStatusReportOrExit();
  const jsonOutput = wantsJson(options, options.positional);
  const checkpointDetected = report.checkpoint.state.detected;
  const needsResumeDecision = report.checkpoint.state.resumeDecision === "ask_user_resume_from_checkpoint";
  const recommendedCommand = report.recommendedCommand || toRecommendedCommand(report.nextStep);

  const payload = {
    ok: true,
    checkpointDetected,
    resumeDecision: report.checkpoint.state.resumeDecision,
    nextStep: report.nextStep,
    recommendedCommand,
    message: needsResumeDecision
      ? "Checkpoint detected. Explicit user confirmation is required to continue."
      : "No checkpoint decision required. Continue with recommended command."
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return OK;
  }

  if (needsResumeDecision) {
    const proceed = await confirmResume(options);
    if (proceed === null) {
      console.log("Non-interactive mode requires --yes to confirm resume from checkpoint.");
      return ERROR;
    }
    if (!proceed) {
      console.log("Resume decision: STOP.");
      return ABORTED;
    }
  }

  console.log("Resume decision: CONTINUE.");
  console.log(`Current state: ${report.nextStep}`);
  if (report.nextStep === "delivery_complete") {
    console.log("Workflow complete. No further SDLC execution steps are required.");
    console.log("Optional local review: aitri status --ui");
    return OK;
  }
  console.log(`Recommended next command: ${recommendedCommand}`);
  return OK;
}

export function runHandoffCommand({
  options,
  getStatusReportOrExit,
  toRecommendedCommand,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const report = getStatusReportOrExit(options.feature || null);
  const jsonOutput = wantsJson(options, options.positional);
  if (!jsonOutput) {
    console.log("DEPRECATION NOTICE: `aitri handoff` is deprecated. Use `aitri go` which includes validation and handoff.");
  }
  const recommendedCommand = report.recommendedCommand || toRecommendedCommand(report.nextStep);
  const payload = {
    ok: report.nextStep === "ready_for_human_approval",
    feature: report.approvedSpec.feature,
    nextStep: report.nextStep,
    recommendedCommand,
    handoff: report.handoff
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (payload.ok) {
    console.log("HANDOFF READY ✅");
    console.log(`Feature: ${payload.feature}`);
    console.log("Human decision required: GO or NO-GO for implementation.");
    console.log("Recommended next command: aitri go");
  } else {
    console.log("HANDOFF NOT READY ❌");
    console.log(`Current state: ${payload.nextStep}`);
    if (payload.recommendedCommand) {
      console.log(`Run next command: ${payload.recommendedCommand}`);
    }
    console.log("Complete the SDLC flow first, then run handoff again.");
  }

  return payload.ok ? OK : ERROR;
}

export async function runGoCommand({
  options,
  getStatusReportOrExit,
  toRecommendedCommand,
  getProjectContextOrExit,
  confirmProceed,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const report = getStatusReportOrExit(options.feature || null);
  const recommendedCommand = report.recommendedCommand || toRecommendedCommand(report.nextStep);
  const ready = report.nextStep === "ready_for_human_approval";
  if (!ready) {
    console.log("GO BLOCKED: SDLC flow is not ready for implementation handoff.");
    console.log(`Current state: ${report.nextStep}`);
    if (recommendedCommand) {
      console.log(`Run next command: ${recommendedCommand}`);
    }
    return ERROR;
  }

  const project = getProjectContextOrExit();
  const validateIssues = collectValidationIssues(project, report.approvedSpec.feature, project.paths);
  if (validateIssues.length > 0) {
    console.log("GO BLOCKED: validation failed.");
    validateIssues.forEach(i => console.log(`  - ${i}`));
    return ERROR;
  }
  const policy = evaluatePolicyChecks({
    root: process.cwd(),
    feature: report.approvedSpec.feature,
    project
  });
  const strictPolicy = Boolean(
    options.strictPolicy ||
    project.config?.policy?.goRequireGit === true
  );
  if (policy.limited) {
    if (strictPolicy) {
      console.log("GO BLOCKED: managed-go policy checks are limited outside git repositories.");
      policy.warnings.forEach((warning) => console.log(`- ${warning}`));
      console.log("Tip: run local-first (default) or initialize git / disable strict policy.");
      console.log(`Policy evidence: ${policy.evidenceFile}`);
      return ERROR;
    }
    console.log("GO NOTICE: continuing in local-first mode (git repository not required).");
    policy.warnings.forEach((warning) => console.log(`- ${warning}`));
    console.log("Tip: use `--strict-policy` (or set `policy.goRequireGit: true`) to enforce git before go.");
    console.log(`Policy evidence: ${policy.evidenceFile}`);
  }
  if (!policy.ok) {
    console.log("GO BLOCKED: managed-go policy checks failed.");
    policy.issues.forEach((issue) => console.log(`- ${issue}`));
    console.log(`Policy evidence: ${policy.evidenceFile}`);
    return ERROR;
  }

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for go/no-go confirmation.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Implementation go/no-go decision: NO-GO.");
    return ABORTED;
  }

  const feature = report.approvedSpec.feature;

  console.log("Implementation go/no-go decision: GO.");
  console.log("Use approved artifacts as source of truth:");
  console.log(`- ${report.approvedSpec.file}`);
  console.log(`- ${path.relative(process.cwd(), project.paths.discoveryFile(feature))}`);
  console.log(`- ${path.relative(process.cwd(), project.paths.planFile(feature))}`);
  console.log(`- ${path.relative(process.cwd(), project.paths.backlogFile(feature))}`);
  console.log(`- ${path.relative(process.cwd(), project.paths.testsFile(feature))}`);
  console.log(`- ${path.relative(process.cwd(), project.paths.verificationFile(feature))}`);
  const goMarkerFile = project.paths.goMarkerFile(feature);
  fs.mkdirSync(path.dirname(goMarkerFile), { recursive: true });
  fs.writeFileSync(goMarkerFile, JSON.stringify({
    schemaVersion: 1,
    ok: true,
    feature,
    decidedAt: new Date().toISOString(),
    policyEvidence: policy.evidenceFile,
    verificationEvidence: path.relative(process.cwd(), project.paths.verificationFile(feature))
  }, null, 2), "utf8");
  console.log(`- ${path.relative(process.cwd(), goMarkerFile)}`);
  return OK;
}
