#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getStatusReport, runStatus } from "./commands/status.js";
import { CONFIG_FILE, loadAitriConfig, resolveProjectPaths } from "./config.js";

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
    format: null,
    autoCheckpoint: true,
    nonInteractive: false,
    guided: false,
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
    } else if (arg === "--no-checkpoint") {
      parsed.autoCheckpoint = false;
    } else if (arg === "--format") {
      parsed.format = (argv[i + 1] || "").trim().toLowerCase();
      i += 1;
    } else if (arg.startsWith("--format=")) {
      parsed.format = arg.slice("--format=".length).trim().toLowerCase();
    } else if (arg === "--non-interactive") {
      parsed.nonInteractive = true;
    } else if (arg === "--guided") {
      parsed.guided = true;
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

function normalizeFeatureName(value) {
  return (value || "").replace(/\s+/g, "-").trim();
}

function normalizeDiscoveryDepth(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "q" || raw === "quick") return "quick";
  if (raw === "s" || raw === "standard") return "standard";
  if (raw === "d" || raw === "deep") return "deep";
  return null;
}

function normalizeRetrievalMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "section" || raw === "section-level" || raw === "section_level") return "section-level";
  if (raw === "semantic" || raw === "semantic-lite" || raw === "semantic_lite") return "semantic-lite";
  return null;
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

  const add = runGit("git add -A", cwd);
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

async function collectDiscoveryInterview(options) {
  const defaults = {
    primaryUsers: "Users defined in approved spec",
    jtbd: "Deliver capability described in approved spec",
    currentPain: "Problem stated in approved spec context",
    constraints: "Constraints to be refined during planning",
    dependencies: "Dependencies to be refined during planning",
    successMetrics: "Baseline and target to be confirmed in product review",
    assumptions: "Assumptions pending explicit validation",
    inScope: "Approved spec functional scope",
    outOfScope: "Anything not explicitly stated in approved spec",
    journey: "Primary journey derived from approved spec context",
    interviewMode: "quick"
  };

  const flaggedDepth = normalizeDiscoveryDepth(options.discoveryDepth);
  if (options.discoveryDepth && !flaggedDepth) {
    throw new Error("Invalid --discovery-depth value. Use quick, standard, or deep.");
  }

  if (options.nonInteractive) {
    return {
      ...defaults,
      interviewMode: flaggedDepth || "quick"
    };
  }

  let guided = options.guided;
  if (!guided) {
    const answer = (await ask("Run guided discovery interview now? (Y/n): ")).toLowerCase();
    guided = (answer === "" || answer === "y" || answer === "yes");
  }
  if (!guided) return defaults;

  console.log("\nGuided Discovery Interview");
  console.log("Progressive mode: quick by default, with optional expansion when needed.\n");

  let depth = flaggedDepth;
  if (!depth) {
    while (true) {
      const choice = (await ask("Select interview depth [q=quick, s=standard, d=deep] (default q): ")).toLowerCase();
      if (!choice || choice === "q" || choice === "quick") {
        depth = "quick";
        break;
      }
      if (choice === "s" || choice === "standard") {
        depth = "standard";
        break;
      }
      if (choice === "d" || choice === "deep") {
        depth = "deep";
        break;
      }
      console.log("Invalid depth. Choose q, s, or d.");
    }
  }

  console.log(`\nInterview mode: ${depth}`);
  const primaryUsers = await ask("1) Primary users/segments: ");
  const jtbd = await ask("2) Jobs-to-be-done (what must users accomplish?): ");
  const currentPain = await ask("3) Current pain/impact (frequency/severity): ");
  const constraints = await ask("4) Constraints (business/technical/compliance): ");
  const dependencies = await ask("5) Dependencies (teams/systems/vendors): ");
  const successMetrics = await ask("6) Success metrics (baseline -> target): ");

  let collectAdvanced = depth !== "quick";
  if (!collectAdvanced) {
    const expand = (await ask("Need expanded discovery details now? (y/N): ")).toLowerCase();
    collectAdvanced = (expand === "y" || expand === "yes");
    if (collectAdvanced) depth = "standard";
  }

  let assumptions = defaults.assumptions;
  let inScope = defaults.inScope;
  let outOfScope = defaults.outOfScope;
  let journey = defaults.journey;
  let deepMetricBaseline = "";
  if (collectAdvanced) {
    assumptions = await ask("7) Key assumptions to validate: ");
    inScope = await ask("8) In-scope (atomic list): ");
    outOfScope = await ask("9) Out-of-scope (deferred): ");
    journey = await ask("10) Primary user journey in one line: ");
  }

  if (depth === "deep") {
    const urgencyNow = await ask("11) Why now (urgency trigger/event): ");
    const baselineToday = await ask("12) Baseline today (current metric value): ");
    const noGoZone = await ask("13) Explicit no-go zone (what must never be built now): ");
    if (urgencyNow) {
      assumptions = `${assumptions || defaults.assumptions}; Why now: ${urgencyNow}`;
    }
    if (baselineToday && successMetrics) {
      // Keep format compact while preserving baseline context.
      deepMetricBaseline = baselineToday;
    }
    if (noGoZone) {
      outOfScope = `${outOfScope || defaults.outOfScope}; No-go zone: ${noGoZone}`;
    }
  }

  return {
    primaryUsers: primaryUsers || defaults.primaryUsers,
    jtbd: jtbd || defaults.jtbd,
    currentPain: currentPain || defaults.currentPain,
    constraints: constraints || defaults.constraints,
    dependencies: dependencies || defaults.dependencies,
    successMetrics: deepMetricBaseline
      ? `${successMetrics || defaults.successMetrics}; Baseline: ${deepMetricBaseline}`
      : (successMetrics || defaults.successMetrics),
    assumptions: assumptions || defaults.assumptions,
    inScope: inScope || defaults.inScope,
    outOfScope: outOfScope || defaults.outOfScope,
    journey: journey || defaults.journey,
    interviewMode: depth
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(content, heading) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n##\\s+\\d+\\.|$)`, "i");
  const match = String(content).match(pattern);
  return match ? match[1] : "";
}

function extractSubsection(content, heading) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n###\\s+|$)`, "i");
  const match = String(content).match(pattern);
  return match ? match[1] : "";
}

function replaceSection(content, heading, newBody) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n##\\s+\\d+\\.|$)`, "i");
  return String(content).replace(pattern, `${heading}\n${newBody.trim()}\n`);
}

function extractFirstSection(content, headings) {
  for (const heading of headings) {
    const section = extractSection(content, heading).trim();
    if (section) return section;
  }
  return "";
}

function compactSectionLines(content, maxLines = 4, fallback = "Not specified in spec.") {
  const lines = String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^###\s+/.test(line))
    .filter((line) => !/^<.*>$/.test(line))
    .filter((line) => line !== "-");

  if (lines.length === 0) return `- ${fallback}`;
  return lines
    .slice(0, maxLines)
    .map((line) => (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line) ? line : `- ${line}`))
    .join("\n");
}

function extractListById(content, idPrefix, fallback = "Not specified in spec.", maxItems = 6) {
  const pattern = new RegExp(`-\\s*${idPrefix}-\\d+\\s*:\\s*([^\\n]+)`, "gi");
  const items = [...String(content || "").matchAll(pattern)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  if (items.length === 0) return `- ${fallback}`;
  return items.slice(0, maxItems).map((item) => `- ${item}`).join("\n");
}

function buildSpecSectionSnapshot(specContent) {
  return {
    mode: "section-level",
    context: compactSectionLines(
      extractFirstSection(specContent, ["## 1. Context"]),
      3,
      "Context is missing."
    ),
    actors: compactSectionLines(
      extractFirstSection(specContent, ["## 2. Actors"]),
      3,
      "Actors are missing."
    ),
    functionalRules: extractListById(specContent, "FR", "Functional rules are missing."),
    acceptanceCriteria: extractListById(specContent, "AC", "Acceptance criteria are missing."),
    security: compactSectionLines(
      extractFirstSection(specContent, ["## 7. Security Considerations"]),
      3,
      "Security considerations are missing."
    ),
    outOfScope: compactSectionLines(
      extractFirstSection(specContent, ["## 8. Out of Scope"]),
      3,
      "Out-of-scope items are missing."
    ),
    retrievalEvidence: [
      "1. Context",
      "2. Actors",
      "3. Functional Rules",
      "7. Security Considerations",
      "8. Out of Scope",
      "9. Acceptance Criteria"
    ]
  };
}

const RETRIEVAL_STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "are", "was", "were", "have", "has", "had",
  "you", "your", "into", "under", "over", "when", "then", "than", "also", "must", "should", "would",
  "can", "could", "use", "using", "used", "not", "only", "its", "it's", "about", "what", "which",
  "where", "who", "how", "why", "any", "all", "our", "their", "them", "more", "less", "very",
  "user", "users", "feature", "system", "spec", "rule"
]);

function tokenizeRetrieval(text) {
  return [...new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !RETRIEVAL_STOPWORDS.has(token))
  )];
}

function splitSpecSections(specContent) {
  const lines = String(specContent || "").split("\n");
  const sections = [];
  let heading = "Document";
  let body = [];

  const flush = () => {
    const joined = body.join("\n").trim();
    if (joined) sections.push({ heading, body: joined });
  };

  lines.forEach((line) => {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flush();
      heading = h2[1].trim();
      body = [];
      return;
    }
    body.push(line);
  });
  flush();
  return sections;
}

function semanticRetrieve(specContent, query, fallback = "Not specified in spec.") {
  const tokens = tokenizeRetrieval(query);
  const sections = splitSpecSections(specContent);
  if (sections.length === 0) {
    return { text: `- ${fallback}`, headings: [] };
  }

  const ranked = sections.map((section) => {
    const headingLower = section.heading.toLowerCase();
    const bodyLower = section.body.toLowerCase();
    let score = 0;
    tokens.forEach((token) => {
      if (headingLower.includes(token)) score += 4;
      if (bodyLower.includes(token)) score += 1;
    });
    return { ...section, score };
  }).sort((a, b) => b.score - a.score);

  const selected = ranked.filter((item) => item.score > 0).slice(0, 2);
  const effective = selected.length > 0 ? selected : ranked.slice(0, 1);
  const combined = effective.map((item) => item.body).join("\n");
  return {
    text: compactSectionLines(combined, 3, fallback),
    headings: effective.map((item) => item.heading)
  };
}

function buildSpecSemanticSnapshot(specContent) {
  const contextRes = semanticRetrieve(specContent, "problem context business impact why now", "Context is missing.");
  const actorsRes = semanticRetrieve(specContent, "actors personas stakeholders users", "Actors are missing.");
  const securityRes = semanticRetrieve(specContent, "security controls threats auth authorization abuse", "Security considerations are missing.");
  const outOfScopeRes = semanticRetrieve(specContent, "out of scope excluded deferred not included", "Out-of-scope items are missing.");
  const evidence = [
    ...contextRes.headings,
    ...actorsRes.headings,
    ...securityRes.headings,
    ...outOfScopeRes.headings
  ];

  return {
    mode: "semantic-lite",
    context: contextRes.text,
    actors: actorsRes.text,
    functionalRules: extractListById(specContent, "FR", "Functional rules are missing."),
    acceptanceCriteria: extractListById(specContent, "AC", "Acceptance criteria are missing."),
    security: securityRes.text,
    outOfScope: outOfScopeRes.text,
    retrievalEvidence: [...new Set(evidence)]
  };
}

function buildSpecSnapshot(specContent, retrievalMode) {
  const mode = retrievalMode || "section-level";
  if (mode === "semantic-lite") return buildSpecSemanticSnapshot(specContent);
  return buildSpecSectionSnapshot(specContent);
}

function detectRetrievalModeFromDiscovery(discoveryContent) {
  const mode = String(discoveryContent || "").match(/Retrieval mode:\s*(section-level|semantic-lite)/i);
  if (!mode) return null;
  return mode[1].toLowerCase();
}

function hasMeaningfulContent(content) {
  const lines = String(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.some((line) => {
    if (/^###\s+/.test(line)) return false;
    const cleaned = line
      .replace(/^[-*]\s*/, "")
      .replace(/^\d+\)\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();
    if (!cleaned || cleaned === "-") return false;
    if (cleaned.length < 6) return false;
    if (/^<.*>$/.test(cleaned)) return false;
    if (/\b(TBD|Not specified|pending|to be refined|to be confirmed)\b/i.test(cleaned)) return false;
    return true;
  });
}

function tailLines(content, maxLines = 40) {
  const lines = String(content || "").split("\n");
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n").trim();
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function globPatternToRegex(pattern) {
  const normalized = toPosixPath(pattern).trim();
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function wildcardToRegex(pattern) {
  const escaped = String(pattern || "")
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function parseGitChangedFiles(root) {
  const inside = runGit("git rev-parse --is-inside-work-tree", root);
  if (!inside.ok || inside.out !== "true") return { git: false, files: [] };

  const status = runGitRaw("git status --porcelain", root);
  if (!status.ok) return { git: true, files: [] };

  const files = String(status.out)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const body = line.length > 3 ? line.slice(3).trim() : "";
      if (!body) return "";
      if (body.includes(" -> ")) {
        return body.split(" -> ").pop();
      }
      return body;
    })
    .map((value) => toPosixPath(value))
    .filter(Boolean);

  return { git: true, files: [...new Set(files)] };
}

function extractImports(content) {
  const imports = new Set();
  const text = String(content || "");

  const jsImport = /\bimport\s+(?:[^'"]+from\s+)?["']([^"']+)["']/g;
  const jsRequire = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  const pyImport = /^\s*import\s+([a-zA-Z0-9_\.]+)/gm;
  const pyFrom = /^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+/gm;
  const goImport = /^\s*"([^"]+)"/gm;

  for (const regex of [jsImport, jsRequire, pyImport, pyFrom, goImport]) {
    let match = regex.exec(text);
    while (match) {
      imports.add(match[1]);
      match = regex.exec(text);
    }
  }
  return [...imports];
}

function isSourceFile(file) {
  return /\.(js|mjs|cjs|ts|tsx|jsx|py|go|java|kt|rb)$/i.test(file);
}

function isDependencyManifest(file) {
  const base = path.basename(file);
  if (/^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(base)) return true;
  if (/^(requirements(\..+)?\.txt|pyproject\.toml|poetry\.lock|Pipfile|Pipfile\.lock)$/i.test(base)) return true;
  if (/^(go\.mod|go\.sum|Cargo\.toml|Cargo\.lock)$/i.test(base)) return true;
  return false;
}

function detectPackageRunner(pkg) {
  const raw = String(pkg?.packageManager || "").toLowerCase();
  if (raw.startsWith("pnpm@")) return "pnpm";
  if (raw.startsWith("yarn@")) return "yarn";
  if (raw.startsWith("bun@")) return "bun";
  return "npm";
}

function scriptCommand(runner, scriptName) {
  if (scriptName === "test") {
    if (runner === "yarn") return "yarn test";
    if (runner === "pnpm") return "pnpm test";
    if (runner === "bun") return "bun run test";
    return "npm test";
  }
  if (runner === "yarn") return `yarn ${scriptName}`;
  if (runner === "bun") return `bun run ${scriptName}`;
  return `${runner} run ${scriptName}`;
}

function findNodeTestFiles(root) {
  const MAX_SCAN = 200;
  const roots = ["tests", "test", "__tests__"]
    .map((dir) => path.join(root, dir))
    .filter((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());

  if (roots.length === 0) return [];

  const files = [];
  const stack = [...roots];
  while (stack.length > 0 && files.length < MAX_SCAN) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.forEach((entry) => {
      if (entry.name.startsWith(".")) return;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        return;
      }
      if (!entry.isFile()) return;
      if (!/\.(test|spec)\.(mjs|cjs|js)$/i.test(entry.name)) return;
      files.push(toPosixPath(path.relative(root, abs)));
    });
  }

  return [...new Set(files)].sort();
}

function pickNodeVerifyCommand(root) {
  const files = findNodeTestFiles(root);
  if (files.length === 0) return null;
  const ranked = [...files].sort((a, b) => {
    const score = (value) => {
      if (/smoke/i.test(value)) return 0;
      if (/e2e/i.test(value)) return 1;
      return 2;
    };
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
  const file = ranked[0];
  return {
    command: `node --test '${shellEscapeSingle(file)}'`,
    source: "node:test:file"
  };
}

function evaluatePolicyChecks({ root, feature, project }) {
  const changed = parseGitChangedFiles(root);
  const policy = project.config.policy || {
    allowDependencyChanges: false,
    blockedImports: [],
    blockedPaths: []
  };
  const blockedPathRegex = (policy.blockedPaths || []).map((pattern) => ({
    pattern,
    regex: globPatternToRegex(pattern)
  }));
  const blockedImportRegex = (policy.blockedImports || []).map((pattern) => ({
    pattern,
    regex: wildcardToRegex(pattern)
  }));

  const issues = [];
  const gaps = {
    dependency_drift: [],
    forbidden_path: [],
    forbidden_import: []
  };
  const warnings = [];
  const changedFiles = changed.files;

  if (!changed.git) {
    warnings.push("Policy checks are limited outside git repositories (dependency drift and changed-file scope unavailable).");
  }

  const dependencyChanges = changedFiles.filter((file) => isDependencyManifest(file));
  if (!policy.allowDependencyChanges && dependencyChanges.length > 0) {
    dependencyChanges.forEach((file) => {
      const msg = `Dependency drift: ${file} changed while dependency changes are blocked by policy.`;
      gaps.dependency_drift.push(msg);
      issues.push(msg);
    });
  }

  if (blockedPathRegex.length > 0) {
    changedFiles.forEach((file) => {
      const matched = blockedPathRegex.find((entry) => entry.regex.test(file));
      if (matched) {
        const msg = `Forbidden path: ${file} matches blocked path rule '${matched.pattern}'.`;
        gaps.forbidden_path.push(msg);
        issues.push(msg);
      }
    });
  }

  if (blockedImportRegex.length > 0) {
    changedFiles.filter((file) => isSourceFile(file)).forEach((file) => {
      const abs = path.join(root, file);
      if (!fs.existsSync(abs)) return;
      const imports = extractImports(fs.readFileSync(abs, "utf8"));
      imports.forEach((imp) => {
        const matched = blockedImportRegex.find((entry) => entry.regex.test(imp));
        if (matched) {
          const msg = `Forbidden import: ${imp} in ${file} matches blocked import rule '${matched.pattern}'.`;
          gaps.forbidden_import.push(msg);
          issues.push(msg);
        }
      });
    });
  }

  const evidenceDir = path.join(project.paths.docsRoot, "policy");
  const evidenceFile = path.join(evidenceDir, `${feature}.json`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const payload = {
    ok: issues.length === 0,
    feature,
    evaluatedAt: new Date().toISOString(),
    policy: {
      allowDependencyChanges: policy.allowDependencyChanges,
      blockedImports: [...(policy.blockedImports || [])],
      blockedPaths: [...(policy.blockedPaths || [])]
    },
    files: {
      changed: changedFiles,
      dependencyChanged: dependencyChanges
    },
    gaps,
    gapSummary: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, v.length])),
    issues,
    warnings,
    evidenceFile: path.relative(root, evidenceFile)
  };

  fs.writeFileSync(evidenceFile, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function detectVerificationCommand(root) {
  const packageJson = path.join(root, "package.json");
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
      const scripts = pkg && pkg.scripts ? pkg.scripts : {};
      const runner = detectPackageRunner(pkg);
      const priorities = ["test:aitri", "test:smoke", "test:ci", "test:unit", "test"];
      const selected = priorities.find((name) => typeof scripts[name] === "string" && scripts[name].trim() !== "");
      if (selected) {
        return {
          command: scriptCommand(runner, selected),
          source: `package.json:scripts.${selected}`
        };
      }
    } catch {
      return {
        command: null,
        source: "package.json:invalid",
        suggestions: [
          "Fix package.json JSON syntax.",
          "Add script `test:aitri` and rerun `aitri verify`.",
          "Or pass an explicit command: aitri verify --verify-cmd \"<command>\"."
        ]
      };
    }
  }

  const nodeFallback = pickNodeVerifyCommand(root);
  if (nodeFallback) {
    return nodeFallback;
  }

  if (fs.existsSync(path.join(root, "pytest.ini")) || fs.existsSync(path.join(root, "pyproject.toml"))) {
    return { command: "pytest -q", source: "python:pytest" };
  }
  if (fs.existsSync(path.join(root, "go.mod"))) {
    return { command: "go test ./...", source: "go:test" };
  }
  return {
    command: null,
    source: "none",
    suggestions: [
      "Add package.json script `test:aitri` (recommended).",
      "Or pass an explicit command: aitri verify --verify-cmd \"<command>\"."
    ]
  };
}

function resolveVerifyFeature(options, root) {
  const fromArgs = normalizeFeatureName(options.feature || options.positional[0]);
  if (fromArgs) return fromArgs;
  const report = getStatusReport({ root });
  return report.approvedSpec.feature || null;
}

function runVerification({ root, feature, verifyCmd }) {
  const detected = detectVerificationCommand(root);
  const command = verifyCmd || detected.command;
  const source = verifyCmd ? "flag:verify-cmd" : detected.source;
  const startedAt = new Date();
  const startMs = Date.now();

  if (!command) {
    const suggestions = Array.isArray(detected.suggestions) ? detected.suggestions : [];
    return {
      ok: false,
      feature,
      command: null,
      commandSource: source,
      exitCode: 1,
      durationMs: Date.now() - startMs,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      stdoutTail: "",
      stderrTail: "No runtime test command detected. Configure package scripts or pass --verify-cmd.",
      reason: "no_test_command",
      suggestions
    };
  }

  const run = spawnSync(command, {
    cwd: root,
    encoding: "utf8",
    shell: true
  });

  return {
    ok: run.status === 0,
    feature,
    command,
    commandSource: source,
    exitCode: run.status == null ? 1 : run.status,
    durationMs: Date.now() - startMs,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    stdoutTail: tailLines(run.stdout || ""),
    stderrTail: tailLines(run.stderr || ""),
    reason: run.status === 0 ? "passed" : "verification_failed"
  };
}

function readDiscoveryField(discovery, label) {
  const pattern = new RegExp(`-\\s*${escapeRegExp(label)}:\\s*\\n-\\s*(.+)`, "i");
  const match = String(discovery).match(pattern);
  return match ? match[1].trim() : "";
}

function getDiscoveryRigorProfile(mode) {
  if (mode === "deep") {
    return {
      mode: "deep",
      planningPolicy: "Plan for full decomposition (explicit risks, constraints, and dependency handling).",
      followUpGate: "No extra discovery depth required before implementation unless scope changes.",
      backlogPolicy: "Stories may proceed to implementation after normal validate/verify/policy gates.",
      qaPolicy: "Include broad negative, abuse, and boundary coverage from the first implementation slice."
    };
  }
  if (mode === "standard") {
    return {
      mode: "standard",
      planningPolicy: "Plan for balanced decomposition with explicit risk tracking and key dependency checks.",
      followUpGate: "Escalate to deep discovery if major architectural uncertainty remains after first planning pass.",
      backlogPolicy: "Keep one hardening story in the first sprint to close remaining discovery gaps.",
      qaPolicy: "Include baseline negative and security scenarios before implementation handoff."
    };
  }
  return {
    mode: "quick",
    planningPolicy: "Plan a constrained first slice and keep assumptions explicit.",
    followUpGate: "Before broad implementation, re-run discovery in standard/deep mode if assumptions remain unresolved.",
    backlogPolicy: "Prioritize one thin vertical slice; delay scale/optimization stories until discovery is expanded.",
    qaPolicy: "Run smoke + core functional checks first, then expand abuse/edge coverage after discovery refinement."
  };
}

function collectPersonaValidationIssues({ discoveryContent, planContent }) {
  const issues = [];

  if (discoveryContent) {
    const discoveryInterview = extractSection(discoveryContent, "## 2. Discovery Interview Summary (Discovery Persona)");
    if (!discoveryInterview) {
      issues.push("Persona gate: Discovery section is missing `## 2. Discovery Interview Summary (Discovery Persona)`.");
    } else if (!hasMeaningfulContent(discoveryInterview)) {
      issues.push("Persona gate: Discovery interview summary is unresolved.");
    }

    const discoveryConfidence = extractSection(discoveryContent, "## 9. Discovery Confidence");
    if (!discoveryConfidence) {
      issues.push("Persona gate: Discovery section is missing `## 9. Discovery Confidence`.");
    } else if (/- Confidence:\s*\n-\s*Low\b/i.test(discoveryConfidence)) {
      issues.push("Persona gate: Discovery confidence is Low. Resolve evidence gaps before handoff.");
    }
  }

  if (planContent) {
    const product = extractSection(planContent, "## 4. Product Review (Product Persona)");
    if (!product) {
      issues.push("Persona gate: Plan is missing `## 4. Product Review (Product Persona)`.");
    } else {
      const businessValue = extractSubsection(product, "### Business value");
      const successMetric = extractSubsection(product, "### Success metric");
      const assumptions = extractSubsection(product, "### Assumptions to validate");
      if (!hasMeaningfulContent(businessValue)) issues.push("Persona gate: Product `Business value` is unresolved.");
      if (!hasMeaningfulContent(successMetric)) issues.push("Persona gate: Product `Success metric` is unresolved.");
      if (!hasMeaningfulContent(assumptions)) issues.push("Persona gate: Product `Assumptions to validate` is unresolved.");
    }

    const architecture = extractSection(planContent, "## 5. Architecture (Architect Persona)");
    if (!architecture) {
      issues.push("Persona gate: Plan is missing `## 5. Architecture (Architect Persona)`.");
    } else {
      const components = extractSubsection(architecture, "### Components");
      const dataFlow = extractSubsection(architecture, "### Data flow");
      const keyDecisions = extractSubsection(architecture, "### Key decisions");
      const risks = extractSubsection(architecture, "### Risks & mitigations");
      const observability = extractSubsection(architecture, "### Observability (logs/metrics/tracing)");
      if (!hasMeaningfulContent(components)) issues.push("Persona gate: Architect `Components` is unresolved.");
      if (!hasMeaningfulContent(dataFlow)) issues.push("Persona gate: Architect `Data flow` is unresolved.");
      if (!hasMeaningfulContent(keyDecisions)) issues.push("Persona gate: Architect `Key decisions` is unresolved.");
      if (!hasMeaningfulContent(risks)) issues.push("Persona gate: Architect `Risks & mitigations` is unresolved.");
      if (!hasMeaningfulContent(observability)) issues.push("Persona gate: Architect `Observability` is unresolved.");
    }
  }

  return issues;
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
  console.log(`
Aitri ⚒️

Commands:
  init       Initialize project structure
  draft      Create a draft spec from an idea (use --guided for guided input)
  approve    Approve a draft spec (runs gates and moves draft into approved specs)
  discover   Generate discovery + artifact scaffolding from an approved spec (use --guided for discovery interview)
  plan       Generate plan doc + traceable backlog/tests from an approved spec
  verify     Execute runtime verification suite and persist machine-readable evidence
  policy     Run managed-go policy checks (dependency drift, forbidden imports/paths)
  validate   Validate traceability placeholders are resolved (FR/AC/US/TC)
  status     Show project state and next recommended step
  handoff    Summarize validated SDLC artifacts and require explicit go/no-go decision
  go         Explicitly enter implementation mode after handoff readiness
  resume     Resume deterministically from checkpoint state and nextStep

Options:
  --yes, -y              Auto-approve plan prompts where supported
  --feature, -f <name>   Feature name for non-interactive runs
  --idea <text>          Idea text for non-interactive draft
  --verify-cmd <cmd>     Explicit runtime verification command (used by \`aitri verify\`)
  --discovery-depth <d>  Guided discovery depth: quick | standard | deep
  --retrieval-mode <m>   Retrieval mode for discover/plan: section | semantic
  --ui                   Generate static status insight page (status command)
  --non-interactive      Do not prompt; fail if required args are missing
  --json, -j             Output machine-readable JSON (status, validate)
  --format <type>        Output format (json supported)
  --no-checkpoint        Disable auto-checkpoint for this command

Exit codes:
  0 success
  1 error (validation/usage/runtime)
  2 aborted by user
`);
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
  process.exit(EXIT_OK);
}
 
if (cmd === "draft") {
  const project = getProjectContextOrExit();
  // We expect to run this from a project repo, not from the Aitri repo
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name in kebab-case (example: user-login): "));
  }
  if (!feature) {
    console.log("Feature name is required. Use kebab-case (example: user-login).");
    process.exit(EXIT_ERROR);
  }

  let idea = options.idea || "";
  if (options.guided) {
    if (options.nonInteractive && !idea) {
      console.log("In guided + non-interactive mode, provide --idea \"<summary>\".");
      process.exit(EXIT_ERROR);
    }

    if (!options.nonInteractive) {
      printGuidedDraftWizard();
      const summary = idea || await ask("1) What capability do you want to build? (1-2 lines): ");
      const actor = await ask("2) Primary actor (example: customer, admin): ");
      const outcome = await ask("3) Expected outcome (what should happen): ");
      const inScope = await ask("4) In scope (main things to include): ");
      const outOfScope = await ask("5) Out of scope (optional): ");
      const detectedTech = detectTechInText(summary);
      const suggestedStack = suggestStackFromSummary(summary);
      const techPrompt = detectedTech
        ? `6) Requirement mentions: ${detectedTech}. Press Enter to confirm, or type replacement: `
        : `6) Preferred language/stack (optional). Suggested: ${suggestedStack}. Press Enter to accept or type replacement: `;
      const technology = await ask(techPrompt);
      idea = [
        `Summary: ${summary || "TBD"}`,
        `Primary actor: ${actor || "TBD"}`,
        `Expected outcome: ${outcome || "TBD"}`,
        `In scope: ${inScope || "TBD"}`,
        `Out of scope: ${outOfScope || "Not specified"}`,
        `Technology preference: ${technology || detectedTech || suggestedStack}`,
        `Technology source: ${detectedTech ? "Requirement-defined (confirmed)" : "Aitri suggestion (accepted/replaced)"}`
      ].join("\n");
    } else {
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
    }
  } else if (!idea && !options.nonInteractive) {
    idea = await ask("Describe the idea in 1-3 lines: ");
  }
  if (!idea) {
    console.log("Idea is required. Provide --idea in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  // Locate Aitri core template relative to where this CLI package lives
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "af_spec.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Template not found at: ${templatePath}`);
    console.log("Make sure Aitri repo has core/templates/af_spec.md");
    process.exit(EXIT_ERROR);
  }

  const template = fs.readFileSync(templatePath, "utf8");

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

  // Insert idea into Context section (simple but effective for v0.1)
  const enriched = template.replace(
    "## 1. Context\nDescribe the problem context.",
    `## 1. Context\n${idea}\n\n---\n\n(Assumptions and details will be refined during review.)`
  );

  fs.writeFileSync(outFile, enriched, "utf8");

  console.log(`Draft spec created: ${path.relative(process.cwd(), outFile)}`);
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "draft",
    feature
  }));
  process.exit(EXIT_OK);
}

if (cmd === "approve") {
  const project = getProjectContextOrExit();
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name to approve (kebab-case): "));
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
      return cleaned.length >= 8 && !/^<.*>$/.test(cleaned);
    });

    if (!(hasFR || hasLegacyNumbered) || !meaningful) {
      issues.push("Functional Rules must include at least one meaningful rule using `- FR-1: ...` (preferred) or legacy `1. ...` format.");
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
    const lines = acMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
    const meaningful = lines.some(l =>
      l !== "-" && !/^<.*>$/.test(l) && l.replace(/^[-*]\s*/, "").trim().length >= 8
    );
    if (!meaningful) {
      issues.push("Acceptance Criteria must include at least one meaningful bullet.");
    }
  }

  if (issues.length > 0) {
    console.log("GATE FAILED:");
    issues.forEach(i => console.log("- " + i));
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
  process.exit(EXIT_OK);
}

if (cmd === "discover") {
  const project = getProjectContextOrExit();
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name (kebab-case, e.g. user-login): "));
  }

  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  const requestedRetrievalMode = normalizeRetrievalMode(options.retrievalMode);
  if (options.retrievalMode && !requestedRetrievalMode) {
    console.log("Invalid --retrieval-mode value. Use section or semantic.");
    process.exit(EXIT_ERROR);
  }
  const retrievalMode = requestedRetrievalMode || "section-level";

  const approvedFile = project.paths.approvedSpecFile(feature);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    process.exit(EXIT_ERROR);
  }

  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "discovery", "discovery_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Discovery template not found at: ${templatePath}`);
    process.exit(EXIT_ERROR);
  }

  const outDir = project.paths.docsDiscoveryDir;
  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const backlogDir = path.dirname(backlogFile);
  const testsDir = path.dirname(testsFile);
  const outFile = project.paths.discoveryFile(feature);

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Create: " + path.relative(process.cwd(), outDir));
  console.log("- Create: " + path.relative(process.cwd(), outFile));
  console.log("- Create: " + path.relative(process.cwd(), backlogDir));
  console.log("- Create: " + path.relative(process.cwd(), backlogFile));
  console.log("- Create: " + path.relative(process.cwd(), testsDir));
  console.log("- Create: " + path.relative(process.cwd(), testsFile));

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
  fs.mkdirSync(backlogDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  const specSnapshot = buildSpecSnapshot(approvedSpec, retrievalMode);
  let discoveryInterview;
  try {
    discoveryInterview = await collectDiscoveryInterview(options);
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Discovery interview failed.");
    process.exit(EXIT_ERROR);
  }
  const confidence = (() => {
    if (
      [discoveryInterview.primaryUsers, discoveryInterview.currentPain, discoveryInterview.successMetrics]
        .some((v) => /TBD|Not specified|pending/i.test(v))
    ) {
      return {
        level: "Low",
        reason: "Critical discovery inputs are missing or too generic.",
        handoff: "Blocked for Clarification"
      };
    }
    if (
      [discoveryInterview.jtbd, discoveryInterview.constraints, discoveryInterview.dependencies, discoveryInterview.assumptions]
        .some((v) => /TBD|Not specified|pending/i.test(v))
    ) {
      return {
        level: "Medium",
        reason: "Discovery is usable but still has notable evidence gaps.",
        handoff: "Ready for Product/Architecture"
      };
    }
    return {
      level: "High",
      reason: "Discovery inputs are specific and decision-ready.",
      handoff: "Ready for Product/Architecture"
    };
  })();
  if (discoveryInterview.interviewMode === "quick" && confidence.level !== "Low") {
    confidence.reason = `${confidence.reason} Interview used quick mode; expand to standard/deep if uncertainty remains.`;
  }
  let discovery = fs.readFileSync(templatePath, "utf8");

  // Basic injection
  discovery = discovery.replace("# Discovery: <feature>", `# Discovery: ${feature}`);
  discovery = discovery.replace(
    "## 1. Problem Statement\n- What problem are we solving?\n- Why now?",
    `## 1. Problem Statement
Derived from approved spec retrieval snapshot:
- Retrieval mode: ${specSnapshot.mode}
- Retrieved sections: ${specSnapshot.retrievalEvidence.length > 0 ? specSnapshot.retrievalEvidence.join(", ") : "none"}

### Context snapshot
${specSnapshot.context}

### Actors snapshot
${specSnapshot.actors}

### Functional rules snapshot
${specSnapshot.functionalRules}

### Security snapshot
${specSnapshot.security}

### Out-of-scope snapshot
${specSnapshot.outOfScope}

Refined problem framing:
- What problem are we solving? ${discoveryInterview.currentPain}
- Why now? ${discoveryInterview.successMetrics}`
  );
  discovery = discovery.replace(
    "## 2. Discovery Interview Summary (Discovery Persona)\n- Primary users:\n-\n- Jobs to be done:\n-\n- Current pain:\n-\n- Constraints (business/technical/compliance):\n-\n- Dependencies:\n-\n- Success metrics:\n-\n- Assumptions:\n-",
    `## 2. Discovery Interview Summary (Discovery Persona)\n- Primary users:\n- ${discoveryInterview.primaryUsers}\n\n- Jobs to be done:\n- ${discoveryInterview.jtbd}\n\n- Current pain:\n- ${discoveryInterview.currentPain}\n\n- Constraints (business/technical/compliance):\n- ${discoveryInterview.constraints}\n\n- Dependencies:\n- ${discoveryInterview.dependencies}\n\n- Success metrics:\n- ${discoveryInterview.successMetrics}\n\n- Assumptions:\n- ${discoveryInterview.assumptions}\n\n- Interview mode:\n- ${discoveryInterview.interviewMode}`
  );
  discovery = discovery.replace(
    "## 3. Scope\n### In scope\n-\n\n### Out of scope\n-",
    `## 3. Scope\n### In scope\n- ${discoveryInterview.inScope}\n\n### Out of scope\n- ${discoveryInterview.outOfScope}`
  );
  discovery = discovery.replace(
    "## 4. Actors & User Journeys\nActors:\n-\n\nPrimary journey:\n-",
    `## 4. Actors & User Journeys\nActors:\n- ${discoveryInterview.primaryUsers}\n\nPrimary journey:\n- ${discoveryInterview.journey}`
  );
  discovery = discovery.replace(
    "## 9. Discovery Confidence\n- Confidence:\n-\n- Reason:\n-\n- Evidence gaps:\n-\n- Handoff decision:\n-",
    `## 9. Discovery Confidence\n- Confidence:\n- ${confidence.level}\n\n- Reason:\n- ${confidence.reason}\n\n- Evidence gaps:\n- ${discoveryInterview.assumptions}\n\n- Handoff decision:\n- ${confidence.handoff}`
  );

  fs.writeFileSync(outFile, discovery, "utf8");
    const backlog = `# Backlog: ${feature}

## Epic
- <one epic statement>

## User Stories
1. As a <actor>, I want <capability>, so that <benefit>.
2. As a <actor>, I want <capability>, so that <benefit>.
3. As a <actor>, I want <capability>, so that <benefit>.
`;

  const tests = `# Test Cases: ${feature}

## Functional
1. Given <context>, when <action>, then <expected>.

## Security
1. Input validation: reject invalid/unsafe inputs.
2. Abuse prevention: rate limit critical endpoints (if any).

## Edge Cases
1. <edge case> -> <expected behavior>
`;

  fs.writeFileSync(backlogFile, backlog, "utf8");
  fs.writeFileSync(testsFile, tests, "utf8");

  console.log("Discovery created: " + path.relative(process.cwd(), outFile));
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "discover",
    feature
  }));
  process.exit(EXIT_OK);
}

if (cmd === "plan") {
  const project = getProjectContextOrExit();
  let feature = normalizeFeatureName(options.feature || options.positional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name (kebab-case, e.g. user-login): "));
  }

  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    process.exit(EXIT_ERROR);
  }

  const requestedRetrievalMode = normalizeRetrievalMode(options.retrievalMode);
  if (options.retrievalMode && !requestedRetrievalMode) {
    console.log("Invalid --retrieval-mode value. Use section or semantic.");
    process.exit(EXIT_ERROR);
  }

  const approvedFile = project.paths.approvedSpecFile(feature);
  const discoveryFile = project.paths.discoveryFile(feature);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    process.exit(EXIT_ERROR);
  }
  if (!fs.existsSync(discoveryFile)) {
    console.log(`Discovery artifact not found: ${path.relative(process.cwd(), discoveryFile)}`);
    console.log("Run discovery first: aitri discover --feature <name>");
    process.exit(EXIT_ERROR);
  }
  const discoveryContent = fs.readFileSync(discoveryFile, "utf8");
  const requiredDiscoverySections = [
    "## 2. Discovery Interview Summary (Discovery Persona)",
    "## 3. Scope",
    "## 9. Discovery Confidence"
  ];
  const missingDiscoverySections = requiredDiscoverySections.filter((section) => !discoveryContent.includes(section));
  if (missingDiscoverySections.length > 0) {
    console.log("PLAN BLOCKED: Discovery artifact is missing required sections.");
    missingDiscoverySections.forEach((section) => console.log(`- Missing: ${section}`));
    console.log("Re-run discovery with the latest template before planning.");
    process.exit(EXIT_ERROR);
  }
  const lowConfidence = /- Confidence:\s*\n-\s*Low\b/i.test(discoveryContent);
  if (lowConfidence) {
    console.log("PLAN BLOCKED: Discovery confidence is Low.");
    console.log("Address discovery evidence gaps and re-run `aitri discover --guided` before planning.");
    process.exit(EXIT_ERROR);
  }

  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "core", "templates", "plan", "plan_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Plan template not found at: ${templatePath}`);
    process.exit(EXIT_ERROR);
  }

  const architectPersona = path.resolve(cliDir, "..", "core", "personas", "architect.md");
  const securityPersona = path.resolve(cliDir, "..", "core", "personas", "security.md");
  const productPersona = path.resolve(cliDir, "..", "core", "personas", "product.md");
  const developerPersona = path.resolve(cliDir, "..", "core", "personas", "developer.md");
  const uxUiPersona = path.resolve(cliDir, "..", "core", "personas", "ux-ui.md");
  const qaPersona = path.resolve(cliDir, "..", "core", "personas", "qa.md");

  const outPlanDir = project.paths.docsPlanDir;
  const outPlanFile = project.paths.planFile(feature);

  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Read: " + path.relative(process.cwd(), templatePath));
  console.log("- Read: " + (fs.existsSync(productPersona) ? productPersona : "core/personas/product.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(architectPersona) ? architectPersona : "core/personas/architect.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(developerPersona) ? developerPersona : "core/personas/developer.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(uxUiPersona) ? uxUiPersona : "core/personas/ux-ui.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(securityPersona) ? securityPersona : "core/personas/security.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(qaPersona) ? qaPersona : "core/personas/qa.md (missing in repo)"));
  console.log("- Create: " + path.relative(process.cwd(), outPlanDir));
  console.log("- Write: " + path.relative(process.cwd(), outPlanFile));
  console.log("- Write: " + path.relative(process.cwd(), backlogFile));
  console.log("- Write: " + path.relative(process.cwd(), testsFile));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Aborted.");
    process.exit(EXIT_ABORTED);
  }

  fs.mkdirSync(outPlanDir, { recursive: true });
  fs.mkdirSync(path.dirname(backlogFile), { recursive: true });
  fs.mkdirSync(path.dirname(testsFile), { recursive: true });

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  const discoveryDoc = fs.readFileSync(discoveryFile, "utf8");
  const inheritedRetrievalMode = detectRetrievalModeFromDiscovery(discoveryDoc);
  const retrievalMode = requestedRetrievalMode || inheritedRetrievalMode || "section-level";
  const specSnapshot = buildSpecSnapshot(approvedSpec, retrievalMode);
  let planDoc = fs.readFileSync(templatePath, "utf8");

  // Inject feature name and include approved spec for traceability
  planDoc = planDoc.replace("# Plan: <feature>", `# Plan: ${feature}`);
  planDoc = planDoc.replace(
    "## 1. Intent (from approved spec)",
    `## 1. Intent (from approved spec)
- Retrieval mode: section-level

### Context snapshot
${specSnapshot.context}

### Actors snapshot
${specSnapshot.actors}

### Functional rules snapshot
${specSnapshot.functionalRules}

### Acceptance criteria snapshot
${specSnapshot.acceptanceCriteria}

### Security snapshot
${specSnapshot.security}

### Out-of-scope snapshot
${specSnapshot.outOfScope}

### Retrieval metadata
- Retrieval mode: ${specSnapshot.mode}
- Retrieved sections: ${specSnapshot.retrievalEvidence.length > 0 ? specSnapshot.retrievalEvidence.join(", ") : "none"}`
  );

  const frList = [...approvedSpec.matchAll(/- FR-\d+:\s*(.+)/g)].map((m) => m[1].trim());
  const coreRule = frList[0] || "Deliver the approved feature scope with traceability.";
  const supportingRule = frList[1] || coreRule;
  const discoveryPain = readDiscoveryField(discoveryDoc, "Current pain") || "Pain evidence must be validated in discovery refinement.";
  const discoveryMetric = readDiscoveryField(discoveryDoc, "Success metrics") || "Define baseline and target KPI before implementation.";
  const discoveryAssumptions = readDiscoveryField(discoveryDoc, "Assumptions") || "Explicit assumptions pending validation with product and architecture.";
  const discoveryDependencies = readDiscoveryField(discoveryDoc, "Dependencies") || "External dependencies to be confirmed.";
  const discoveryConstraints = readDiscoveryField(discoveryDoc, "Constraints (business/technical/compliance)") || "Constraints to be confirmed.";
  const discoveryInterviewMode = normalizeDiscoveryDepth(readDiscoveryField(discoveryDoc, "Interview mode")) || "quick";
  const rigor = getDiscoveryRigorProfile(discoveryInterviewMode);

  planDoc = replaceSection(
    planDoc,
    "## 2. Discovery Review (Discovery Persona)",
    `### Problem framing
- ${discoveryPain}
- Core rule to preserve: ${coreRule}

### Constraints and dependencies
- Constraints: ${discoveryConstraints}
- Dependencies: ${discoveryDependencies}

### Success metrics
- ${discoveryMetric}

### Key assumptions
- ${discoveryAssumptions}

### Discovery rigor profile
- Discovery interview mode: ${rigor.mode}
- Planning policy: ${rigor.planningPolicy}
- Follow-up gate: ${rigor.followUpGate}`
  );

  planDoc = replaceSection(
    planDoc,
    "## 4. Product Review (Product Persona)",
    `### Business value
- Address user pain by enforcing: ${coreRule}
- Secondary value from supporting rule: ${supportingRule}

### Success metric
- Primary KPI: ${discoveryMetric}
- Ship only if metric has baseline and target.

### Assumptions to validate
- ${discoveryAssumptions}
- Validate dependency and constraint impact before implementation start.
- Discovery rigor policy: ${rigor.followUpGate}`
  );

  planDoc = replaceSection(
    planDoc,
    "## 5. Architecture (Architect Persona)",
    `### Components
- Client or entry interface for ${feature}.
- Application service implementing FR traceability.
- Persistence/integration boundary for state and external dependencies.

### Data flow
- Request enters through interface layer.
- Application service validates input, enforces rules, and coordinates dependencies.
- Results are persisted and returned with deterministic error handling.

### Key decisions
- Preserve spec traceability from FR/AC to backlog/tests.
- Keep interfaces explicit to reduce hidden coupling.
- Prefer observable failure modes over silent degradation.

### Risks & mitigations
- Dependency instability risk: add timeouts/retries and fallback behavior.
- Constraint mismatch risk: validate assumptions before rollout.
- Scope drift risk: block changes outside approved spec.

### Observability (logs/metrics/tracing)
- Logs: authentication and error events with correlation IDs.
- Metrics: success rate, latency, and failure-rate by endpoint/use case.
- Tracing: end-to-end request trace across internal and external calls.`
  );

  fs.writeFileSync(outPlanFile, planDoc, "utf8");

  // Overwrite backlog/tests with a structured starting point (content will be refined by agents)
  const backlog = `# Backlog: ${feature}

> Generated by \`aitri plan\`.
> Spec-driven rule: every story MUST reference one or more Functional Rules (FR-*) and, when applicable, Acceptance Criteria (AC-*).
> Discovery rigor profile: ${rigor.mode}.
> Planning rule: ${rigor.backlogPolicy}

## Epics
- EP-1: <epic outcome>
  - Notes:
  - Trace: FR-?, FR-?
- EP-2: <epic outcome>
  - Notes:
  - Trace: FR-?, FR-?

## User Stories

### US-1
- As a <actor>, I want <capability>, so that <benefit>.
- Trace: FR-?, AC-?
- Acceptance Criteria:
  - Given ..., when ..., then ...
  - Given ..., when ..., then ...

### US-2
- As a <actor>, I want <capability>, so that <benefit>.
- Trace: FR-?, AC-?
- Acceptance Criteria:
  - Given ..., when ..., then ...

(repeat as needed)
`;
  const tests = `# Test Cases: ${feature}

> Generated by \`aitri plan\`.
> Spec-driven rule: every test MUST trace to a User Story (US-*) and one or more Functional Rules (FR-*). Include AC-* when applicable.
> Discovery rigor profile: ${rigor.mode}.
> QA rule: ${rigor.qaPolicy}

## Functional

### TC-1
- Title: <what is being validated>
- Trace: US-?, FR-?, AC-?
- Steps:
  1) Given <context>
  2) When <action>
  3) Then <expected>

## Negative / Abuse

### TC-2
- Title: <invalid input or abuse scenario>
- Trace: US-?, FR-?
- Steps:
  1) Given <invalid context>
  2) When <action>
  3) Then <rejected with clear error>

## Security

### TC-3
- Title: <security control validation>
- Trace: US-?, FR-?
- Steps:
  1) Given <threat scenario>
  2) When <attempt>
  3) Then <blocked/logged/limited>

## Edge Cases

### TC-4
- Title: <edge case>
- Trace: US-?, FR-?
- Steps:
  1) Given <edge context>
  2) When <action>
  3) Then <expected>
`;

  fs.writeFileSync(backlogFile, backlog, "utf8");
  fs.writeFileSync(testsFile, tests, "utf8");

  console.log("Plan created: " + path.relative(process.cwd(), outPlanFile));
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "plan",
    feature
  }));
  process.exit(EXIT_OK);
}

if (cmd === "verify") {
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
    process.exit(EXIT_ERROR);
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
    process.exit(EXIT_ERROR);
  }

  const result = runVerification({
    root: process.cwd(),
    feature,
    verifyCmd: options.verifyCmd
  });

  const evidenceDir = project.paths.docsVerificationDir;
  const evidenceFile = project.paths.verificationFile(feature);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(evidenceFile, JSON.stringify({
    ...result,
    evidenceFile: path.relative(process.cwd(), evidenceFile)
  }, null, 2), "utf8");

  const payload = {
    ...result,
    evidenceFile: path.relative(process.cwd(), evidenceFile)
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (payload.ok) {
    console.log("VERIFICATION PASSED ✅");
    console.log(`- Feature: ${payload.feature}`);
    console.log(`- Command: ${payload.command}`);
    console.log(`- Evidence: ${payload.evidenceFile}`);
    if (payload.stdoutTail) console.log(`- Output (tail):\n${payload.stdoutTail}`);
  } else {
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
  }

  process.exit(payload.ok ? EXIT_OK : EXIT_ERROR);
}

if (cmd === "policy") {
  const policyPositional = [...options.positional];
  const jsonOutput = wantsJson(options, policyPositional);
  if (policyPositional.length > 0 && policyPositional[policyPositional.length - 1].toLowerCase() === "json") {
    policyPositional.pop();
  }

  const project = getProjectContextOrExit();
  let feature = normalizeFeatureName(options.feature || policyPositional[0]);
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
    process.exit(EXIT_ERROR);
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

  process.exit(payload.ok ? EXIT_OK : EXIT_ERROR);
}

if (cmd === "validate") {
  const project = getProjectContextOrExit();
  const validatePositional = [...options.positional];
  const jsonOutput = wantsJson(options, validatePositional);
  if (validatePositional.length > 0 && validatePositional[validatePositional.length - 1].toLowerCase() === "json") {
    validatePositional.pop();
  }

  let feature = normalizeFeatureName(options.feature || validatePositional[0]);
  if (!feature && !options.nonInteractive) {
    feature = normalizeFeatureName(await ask("Feature name (kebab-case, e.g. user-login): "));
  }

  if (!feature) {
    const msg = "Feature name is required. Use --feature <name> in non-interactive mode.";
    if (jsonOutput) {
      console.log(JSON.stringify({
        ok: false,
        feature: null,
        issues: [msg],
        gaps: {
          usage: [msg]
        }
      }, null, 2));
    } else {
      console.log(msg);
    }
    process.exit(EXIT_ERROR);
  }

  const approvedFile = project.paths.approvedSpecFile(feature);
  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const discoveryFile = project.paths.discoveryFile(feature);
  const planFile = project.paths.planFile(feature);

  const issues = [];
  const gapTypes = {
    missing_artifact: [],
    structure: [],
    placeholder: [],
    persona: [],
    coverage_fr_us: [],
    coverage_fr_tc: [],
    coverage_us_tc: []
  };
  const addIssue = (type, message) => {
    issues.push(message);
    if (gapTypes[type]) gapTypes[type].push(message);
  };
  const result = {
    ok: false,
    feature,
    files: {
      spec: path.relative(process.cwd(), approvedFile),
      backlog: path.relative(process.cwd(), backlogFile),
      tests: path.relative(process.cwd(), testsFile),
      discovery: path.relative(process.cwd(), discoveryFile),
      plan: path.relative(process.cwd(), planFile)
    },
    coverage: {
      specFr: 0,
      backlogFr: 0,
      testsFr: 0,
      backlogUs: 0,
      testsUs: 0
    },
    gaps: gapTypes,
    gapSummary: {},
    issues
  };

  if (!fs.existsSync(approvedFile)) {
    addIssue("missing_artifact", `Missing approved spec: ${path.relative(process.cwd(), approvedFile)}`);
  }
  if (!fs.existsSync(backlogFile)) {
    addIssue("missing_artifact", `Missing backlog: ${path.relative(process.cwd(), backlogFile)}`);
  }
  if (!fs.existsSync(testsFile)) {
    addIssue("missing_artifact", `Missing tests: ${path.relative(process.cwd(), testsFile)}`);
  }

  result.gapSummary = Object.fromEntries(Object.entries(gapTypes).map(([k, v]) => [k, v.length]));

  if (issues.length > 0) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach(i => console.log("- " + i));
    }
    process.exit(EXIT_ERROR);
  }

  const spec = fs.readFileSync(approvedFile, "utf8");
  const backlog = fs.readFileSync(backlogFile, "utf8");
  const tests = fs.readFileSync(testsFile, "utf8");

  // Basic structure checks
  if (!/###\s+US-\d+/m.test(backlog)) {
    addIssue("structure", "Backlog must include at least one user story with an ID like `### US-1`.");
  }
  if (backlog.includes("FR-?")) {
    addIssue("placeholder", "Backlog contains placeholder `FR-?`. Replace with real Functional Rule IDs (FR-1, FR-2...).");
  }
  if (backlog.includes("AC-?")) {
    addIssue("placeholder", "Backlog contains placeholder `AC-?`. Replace with real Acceptance Criteria IDs (AC-1, AC-2...).");
  }

  if (!/###\s+TC-\d+/m.test(tests)) {
    addIssue("structure", "Tests must include at least one test case with an ID like `### TC-1`.");
  }
  if (tests.includes("US-?")) {
    addIssue("placeholder", "Tests contain placeholder `US-?`. Replace with real User Story IDs (US-1, US-2...).");
  }
  if (tests.includes("FR-?")) {
    addIssue("placeholder", "Tests contain placeholder `FR-?`. Replace with real Functional Rule IDs (FR-1, FR-2...).");
  }
  if (tests.includes("AC-?")) {
    addIssue("placeholder", "Tests contain placeholder `AC-?`. Replace with real Acceptance Criteria IDs (AC-1, AC-2...).");
  }

  result.gapSummary = Object.fromEntries(Object.entries(gapTypes).map(([k, v]) => [k, v.length]));

  if (issues.length > 0) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach(i => console.log("- " + i));
    }
    process.exit(EXIT_ERROR);
  }

  // --- Coverage checks (minimal) ---
  // 1) Every FR-* in spec should be referenced by at least one US-* in backlog
  const specFRs = [...spec.matchAll(/\bFR-\d+\b/g)].map(m => m[0]);
  const backlogFRs = new Set([...backlog.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));

  const missingFRCoverage = [...new Set(specFRs)].filter(fr => !backlogFRs.has(fr));
  missingFRCoverage.forEach(fr =>
    addIssue("coverage_fr_us", `Coverage: ${fr} is defined in spec but not referenced in backlog user stories.`)
  );

  // 2) Every FR-* in spec should be referenced by at least one TC-* in tests
  const testsFRs = new Set([...tests.matchAll(/\bFR-\d+\b/g)].map(m => m[0]));
  const missingFRTestsCoverage = [...new Set(specFRs)].filter(fr => !testsFRs.has(fr));
  missingFRTestsCoverage.forEach(fr =>
    addIssue("coverage_fr_tc", `Coverage: ${fr} is defined in spec but not referenced in tests.`)
  );

  // 2) Every US-* in backlog should be referenced by at least one TC-* in tests
  const backlogUS = [...backlog.matchAll(/\bUS-\d+\b/g)].map(m => m[0]);
  const testsUS = new Set([...tests.matchAll(/\bUS-\d+\b/g)].map(m => m[0]));

  const missingUSCoverage = [...new Set(backlogUS)].filter(us => !testsUS.has(us));
  missingUSCoverage.forEach(us =>
    addIssue("coverage_us_tc", `Coverage: ${us} exists in backlog but is not referenced in tests.`)
  );
  // --- End coverage checks ---

  result.coverage.specFr = new Set(specFRs).size;
  result.coverage.backlogFr = backlogFRs.size;
  result.coverage.testsFr = testsFRs.size;
  result.coverage.backlogUs = new Set(backlogUS).size;
  result.coverage.testsUs = testsUS.size;

  if (fs.existsSync(discoveryFile) && fs.existsSync(planFile)) {
    const discoveryContent = fs.readFileSync(discoveryFile, "utf8");
    const planContent = fs.readFileSync(planFile, "utf8");
    const personaIssues = collectPersonaValidationIssues({ discoveryContent, planContent });
    personaIssues.forEach((issue) => addIssue("persona", issue));
  }

  result.gapSummary = Object.fromEntries(Object.entries(gapTypes).map(([k, v]) => [k, v.length]));

  if (issues.length > 0) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("VALIDATION FAILED:");
      issues.forEach((i) => console.log("- " + i));
    }
    process.exit(EXIT_ERROR);
  }

  result.ok = true;
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("VALIDATION PASSED ✅");
    console.log("- Spec: " + path.relative(process.cwd(), approvedFile));
    console.log("- Backlog: " + path.relative(process.cwd(), backlogFile));
    console.log("- Tests: " + path.relative(process.cwd(), testsFile));
  }
  process.exit(EXIT_OK);
}

if (cmd === "status") {
  try {
    runStatus({
      json: wantsJson(options, options.positional),
      ui: wantsUi(options, options.positional),
      root: process.cwd()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid ${CONFIG_FILE}`;
    console.log(message);
    process.exit(EXIT_ERROR);
  }
  process.exit(EXIT_OK);
}

if (cmd === "resume") {
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
    process.exit(EXIT_OK);
  }

  if (needsResumeDecision) {
    const proceed = await confirmResume(options);
    if (proceed === null) {
      console.log("Non-interactive mode requires --yes to confirm resume from checkpoint.");
      process.exit(EXIT_ERROR);
    }
    if (!proceed) {
      console.log("Resume decision: STOP.");
      process.exit(EXIT_ABORTED);
    }
  }

  console.log("Resume decision: CONTINUE.");
  console.log(`Current state: ${report.nextStep}`);
  console.log(`Recommended next command: ${recommendedCommand}`);
  process.exit(EXIT_OK);
}

if (cmd === "handoff") {
  const report = getStatusReportOrExit();
  const jsonOutput = wantsJson(options, options.positional);
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

  process.exit(payload.ok ? EXIT_OK : EXIT_ERROR);
}

if (cmd === "go") {
  const report = getStatusReportOrExit();
  const recommendedCommand = report.recommendedCommand || toRecommendedCommand(report.nextStep);
  const ready = report.nextStep === "ready_for_human_approval";
  if (!ready) {
    console.log("GO BLOCKED: SDLC flow is not ready for implementation handoff.");
    console.log(`Current state: ${report.nextStep}`);
    if (recommendedCommand) {
      console.log(`Run next command: ${recommendedCommand}`);
    }
    process.exit(EXIT_ERROR);
  }

  const project = getProjectContextOrExit();
  const policy = evaluatePolicyChecks({
    root: process.cwd(),
    feature: report.approvedSpec.feature,
    project
  });
  if (!policy.ok) {
    console.log("GO BLOCKED: managed-go policy checks failed.");
    policy.issues.forEach((issue) => console.log(`- ${issue}`));
    console.log(`Policy evidence: ${policy.evidenceFile}`);
    process.exit(EXIT_ERROR);
  }

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for go/no-go confirmation.");
    process.exit(EXIT_ERROR);
  }
  if (!proceed) {
    console.log("Implementation go/no-go decision: NO-GO.");
    process.exit(EXIT_ABORTED);
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
  process.exit(EXIT_OK);
}

console.log("Unknown command.");
process.exit(EXIT_ERROR);
