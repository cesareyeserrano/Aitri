import fs from "node:fs";
import path from "node:path";

function normalizeProjectName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 80) return "";
  return /^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/.test(raw) ? raw : "";
}

export async function runInitCommand({
  options,
  ask,
  showBanner,
  getProjectContextOrExit,
  confirmProceed,
  runAutoCheckpoint,
  printCheckpointSummary,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  showBanner();
  const defaultProjectName = path.basename(process.cwd()) || "aitri-project";
  const providedProject = normalizeProjectName(options.project);
  if (options.project && !providedProject) {
    console.log("Invalid project name. Use letters/numbers/spaces/._- (max 80 chars).");
    return ERROR;
  }
  let projectName = providedProject;
  if (
    !projectName &&
    !options.nonInteractive &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  ) {
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
  if (!projectName) {
    projectName = defaultProjectName;
  }
  const projectProfileFile = path.join(project.paths.docsRoot, "project.json");
  const initDirs = [
    project.paths.specsDraftsDir,
    project.paths.specsApprovedDir,
    project.paths.backlogRoot,
    project.paths.testsRoot,
    project.paths.docsRoot
  ];

  console.log("PLAN:");
  initDirs.forEach((dir) => console.log("- Create: " + path.relative(process.cwd(), dir)));
  console.log("- Write: " + path.relative(process.cwd(), projectProfileFile));
  if (project.config.loaded) {
    console.log(`- Config: ${project.config.file}`);
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

  initDirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
  fs.writeFileSync(projectProfileFile, `${JSON.stringify({
    name: projectName,
    initializedAt: new Date().toISOString(),
    root: path.basename(process.cwd())
  }, null, 2)}\n`, "utf8");

  console.log("Project initialized by Aitri ⚒️");
  console.log(`Project profile: ${path.relative(process.cwd(), projectProfileFile)} (${projectName})`);
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "init",
    feature: "project"
  }));
  return OK;
}
