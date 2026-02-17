import fs from "node:fs";
import path from "node:path";
import { parseApprovedSpec } from "./spec-parser.js";
import { extractSection, normalizeLine, resolveFeature } from "../lib.js";

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function parseTraceIds(traceLine, prefix) {
  return [...new Set(
    [...String(traceLine || "").matchAll(new RegExp(`\\b${prefix}-\\d+\\b`, "g"))]
      .map((match) => match[0])
  )];
}

function parseUserStories(backlogContent) {
  const blocks = [...String(backlogContent || "").matchAll(/###\s*(US-\d+)([\s\S]*?)(?=\n###\s*US-\d+|$)/g)];
  return blocks.map((match) => {
    const id = match[1].trim();
    const body = match[2];
    const sentenceMatch = body.match(/-\s*As an?\s+[^.\n]+\./i);
    const traceLine = (body.match(/-\s*Trace:\s*([^\n]+)/i) || [null, ""])[1];
    const acceptanceLines = [...body.matchAll(/-\s*Given\s+(.+?),\s*when\s+(.+?),\s*then\s+(.+?)\./gi)]
      .map((parts) => ({
        given: normalizeLine(parts[1]),
        when: normalizeLine(parts[2]),
        then: normalizeLine(parts[3])
      }));
    return {
      id,
      sentence: sentenceMatch ? normalizeLine(sentenceMatch[0].replace(/^-\s*/, "")) : `As a worker, I want to implement ${id}.`,
      frIds: parseTraceIds(traceLine, "FR"),
      acIds: parseTraceIds(traceLine, "AC"),
      acceptance: acceptanceLines
    };
  });
}

function parseTcMapByStory(testsContent) {
  const blocks = [...String(testsContent || "").matchAll(/###\s*(TC-\d+)([\s\S]*?)(?=\n###\s*TC-\d+|$)/g)];
  const map = {};
  blocks.forEach((match) => {
    const tcId = match[1];
    const body = match[2];
    const title = normalizeLine((body.match(/-\s*Title:\s*(.+)/i) || [null, `Validate ${tcId}`])[1]);
    const traceLine = (body.match(/-\s*Trace:\s*([^\n]+)/i) || [null, ""])[1];
    const usIds = parseTraceIds(traceLine, "US");
    const frIds = parseTraceIds(traceLine, "FR");
    usIds.forEach((usId) => {
      if (!map[usId]) map[usId] = [];
      map[usId].push({ id: tcId, title, frIds });
    });
  });
  return map;
}

function parseResourceStrategy(specContent) {
  const assetMatch = String(specContent || "").match(/## (?:8\. Asset Strategy|10\. Resource Strategy|Asset Strategy|Resource Strategy)([\s\S]*?)(\n##\s|\s*$)/i);
  if (!assetMatch) return null;
  const lines = assetMatch[1].split("\n").map(l => l.trim()).filter(l => l && l !== "-");
  return lines.length > 0 ? lines : null;
}

function scanProjectAssets(root) {
  const assetDirs = ["web/assets", "assets", "public/assets", "src/assets", "static"];
  const found = [];
  for (const dir of assetDirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    try {
      const entries = scanDirRecursive(abs, root, 3);
      found.push(...entries);
    } catch { /* skip unreadable dirs */ }
  }
  return found.length > 0 ? found : null;
}

function scanDirRecursive(dir, root, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith(".") || entry.name.endsWith(".zip")) continue;
    if (entry.isDirectory()) {
      results.push(...scanDirRecursive(full, root, maxDepth, depth + 1));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".ogg", ".mp3", ".wav", ".ttf", ".woff", ".woff2", ".json"].includes(ext)) {
        results.push(path.relative(root, full));
      }
    }
  }
  return results;
}

function parseQualityConstraints(planContent) {
  const architecture = extractSection(planContent, "## 5. Architecture (Architect Persona)");
  const domain = normalizeLine((architecture.match(/-\s*Domain:\s*(.+)/i) || [null, "Not specified"])[1]);
  const stackConstraint = normalizeLine((architecture.match(/-\s*Stack constraint:\s*(.+)/i) || [null, "Not specified"])[1]);
  const forbiddenDefaults = normalizeLine((architecture.match(/-\s*Forbidden defaults:\s*(.+)/i) || [null, "Not specified"])[1]);
  return { domain, stackConstraint, forbiddenDefaults };
}

function parseImplementationHints(planContent) {
  const section = extractSection(planContent, "## 10. Implementation Notes (Developer Persona)");
  const sequenceLine = normalizeLine((section.match(/-\s*Suggested sequence:\s*([\s\S]*?)(?=\n-\s*Dependencies:|\n-\s*Rollout|$)/i) || [null, ""])[1]);
  const dependencyLine = normalizeLine((section.match(/-\s*Dependencies:\s*([\s\S]*?)(?=\n-\s*Rollout|$)/i) || [null, ""])[1]);
  return {
    sequence: sequenceLine || "Follow IMPLEMENTATION_ORDER.md from this command.",
    dependencies: dependencyLine || "Use scaffold interfaces as non-breaking contracts."
  };
}

function storyPriorityScore(story) {
  const text = `${story.sentence} ${story.frIds.join(" ")}`.toLowerCase();
  if (/\b(model|schema|entity|repository|storage|data)\b/.test(text)) return 1;
  if (/\b(service|workflow|engine|api|validation|policy)\b/.test(text)) return 2;
  if (/\b(ui|dashboard|screen|view|portal|frontend|ux)\b/.test(text)) return 3;
  return 2;
}

function storyNumericId(storyId) {
  const value = Number.parseInt(String(storyId || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function buildImplementationOrder(stories, tcMapByStory) {
  return [...stories]
    .map((story) => ({
      ...story,
      dependencyScore: storyPriorityScore(story),
      tcCount: (tcMapByStory[story.id] || []).length
    }))
    .sort((a, b) => {
      const depDiff = a.dependencyScore - b.dependencyScore;
      if (depDiff !== 0) return depDiff;
      const tcDiff = b.tcCount - a.tcCount;
      if (tcDiff !== 0) return tcDiff;
      return storyNumericId(a.id) - storyNumericId(b.id);
    });
}

function findScaffoldReferences(story, manifest) {
  const storyToken = String(story.id || "").toLowerCase().replace(/^us-/, "tc-");
  const testFiles = (manifest?.testFiles || []).filter((file) => {
    const lower = String(file).toLowerCase();
    if (!storyToken) return true;
    return lower.includes(storyToken);
  });

  const frTokens = new Set(story.frIds.map((fr) => fr.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  const interfaceFiles = (manifest?.interfaceFiles || []).filter((file) => {
    const normalized = String(file).toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (frTokens.size === 0) return true;
    return [...frTokens].some((token) => normalized.includes(token));
  });

  return {
    testFiles: testFiles.slice(0, 6),
    interfaceFiles: interfaceFiles.slice(0, 6)
  };
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeFile(file, content) {
  ensureDir(file);
  fs.writeFileSync(file, content, "utf8");
}

function buildBriefContent({
  feature,
  story,
  parsedSpec,
  quality,
  hints,
  linkedTc,
  references,
  dependencies,
  resourceStrategy,
  projectAssets
}) {
  const acceptance = story.acceptance.length > 0
    ? story.acceptance.map((ac) => `- Given ${ac.given}, when ${ac.when}, then ${ac.then}.`).join("\n")
    : "- No explicit acceptance criteria found. Use tests.md trace as source of truth.";

  const tcSection = linkedTc.length > 0
    ? linkedTc.map((tc) => `- ${tc.id}: ${tc.title} (Trace FR: ${tc.frIds.join(", ") || "none"})`).join("\n")
    : "- No TC linked to this story in tests.md.";

  const contextSnapshot = parsedSpec.context.slice(0, 3).map((line) => `- ${line}`).join("\n");
  const referencesSection = [
    ...references.interfaceFiles.map((file) => `- Interface: ${file}`),
    ...references.testFiles.map((file) => `- Test stub: ${file}`)
  ];

  return `# Implementation Brief: ${story.id}

Feature: ${feature}
Story: ${story.sentence}
Trace: ${[...story.frIds, ...story.acIds].join(", ") || "Missing trace IDs in backlog"}

## 1. Feature Context
${contextSnapshot}

## 2. Acceptance Criteria
${acceptance}

## 3. Test Cases to Satisfy
${tcSection}

## 4. Scaffold References
${referencesSection.length > 0 ? referencesSection.join("\n") : "- Run \`aitri scaffold\` again to regenerate references."}

## 5. Dependency Notes
- Order rationale: ${dependencies}
- Plan sequence hint: ${hints.sequence}
- Plan dependency hint: ${hints.dependencies}

## 6. Quality Constraints
- Domain profile: ${quality.domain}
- Stack constraint: ${quality.stackConstraint}
- Forbidden defaults: ${quality.forbiddenDefaults}
- Non-negotiable: keep FR traceability comments in interfaces and TC markers in tests.
${resourceStrategy ? `
## 7. Resource/Asset Strategy (from approved spec)
${resourceStrategy.map(l => l.startsWith("-") ? l : `- ${l}`).join("\n")}
` : ""}${projectAssets ? `
## 8. Available Assets in Project
The following asset files were found in the project. Use these instead of generating new ones:
${projectAssets.slice(0, 40).map(a => `- ${a}`).join("\n")}${projectAssets.length > 40 ? `\n- ... and ${projectAssets.length - 40} more files` : ""}
` : ""}
`;
}

function buildOrderContent({ feature, orderedStories, tcMapByStory }) {
  const rows = orderedStories.map((story, index) => {
    const tcCount = (tcMapByStory[story.id] || []).length;
    return `${index + 1}. ${story.id} (dependencyScore=${story.dependencyScore}, tcCount=${tcCount})`;
  }).join("\n");

  return `# Implementation Order: ${feature}

Generated by \`aitri implement\`.

Dependency-sort policy:
- Lower dependencyScore executes first (data/model -> service -> UI/integration).
- Higher TC linkage breaks ties (stories with more verification surface first).
- US numeric order resolves remaining ties.

## Ordered Stories
${rows}
`;
}

export async function runImplementCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  confirmProceed,
  printCheckpointSummary,
  runAutoCheckpoint,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();

  let feature;
  try {
    feature = resolveFeature(options, getStatusReportOrExit);
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Feature resolution failed.");
    return ERROR;
  }

  const goMarkerFile = project.paths.goMarkerFile(feature);
  const scaffoldManifestFile = path.join(project.paths.implementationFeatureDir(feature), "scaffold-manifest.json");
  if (!fs.existsSync(goMarkerFile)) {
    console.log("IMPLEMENT BLOCKED: go gate was not completed for this feature.");
    console.log(`Run first: aitri go --feature ${feature} --yes`);
    return ERROR;
  }
  if (!fs.existsSync(scaffoldManifestFile)) {
    console.log("IMPLEMENT BLOCKED: scaffold artifacts are missing.");
    console.log(`Run first: aitri scaffold --feature ${feature} --yes`);
    return ERROR;
  }

  const approvedFile = project.paths.approvedSpecFile(feature);
  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const planFile = project.paths.planFile(feature);
  const required = [approvedFile, backlogFile, testsFile, planFile];
  const missing = required.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    console.log("IMPLEMENT BLOCKED: missing required artifacts.");
    missing.forEach((file) => console.log(`- ${path.relative(process.cwd(), file)}`));
    return ERROR;
  }

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  const backlogContent = fs.readFileSync(backlogFile, "utf8");
  const testsContent = fs.readFileSync(testsFile, "utf8");
  const planContent = fs.readFileSync(planFile, "utf8");
  const parsedSpec = parseApprovedSpec(approvedSpec, { feature });
  const stories = parseUserStories(backlogContent);
  if (stories.length === 0) {
    console.log("IMPLEMENT BLOCKED: backlog has no US-* entries.");
    return ERROR;
  }

  const tcMapByStory = parseTcMapByStory(testsContent);
  const quality = parseQualityConstraints(planContent);
  const hints = parseImplementationHints(planContent);
  const resourceStrategy = parseResourceStrategy(approvedSpec);
  const projectAssets = scanProjectAssets(process.cwd());
  const scaffoldManifest = readJsonFile(scaffoldManifestFile) || {};
  const ordered = buildImplementationOrder(stories, tcMapByStory);

  const implementationDir = project.paths.implementationFeatureDir(feature);
  const orderFile = project.paths.implementationOrderFile(feature);
  const briefFiles = ordered.map((story, index) => path.join(implementationDir, `${story.id}.md`));

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Read: " + path.relative(process.cwd(), backlogFile));
  console.log("- Read: " + path.relative(process.cwd(), testsFile));
  console.log("- Read: " + path.relative(process.cwd(), planFile));
  console.log("- Read: " + path.relative(process.cwd(), scaffoldManifestFile));
  console.log("- Create: " + path.relative(process.cwd(), implementationDir));
  console.log("- Write: " + path.relative(process.cwd(), orderFile));
  briefFiles.forEach((file, index) => {
    console.log(`- Write: ${path.relative(process.cwd(), file)} (order ${index + 1})`);
  });

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
  }

  fs.mkdirSync(implementationDir, { recursive: true });
  writeFile(orderFile, buildOrderContent({
    feature,
    orderedStories: ordered,
    tcMapByStory
  }));

  ordered.forEach((story, index) => {
    const linkedTc = tcMapByStory[story.id] || [];
    const references = findScaffoldReferences(story, scaffoldManifest);
    const previous = ordered.slice(0, index).map((item) => item.id);
    const dependencyNotes = previous.length > 0
      ? `Implement after ${previous.join(", ")}`
      : "No previous story dependency";
    const brief = buildBriefContent({
      feature,
      story,
      parsedSpec,
      quality,
      hints,
      linkedTc,
      references,
      dependencies: dependencyNotes,
      resourceStrategy,
      projectAssets
    });
    writeFile(path.join(implementationDir, `${story.id}.md`), brief);
  });

  const manifestFile = path.join(implementationDir, "implement-manifest.json");
  writeFile(manifestFile, JSON.stringify({
    feature,
    generatedAt: new Date().toISOString(),
    stories: ordered.map((story, index) => ({
      id: story.id,
      order: index + 1,
      dependencyScore: story.dependencyScore,
      brief: path.relative(process.cwd(), path.join(implementationDir, `${story.id}.md`)),
      testCases: (tcMapByStory[story.id] || []).map((tc) => tc.id)
    })),
    orderFile: path.relative(process.cwd(), orderFile)
  }, null, 2));

  console.log("Implementation briefs created: " + path.relative(process.cwd(), implementationDir));
  console.log(`- Stories: ${ordered.length}`);
  console.log(`- Order file: ${path.relative(process.cwd(), orderFile)}`);
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "implement",
    feature
  }));
  return OK;
}
