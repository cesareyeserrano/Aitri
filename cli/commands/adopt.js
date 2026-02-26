import fs from "node:fs";
import path from "node:path";
import { callAI } from "../ai-client.js";

// ---------------------------------------------------------------------------
// EVO-008: aitri adopt — Phase 1 (Scan) + Phase 2 (LLM Infer)
// Invariants:
//   - NEVER modifies src/, tests, or existing source files
//   - Output is always DRAFT (adoption-manifest.json, specs/drafts, docs/discovery)
//   - Idempotent: re-running updates the manifest, never overwrites approved content
//   - Phase 1 works without AI config; Phase 2 requires ai config
// ---------------------------------------------------------------------------

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------------

function detectStack(root) {
  const stacks = [];
  const pkg = readJsonSafe(path.join(root, "package.json"));
  if (pkg) {
    stacks.push({
      name: "node",
      version: pkg.engines?.node || null,
      packageManager: fs.existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm"
        : fs.existsSync(path.join(root, "yarn.lock")) ? "yarn"
        : "npm",
      hasTypeScript: fs.existsSync(path.join(root, "tsconfig.json")),
      mainEntry: pkg.main || pkg.exports || null,
      scripts: Object.keys(pkg.scripts || {})
    });
  }
  if (fs.existsSync(path.join(root, "pyproject.toml")) || fs.existsSync(path.join(root, "setup.py")) || fs.existsSync(path.join(root, "requirements.txt"))) {
    stacks.push({ name: "python" });
  }
  if (fs.existsSync(path.join(root, "go.mod"))) {
    const mod = fs.readFileSync(path.join(root, "go.mod"), "utf8");
    const moduleLine = mod.split("\n").find((l) => l.startsWith("module "));
    stacks.push({ name: "go", module: moduleLine ? moduleLine.slice(7).trim() : null });
  }
  if (fs.existsSync(path.join(root, "Cargo.toml"))) {
    stacks.push({ name: "rust" });
  }
  if (fs.existsSync(path.join(root, "pom.xml")) || fs.existsSync(path.join(root, "build.gradle"))) {
    stacks.push({ name: "java" });
  }
  return stacks;
}

// ---------------------------------------------------------------------------
// Folder convention detection
// Returns candidates for src, tests, docs mapped to Aitri standard paths
// ---------------------------------------------------------------------------

const STANDARD_PATHS = { specs: "specs", backlog: "backlog", tests: "tests", docs: "docs" };

function detectFolderConventions(root) {
  const conventions = {};
  const srcCandidates = ["src", "lib", "app", "packages"];
  for (const c of srcCandidates) {
    if (fs.existsSync(path.join(root, c))) {
      conventions.sourcePath = c;
      break;
    }
  }
  const testCandidates = ["tests", "test", "__tests__", "spec", "specs"];
  for (const c of testCandidates) {
    if (fs.existsSync(path.join(root, c))) {
      conventions.existingTestPath = c;
      break;
    }
  }
  const docCandidates = ["docs", "documentation", "wiki", "doc"];
  for (const c of docCandidates) {
    if (fs.existsSync(path.join(root, c))) {
      conventions.existingDocPath = c;
      break;
    }
  }
  return conventions;
}

// ---------------------------------------------------------------------------
// Proposed aitri.config.json (only when paths conflict with Aitri standard)
// ---------------------------------------------------------------------------

function buildProposedConfig(conventions, existingAitriConfig) {
  if (existingAitriConfig) return null; // already configured
  const pathOverrides = {};
  // If existing test folder clashes with Aitri's "tests" default, propose aitri/tests
  if (conventions.existingTestPath && conventions.existingTestPath !== STANDARD_PATHS.tests) {
    pathOverrides.tests = `aitri/${STANDARD_PATHS.tests}`;
  }
  // If existing doc folder clashes with Aitri's "docs" default, propose aitri/docs
  if (conventions.existingDocPath && conventions.existingDocPath !== STANDARD_PATHS.docs) {
    pathOverrides.docs = `aitri/${STANDARD_PATHS.docs}`;
  }
  if (Object.keys(pathOverrides).length === 0) return null;
  return { paths: pathOverrides };
}

// ---------------------------------------------------------------------------
// Entry point scan
// ---------------------------------------------------------------------------

function detectEntryPoints(root, stack) {
  const entries = [];
  if (stack === "node") {
    const pkg = readJsonSafe(path.join(root, "package.json"));
    if (pkg?.main && fs.existsSync(path.join(root, pkg.main))) entries.push(pkg.main);
    if (pkg?.bin) {
      const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin);
      bins.forEach((b) => { if (fs.existsSync(path.join(root, b))) entries.push(b); });
    }
    // CLI pattern
    if (fs.existsSync(path.join(root, "cli", "index.js"))) entries.push("cli/index.js");
    if (fs.existsSync(path.join(root, "index.js"))) entries.push("index.js");
    if (fs.existsSync(path.join(root, "src", "index.js"))) entries.push("src/index.js");
    if (fs.existsSync(path.join(root, "src", "index.ts"))) entries.push("src/index.ts");
  } else if (stack === "python") {
    const mains = ["main.py", "app.py", "__main__.py", "src/main.py", "src/app.py"];
    mains.forEach((f) => { if (fs.existsSync(path.join(root, f))) entries.push(f); });
  } else if (stack === "go") {
    const mains = ["main.go", "cmd/main.go", "cmd/app/main.go"];
    mains.forEach((f) => { if (fs.existsSync(path.join(root, f))) entries.push(f); });
  }
  return [...new Set(entries)];
}

// ---------------------------------------------------------------------------
// Test file inventory (bounded — count only, don't read)
// ---------------------------------------------------------------------------

function countTestFiles(root, testPath) {
  if (!testPath || !fs.existsSync(path.join(root, testPath))) return 0;
  let count = 0;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (/\.(test|spec)\.(js|ts|mjs|py|go)$|_test\.go$|test_.*\.py$/.test(e.name)) count++;
    }
  }
  walk(path.join(root, testPath));
  return count;
}

// ---------------------------------------------------------------------------
// README detection
// ---------------------------------------------------------------------------

function detectReadme(root) {
  const candidates = ["README.md", "README.MD", "readme.md", "README", "README.txt"];
  for (const c of candidates) {
    if (fs.existsSync(path.join(root, c))) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Aitri structure gap analysis
// ---------------------------------------------------------------------------

function analyzeAitriGaps(root, paths) {
  const gaps = [];
  if (!fs.existsSync(paths.specsApprovedDir)) gaps.push("No approved specs — run aitri adopt then aitri approve");
  if (!fs.existsSync(paths.specsDraftsDir)) gaps.push("No draft specs — run aitri adopt to generate DRAFT specs (Phase 2 requires ai config)");
  if (!fs.existsSync(path.join(paths.docsRoot, "project.json"))) gaps.push("No docs/project.json — run aitri init or aitri upgrade");
  return gaps;
}

// ---------------------------------------------------------------------------
// Check whether Aitri structure already exists
// ---------------------------------------------------------------------------

function detectExistingAitriStructure(root, paths) {
  return {
    hasSpecsDrafts: fs.existsSync(paths.specsDraftsDir),
    hasSpecsApproved: fs.existsSync(paths.specsApprovedDir),
    hasBacklog: fs.existsSync(paths.backlogRoot),
    hasTests: fs.existsSync(paths.testsRoot),
    hasDocs: fs.existsSync(paths.docsRoot),
    hasProjectJson: fs.existsSync(path.join(paths.docsRoot, "project.json")),
    hasAitriConfig: fs.existsSync(path.join(root, "aitri.config.json")) || fs.existsSync(path.join(root, ".aitri.json"))
  };
}

// ---------------------------------------------------------------------------
// Phase 2: LLM prompts
// ---------------------------------------------------------------------------

const PHASE2_SYSTEM_PROMPT = `You are a senior software architect performing retrograde spec inference.
Given a project's README, manifest, and key source files, you will infer candidate features and produce
structured specifications following the Aitri AF-SPEC format.
Return ONLY valid JSON. No markdown fences, no explanation outside the JSON object.`;

function buildPhase2Prompt(manifest, readmeContent, entryContent) {
  const stackNames = (manifest.stacks || []).map((s) => s.name).join(", ") || "unknown";
  const entrySection = entryContent
    ? `\n\nKey entry point (bounded excerpt):\n\`\`\`\n${entryContent.slice(0, 3000)}\n\`\`\``
    : "";
  const readmeSection = readmeContent
    ? `\n\nREADME:\n${readmeContent.slice(0, 4000)}`
    : "";
  return `You are onboarding an existing ${stackNames} project into a spec-driven workflow.
Analyze the project information below and infer the top 1–3 distinct functional features.
For each feature, produce a complete spec in Aitri AF-SPEC format.${readmeSection}${entrySection}

Return a JSON object with this exact shape:
{
  "features": [
    {
      "name": "kebab-case-feature-name",
      "title": "Human Readable Title",
      "spec": "<full AF-SPEC markdown as a string>",
      "discoveryNotes": "<retrograde discovery notes as a string>"
    }
  ]
}

Rules for each spec string:
- Start with: # AF-SPEC: <Feature Title>
- Second line: STATUS: DRAFT
- Include sections: 1. Context, 2. Actors, 3. Functional Rules (FR-1, FR-2 ...), 4. Edge Cases, 5. Failure Conditions, 6. Non-Functional Requirements, 7. Security Considerations, 8. Out of Scope, 9. Acceptance Criteria (AC-1 ... Given/When/Then), 10. Requirement Source Statement
- Section 10 must say: "- Requirements inferred from existing project by aitri adopt (Phase 2). Human review required."
- Use stable IDs (FR-1, FR-2, AC-1, AC-2) so User Stories and Tests can reference them
- Be concrete — derive rules from actual observed behaviors, not generic placeholders

Rules for discoveryNotes:
- Start with: # Discovery: <Feature Title>
- Second line: STATUS: DRAFT
- Include: Problem Statement, Actors, Scope (in/out), Architecture notes, Retrograde confidence (low/medium/high with reason)`;
}

// ---------------------------------------------------------------------------
// Phase 2: bounded entry point reader
// ---------------------------------------------------------------------------

function readBoundedEntryPoint(root, entryPoints, maxBytes = 3000) {
  for (const ep of entryPoints) {
    const fullPath = path.join(root, ep);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, "utf8");
      return content.slice(0, maxBytes);
    } catch { /* skip */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 2: write DRAFT spec + discovery doc (never overwrites approved content)
// ---------------------------------------------------------------------------

export function writeDraftSpec(paths, featureName, specContent) {
  const draftFile = path.join(paths.specsDraftsDir, `${featureName}.md`);
  // Never overwrite approved
  const approvedFile = path.join(paths.specsApprovedDir, `${featureName}.md`);
  if (fs.existsSync(approvedFile)) return { skipped: true, reason: "approved spec exists" };
  fs.mkdirSync(paths.specsDraftsDir, { recursive: true });
  fs.writeFileSync(draftFile, specContent, "utf8");
  return { written: true, file: draftFile };
}

export function writeDiscoveryDoc(paths, featureName, discoveryContent) {
  const discoveryFile = path.join(paths.docsDiscoveryDir, `${featureName}.md`);
  if (fs.existsSync(discoveryFile)) return { skipped: true, reason: "discovery doc already exists" };
  fs.mkdirSync(paths.docsDiscoveryDir, { recursive: true });
  fs.writeFileSync(discoveryFile, discoveryContent, "utf8");
  return { written: true, file: discoveryFile };
}

// ---------------------------------------------------------------------------
// Phase 3: extract test names from existing source test files
// ---------------------------------------------------------------------------

const TEST_PATTERNS = {
  // Node/JS/TS: test("name", ...) | it("name", ...) | describe("name", ...)
  node: /(?:^|\s)(?:test|it|describe)\s*\(\s*["'`]([^"'`]+)["'`]/gm,
  // Python: def test_name(...) | class TestName
  python: /(?:^|\s)(?:def\s+(test_\w+)|class\s+(Test\w+))/gm,
  // Go: func TestName(t
  go: /func\s+(Test\w+)\s*\(/gm
};

export function extractTestNames(fileContent, stackFamily) {
  const pattern = TEST_PATTERNS[stackFamily] || TEST_PATTERNS.node;
  const names = [];
  let match;
  // Reset lastIndex for repeated use
  pattern.lastIndex = 0;
  while ((match = pattern.exec(fileContent)) !== null) {
    const name = match[1] || match[2] || "";
    if (name) names.push(name.trim());
  }
  return [...new Set(names)];
}

function walkTestFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(test|spec)\.(js|ts|mjs|cjs)$|_test\.go$|test_.*\.py$/.test(e.name)) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

function inferStackFamily(stacks) {
  if (stacks.some((s) => s.name === "go")) return "go";
  if (stacks.some((s) => s.name === "python")) return "python";
  return "node";
}

// ---------------------------------------------------------------------------
// Phase 3: build tests.md mapping existing test names → TC-* stubs
// ---------------------------------------------------------------------------

export function buildTestsMapping(testFiles, testDir, stackFamily, approvedFeatures) {
  const lines = ["# Tests: Adopted Project (Phase 3 Map)", "", "STATUS: DRAFT", ""];

  if (approvedFeatures.length > 0) {
    lines.push(`> Features: ${approvedFeatures.join(", ")}`, "");
  }

  lines.push("<!-- Each TC below maps an existing test to the Aitri TC-* format. -->",
    "<!-- Add Trace: lines once you have confirmed FR-* and AC-* references. -->", "");

  let tcIndex = 1;
  for (const file of testFiles) {
    const relPath = path.relative(testDir, file);
    let content;
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    const names = extractTestNames(content, stackFamily);
    if (names.length === 0) continue;

    lines.push(`## ${relPath}`, "");
    for (const name of names) {
      lines.push(
        `### TC-${tcIndex}`,
        `- Title: ${name}`,
        `- Source: ${relPath}`,
        `- Trace: (add FR-* and AC-* references after approving spec)`,
        ""
      );
      tcIndex++;
    }
  }

  if (tcIndex === 1) {
    lines.push("No test names detected. Add test files to the existing test directory.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Phase 3: write tests mapping (idempotent — never overwrites existing tests.md)
// ---------------------------------------------------------------------------

export function writeTestsMapping(paths, featureName, content) {
  const testsFile = path.join(paths.testsRoot, featureName, "tests.md");
  if (fs.existsSync(testsFile)) return { skipped: true, reason: "tests.md already exists" };
  fs.mkdirSync(path.dirname(testsFile), { recursive: true });
  fs.writeFileSync(testsFile, content, "utf8");
  return { written: true, file: testsFile };
}

// ---------------------------------------------------------------------------
// Phase 3: build verified aitri.config.json (only when paths need overrides)
// ---------------------------------------------------------------------------

export function buildVerifiedConfig(conventions, root) {
  const pathOverrides = {};
  // If existing test path differs from default "tests", map to avoid collision
  if (conventions.existingTestPath && conventions.existingTestPath !== "tests") {
    pathOverrides.tests = `aitri/tests`;
  }
  if (conventions.existingDocPath && conventions.existingDocPath !== "docs") {
    pathOverrides.docs = `aitri/docs`;
  }
  return Object.keys(pathOverrides).length > 0 ? { paths: pathOverrides } : null;
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export async function runAdoptCommand({
  options,
  getProjectContextOrExit,
  confirmProceed,
  runAutoCheckpoint,
  printCheckpointSummary,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  const root = process.cwd();
  const { paths } = project;
  const isDryRun = options.dryRun;
  const depth = (options.depth || "quick").toLowerCase();
  const isPhase2 = depth === "standard" || depth === "deep";
  const isPhase3 = depth === "deep";

  const phaseLabel = isPhase3
    ? "Phase 1: Scan + Phase 2: Infer + Phase 3: Map"
    : isPhase2 ? "Phase 1: Scan + Phase 2: Infer" : "Phase 1: Scan";
  console.log(`Aitri Adopt — Project Onboarding (${phaseLabel})`);
  console.log("");

  // -- Scan ------------------------------------------------------------------

  const stacks = detectStack(root);
  const conventions = detectFolderConventions(root);
  const readme = detectReadme(root);
  const aitriStructure = detectExistingAitriStructure(root, paths);
  const gaps = analyzeAitriGaps(root, paths);

  const existingAitriConfigFile = fs.existsSync(path.join(root, "aitri.config.json"))
    ? "aitri.config.json"
    : fs.existsSync(path.join(root, ".aitri.json")) ? ".aitri.json" : null;

  const proposedConfig = buildProposedConfig(conventions, existingAitriConfigFile);

  const entryPoints = stacks.flatMap((s) => detectEntryPoints(root, s.name));
  const testFileCount = countTestFiles(root, conventions.existingTestPath);

  // -- Report ----------------------------------------------------------------

  if (stacks.length === 0) {
    console.log("No recognized tech stack detected (package.json, pyproject.toml, go.mod, Cargo.toml).");
    console.log("Aitri can still initialize its folder structure, but stack-specific hints will be missing.");
    console.log("");
  } else {
    console.log("Detected stack:");
    for (const s of stacks) {
      const extra = s.hasTypeScript ? " + TypeScript" : "";
      const pm = s.packageManager ? ` (${s.packageManager})` : "";
      console.log(`  ${s.name}${extra}${pm}`);
    }
    console.log("");
  }

  if (readme) {
    console.log(`README:          ${readme}`);
  }
  if (conventions.sourcePath) {
    console.log(`Source path:     ${conventions.sourcePath}/`);
  }
  if (conventions.existingTestPath) {
    console.log(`Existing tests:  ${conventions.existingTestPath}/ (${testFileCount} test files detected)`);
  }
  if (entryPoints.length > 0) {
    console.log(`Entry points:    ${entryPoints.join(", ")}`);
  }
  console.log("");

  // Aitri structure status
  const structureEntries = [
    ["specs/drafts", aitriStructure.hasSpecsDrafts],
    ["specs/approved", aitriStructure.hasSpecsApproved],
    ["backlog", aitriStructure.hasBacklog],
    ["tests (aitri)", aitriStructure.hasTests],
    ["docs", aitriStructure.hasDocs],
    ["docs/project.json", aitriStructure.hasProjectJson]
  ];
  const alreadyInitialized = structureEntries.every(([, exists]) => exists);

  if (alreadyInitialized) {
    console.log("Aitri structure: already initialized");
  } else {
    console.log("Aitri structure gaps:");
    structureEntries
      .filter(([, exists]) => !exists)
      .forEach(([name]) => console.log(`  - ${name} (will be created)`));
  }
  console.log("");

  if (gaps.length > 0) {
    console.log("Gaps vs Aitri standard:");
    gaps.forEach((g) => console.log(`  - ${g}`));
    console.log("");
  }

  if (proposedConfig) {
    console.log("Proposed aitri.config.json (path conflict resolution):");
    console.log(JSON.stringify(proposedConfig, null, 2));
    console.log("");
  }

  // AI config detection (needed for Phase 2 and for hints)
  const aiConfig = project.config.ai || {};
  const hasAiConfig = !!(aiConfig.provider);

  if (isPhase2 && !hasAiConfig) {
    console.log("Phase 2 requires an ai config in aitri.config.json.");
    console.log("Add: { \"ai\": { \"provider\": \"claude\", \"model\": \"claude-opus-4-6\", \"apiKeyEnv\": \"ANTHROPIC_API_KEY\" } }");
    console.log("");
    return ERROR;
  }

  if (!isPhase2 && !hasAiConfig) {
    console.log("Phase 2 (LLM inference — DRAFT spec generation) requires an ai config in aitri.config.json.");
    console.log("Add: { \"ai\": { \"provider\": \"claude\", \"model\": \"claude-opus-4-6\", \"apiKeyEnv\": \"ANTHROPIC_API_KEY\" } }");
    console.log("Then run: aitri adopt --depth standard");
    console.log("");
  }

  if (isDryRun) {
    console.log("[dry-run] No files written. Remove --dry-run to initialize Aitri structure.");
    return OK;
  }

  // -- Plan ------------------------------------------------------------------

  const dirsToCreate = [
    !aitriStructure.hasSpecsDrafts && paths.specsDraftsDir,
    !aitriStructure.hasSpecsApproved && paths.specsApprovedDir,
    !aitriStructure.hasBacklog && paths.backlogRoot,
    !aitriStructure.hasTests && paths.testsRoot,
    !aitriStructure.hasDocs && paths.docsRoot
  ].filter(Boolean);

  const manifestFile = path.join(paths.docsRoot, "adoption-manifest.json");
  const configFile = path.join(root, "aitri.config.json");

  const planLines = [];
  dirsToCreate.forEach((d) => planLines.push(`- Create: ${path.relative(root, d)}`));
  planLines.push(`- Write:  ${path.relative(root, manifestFile)}`);
  if (proposedConfig && !existingAitriConfigFile) {
    planLines.push(`- Write:  aitri.config.json (proposed path overrides)`);
  }
  if (isPhase2) {
    planLines.push(`- Infer:  DRAFT specs via LLM (specs/drafts/<feature>.md)`);
    planLines.push(`- Infer:  Discovery docs (docs/discovery/<feature>.md)`);
  }
  if (isPhase3) {
    planLines.push(`- Map:    Existing tests → TC-* stubs (tests/<feature>/tests.md)`);
    planLines.push(`- Write:  Verified aitri.config.json (if path overrides needed)`);
  }

  if (!isPhase2 && !isPhase3 && planLines.length === 0 && alreadyInitialized && fs.existsSync(manifestFile)) {
    console.log("Project already adopted. Manifest up to date.");
    return OK;
  }

  console.log("PLAN:");
  planLines.forEach((l) => console.log(l));
  console.log("");

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
  }

  // -- Execute ---------------------------------------------------------------

  dirsToCreate.forEach((d) => fs.mkdirSync(d, { recursive: true }));

  const manifest = {
    adoptedAt: new Date().toISOString(),
    projectRoot: path.basename(root),
    stacks,
    readme,
    conventions,
    entryPoints,
    existingTestFiles: testFileCount,
    existingAitriStructure: aitriStructure,
    gaps,
    phase2Ready: hasAiConfig,
    phase2Command: "aitri adopt --depth standard"
  };

  writeJsonFile(manifestFile, manifest);
  console.log(`  [OK] docs/adoption-manifest.json`);

  if (proposedConfig && !existingAitriConfigFile) {
    writeJsonFile(configFile, proposedConfig);
    console.log(`  [OK] aitri.config.json (proposed — review before committing)`);
  }

  console.log("");

  // -- Phase 2: LLM inference -----------------------------------------------

  if (isPhase2) {
    console.log("Phase 2: LLM inference — generating DRAFT specs...");
    console.log("");

    const readmeContent = readme
      ? (() => { try { return fs.readFileSync(path.join(root, readme), "utf8"); } catch { return null; } })()
      : null;
    const entryContent = readBoundedEntryPoint(root, entryPoints);

    const prompt = buildPhase2Prompt(manifest, readmeContent, entryContent);
    const result = await callAI({ prompt, systemPrompt: PHASE2_SYSTEM_PROMPT, config: aiConfig });

    if (!result.ok) {
      console.log(`AI error: ${result.error}`);
      console.log("Phase 1 artifacts were written. Fix the AI config and re-run with --depth standard.");
      return ERROR;
    }

    let inferred;
    try {
      const text = result.content.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      inferred = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      console.log("Could not parse AI response as JSON. Phase 1 artifacts were written.");
      console.log("Raw AI output saved to: docs/adoption-manifest.json (phase2RawResponse field)");
      const existing = readJsonSafe(manifestFile) || manifest;
      existing.phase2RawResponse = result.content;
      writeJsonFile(manifestFile, existing);
      return ERROR;
    }

    const features = Array.isArray(inferred?.features) ? inferred.features : [];
    if (features.length === 0) {
      console.log("AI returned no features. Check README and entry points for more context.");
      return ERROR;
    }

    const phase2Results = [];
    for (const f of features) {
      const name = String(f.name || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (!name) continue;

      const specResult = writeDraftSpec(paths, name, f.spec || "");
      const discovResult = writeDiscoveryDoc(paths, name, f.discoveryNotes || "");

      if (specResult.written) {
        console.log(`  [OK] specs/drafts/${name}.md`);
      } else if (specResult.skipped) {
        console.log(`  [SKIP] specs/drafts/${name}.md — ${specResult.reason}`);
      }
      if (discovResult.written) {
        console.log(`  [OK] docs/discovery/${name}.md`);
      } else if (discovResult.skipped) {
        console.log(`  [SKIP] docs/discovery/${name}.md — ${discovResult.reason}`);
      }

      phase2Results.push({ name, title: f.title, specWritten: !!specResult.written, discoveryWritten: !!discovResult.written });
    }

    // Update manifest with Phase 2 results
    const updatedManifest = readJsonSafe(manifestFile) || manifest;
    updatedManifest.phase2 = {
      completedAt: new Date().toISOString(),
      featuresInferred: phase2Results
    };
    writeJsonFile(manifestFile, updatedManifest);

    console.log("");
    console.log(`Phase 2 complete. ${phase2Results.length} feature(s) inferred.`);
    console.log("All specs are DRAFT — human review required before aitri approve.");
    if (!isPhase3) {
      console.log("");
      console.log("Next steps:");
      console.log("  1. Review each DRAFT spec in specs/drafts/");
      console.log("  2. Edit and refine as needed");
      console.log("  3. Run: aitri approve --feature <name>  (for each feature you accept)");
      console.log("  4. Run: aitri adopt --depth deep  (Phase 3: map existing tests to TC-*)");

      printCheckpointSummary(runAutoCheckpoint({
        enabled: options.autoCheckpoint,
        phase: "adopt",
        feature: "project"
      }));

      return OK;
    }
  }

  // -- Phase 3: Map existing tests → TC-* stubs -----------------------------

  if (isPhase3) {
    console.log("");
    console.log("Phase 3: Mapping existing tests to TC-* stubs...");
    console.log("");

    // Load manifest to get conventions (may have been updated in Phase 2)
    const currentManifest = readJsonSafe(manifestFile) || {};
    const manifestConventions = currentManifest.conventions || conventions;
    const manifestStacks = currentManifest.stacks || stacks;
    const stackFamily = inferStackFamily(manifestStacks);

    // Find approved features (specs/approved/*.md)
    let approvedFeatures = [];
    if (fs.existsSync(paths.specsApprovedDir)) {
      approvedFeatures = fs.readdirSync(paths.specsApprovedDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
    }

    if (approvedFeatures.length === 0) {
      console.log("No approved specs found. Phase 3 maps tests to approved features.");
      console.log("Run aitri approve --feature <name> first, then re-run aitri adopt --depth deep.");
      return ERROR;
    }

    // Scan existing test files
    const existingTestDir = manifestConventions.existingTestPath
      ? path.join(root, manifestConventions.existingTestPath)
      : null;

    const testFiles = existingTestDir ? walkTestFiles(existingTestDir) : [];

    if (testFiles.length === 0) {
      console.log(`No existing test files found in ${manifestConventions.existingTestPath || "(no test path detected)"}.`);
      console.log("Phase 3 requires existing test files to map to TC-* stubs.");
    } else {
      // For each approved feature, write a tests.md with TC-* stubs
      const phase3Results = [];
      for (const feature of approvedFeatures) {
        const testsContent = buildTestsMapping(testFiles, existingTestDir, stackFamily, [feature]);
        const result = writeTestsMapping(paths, feature, testsContent);
        if (result.written) {
          console.log(`  [OK] tests/${feature}/tests.md (${testFiles.length} test file(s) mapped)`);
          phase3Results.push({ feature, testsWritten: true });
        } else {
          console.log(`  [SKIP] tests/${feature}/tests.md — ${result.reason}`);
          phase3Results.push({ feature, testsWritten: false, reason: result.reason });
        }
      }

      // Update manifest
      const updatedManifest = readJsonSafe(manifestFile) || {};
      updatedManifest.phase3 = {
        completedAt: new Date().toISOString(),
        testFilesMapped: testFiles.length,
        features: phase3Results
      };
      writeJsonFile(manifestFile, updatedManifest);
    }

    // Verified aitri.config.json (only if path overrides needed and not already present)
    const verifiedConfig = buildVerifiedConfig(manifestConventions, root);
    if (verifiedConfig && !existingAitriConfigFile) {
      writeJsonFile(path.join(root, "aitri.config.json"), verifiedConfig);
      console.log(`  [OK] aitri.config.json (verified path overrides)`);
    } else if (verifiedConfig && existingAitriConfigFile) {
      console.log(`  [INFO] aitri.config.json already exists — review manually for path overrides`);
    }

    console.log("");
    console.log("Phase 3 complete.");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Review tests/<feature>/tests.md — add FR-* and AC-* Trace lines");
    console.log("  2. Run: aitri plan --feature <name>  (to generate full backlog)");
    console.log("  3. Run: aitri go --feature <name>  (unlocks factory mode)");

    printCheckpointSummary(runAutoCheckpoint({
      enabled: options.autoCheckpoint,
      phase: "adopt",
      feature: "project"
    }));

    return OK;
  }

  // -- Phase 1 only next steps -----------------------------------------------

  console.log("Project onboarding complete (Phase 1).");
  console.log(`Next steps:`);
  console.log(`  1. Review docs/adoption-manifest.json`);
  if (proposedConfig && !existingAitriConfigFile) {
    console.log(`  2. Review aitri.config.json — adjust paths as needed`);
  }
  if (!hasAiConfig) {
    console.log(`  ${proposedConfig ? "3" : "2"}. Add ai config to aitri.config.json, then run: aitri adopt --depth standard`);
  } else {
    console.log(`  ${proposedConfig ? "3" : "2"}. Run: aitri adopt --depth standard  (Phase 2: LLM DRAFT spec generation)`);
  }

  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "adopt",
    feature: "project"
  }));

  return OK;
}
