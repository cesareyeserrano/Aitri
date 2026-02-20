import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApprovedSpec } from "./spec-parser.js";
import { escapeRegExp, extractSection, extractSubsection, resolveFeature } from "../lib.js";

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pascalCase(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export function renderTemplate(template, variables) {
  return Object.entries(variables).reduce(
    (content, [key, value]) => content.replaceAll(`{{${key}}}`, String(value)),
    String(template || "")
  );
}

export function readTemplate(templateName) {
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "..", "core", "templates", "scaffold", templateName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Scaffold template not found: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, "utf8");
}

export function detectStackFamily(parsedSpec) {
  const stack = parsedSpec.techStack?.id || "node-cli";
  if (stack === "python") return "python";
  if (stack === "go") return "go";
  return "node";
}

export function parseTestCases(testsContent) {
  const matches = [...String(testsContent || "").matchAll(/###\s*(TC-\d+)([\s\S]*?)(?=\n###\s*TC-\d+|$)/g)];
  return matches.map((match) => {
    const id = match[1].trim();
    const body = match[2];
    const titleMatch = body.match(/-\s*Title:\s*(.+)/i);
    const title = titleMatch
      ? titleMatch[1].trim().replace(/\.$/, "")
      : `Validate ${id.toLowerCase()} behavior`;
    const traceLine = (body.match(/-\s*Trace:\s*([^\n]+)/i) || [null, ""])[1];
    const acIds = [...new Set(
      [...String(traceLine).matchAll(/\bAC-\d+\b/g)].map((m) => m[0])
    )];
    // EVO-006: also capture FR-* refs for contract linkage
    const frIds = [...new Set(
      [...String(traceLine).matchAll(/\bFR-\d+\b/g)].map((m) => m[0])
    )];
    return { id, title, acIds, frIds };
  });
}

/**
 * EVO-006: Build a per-stack contract import statement for a test stub.
 * Resolves the contract file(s) for each FR-* traced by the TC and returns
 * a ready-to-use import line so the developer can implement logic immediately.
 */
export function buildContractImports({ tc, root, testFile, stackFamily, feature, parsedSpec }) {
  const frIds = tc.frIds || [];
  if (frIds.length === 0) {
    if (stackFamily === "go") return `import "testing"`;
    return "// No contract linked — add FR-* to the TC Trace line to auto-import.";
  }

  const rules = parsedSpec.functionalRules || [];
  const frMap = new Map(rules.map((r) => [r.id, r.text]));

  if (stackFamily === "node") {
    const lines = frIds.map((frId) => {
      const frText = frMap.get(frId) || frId.toLowerCase();
      const contractFile = interfacePathByStack(root, stackFamily, feature, frId, frText);
      let relPath = path.relative(path.dirname(testFile), contractFile).replace(/\\/g, "/");
      if (!relPath.startsWith(".")) relPath = "./" + relPath;
      const fnName = slugify(`${frId}-${frText}`).replace(/-/g, "_").slice(0, 50);
      return `import { ${fnName} } from "${relPath}";`;
    });
    return lines.join("\n");
  }

  if (stackFamily === "python") {
    const lines = frIds.map((frId) => {
      const frText = frMap.get(frId) || frId.toLowerCase();
      const suffix = slugify(frText).slice(0, 32);
      const moduleName = `${frId.toLowerCase().replace("-", "_")}_${suffix}`.replace(/-/g, "_");
      const fnName = slugify(`${frId}-${frText}`).replace(/-/g, "_").slice(0, 50);
      return `from src.contracts.${moduleName} import ${fnName}`;
    });
    return lines.join("\n");
  }

  if (stackFamily === "go") {
    return `import (\n\t"testing"\n\t"${feature}/internal/contracts"\n)`;
  }

  return "";
}

function buildAcTemplateVars(tc, parsedSpec) {
  const acIds = tc.acIds || [];
  if (acIds.length === 0) return { AC_IDS: "none", AC_DESCRIPTIONS: "No AC mapped to this TC." };
  const acMap = new Map(
    (parsedSpec.acceptanceCriteria || []).map((ac) => [ac.id, ac.text])
  );
  const descriptions = acIds
    .map((id) => `${id}: ${acMap.get(id) || "No description available."}`)
    .join("\n// ");
  return { AC_IDS: acIds.join(", "), AC_DESCRIPTIONS: descriptions };
}

function parseArchitectureComponents(planContent) {
  const architecture = extractSection(planContent, "## 5. Architecture (Architect Persona)");
  const componentsSection = extractSubsection(architecture, "### Components");
  return String(componentsSection || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function stackDirectoryPlan(stackFamily, feature, componentNames) {
  const normalizedComponents = componentNames
    .map((name) => slugify(name))
    .filter(Boolean)
    .slice(0, 6);

  if (stackFamily === "python") {
    return [
      "src/app",
      "src/services",
      "src/repositories",
      "src/contracts",
      ...normalizedComponents.map((name) => `src/modules/${name}`),
      `tests/${feature}/generated`
    ];
  }

  if (stackFamily === "go") {
    return [
      "cmd",
      "internal/service",
      "internal/repository",
      "internal/contracts",
      ...normalizedComponents.map((name) => `internal/modules/${name}`),
      `tests/${feature}/generated`
    ];
  }

  return [
    "src/commands",
    "src/services",
    "src/adapters",
    "src/contracts",
    ...normalizedComponents.map((name) => `src/modules/${name}`),
    `tests/${feature}/generated`
  ];
}

function interfacePathByStack(root, stackFamily, feature, frId, frText) {
  const suffix = slugify(frText).slice(0, 32) || frId.toLowerCase();
  if (stackFamily === "python") {
    return path.join(root, "src", "contracts", `${frId.toLowerCase()}-${suffix}.py`);
  }
  if (stackFamily === "go") {
    return path.join(root, "internal", "contracts", `${frId.toLowerCase()}-${suffix}.go`);
  }
  return path.join(root, "src", "contracts", `${frId.toLowerCase()}-${suffix}.js`);
}

function testPathByStack(root, stackFamily, feature, tcId, title) {
  const name = slugify(title).slice(0, 36) || tcId.toLowerCase();
  const baseDir = path.join(root, "tests", feature, "generated");
  if (stackFamily === "python") {
    return path.join(baseDir, `test_${tcId.toLowerCase()}_${name}.py`);
  }
  if (stackFamily === "go") {
    return path.join(baseDir, `${tcId.toLowerCase()}_${name}_test.go`);
  }
  return path.join(baseDir, `${tcId.toLowerCase()}-${name}.test.mjs`);
}

function ensureDirForFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeFile(file, content) {
  ensureDirForFile(file);
  fs.writeFileSync(file, content, "utf8");
}

function detectExistingSrcConflicts(plannedDirs, root) {
  const conflicts = [];
  for (const dir of plannedDirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const entries = fs.readdirSync(abs).filter((e) => !e.startsWith("."));
    if (entries.length > 0) {
      conflicts.push({
        dir,
        existingFiles: entries.slice(0, 3),
        total: entries.length
      });
    }
  }
  return conflicts;
}

function readProjectProfile(docsRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(docsRoot, "project.json"), "utf8"));
  } catch { return null; }
}

function maybeWriteBaseConfig({ root, stackFamily, feature }) {
  const writes = [];
  const gitignore = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignore)) {
    writeFile(gitignore, "node_modules/\n__pycache__/\n.venv/\ncoverage/\ndist/\n", "utf8");
    writes.push(gitignore);
  }

  if (stackFamily === "python") {
    const pyproject = path.join(root, "pyproject.toml");
    if (!fs.existsSync(pyproject)) {
      writeFile(pyproject, `[project]
name = "${feature}"
version = "0.1.0"
requires-python = ">=3.10"

[tool.pytest.ini_options]
testpaths = ["tests"]
`, "utf8");
      writes.push(pyproject);
    }
    return writes;
  }

  if (stackFamily === "go") {
    const goMod = path.join(root, "go.mod");
    if (!fs.existsSync(goMod)) {
      writeFile(goMod, `module ${feature}\n\ngo 1.21\n`, "utf8");
      writes.push(goMod);
    }
    return writes;
  }

  const packageJson = path.join(root, "package.json");
  if (!fs.existsSync(packageJson)) {
    writeFile(packageJson, `{
  "name": "${feature}",
  "private": true,
  "type": "module",
  "scripts": {
    "test:aitri": "node --test tests/${feature}/generated/*.test.mjs"
  }
}
`, "utf8");
    writes.push(packageJson);
  }
  return writes;
}

function scaffoldTemplatesByStack(stackFamily) {
  if (stackFamily === "python") {
    return {
      test: readTemplate("python-test.py.tpl"),
      iface: readTemplate("python-interface.py.tpl")
    };
  }
  if (stackFamily === "go") {
    return {
      test: readTemplate("go-test.go.tpl"),
      iface: readTemplate("go-interface.go.tpl")
    };
  }
  return {
    test: readTemplate("node-test.js.tpl"),
    iface: readTemplate("node-interface.js.tpl")
  };
}

export function createTestStub({ root, stackFamily, feature, tc, testTemplate, parsedSpec }) {
  const acVars = buildAcTemplateVars(tc, parsedSpec || {});
  const file = testPathByStack(root, stackFamily, feature, tc.id, tc.title);
  // EVO-006: resolve contract import before rendering the template
  const contractImport = buildContractImports({
    tc,
    root,
    testFile: file,
    stackFamily,
    feature,
    parsedSpec: parsedSpec || {}
  });
  const body = renderTemplate(testTemplate, {
    TC_ID: tc.id,
    TC_TITLE: tc.title,
    TEST_NAME: slugify(`${tc.id}-${tc.title}`).replace(/-/g, "_"),
    CONTRACT_IMPORT: contractImport,
    ...acVars
  });
  writeFile(file, body);
  return file;
}

export function createInterfaceStub({ root, stackFamily, fr, ifaceTemplate }) {
  const fnName = slugify(`${fr.id}-${fr.text}`).replace(/-/g, "_");
  const file = interfacePathByStack(root, stackFamily, "", fr.id, fr.text);
  const body = renderTemplate(ifaceTemplate, {
    FR_ID: fr.id,
    FR_TEXT: fr.text,
    FUNCTION_NAME: stackFamily === "go" ? pascalCase(fnName) : fnName
  });
  writeFile(file, body);
  return file;
}

export async function runScaffoldCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  confirmProceed,
  printCheckpointSummary,
  runAutoCheckpoint,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const _scaffoldJsonOutput = (options.json) || ((options.format||"").toLowerCase()==="json") || (options.positional||[]).some(p=>p.toLowerCase()==="json");
  if (!_scaffoldJsonOutput) {
    console.log("DEPRECATION: `aitri scaffold` is deprecated. Use `aitri build` instead.");
  }
  const project = getProjectContextOrExit();

  let feature;
  try {
    feature = resolveFeature(options, getStatusReportOrExit);
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Feature resolution failed.");
    return ERROR;
  }

  const goMarkerFile = project.paths.goMarkerFile(feature);
  if (!fs.existsSync(goMarkerFile)) {
    console.log("SCAFFOLD BLOCKED: go gate was not completed for this feature.");
    console.log(`Run first: aitri go --feature ${feature} --yes`);
    return ERROR;
  }

  const approvedFile = project.paths.approvedSpecFile(feature);
  const planFile = project.paths.planFile(feature);
  const testsFile = project.paths.testsFile(feature);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    return ERROR;
  }
  if (!fs.existsSync(planFile)) {
    console.log(`Plan file not found: ${path.relative(process.cwd(), planFile)}`);
    return ERROR;
  }
  if (!fs.existsSync(testsFile)) {
    console.log(`Tests file not found: ${path.relative(process.cwd(), testsFile)}`);
    return ERROR;
  }

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  const parsedSpec = parseApprovedSpec(approvedSpec, { feature });

  // Stack: spec-defined > project profile detection > default
  let stackFamily = detectStackFamily(parsedSpec);
  if (!parsedSpec.techStack?.id) {
    const profile = readProjectProfile(project.paths.docsRoot);
    if (profile?.detectedStack?.length > 0) {
      stackFamily = profile.detectedStack[0];
      console.log(`Tech stack auto-detected from project: ${stackFamily}`);
    }
  }
  const testsContent = fs.readFileSync(testsFile, "utf8");
  const testCases = parseTestCases(testsContent);
  if (testCases.length === 0) {
    console.log("SCAFFOLD BLOCKED: no TC-* entries found in tests file.");
    console.log("Run `aitri plan` to generate traceable tests first.");
    return ERROR;
  }

  const planContent = fs.readFileSync(planFile, "utf8");
  const architectureComponents = parseArchitectureComponents(planContent);
  const dirs = stackDirectoryPlan(stackFamily, feature, architectureComponents);

  const templates = scaffoldTemplatesByStack(stackFamily);
  const interfaceRules = parsedSpec.functionalRules.length > 0
    ? parsedSpec.functionalRules
    : [{ id: "FR-1", text: "deliver approved scope with traceability" }];

  // Dry-run: show plan without writing
  if (options.dryRun) {
    console.log("DRY RUN — no files will be written:");
    dirs.forEach((dir) => {
      const exists = fs.existsSync(path.join(process.cwd(), dir));
      console.log(`  ${exists ? "[EXISTS]" : "[CREATE]"} ${dir}`);
    });
    testCases.forEach((tc) => console.log(`  [STUB]   tests/${feature}/generated/${tc.id}-*.test.*`));
    interfaceRules.forEach((fr) => console.log(`  [STUB]   src/contracts/${fr.id.toLowerCase()}-*.js`));
    return OK;
  }

  // Existing src/ content detection
  const srcConflicts = detectExistingSrcConflicts(dirs.filter((d) => !d.startsWith("tests/")), process.cwd());
  if (srcConflicts.length > 0) {
    console.log("WARNING: Scaffold would write to existing directories with content:");
    srcConflicts.forEach((c) => {
      const preview = c.existingFiles.join(", ") + (c.total > 3 ? ", ..." : "");
      console.log(`  ${c.dir}/ (${c.total} existing files: ${preview})`);
    });
    console.log("Aitri will only ADD new files. Existing files will NOT be overwritten.");
    console.log("");
  }

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Read: " + path.relative(process.cwd(), planFile));
  console.log("- Read: " + path.relative(process.cwd(), testsFile));
  console.log("- Read: " + path.relative(process.cwd(), goMarkerFile));
  dirs.forEach((dir) => {
    console.log("- Create: " + dir);
  });
  console.log(`- Generate: ${testCases.length} test stubs traced to TC-*`);
  console.log(`- Generate: ${interfaceRules.length} interface stubs traced to FR-*`);

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
  }

  dirs.forEach((dir) => fs.mkdirSync(path.join(process.cwd(), dir), { recursive: true }));

  const writtenTests = testCases.map((tc) => createTestStub({
    root: process.cwd(),
    stackFamily,
    feature,
    tc,
    testTemplate: templates.test,
    parsedSpec
  }));
  const writtenInterfaces = interfaceRules.map((fr) => createInterfaceStub({
    root: process.cwd(),
    stackFamily,
    fr,
    ifaceTemplate: templates.iface
  }));
  const baseConfigs = maybeWriteBaseConfig({
    root: process.cwd(),
    stackFamily,
    feature
  });

  const manifestFile = path.join(project.paths.implementationFeatureDir(feature), "scaffold-manifest.json");
  writeFile(manifestFile, JSON.stringify({
    schemaVersion: 1,
    feature,
    stackFamily,
    generatedAt: new Date().toISOString(),
    testFiles: writtenTests.map((file) => path.relative(process.cwd(), file)),
    interfaceFiles: writtenInterfaces.map((file) => path.relative(process.cwd(), file)),
    baseConfigs: baseConfigs.map((file) => path.relative(process.cwd(), file))
  }, null, 2));

  console.log("Scaffold created: " + path.relative(process.cwd(), manifestFile));
  console.log(`- Stack: ${parsedSpec.techStack.label} (${stackFamily})`);
  console.log(`- Test stubs: ${writtenTests.length}`);
  console.log(`- Interface stubs: ${writtenInterfaces.length}`);
  if (baseConfigs.length > 0) {
    console.log(`- Base config files: ${baseConfigs.length}`);
  }
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "scaffold",
    feature
  }));
  return OK;
}
