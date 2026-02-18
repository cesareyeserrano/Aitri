import fs from "node:fs";
import path from "node:path";

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export async function runAmendCommand({
  options,
  ask,
  getProjectContextOrExit,
  confirmProceed,
  runAutoCheckpoint,
  printCheckpointSummary,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();

  const feature = options.feature;
  if (!feature) {
    console.log("Feature name is required. Use --feature <name>.");
    return ERROR;
  }

  const approvedSpecFile = project.paths.approvedSpecFile(feature);
  if (!fs.existsSync(approvedSpecFile)) {
    console.log(`No approved spec found for: ${feature}`);
    console.log(`Run aitri approve --feature ${feature} first.`);
    return ERROR;
  }

  const versionDir = project.paths.specVersionDir(feature);
  const changelogFile = project.paths.specChangelogFile(feature);
  const staleMarkerFile = project.paths.staleMarkerFile(feature);

  // Determine current version number
  const changelog = readJsonSafe(changelogFile);
  const currentVersion = changelog?.currentVersion ?? 1;
  const nextVersion = currentVersion + 1;
  const archiveFile = path.join(versionDir, `v${currentVersion}.md`);

  // Discover stale artifacts
  const staleArtifacts = [];
  const checkFiles = [
    project.paths.discoveryFile(feature),
    project.paths.planFile(feature),
    project.paths.backlogFile(feature),
    project.paths.testsFile(feature)
  ];
  checkFiles.forEach((f) => {
    if (fs.existsSync(f)) staleArtifacts.push(path.relative(root, f));
  });

  const draftFile = project.paths.draftSpecFile(feature);
  const amendReason = options.note || null;

  console.log("PLAN:");
  console.log(`- Archive: ${path.relative(root, approvedSpecFile)} → ${path.relative(root, archiveFile)}`);
  console.log(`- Create draft: ${path.relative(root, draftFile)}`);
  console.log(`- Write changelog: ${path.relative(root, changelogFile)}`);
  console.log(`- Write stale marker: ${path.relative(root, staleMarkerFile)}`);
  if (staleArtifacts.length > 0) {
    console.log(`- Mark stale: ${staleArtifacts.join(", ")}`);
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

  const specContent = fs.readFileSync(approvedSpecFile, "utf8");

  // Archive current approved spec
  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(archiveFile, specContent, "utf8");

  // Create new draft from approved spec (reset status to DRAFT)
  const draftContent = specContent.replace(/^STATUS:\s*APPROVED\s*$/m, "STATUS: DRAFT");
  fs.mkdirSync(path.dirname(draftFile), { recursive: true });
  fs.writeFileSync(draftFile, draftContent, "utf8");

  // Write changelog
  const delivery = readJsonSafe(project.paths.deliveryJsonFile(feature));
  const newChangelog = {
    feature,
    versions: [
      ...(changelog?.versions || []),
      {
        version: currentVersion,
        approvedAt: null,
        deliveredAt: delivery?.decision === "SHIP" ? delivery.deliveredAt || null : null,
        archiveFile: path.relative(root, archiveFile),
        reason: null
      }
    ],
    currentVersion: nextVersion,
    amendedAt: new Date().toISOString(),
    amendReason
  };
  fs.writeFileSync(changelogFile, JSON.stringify(newChangelog, null, 2) + "\n", "utf8");

  // Write stale marker
  fs.mkdirSync(path.dirname(staleMarkerFile), { recursive: true });
  fs.writeFileSync(staleMarkerFile, JSON.stringify({
    feature,
    staleSince: new Date().toISOString(),
    reason: `Spec amended. Downstream artifacts (discovery, plan, backlog, tests) were generated from v${currentVersion} and may not reflect v${nextVersion} changes.`,
    staleArtifacts
  }, null, 2) + "\n", "utf8");

  console.log(`Spec archived as v${currentVersion}: ${path.relative(root, archiveFile)}`);
  console.log(`New draft created: ${path.relative(root, draftFile)}`);
  console.log(`Edit the draft, then run: aitri approve --feature ${feature}`);
  console.log(`Note: discovery, plan, backlog, and tests are now stale.`);

  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "amend",
    feature
  }));
  return OK;
}
