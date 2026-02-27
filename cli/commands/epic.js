// cli/commands/epic.js
// EVO-041: Épicas — organizational containers for features with aggregated progress
import fs from "node:fs";
import path from "node:path";
import { scanAllFeatures } from "./features.js";

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function epicsDir(paths) {
  return path.join(paths.docsRoot, "epics");
}

function epicFile(paths, name) {
  return path.join(epicsDir(paths), `${name}.json`);
}

function readAllEpics(paths) {
  const dir = epicsDir(paths);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => readJsonSafe(path.join(dir, f)))
    .filter(Boolean);
}

function computeProgress(epicFeatures, allFeatures) {
  const featureMap = new Map(allFeatures.map(f => [f.name, f]));
  let delivered = 0, inProgress = 0, notStarted = 0;
  for (const name of epicFeatures) {
    const f = featureMap.get(name);
    if (!f || f.state === "unknown") { notStarted++; continue; }
    if (f.state === "delivered") { delivered++; continue; }
    if (f.state === "draft") { notStarted++; continue; }
    inProgress++;
  }
  return { total: epicFeatures.length, delivered, inProgress, notStarted };
}

export function readAllEpicsWithProgress(paths) {
  const epics = readAllEpics(paths);
  if (epics.length === 0) return [];
  const allFeatures = scanAllFeatures(paths);
  return epics.map(e => ({
    ...e,
    progressSummary: computeProgress(e.features, allFeatures)
  }));
}

// Lightweight variant that only needs the docs root path (no full paths object required)
export function readEpicsSummaryFromDocsRoot(docsRoot) {
  const dir = path.join(docsRoot, "epics");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => readJsonSafe(path.join(dir, f)))
    .filter(Boolean);
}

export function runEpicCreateCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const name = options.name;

  if (!name) {
    console.log("Epic name required. Use: aitri epic create --name <name> --features <f1,f2,...>");
    return ERROR;
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.log("Epic name must be kebab-case (lowercase letters, digits, hyphens). Example: user-auth");
    return ERROR;
  }

  const featuresArg = options.features;
  if (!featuresArg) {
    console.log("Features required. Use: --features <f1,f2,...>");
    return ERROR;
  }

  const features = featuresArg.split(",").map(f => f.trim()).filter(Boolean);
  if (features.length === 0) {
    console.log("At least one feature is required.");
    return ERROR;
  }

  const file = epicFile(project.paths, name);
  if (fs.existsSync(file) && !options.force) {
    console.log(`Epic "${name}" already exists. Use --force to overwrite.`);
    return ERROR;
  }

  const allFeatures = scanAllFeatures(project.paths);
  const progress = computeProgress(features, allFeatures);

  const epic = {
    schemaVersion: 1,
    name,
    createdAt: new Date().toISOString(),
    features,
    progressSummary: progress
  };

  fs.mkdirSync(epicsDir(project.paths), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(epic, null, 2) + "\n", "utf8");

  const rel = path.relative(process.cwd(), file);
  console.log(`Epic "${name}" created → ${rel}`);
  const parts = [];
  if (progress.delivered > 0) parts.push(`${progress.delivered} delivered`);
  if (progress.inProgress > 0) parts.push(`${progress.inProgress} in progress`);
  if (progress.notStarted > 0) parts.push(`${progress.notStarted} not started`);
  console.log(`Features (${progress.total}): ${parts.join(", ") || "none tracked yet"}`);
  return OK;
}

export function runEpicStatusCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  const project = getProjectContextOrExit();
  const name = options.name || options.epic || null;
  const jsonOutput = options.json;

  if (!name) {
    const epics = readAllEpicsWithProgress(project.paths);
    if (epics.length === 0) {
      if (jsonOutput) { console.log(JSON.stringify({ ok: true, epics: [] }, null, 2)); return OK; }
      console.log("No epics found. Create one with: aitri epic create --name <name> --features <f1,f2,...>");
      return OK;
    }
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: true, epics }, null, 2));
      return OK;
    }
    console.log("Epics in this project:\n");
    for (const e of epics) {
      const p = e.progressSummary;
      console.log(`  ${e.name}  (${p.delivered}/${p.total} delivered, ${p.inProgress} in progress)`);
      console.log(`  Features: ${e.features.join(", ")}`);
      console.log("");
    }
    return OK;
  }

  const file = epicFile(project.paths, name);
  if (!fs.existsSync(file)) {
    console.log(`Epic "${name}" not found.`);
    return ERROR;
  }

  const epic = readJsonSafe(file);
  if (!epic) { console.log(`Failed to read epic "${name}".`); return ERROR; }

  const allFeatures = scanAllFeatures(project.paths);
  const featureMap = new Map(allFeatures.map(f => [f.name, f]));
  const progress = computeProgress(epic.features, allFeatures);

  if (jsonOutput) {
    const featuresDetail = epic.features.map(fname => {
      const f = featureMap.get(fname);
      return f
        ? { name: fname, state: f.state, nextStep: f.nextStep }
        : { name: fname, state: "not-found", nextStep: null };
    });
    console.log(JSON.stringify({ ok: true, epic: { ...epic, progressSummary: progress }, features: featuresDetail }, null, 2));
    return OK;
  }

  console.log(`\nEpic: ${name}`);
  console.log(`Created: ${epic.createdAt}`);
  console.log(`Progress: ${progress.delivered}/${progress.total} delivered\n`);

  const nameW = Math.max(20, ...epic.features.map(f => f.length + 2));
  const stateW = 18;
  console.log("  " + "Feature".padEnd(nameW) + "State".padEnd(stateW) + "Next Step");
  console.log("  " + "─".repeat(nameW + stateW + 40));
  for (const fname of epic.features) {
    const f = featureMap.get(fname);
    const state = f ? f.state : "not-found";
    const nextStep = f ? (f.nextStep || "(complete)") : "(aitri draft first)";
    console.log("  " + fname.padEnd(nameW) + state.padEnd(stateW) + nextStep);
  }
  console.log("");
  const parts = [];
  if (progress.delivered > 0) parts.push(`${progress.delivered} delivered`);
  if (progress.inProgress > 0) parts.push(`${progress.inProgress} in progress`);
  if (progress.notStarted > 0) parts.push(`${progress.notStarted} not started`);
  if (parts.length > 0) console.log(`  ${parts.join(", ")}`);
  return OK;
}
