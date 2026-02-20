import fs from "node:fs";
import path from "node:path";

const CHECKPOINT_DIR = ".aitri";
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, "DEV_STATE.md");
const EVOLUTION_BACKLOG = path.join("backlog", "aitri-core", "evolution.md");

const TIMESTAMP_RE = /> LAST UPDATE: .*/;
const AGENT_RE = /> AGENT: .*/;
const WORKING_MEMORY_RE = /## 🧠 Working Memory \(Context\)\n[\s\S]*?(?=\n## |\n$|$)/;

/**
 * aitri checkpoint [message] [--agent <name>] [--objective <text>] [--next <text>] [--blocker <text>]
 *
 * Saves current session state to .aitri/DEV_STATE.md (the Relay Protocol "save game").
 * Reads existing checkpoint, patches timestamp + working memory, preserves all other sections.
 */
export function runCheckpointCommand({ options, exitCodes }) {
  const cwd = process.cwd();
  const checkpointPath = path.resolve(cwd, CHECKPOINT_FILE);
  const checkpointDir = path.resolve(cwd, CHECKPOINT_DIR);
  const backlogPath = path.resolve(cwd, EVOLUTION_BACKLOG);

  const message = options.positional[0] || options.note || null;
  const agent = options.agent || "Developer/Agent";
  const objective = options.objective || null;
  const nextAction = options.next || null;
  const blocker = options.blocker || null;

  // Ensure .aitri/ dir exists
  if (!fs.existsSync(checkpointDir)) {
    fs.mkdirSync(checkpointDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();

  if (!fs.existsSync(checkpointPath)) {
    // Bootstrap checkpoint from scratch
    const initial = generateCheckpoint({ timestamp, agent, message, objective, nextAction, blocker });
    fs.writeFileSync(checkpointPath, initial, "utf8");
    console.log(`Checkpoint created: ${CHECKPOINT_FILE}`);
    console.log(`Timestamp: ${timestamp}`);
    if (message) console.log(`Context: ${message}`);
    return exitCodes.OK;
  }

  // Patch existing checkpoint — only update what was explicitly provided
  let content = fs.readFileSync(checkpointPath, "utf8");

  content = content.replace(TIMESTAMP_RE, `> LAST UPDATE: ${timestamp}`);
  content = content.replace(AGENT_RE, `> AGENT: ${agent}`);

  if (message) {
    content = content.replace(
      WORKING_MEMORY_RE,
      `## 🧠 Working Memory (Context)\n- ${message}\n`
    );
  }

  if (objective) {
    content = content.replace(
      /## 🎯 Current Objective\n[\s\S]*?(?=\n## |\n$|$)/,
      `## 🎯 Current Objective\n${objective}\n`
    );
  }

  if (nextAction) {
    content = content.replace(
      /## ⏭️ Next Immediate Action\n[\s\S]*?(?=\n## |\n$|$)/,
      `## ⏭️ Next Immediate Action\n${nextAction}\n`
    );
  }

  if (blocker) {
    content = content.replace(
      /## 🛑 Blockers \/ Errors\n[\s\S]*?(?=\n## |\n$|$)/,
      `## 🛑 Blockers / Errors\n- ${blocker}\n`
    );
  }

  fs.writeFileSync(checkpointPath, content, "utf8");

  console.log(`Checkpoint saved: ${CHECKPOINT_FILE}`);
  console.log(`Timestamp: ${timestamp}`);
  if (message) console.log(`Context: ${message}`);

  // Surface evolution backlog next item (informational)
  if (fs.existsSync(backlogPath)) {
    const backlog = fs.readFileSync(backlogPath, "utf8");
    const inProgress = backlog.match(/### \[EVO-\w+\][^\n]*\n[\s\S]*?Status.*?IN PROGRESS/i);
    if (inProgress) {
      const title = (inProgress[0].match(/### (\[EVO-\w+\][^\n]*)/) || [])[1];
      if (title) console.log(`Active EVO: ${title.trim()}`);
    }
  }

  return exitCodes.OK;
}

/**
 * aitri checkpoint show
 *
 * Prints the current checkpoint to stdout.
 */
export function runCheckpointShowCommand({ exitCodes }) {
  const cwd = process.cwd();
  const checkpointPath = path.resolve(cwd, CHECKPOINT_FILE);

  if (!fs.existsSync(checkpointPath)) {
    console.log("No checkpoint found. Run `aitri checkpoint` to create one.");
    return exitCodes.ERROR;
  }

  console.log(fs.readFileSync(checkpointPath, "utf8"));
  return exitCodes.OK;
}

function generateCheckpoint({ timestamp, agent, message, objective, nextAction, blocker }) {
  return [
    "# Aitri Development Checkpoint",
    `> LAST UPDATE: ${timestamp}`,
    `> AGENT: ${agent}`,
    "",
    "## 🎯 Current Objective",
    objective || "[EVO-META] Self-Evolution System Implementation.",
    "",
    "## 🧠 Working Memory (Context)",
    message ? `- ${message}` : "- (no context provided — run `aitri checkpoint \"<message>\"`)",
    "",
    "## 🚧 Active State",
    "- [ ] (update this section with current progress)",
    "",
    "## 🛑 Blockers / Errors",
    blocker ? `- ${blocker}` : "None.",
    "",
    "## ⏭️ Next Immediate Action",
    nextAction || "(define next action with --next \"<action>\")",
    ""
  ].join("\n");
}
