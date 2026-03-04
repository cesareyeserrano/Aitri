import fs from "node:fs";
import path from "node:path";
import { normalizeFeatureName } from "../lib.js";

const VERIFICATION_PERSONA = `You are a senior QA architect performing semantic traceability validation.
For each User Story, determine if it semantically satisfies the intent of its traced Functional Requirements.

For each US report:
- verdict: pass | partial | fail
- confidence: high | medium | low
- reason: one concise sentence

"pass": US clearly covers the FR intent — behavior, actor, and outcome align.
"partial": US covers part of the FR intent but misses edge cases or constraints.
"fail": US does not satisfy the FR intent or traces to a FR that does not exist.`;

/**
 * Extract Functional Rules from spec content.
 * Returns a map: { "FR-1": "The system must ...", ... }
 */
function extractFRs(specContent) {
  const sectionMatch = specContent.match(
    /## (?:\d+\.?\s*)?Functional Rules(?:\s*\(traceable\))?([\s\S]*?)(\n##\s|\s*$)/
  );
  if (!sectionMatch) return {};

  const frs = {};
  const lines = sectionMatch[1].split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^[-*]\s*(FR-\d+)\s*:\s*(.+)/i);
    if (m) frs[m[1].toUpperCase()] = m[2].trim();
  }
  return frs;
}

/**
 * Extract User Stories from backlog content.
 * Returns an array: [{ id: "US-1", text: "...", traces: ["FR-1", "AC-1"] }, ...]
 */
function extractUserStories(backlogContent) {
  const stories = [];
  const chunks = backlogContent.split(/(?=###\s+US-\d+)/);
  for (const chunk of chunks) {
    const idMatch = chunk.match(/###\s+(US-\d+)/i);
    if (!idMatch) continue;
    const id = idMatch[1].toUpperCase();

    const textLines = chunk.split("\n")
      .map(l => l.trim())
      .filter(l => l.startsWith("-") && !/^-\s*Trace:/i.test(l))
      .map(l => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);

    const traceMatch = chunk.match(/Trace:\s*([^\n]+)/i);
    const traces = traceMatch
      ? traceMatch[1].split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
      : [];

    stories.push({ id, text: textLines.join(" "), traces });
  }
  return stories;
}

/**
 * aitri verify-intent --feature <name> [--story US-N]
 *
 * Outputs a semantic traceability verification task for the agent.
 * The agent checks if each User Story satisfies the intent of its traced FRs.
 */
export async function runVerifyIntentCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;

  const rawFeatureInput = String(options.feature || options.positional[0] || "").trim();
  const feature = normalizeFeatureName(rawFeatureInput);

  if (!feature) {
    const msg = "Feature name is required. Use --feature <name>.";
    if (options.json || options.format === "json" || options.nonInteractive) {
      console.log(JSON.stringify({ ok: false, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const project = getProjectContextOrExit();

  // Require approved spec
  const specFile = project.paths.approvedSpecFile(feature);
  if (!fs.existsSync(specFile)) {
    const msg = `Approved spec not found for '${feature}'. Run \`aitri approve --feature ${feature}\` first.`;
    if (options.json || options.format === "json" || options.nonInteractive) {
      console.log(JSON.stringify({ ok: false, feature, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  // Require backlog
  const backlogFile = project.paths.backlogFile(feature);
  if (!fs.existsSync(backlogFile)) {
    const msg = `Backlog not found for '${feature}'. Run \`aitri plan --feature ${feature}\` first.`;
    if (options.json || options.format === "json" || options.nonInteractive) {
      console.log(JSON.stringify({ ok: false, feature, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const specContent = fs.readFileSync(specFile, "utf8");
  const backlogContent = fs.readFileSync(backlogFile, "utf8");

  const frs = extractFRs(specContent);
  let stories = extractUserStories(backlogContent);

  // Filter to single story if --story provided
  const storyFilter = options.story ? options.story.trim().toUpperCase() : null;
  if (storyFilter) {
    stories = stories.filter(s => s.id === storyFilter);
    if (stories.length === 0) {
      const msg = `Story '${storyFilter}' not found in backlog for '${feature}'.`;
      if (options.json || options.format === "json" || options.nonInteractive) {
        console.log(JSON.stringify({ ok: false, feature, error: msg }));
      } else {
        console.log(msg);
      }
      return ERROR;
    }
  }

  if (stories.length === 0) {
    const msg = "No User Stories found in backlog. Run `aitri plan` to generate them.";
    if (options.json || options.format === "json" || options.nonInteractive) {
      console.log(JSON.stringify({ ok: false, feature, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const frSummary = Object.entries(frs)
    .map(([id, text]) => `${id}: ${text}`)
    .join("\n") || "(no FRs found in spec)";

  console.log(`--- AGENT TASK: verify-intent — ${feature} ---`);
  console.log(`## Persona\n${VERIFICATION_PERSONA}\n`);
  console.log(`## All Functional Requirements\n${frSummary}\n`);
  console.log(`## User Stories to verify (${stories.length})\n`);

  for (const story of stories) {
    const tracedFRs = story.traces
      .filter(t => t.startsWith("FR-"))
      .map(id => frs[id] ? `${id}: ${frs[id]}` : `${id}: (not found in spec)`)
      .join("\n") || "(no FR traces — check backlog Trace: line)";

    console.log(`### ${story.id}`);
    console.log(`Story: ${story.text || "(no story text found)"}`);
    console.log(`Traced FRs: ${story.traces.filter(t => t.startsWith("FR-")).join(", ") || "none"}`);
    console.log(tracedFRs);
    console.log(`→ Does ${story.id} semantically satisfy the intent of its traced FRs?\n`);
  }

  console.log(`--- END TASK ---`);
  console.log(`\nFor each US, report: verdict (pass/partial/fail), confidence, reason.`);
  console.log(`Backlog: ${path.relative(process.cwd(), backlogFile)}`);

  return OK;
}
