import fs from "node:fs";
import path from "node:path";
import { normalizeFeatureName } from "../lib.js";

/**
 * Parse US-N entries from a backlog markdown string.
 * Returns a Map: { "US-1" => { id, text, traces: string[] } }
 */
function parseStories(markdown) {
  const map = new Map();
  const chunks = markdown.split(/(?=###\s+US-\d+)/);
  for (const chunk of chunks) {
    const idMatch = chunk.match(/###\s+(US-\d+)/i);
    if (!idMatch) continue;
    const id = idMatch[1].toUpperCase();

    const textLine = chunk.split("\n")
      .map(l => l.trim())
      .find(l => /^-\s+As a /i.test(l));
    const text = textLine ? textLine.replace(/^-\s+/, "") : "";

    const traceMatch = chunk.match(/Trace:\s*([^\n]+)/i);
    const traces = traceMatch
      ? traceMatch[1].split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
      : [];

    map.set(id, { id, text, traces });
  }
  return map;
}

/**
 * Compute delta between two story maps.
 * Returns { added, removed, modified, unchanged }
 */
function computeDelta(current, proposed) {
  const added = [];
  const removed = [];
  const modified = [];
  const unchanged = [];

  const allIds = new Set([...current.keys(), ...proposed.keys()]);
  for (const id of [...allIds].sort()) {
    const cur = current.get(id);
    const prop = proposed.get(id);

    if (!cur) {
      added.push({ id, traces: prop.traces, text: prop.text });
    } else if (!prop) {
      removed.push({ id, traces: cur.traces, text: cur.text });
    } else {
      const curTraces = cur.traces.join(", ");
      const propTraces = prop.traces.join(", ");
      const textChanged = cur.text !== prop.text;
      const tracesChanged = curTraces !== propTraces;
      if (textChanged || tracesChanged) {
        modified.push({
          id,
          fromTraces: cur.traces,
          toTraces: prop.traces,
          textChanged,
          tracesChanged
        });
      } else {
        unchanged.push({ id });
      }
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * aitri diff --feature <name> --proposed <file> [--json]
 *
 * Diffs the current backlog for a feature against a proposed update.
 * Outputs added/removed/modified/unchanged US items.
 */
export function runDiffCommand({ options, getProjectContextOrExit, exitCodes }) {
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

  const proposedPath = options.proposed || null;
  if (!proposedPath) {
    const msg = "Proposed backlog file is required. Use --proposed <file>.";
    if (options.json || options.format === "json" || options.nonInteractive) {
      console.log(JSON.stringify({ ok: false, feature, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const project = getProjectContextOrExit();
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

  const resolvedProposed = path.isAbsolute(proposedPath)
    ? proposedPath
    : path.resolve(process.cwd(), proposedPath);

  if (!fs.existsSync(resolvedProposed)) {
    const msg = `Proposed file not found: ${proposedPath}`;
    if (options.json || options.format === "json" || options.nonInteractive) {
      console.log(JSON.stringify({ ok: false, feature, error: msg }));
    } else {
      console.log(msg);
    }
    return ERROR;
  }

  const currentContent = fs.readFileSync(backlogFile, "utf8");
  const proposedContent = fs.readFileSync(resolvedProposed, "utf8");

  const current = parseStories(currentContent);
  const proposed = parseStories(proposedContent);

  const delta = computeDelta(current, proposed);
  const hasChanges = delta.added.length > 0 || delta.removed.length > 0 || delta.modified.length > 0;

  const output = {
    ok: true,
    feature,
    hasChanges,
    delta: {
      added: delta.added,
      removed: delta.removed,
      modified: delta.modified,
      unchanged: delta.unchanged.map(s => s.id)
    },
    summary: {
      added: delta.added.length,
      removed: delta.removed.length,
      modified: delta.modified.length,
      unchanged: delta.unchanged.length
    }
  };

  if (options.json || options.format === "json" || options.nonInteractive) {
    console.log(JSON.stringify(output, null, 2));
    return OK;
  }

  // Human-readable output
  console.log(`\nBacklog delta — ${feature}\n`);

  if (!hasChanges) {
    console.log("  No changes detected — proposed backlog matches current.");
  } else {
    for (const s of delta.added) {
      const traces = s.traces.length ? `Trace: ${s.traces.join(", ")}` : "no traces";
      console.log(`  + ${s.id} (added)      ${traces}`);
    }
    for (const s of delta.modified) {
      const from = s.fromTraces.join(", ") || "none";
      const to = s.toTraces.join(", ") || "none";
      if (s.tracesChanged) {
        console.log(`  ~ ${s.id} (modified)   Trace: ${from} → ${to}`);
      } else {
        console.log(`  ~ ${s.id} (modified)   story text changed`);
      }
    }
    for (const s of delta.removed) {
      const traces = s.traces.length ? `Trace: ${s.traces.join(", ")}` : "no traces";
      console.log(`  - ${s.id} (removed)    ${traces}`);
    }
    for (const s of delta.unchanged) {
      console.log(`  = ${s.id} (unchanged)`);
    }
  }

  const { added, removed, modified, unchanged } = output.summary;
  console.log(`\n${added} added, ${modified} modified, ${removed} removed, ${unchanged} unchanged.`);
  if (hasChanges) {
    console.log(`Current: ${path.relative(process.cwd(), backlogFile)}`);
    console.log(`Proposed: ${path.relative(process.cwd(), resolvedProposed)}`);
  }

  return OK;
}
