import fs from "node:fs";
import path from "node:path";

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function globMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.basename(f, ".md"));
}

function featureNextStep(state, feature) {
  switch (state) {
    case "draft": return `aitri approve --feature ${feature}`;
    case "approved": return `aitri plan --feature ${feature}`;
    case "implementation": return `aitri build --feature ${feature}`;
    case "deliver_pending": return `aitri deliver --feature ${feature}`;
    case "blocked": return `aitri go --feature ${feature}`;
    case "delivered": return null;
    default: return `aitri status --feature ${feature}`;
  }
}

function resolveFeatureState(feature, paths) {
  const isDraft = fs.existsSync(paths.draftSpecFile(feature));
  const isApproved = fs.existsSync(paths.approvedSpecFile(feature));
  const delivery = readJsonSafe(paths.deliveryJsonFile(feature));

  if (delivery?.decision === "SHIP") return "delivered";
  if (delivery?.decision === "HOLD") return "blocked";
  if (fs.existsSync(paths.goMarkerFile(feature))) {
    const deliveryFile = paths.deliveryJsonFile(feature);
    if (fs.existsSync(deliveryFile)) return "deliver_pending";
    return "implementation";
  }
  if (isApproved) return "approved";
  if (isDraft) return "draft";
  return "unknown";
}

function scanAllFeatures(paths) {
  const seen = new Set();
  const features = [];

  const drafts = globMd(paths.specsDraftsDir);
  for (const name of drafts) {
    if (seen.has(name)) continue;
    seen.add(name);
    const state = resolveFeatureState(name, paths);
    const specFile = path.relative(paths.root || process.cwd(), paths.draftSpecFile(name));
    const delivery = readJsonSafe(paths.deliveryJsonFile(name));
    features.push({
      name,
      state,
      specFile,
      deliveredAt: delivery?.decision === "SHIP" ? (delivery.deliveredAt || null) : null,
      nextStep: featureNextStep(state, name)
    });
  }

  const approved = globMd(paths.specsApprovedDir);
  for (const name of approved) {
    if (seen.has(name)) continue;
    seen.add(name);
    const state = resolveFeatureState(name, paths);
    const specFile = path.relative(paths.root || process.cwd(), paths.approvedSpecFile(name));
    const delivery = readJsonSafe(paths.deliveryJsonFile(name));
    features.push({
      name,
      state,
      specFile,
      deliveredAt: delivery?.decision === "SHIP" ? (delivery.deliveredAt || null) : null,
      nextStep: featureNextStep(state, name)
    });
  }

  return features;
}

export function runFeaturesCommand({
  options,
  getProjectContextOrExit,
  exitCodes
}) {
  const { OK } = exitCodes;
  const project = getProjectContextOrExit();
  const features = scanAllFeatures(project.paths);

  const jsonOutput = options.json
    || (options.format || "").toLowerCase() === "json"
    || options.positional.some((p) => p.toLowerCase() === "json");

  const delivered = features.filter((f) => f.state === "delivered").length;
  const inProgress = features.filter((f) => !["delivered", "draft"].includes(f.state)).length;
  const draft = features.filter((f) => f.state === "draft").length;
  const summary = { total: features.length, delivered, inProgress, draft };

  if (jsonOutput) {
    console.log(JSON.stringify({ ok: true, features, summary }, null, 2));
    return OK;
  }

  if (features.length === 0) {
    console.log("No features found. Run `aitri draft` to start a new feature.");
    return OK;
  }

  console.log("Features in this project:\n");
  const nameW = Math.max(20, ...features.map((f) => f.name.length + 2));
  const stateW = 18;
  console.log(
    "  " + "Feature".padEnd(nameW) + "State".padEnd(stateW) + "Next Step"
  );
  console.log("  " + "─".repeat(nameW + stateW + 40));
  for (const f of features) {
    const nextStep = f.nextStep || "(complete)";
    console.log("  " + f.name.padEnd(nameW) + f.state.padEnd(stateW) + nextStep);
  }
  console.log("");
  const parts = [];
  if (delivered > 0) parts.push(`${delivered} delivered`);
  if (inProgress > 0) parts.push(`${inProgress} in progress`);
  if (draft > 0) parts.push(`${draft} draft`);
  console.log(`Total: ${features.length} feature${features.length !== 1 ? "s" : ""} (${parts.join(", ")})`);
  return OK;
}

export async function runNextCommand({
  options,
  ask,
  getProjectContextOrExit,
  confirmProceed,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const allFeatures = scanAllFeatures(project.paths);
  const pending = allFeatures.filter((f) => f.state !== "delivered");

  if (pending.length === 0) {
    console.log("All features are delivered. Run `aitri draft` to start a new feature.");
    return OK;
  }

  // Apply queue priority if available
  const queue = readJsonSafe(project.paths.projectQueueFile);
  let candidate;
  if (queue?.queue?.length > 0) {
    const queueMap = new Map(queue.queue.map((e) => [e.feature, e.priority]));
    const queued = pending
      .filter((f) => queueMap.has(f.name))
      .sort((a, b) => (queueMap.get(a.name) || 99) - (queueMap.get(b.name) || 99));
    candidate = queued[0] || pending[0];
  } else {
    const drafts = pending.filter((f) => f.state === "draft");
    const others = pending.filter((f) => f.state !== "draft");
    candidate = drafts[0] || others[0];
  }

  const cmd = candidate.nextStep || `aitri status --feature ${candidate.name}`;

  if (options.nonInteractive) {
    console.log(`Next: ${candidate.name} (${candidate.state})`);
    console.log(`Run: ${cmd}`);
    return OK;
  }

  console.log(`Next feature: ${candidate.name} (${candidate.state})`);
  console.log(`Suggested: ${cmd}`);
  return OK;
}