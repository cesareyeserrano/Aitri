import fs from "node:fs";
import path from "node:path";
import { confirmYesNo } from "./session-control.js";

const AITRI_MARKERS = new Set([
  "drafts", "approved", "discovery", "plan", "verification", "delivery",
  "implementation", "project.json", "insight", "stale", "feedback"
]);

function normalizeProjectName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 80) return "";
  return /^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/.test(raw) ? raw : "";
}

function detectConflicts(initDirs, root) {
  const conflicts = [];
  for (const dir of initDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    const foreign = entries.filter((e) => !AITRI_MARKERS.has(e));
    if (foreign.length > 0) {
      conflicts.push({
        dir: path.relative(root, dir),
        foreignEntries: foreign.slice(0, 5),
        total: foreign.length
      });
    }
  }
  return conflicts;
}

function detectProjectType(root) {
  const signals = [];
  if (fs.existsSync(path.join(root, "package.json"))) signals.push("node");
  if (fs.existsSync(path.join(root, "pyproject.toml")) || fs.existsSync(path.join(root, "setup.py"))) signals.push("python");
  if (fs.existsSync(path.join(root, "go.mod"))) signals.push("go");
  if (fs.existsSync(path.join(root, "Cargo.toml"))) signals.push("rust");
  if (fs.existsSync(path.join(root, "pom.xml")) || fs.existsSync(path.join(root, "build.gradle"))) signals.push("java");
  return signals;
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export async function runInitCommand({
  options,
  ask,
  showBanner,
  getProjectContextOrExit,
  runAutoCheckpoint,
  printCheckpointSummary,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  showBanner();
  const root = process.cwd();
  const defaultProjectName = path.basename(root) || "aitri-project";
  const providedProject = normalizeProjectName(options.project);
  if (options.project && !providedProject) {
    console.log("Invalid project name. Use letters/numbers/spaces/._- (max 80 chars).");
    return ERROR;
  }
  let projectName = providedProject;
  if (!projectName && !options.nonInteractive && process.stdin.isTTY && process.stdout.isTTY) {
    const prompted = await ask(`Project name (default: ${defaultProjectName}): `);
    if (!String(prompted || "").trim()) {
      projectName = defaultProjectName;
    } else {
      projectName = normalizeProjectName(prompted);
      if (!projectName) {
        console.log("Invalid project name. Use letters/numbers/spaces/._- (max 80 chars).");
        return ERROR;
      }
    }
  }
  if (!projectName) projectName = defaultProjectName;

  const projectProfileFile = path.join(project.paths.docsRoot, "project.json");
  const initDirs = [
    project.paths.specsDraftsDir,
    project.paths.specsApprovedDir,
    project.paths.backlogRoot,
    project.paths.testsRoot,
    project.paths.docsRoot
  ];

  // Brownfield conflict detection
  const conflicts = detectConflicts(initDirs, root);
  if (conflicts.length > 0) {
    console.log("WARNING: Existing directories detected with non-Aitri content:");
    conflicts.forEach((c) => {
      const preview = c.foreignEntries.join(", ") + (c.total > 5 ? ", ..." : "");
      console.log(`  ${c.dir}/ (${c.total} existing files: ${preview})`);
    });
    console.log("");
    console.log("Recommendation: Create aitri.config.json to map Aitri directories to a separate path.");
    console.log("");
    if (!options.nonInteractive) {
      const cont = await confirmYesNo({ ask, question: "Continue with default paths anyway? (y/N): ", defaultYes: false });
      if (!cont) {
        console.log("Aborted. Create aitri.config.json first, then re-run aitri init.");
        return ABORTED;
      }
    } else if (!options.yes) {
      console.log("Non-interactive mode: use aitri.config.json for custom paths or --yes to override.");
      return ERROR;
    } else {
      console.log("Proceeding with default paths (--yes provided).");
    }
  }

  console.log("PLAN:");
  initDirs.forEach((dir) => console.log("- Create: " + path.relative(root, dir)));
  console.log("- Write: " + path.relative(root, projectProfileFile));
  if (project.config.loaded) console.log(`- Config: ${project.config.file}`);

  initDirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

  // Write project.json — skip if exists (overwrite protection)
  const existingProfile = readJsonSafe(projectProfileFile);
  if (!existingProfile) {
    const detectedStack = detectProjectType(root);
    const { version } = JSON.parse(fs.readFileSync(
      new URL("../../package.json", import.meta.url),
      "utf8"
    ));
    fs.writeFileSync(projectProfileFile, JSON.stringify({
      name: projectName,
      initializedAt: new Date().toISOString(),
      root: path.basename(root),
      detectedStack,
      aitriVersion: version
    }, null, 2) + "\n", "utf8");
  } else {
    console.log(`Project profile already exists: ${path.relative(root, projectProfileFile)} (${existingProfile.name})`);
  }

  console.log("Project initialized by Aitri ⚒️");
  console.log(`Project profile: ${path.relative(root, projectProfileFile)} (${projectName})`);
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "init",
    feature: "project"
  }));
  return OK;
}
