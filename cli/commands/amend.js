import fs from "node:fs";
import path from "node:path";
import { readDependencyGraph } from "../lib/dependency-graph.js";
import { loadPersonaSystemPrompt } from "../persona-loader.js";

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// EVO-097: check design.md no_impact condiciones against amendment note
function checkNoImpactAdvisory(root, amendNote) {
  const designPath = path.join(root, ".aitri/design.md");
  if (!fs.existsSync(designPath) || !amendNote) return [];
  const content = fs.readFileSync(designPath, "utf8");
  const matches = [...content.matchAll(/condiciones:\s*([^\n]+)/gi)];
  const noteWords = amendNote.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  return matches
    .filter((m) => noteWords.some((w) => m[1].toLowerCase().includes(w)))
    .map((m) => m[1].trim().slice(0, 100));
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

  // EVO-097: design-amendment propagation
  const amendTs = new Date().toISOString().replace(/[:.]/g, "-");
  const amendDir = path.join(root, ".aitri", `amendment-${amendTs}`);
  fs.mkdirSync(amendDir, { recursive: true });

  // 1. Re-sign Security/QA — write pending review slots
  const note = amendReason || "(no note)";
  ["security", "qa"].forEach((persona) => {
    const loaded = loadPersonaSystemPrompt(persona);
    const body = [
      `# ${persona === "security" ? "Security" : "QA"} Re-Sign Required`,
      ``, `Amendment: ${note}`, ``,
      `Please review this amendment for ${persona === "security" ? "security implications" : "QA implications"}.`,
      ``, `## Persona System Prompt`, ``,
      loaded.ok ? loaded.systemPrompt : "(persona not loaded)"
    ].join("\n");
    fs.writeFileSync(path.join(amendDir, `${persona}-review-pending.md`), body, "utf8");
  });

  // 2. GI consumers propagation
  let giConsumersAffected = [];
  const depGraph = readDependencyGraph(root);
  if (depGraph && amendReason) {
    const gis = depGraph.global_interfaces || [];
    const giConsumers = depGraph.global_interface_consumers || {};
    const mentionedGIs = gis.filter((gi) => amendReason.toLowerCase().includes(gi.id.toLowerCase()));
    giConsumersAffected = [...new Set(mentionedGIs.flatMap((gi) => giConsumers[gi.id] || []))];
    if (giConsumersAffected.length > 0) {
      const reProveFile = path.join(root, "docs", "implementation", feature, "re-prove-required.json");
      const existing = readJsonSafe(reProveFile) || {};
      const entries = existing.entries || [];
      giConsumersAffected.forEach((usId) => {
        entries.push({ story: usId, status: "pending", reason: `GI consumer — amendment: ${note}`, since: new Date().toISOString() });
      });
      fs.mkdirSync(path.dirname(reProveFile), { recursive: true });
      fs.writeFileSync(reProveFile, JSON.stringify({ schemaVersion: 1, feature, entries }, null, 2), "utf8");
    }
  }

  // 3. NO IMPACT advisory
  const noImpactAdvisory = checkNoImpactAdvisory(root, amendReason);

  // 4. Sealed-hashes invalidation (if amendment references FR IDs)
  const sealedHashesFile = path.join(root, ".aitri", "sealed-hashes.json");
  let sealedInvalidated = false;
  if (fs.existsSync(sealedHashesFile) && amendReason && /\bFR-\d+\b/.test(amendReason)) {
    fs.unlinkSync(sealedHashesFile);
    sealedInvalidated = true;
  }

  // 5. Amendment manifest
  fs.writeFileSync(path.join(amendDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1, feature, amendedAt: new Date().toISOString(),
    note, version: currentVersion, nextVersion,
    giConsumersAffected, sealedInvalidated, noImpactAdvisory,
    pendingReviews: ["security-review-pending.md", "qa-review-pending.md"]
  }, null, 2), "utf8");

  const relAmendDir = path.relative(root, amendDir);
  console.log(`Amendment manifest: ${relAmendDir}/manifest.json`);
  console.log(`Re-sign prompts: ${relAmendDir}/security-review-pending.md, ${relAmendDir}/qa-review-pending.md`);
  if (giConsumersAffected.length > 0) console.log(`GI consumers requiring re-prove: ${giConsumersAffected.join(", ")}`);
  if (sealedInvalidated) console.log("SPEC-SEALED hashes invalidated — re-run: aitri build --feature " + feature);
  if (noImpactAdvisory.length > 0) {
    console.log("NO IMPACT ADVISORY: amendment may trigger re-review:");
    noImpactAdvisory.forEach((c) => console.log(`  - ${c}`));
  }

  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "amend",
    feature
  }));
  return OK;
}
