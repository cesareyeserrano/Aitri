import fs from "node:fs";
import path from "node:path";

const VALID_CATEGORIES = ["bug", "improvement", "requirement-gap", "ux"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function nextEntryId(entries) {
  return `FB-${entries.length + 1}`;
}

export async function runFeedbackCommand({
  options,
  ask,
  askRequired,
  getProjectContextOrExit,
  confirmProceed,
  runAutoCheckpoint,
  printCheckpointSummary,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();

  const feature = options.feature;
  if (!feature) {
    console.log("Feature name is required. Use --feature <name>.");
    return ERROR;
  }

  const approvedExists = fs.existsSync(project.paths.approvedSpecFile(feature));
  const delivery = readJsonSafe(project.paths.deliveryJsonFile(feature));
  if (!approvedExists && !delivery) {
    console.log(`No approved spec or delivery record found for: ${feature}`);
    console.log("Feedback requires an approved or delivered feature.");
    return ERROR;
  }

  const feedbackFile = project.paths.feedbackFile(feature);
  const existing = readJsonSafe(feedbackFile) || { feature, entries: [] };
  const entries = existing.entries || [];

  let category, description, severity;

  if (options.note) {
    // Non-interactive mode with --note
    description = options.note;
    category = "improvement";
    severity = "medium";
  } else if (options.nonInteractive) {
    console.log("Non-interactive mode requires --note \"feedback text\".");
    return ERROR;
  } else {
    // Interactive flow
    console.log(`Aitri Feedback Capture — ${feature}\n`);

    const rawCategory = await ask(`1) Category? (${VALID_CATEGORIES.join(" / ")})\n   > `);
    category = VALID_CATEGORIES.includes(rawCategory.trim()) ? rawCategory.trim() : "improvement";

    description = await ask("2) Describe the feedback:\n   > ");
    if (!description.trim()) {
      console.log("Feedback description is required.");
      return ERROR;
    }
    description = description.trim();

    const rawSeverity = await ask(`3) Severity? (${VALID_SEVERITIES.join(" / ")})\n   > `);
    severity = VALID_SEVERITIES.includes(rawSeverity.trim()) ? rawSeverity.trim() : "medium";
  }

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
  }

  const entry = {
    id: nextEntryId(entries),
    addedAt: new Date().toISOString(),
    category,
    description,
    severity,
    resolution: null,
    resolvedAt: null
  };
  entries.push(entry);

  const updated = { feature, entries };
  fs.mkdirSync(path.dirname(feedbackFile), { recursive: true });
  fs.writeFileSync(feedbackFile, JSON.stringify(updated, null, 2) + "\n", "utf8");

  console.log(`\nFeedback recorded: ${entry.id}`);
  console.log(`Stored: ${path.relative(process.cwd(), feedbackFile)}`);
  console.log(`\nSuggestion: If this feedback requires spec changes, run:`);
  console.log(`  aitri amend --feature ${feature}`);

  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "feedback",
    feature
  }));
  return OK;
}
