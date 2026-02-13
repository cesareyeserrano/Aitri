import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function exists(p) {
  return fs.existsSync(p);
}

function listMd(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
}

function firstOrNull(arr) {
  return arr.length > 0 ? arr[0] : null;
}

function collectValidationIssues(spec, backlog, tests) {
  const issues = [];

  if (!/###\s+US-\d+/m.test(backlog)) {
    issues.push("Backlog must include at least one user story with an ID like `### US-1`.");
  }
  if (backlog.includes("FR-?")) {
    issues.push("Backlog contains placeholder `FR-?`.");
  }
  if (backlog.includes("AC-?")) {
    issues.push("Backlog contains placeholder `AC-?`.");
  }

  if (!/###\s+TC-\d+/m.test(tests)) {
    issues.push("Tests must include at least one test case with an ID like `### TC-1`.");
  }
  if (tests.includes("US-?")) {
    issues.push("Tests contain placeholder `US-?`.");
  }
  if (tests.includes("FR-?")) {
    issues.push("Tests contain placeholder `FR-?`.");
  }
  if (tests.includes("AC-?")) {
    issues.push("Tests contain placeholder `AC-?`.");
  }

  const specFRs = [...new Set([...spec.matchAll(/\bFR-\d+\b/g)].map((m) => m[0]))];
  const backlogFRs = new Set([...backlog.matchAll(/\bFR-\d+\b/g)].map((m) => m[0]));
  const testsFRs = new Set([...tests.matchAll(/\bFR-\d+\b/g)].map((m) => m[0]));

  const backlogUS = [...new Set([...backlog.matchAll(/\bUS-\d+\b/g)].map((m) => m[0]))];
  const testsUS = new Set([...tests.matchAll(/\bUS-\d+\b/g)].map((m) => m[0]));

  for (const fr of specFRs) {
    if (!backlogFRs.has(fr)) {
      issues.push(`Coverage: ${fr} is defined in spec but not referenced in backlog user stories.`);
    }
    if (!testsFRs.has(fr)) {
      issues.push(`Coverage: ${fr} is defined in spec but not referenced in tests.`);
    }
  }

  for (const us of backlogUS) {
    if (!testsUS.has(us)) {
      issues.push(`Coverage: ${us} exists in backlog but is not referenced in tests.`);
    }
  }

  return issues;
}

function computeNextStep({ missingDirs, approvedSpecFound, discoveryExists, planExists, validateOk }) {
  if (missingDirs.length > 0) return "aitri init";
  if (!approvedSpecFound) return "aitri draft";
  if (!discoveryExists) return "aitri discover";
  if (!planExists) return "aitri plan";
  if (!validateOk) return "aitri validate";
  return "ready_for_human_approval";
}

function readGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function detectCheckpointState(root) {
  const insideWorkTree = readGit("git rev-parse --is-inside-work-tree", root) === "true";
  if (!insideWorkTree) {
    return {
      git: false,
      detected: false,
      latestCommit: null,
      latestStash: null,
      resumeDecision: "no_checkpoint_detected",
      prompt: "No checkpoint was detected."
    };
  }

  const latestCommitRaw = readGit("git log --grep='^checkpoint:' --pretty=format:'%h|%cI|%s' -n 1", root);
  const latestCommit = latestCommitRaw
    ? (() => {
      const [hash, timestamp, message] = latestCommitRaw.split("|");
      return { hash, timestamp, message };
    })()
    : null;

  const stashLines = readGit("git stash list --format='%gd|%gs'", root)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\|checkpoint:/i.test(line));
  const latestStash = stashLines[0]
    ? (() => {
      const [ref, message] = stashLines[0].split("|");
      return { ref, message };
    })()
    : null;

  const detected = !!latestCommit || !!latestStash;
  return {
    git: true,
    detected,
    latestCommit,
    latestStash,
    resumeDecision: detected ? "ask_user_resume_from_checkpoint" : "no_checkpoint_detected",
    prompt: detected
      ? "Checkpoint detected. Ask user whether to continue from this checkpoint before any write action."
      : "No checkpoint was detected."
  };
}

export function runStatus(options = {}) {
  const { json = false } = options;
  const root = process.cwd();

  const requiredDirs = ["specs", "backlog", "tests", "docs"];
  const missingDirs = requiredDirs.filter((d) => !exists(path.join(root, d)));

  const approvedDir = path.join(root, "specs", "approved");
  const approvedSpecs = listMd(approvedDir);
  const approvedSpecFile = firstOrNull(approvedSpecs);

  const report = {
    root,
    structure: {
      ok: missingDirs.length === 0,
      missingDirs
    },
    approvedSpec: {
      found: !!approvedSpecFile,
      feature: approvedSpecFile ? approvedSpecFile.replace(".md", "") : null,
      file: approvedSpecFile ? path.join("specs", "approved", approvedSpecFile) : null
    },
    artifacts: {
      discovery: false,
      plan: false,
      backlog: false,
      tests: false
    },
    validation: {
      ok: false,
      issues: []
    },
    checkpoint: {
      recommended: true,
      command: "git add -A && git commit -m \"checkpoint: <feature-or-stage>\"",
      fallback: "git stash push -m \"checkpoint: <feature-or-stage>\"",
      state: detectCheckpointState(root)
    },
    resume: {
      command: "aitri status json",
      rule: "Follow nextStep from status output."
    },
    handoff: {
      required: false,
      state: "in_progress",
      message: "Continue with nextStep.",
      nextActions: []
    },
    nextStep: null
  };

  if (approvedSpecFile) {
    const feature = report.approvedSpec.feature;
    const discoveryFile = path.join(root, "docs", "discovery", `${feature}.md`);
    const planFile = path.join(root, "docs", "plan", `${feature}.md`);
    const backlogFile = path.join(root, "backlog", feature, "backlog.md");
    const testsFile = path.join(root, "tests", feature, "tests.md");
    const specFile = path.join(root, "specs", "approved", `${feature}.md`);

    report.artifacts.discovery = exists(discoveryFile);
    report.artifacts.plan = exists(planFile);
    report.artifacts.backlog = exists(backlogFile);
    report.artifacts.tests = exists(testsFile);

    if (exists(specFile) && exists(backlogFile) && exists(testsFile)) {
      const spec = fs.readFileSync(specFile, "utf8");
      const backlog = fs.readFileSync(backlogFile, "utf8");
      const tests = fs.readFileSync(testsFile, "utf8");

      report.validation.issues = collectValidationIssues(spec, backlog, tests);
      report.validation.ok = report.validation.issues.length === 0;
    } else {
      if (!exists(specFile)) report.validation.issues.push(`Missing approved spec: ${path.relative(root, specFile)}`);
      if (!exists(backlogFile)) report.validation.issues.push(`Missing backlog: ${path.relative(root, backlogFile)}`);
      if (!exists(testsFile)) report.validation.issues.push(`Missing tests: ${path.relative(root, testsFile)}`);
      report.validation.ok = false;
    }

    report.nextStep = computeNextStep({
      missingDirs,
      approvedSpecFound: true,
      discoveryExists: report.artifacts.discovery,
      planExists: report.artifacts.plan,
      validateOk: report.validation.ok
    });
  } else {
    report.nextStep = computeNextStep({
      missingDirs,
      approvedSpecFound: false,
      discoveryExists: false,
      planExists: false,
      validateOk: false
    });
  }

  if (report.nextStep === "ready_for_human_approval") {
    report.handoff = {
      required: true,
      state: "awaiting_human_approval",
      message: "SDLC artifact flow is complete. Human approval is required before implementation.",
      nextActions: [
        "Review approved spec, discovery, plan, backlog, and tests.",
        "Decide go/no-go for implementation.",
        "Create a checkpoint commit before starting implementation."
      ]
    };
  } else {
    report.handoff = {
      required: false,
      state: "in_progress",
      message: "Continue with nextStep.",
      nextActions: [report.nextStep]
    };
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Aitri Project Status ⚒️\n");

  if (report.structure.ok) {
    console.log("✔ Structure initialized");
  } else {
    console.log("✖ Missing structure:", report.structure.missingDirs.join(", "));
  }

  if (!report.approvedSpec.found) {
    console.log("✖ No approved specs found");
    console.log("\nNext recommended step:");
    console.log(report.nextStep);
    return;
  }

  console.log(`✔ Approved spec found: ${report.approvedSpec.feature}`);
  console.log(report.artifacts.discovery ? "✔ Discovery exists" : "✖ Discovery not generated");
  console.log(report.artifacts.plan ? "✔ Plan exists" : "✖ Plan not generated");

  if (report.validation.ok) {
    console.log("✔ Validation likely passed");
  } else {
    console.log("✖ Validation not passed");
  }

  console.log("\nNext recommended step:");
  if (report.nextStep === "ready_for_human_approval") {
    console.log("✅ Ready for human approval → implementation phase");
    console.log("Human action required: review artifacts and approve go/no-go for implementation.");
  } else {
    console.log(report.nextStep);
  }

  console.log("\nCheckpoint recommendation:");
  console.log(`- Commit: ${report.checkpoint.command}`);
  console.log(`- Fallback: ${report.checkpoint.fallback}`);
  if (report.checkpoint.state.git) {
    if (report.checkpoint.state.detected) {
      console.log("- Checkpoint detected:");
      if (report.checkpoint.state.latestCommit) {
        console.log(
          `  commit ${report.checkpoint.state.latestCommit.hash} ${report.checkpoint.state.latestCommit.message}`
        );
      }
      if (report.checkpoint.state.latestStash) {
        console.log(
          `  stash ${report.checkpoint.state.latestStash.ref} ${report.checkpoint.state.latestStash.message}`
        );
      }
      console.log("- Resume decision required: ask user to continue from checkpoint (yes/no).");
    } else {
      console.log("- No existing checkpoint detected in git history/stash.");
    }
  }
}
