import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { warnIfStale } from "../lib/staleness.js";
import {
  buildSpecSnapshot,
  collectDiscoveryInterview,
  detectQualityDomain,
  detectRetrievalModeFromDiscovery,
  getQualityProfile,
  getDiscoveryRigorProfile,
  normalizeDiscoveryDepth,
  normalizeRetrievalMode,
  readDiscoveryField
} from "./discovery-plan-helpers.js";
import { parseApprovedSpec } from "./spec-parser.js";
import { generatePlanArtifacts } from "./content-generator.js";
import { auditAgentContent } from "./content-auditor.js";
import { normalizeFeatureName, escapeRegExp } from "../lib.js";

function replaceSection(content, heading, newBody) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n##\\s+\\d+\\.|$)`, "i");
  return String(content).replace(pattern, `${heading}\n${newBody.trim()}\n`);
}

async function _writeDiscoveryArtifact({
  feature, project, approvedSpec, specSnapshot, discoveryInterview,
  confidence, templatePath, options, runAutoCheckpoint, printCheckpointSummary
}) {
  const outDir = project.paths.docsDiscoveryDir;
  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const outFile = project.paths.discoveryFile(feature);

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(backlogFile), { recursive: true });
  fs.mkdirSync(path.dirname(testsFile), { recursive: true });

  let discovery = fs.readFileSync(templatePath, "utf8");
  discovery = discovery.replace("# Discovery: <feature>", `# Discovery: ${feature}`);
  discovery = discovery.replace(
    "## 1. Problem Statement\n- What problem are we solving?\n- Why now?",
    `## 1. Problem Statement
Derived from approved spec retrieval snapshot:
- Retrieval mode: ${specSnapshot.mode}
- Retrieved sections: ${specSnapshot.retrievalEvidence.length > 0 ? specSnapshot.retrievalEvidence.join(", ") : "none"}

### Context snapshot
${specSnapshot.context}

### Actors snapshot
${specSnapshot.actors}

### Functional rules snapshot
${specSnapshot.functionalRules}

### Security snapshot
${specSnapshot.security}

### Out-of-scope snapshot
${specSnapshot.outOfScope}

Refined problem framing:
- What problem are we solving? ${discoveryInterview.currentPain}
- Why now? ${discoveryInterview.successMetrics}`
  );
  discovery = discovery.replace(
    "## 2. Discovery Interview Summary (Discovery Persona)\n- Primary users:\n-\n- Jobs to be done:\n-\n- Current pain:\n-\n- Constraints (business/technical/compliance):\n-\n- Dependencies:\n-\n- Success metrics:\n-\n- Assumptions:\n-",
    `## 2. Discovery Interview Summary (Discovery Persona)\n- Primary users:\n- ${discoveryInterview.primaryUsers}\n\n- Jobs to be done:\n- ${discoveryInterview.jtbd}\n\n- Current pain:\n- ${discoveryInterview.currentPain}\n\n- Constraints (business/technical/compliance):\n- ${discoveryInterview.constraints}\n\n- Dependencies:\n- ${discoveryInterview.dependencies}\n\n- Success metrics:\n- ${discoveryInterview.successMetrics}\n\n- Assumptions:\n- ${discoveryInterview.assumptions}\n\n- Interview mode:\n- ${discoveryInterview.interviewMode}`
  );
  discovery = discovery.replace(
    "## 3. Scope\n### In scope\n-\n\n### Out of scope\n-",
    `## 3. Scope\n### In scope\n- ${discoveryInterview.inScope}\n\n### Out of scope\n- ${discoveryInterview.outOfScope}`
  );
  discovery = discovery.replace(
    "## 4. Actors & User Journeys\nActors:\n-\n\nPrimary journey:\n-",
    `## 4. Actors & User Journeys\nActors:\n- ${discoveryInterview.primaryUsers}\n\nPrimary journey:\n- ${discoveryInterview.journey}`
  );
  discovery = discovery.replace(
    "## 9. Discovery Confidence\n- Confidence:\n-\n- Reason:\n-\n- Evidence gaps:\n-\n- Handoff decision:\n-",
    `## 9. Discovery Confidence\n- Confidence:\n- ${confidence.level}\n\n- Reason:\n- ${confidence.reason}\n\n- Evidence gaps:\n- ${discoveryInterview.assumptions}\n\n- Handoff decision:\n- ${confidence.handoff}`
  );

  fs.writeFileSync(outFile, discovery, "utf8");
  const parsedSpec = parseApprovedSpec(approvedSpec, { feature });
  const qualityDomain = detectQualityDomain(approvedSpec, feature);
  const qualityProfile = getQualityProfile(qualityDomain);
  const rigor = getDiscoveryRigorProfile(discoveryInterview.interviewMode);
  const generated = generatePlanArtifacts({ feature, parsedSpec, rigor, qualityProfile });

  fs.writeFileSync(backlogFile, generated.backlog, "utf8");
  fs.writeFileSync(testsFile, generated.tests, "utf8");

  console.log("Discovery created: " + path.relative(process.cwd(), outFile));
  if (printCheckpointSummary && runAutoCheckpoint) {
    printCheckpointSummary(runAutoCheckpoint({
      enabled: options.autoCheckpoint,
      phase: "discover",
      feature
    }));
  }
  return outFile;
}

export async function runDiscoverCommand({
  options,
  ask,
  getProjectContextOrExit,
  confirmProceed,
  printCheckpointSummary,
  runAutoCheckpoint,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  console.log("DEPRECATION NOTICE: `aitri discover` is deprecated. Use `aitri plan` which runs discovery automatically.");
  const project = getProjectContextOrExit();
  const rawFeatureInput = String(options.feature || options.positional[0] || "").trim();
  let feature = normalizeFeatureName(rawFeatureInput);
  if (rawFeatureInput && !feature) {
    console.log("Invalid feature name. Use kebab-case (example: user-login).");
    return ERROR;
  }
  if (!feature && !options.nonInteractive) {
    const prompted = await ask("Feature name (kebab-case, e.g. user-login): ");
    feature = normalizeFeatureName(prompted);
    if (!feature && String(prompted || "").trim()) {
      console.log("Invalid feature name. Use kebab-case (example: user-login).");
      return ERROR;
    }
  }

  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    return ERROR;
  }

  const requestedRetrievalMode = normalizeRetrievalMode(options.retrievalMode);
  if (options.retrievalMode && !requestedRetrievalMode) {
    console.log("Invalid --retrieval-mode value. Use section or semantic.");
    return ERROR;
  }
  const retrievalMode = requestedRetrievalMode || "section-level";

  const approvedFile = project.paths.approvedSpecFile(feature);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    return ERROR;
  }

  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "..", "core", "templates", "discovery", "discovery_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Discovery template not found at: ${templatePath}`);
    return ERROR;
  }

  const outDir = project.paths.docsDiscoveryDir;
  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);
  const backlogDir = path.dirname(backlogFile);
  const testsDir = path.dirname(testsFile);
  const outFile = project.paths.discoveryFile(feature);

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Create: " + path.relative(process.cwd(), outDir));
  console.log("- Create: " + path.relative(process.cwd(), outFile));
  console.log("- Create: " + path.relative(process.cwd(), backlogDir));
  console.log("- Create: " + path.relative(process.cwd(), backlogFile));
  console.log("- Create: " + path.relative(process.cwd(), testsDir));
  console.log("- Create: " + path.relative(process.cwd(), testsFile));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(backlogDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  const specSnapshot = buildSpecSnapshot(approvedSpec, retrievalMode);
  let discoveryInterview;
  try {
    discoveryInterview = await collectDiscoveryInterview(options, ask, approvedSpec);
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Discovery interview failed.");
    return ERROR;
  }
  const confidence = (() => {
    if (
      [discoveryInterview.primaryUsers, discoveryInterview.currentPain, discoveryInterview.successMetrics]
        .some((v) => /TBD|Not specified|pending/i.test(v))
    ) {
      return {
        level: "Low",
        reason: "Critical discovery inputs are missing or too generic.",
        handoff: "Blocked for Clarification"
      };
    }
    if (
      [discoveryInterview.jtbd, discoveryInterview.constraints, discoveryInterview.dependencies, discoveryInterview.assumptions]
        .some((v) => /TBD|Not specified|pending/i.test(v))
    ) {
      return {
        level: "Medium",
        reason: "Discovery is usable but still has notable evidence gaps.",
        handoff: "Ready for Product/Architecture"
      };
    }
    return {
      level: "High",
      reason: "Discovery inputs are specific and decision-ready.",
      handoff: "Ready for Product/Architecture"
    };
  })();
  if (discoveryInterview.interviewMode === "quick" && confidence.level !== "Low") {
    confidence.reason = `${confidence.reason} Interview used quick mode; expand to standard/deep if uncertainty remains.`;
  }
  await _writeDiscoveryArtifact({
    feature, project, approvedSpec, specSnapshot, discoveryInterview,
    confidence, templatePath, options, runAutoCheckpoint, printCheckpointSummary
  });
  return OK;
}

export async function runPlanCommand({
  options,
  ask,
  getProjectContextOrExit,
  confirmProceed,
  printCheckpointSummary,
  runAutoCheckpoint,
  exitCodes
}) {
  const { OK, ERROR, ABORTED } = exitCodes;
  const project = getProjectContextOrExit();
  const rawFeatureInput = String(options.feature || options.positional[0] || "").trim();
  let feature = normalizeFeatureName(rawFeatureInput);
  if (rawFeatureInput && !feature) {
    console.log("Invalid feature name. Use kebab-case (example: user-login).");
    return ERROR;
  }
  if (!feature && !options.nonInteractive) {
    const prompted = await ask("Feature name (kebab-case, e.g. user-login): ");
    feature = normalizeFeatureName(prompted);
    if (!feature && String(prompted || "").trim()) {
      console.log("Invalid feature name. Use kebab-case (example: user-login).");
      return ERROR;
    }
  }

  if (!feature) {
    console.log("Feature name is required. Use --feature <name> in non-interactive mode.");
    return ERROR;
  }

  const requestedRetrievalMode = normalizeRetrievalMode(options.retrievalMode);
  if (options.retrievalMode && !requestedRetrievalMode) {
    console.log("Invalid --retrieval-mode value. Use section or semantic.");
    return ERROR;
  }

  const approvedFile = project.paths.approvedSpecFile(feature);
  const discoveryFile = project.paths.discoveryFile(feature);
  if (!fs.existsSync(approvedFile)) {
    console.log(`Approved spec not found: ${path.relative(process.cwd(), approvedFile)}`);
    console.log("Approve the spec first: aitri approve");
    return ERROR;
  }
  if (!fs.existsSync(discoveryFile)) {
    console.log("No discovery found. Running discovery inline...");
    const cliDirDisc = path.dirname(fileURLToPath(import.meta.url));
    const discTemplatePath = path.resolve(cliDirDisc, "..", "..", "core", "templates", "discovery", "discovery_template.md");
    if (!fs.existsSync(discTemplatePath)) {
      console.log(`Discovery template not found at: ${discTemplatePath}`);
      return ERROR;
    }
    const discRetrievalMode = requestedRetrievalMode || "section-level";
    const discApprovedSpec = fs.readFileSync(approvedFile, "utf8");
    const discSpecSnapshot = buildSpecSnapshot(discApprovedSpec, discRetrievalMode);
    let discInterview;
    try {
      discInterview = await collectDiscoveryInterview(options, ask, discApprovedSpec);
    } catch (error) {
      console.log(error instanceof Error ? error.message : "Discovery interview failed.");
      return ERROR;
    }
    const discConfidence = (() => {
      if (
        [discInterview.primaryUsers, discInterview.currentPain, discInterview.successMetrics]
          .some((v) => /TBD|Not specified|pending/i.test(v))
      ) {
        return { level: "Low", reason: "Critical discovery inputs are missing or too generic.", handoff: "Blocked for Clarification" };
      }
      if (
        [discInterview.jtbd, discInterview.constraints, discInterview.dependencies, discInterview.assumptions]
          .some((v) => /TBD|Not specified|pending/i.test(v))
      ) {
        return { level: "Medium", reason: "Discovery is usable but still has notable evidence gaps.", handoff: "Ready for Product/Architecture" };
      }
      return { level: "High", reason: "Discovery inputs are specific and decision-ready.", handoff: "Ready for Product/Architecture" };
    })();
    if (discInterview.interviewMode === "quick" && discConfidence.level !== "Low") {
      discConfidence.reason = `${discConfidence.reason} Interview used quick mode; expand to standard/deep if uncertainty remains.`;
    }
    await _writeDiscoveryArtifact({
      feature, project, approvedSpec: discApprovedSpec, specSnapshot: discSpecSnapshot,
      discoveryInterview: discInterview, confidence: discConfidence,
      templatePath: discTemplatePath, options,
      runAutoCheckpoint, printCheckpointSummary
    });
  }
  const discoveryContent = fs.readFileSync(discoveryFile, "utf8");
  const requiredDiscoverySections = [
    "## 2. Discovery Interview Summary (Discovery Persona)",
    "## 3. Scope",
    "## 9. Discovery Confidence"
  ];
  const missingDiscoverySections = requiredDiscoverySections.filter((section) => !discoveryContent.includes(section));
  if (missingDiscoverySections.length > 0) {
    console.log("PLAN BLOCKED: Discovery artifact is missing required sections.");
    missingDiscoverySections.forEach((section) => console.log(`- Missing: ${section}`));
    console.log("Re-run discovery with the latest template before planning.");
    return ERROR;
  }
  const lowConfidence = /- Confidence:\s*\n-\s*Low\b/i.test(discoveryContent);
  if (lowConfidence) {
    console.log("PLAN BLOCKED: Discovery confidence is Low.");
    console.log("Address discovery evidence gaps and re-run `aitri discover --guided` before planning.");
    return ERROR;
  }

  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(cliDir, "..", "..", "core", "templates", "plan", "plan_template.md");

  if (!fs.existsSync(templatePath)) {
    console.log(`Plan template not found at: ${templatePath}`);
    return ERROR;
  }

  const architectPersona = path.resolve(cliDir, "..", "..", "core", "personas", "architect.md");
  const securityPersona = path.resolve(cliDir, "..", "..", "core", "personas", "security.md");
  const productPersona = path.resolve(cliDir, "..", "..", "core", "personas", "product.md");
  const developerPersona = path.resolve(cliDir, "..", "..", "core", "personas", "developer.md");
  const uxUiPersona = path.resolve(cliDir, "..", "..", "core", "personas", "ux-ui.md");
  const qaPersona = path.resolve(cliDir, "..", "..", "core", "personas", "qa.md");

  const outPlanDir = project.paths.docsPlanDir;
  const outPlanFile = project.paths.planFile(feature);
  const backlogFile = project.paths.backlogFile(feature);
  const testsFile = project.paths.testsFile(feature);

  // EVO-044: If re-running plan and pre-planning artifacts changed, inform user
  const prePlanRoot = process.cwd();
  warnIfStale({
    sourceFiles: [
      path.join(prePlanRoot, ".aitri/architecture-decision.md"),
      path.join(prePlanRoot, ".aitri/security-review.md"),
      path.join(prePlanRoot, ".aitri/ux-design.md"),
      path.join(prePlanRoot, ".aitri/qa-plan.md")
    ],
    downstreamFile: outPlanFile,
    downstreamLabel: `docs/plan/${feature}.md`,
    forceFlag: "Regenerating plan with latest pre-planning context.",
    cwd: prePlanRoot
  });

  console.log("PLAN:");
  console.log("- Read: " + path.relative(process.cwd(), approvedFile));
  console.log("- Read: " + path.relative(process.cwd(), templatePath));
  console.log("- Read: " + (fs.existsSync(productPersona) ? productPersona : "core/personas/product.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(architectPersona) ? architectPersona : "core/personas/architect.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(developerPersona) ? developerPersona : "core/personas/developer.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(uxUiPersona) ? uxUiPersona : "core/personas/ux-ui.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(securityPersona) ? securityPersona : "core/personas/security.md (missing in repo)"));
  console.log("- Read: " + (fs.existsSync(qaPersona) ? qaPersona : "core/personas/qa.md (missing in repo)"));
  console.log("- Create: " + path.relative(process.cwd(), outPlanDir));
  console.log("- Write: " + path.relative(process.cwd(), outPlanFile));
  console.log("- Write: " + path.relative(process.cwd(), backlogFile));
  console.log("- Write: " + path.relative(process.cwd(), testsFile));

  const proceed = await confirmProceed(options);
  if (proceed === null) {
    console.log("Non-interactive mode requires --yes for commands that modify files.");
    return ERROR;
  }
  if (!proceed) {
    console.log("Aborted.");
    return ABORTED;
  }

  fs.mkdirSync(outPlanDir, { recursive: true });
  fs.mkdirSync(path.dirname(backlogFile), { recursive: true });
  fs.mkdirSync(path.dirname(testsFile), { recursive: true });

  const approvedSpec = fs.readFileSync(approvedFile, "utf8");
  const discoveryDoc = fs.readFileSync(discoveryFile, "utf8");
  const parsedSpec = parseApprovedSpec(approvedSpec, { feature });
  const inheritedRetrievalMode = detectRetrievalModeFromDiscovery(discoveryDoc);
  const retrievalMode = requestedRetrievalMode || inheritedRetrievalMode || "section-level";
  const specSnapshot = buildSpecSnapshot(approvedSpec, retrievalMode);
  const qualityDomain = detectQualityDomain(approvedSpec, discoveryDoc, feature);
  const qualityProfile = getQualityProfile(qualityDomain);
  let planDoc = fs.readFileSync(templatePath, "utf8");

  planDoc = planDoc.replace("# Plan: <feature>", `# Plan: ${feature}`);
  planDoc = planDoc.replace(
    "## 1. Intent (from approved spec)",
    `## 1. Intent (from approved spec)
- Retrieval mode: ${specSnapshot.mode}

### Context snapshot
${specSnapshot.context}

### Actors snapshot
${specSnapshot.actors}

### Functional rules snapshot
${specSnapshot.functionalRules}

### Acceptance criteria snapshot
${specSnapshot.acceptanceCriteria}

### Security snapshot
${specSnapshot.security}

### Out-of-scope snapshot
${specSnapshot.outOfScope}

### Retrieval metadata
- Retrieval mode: ${specSnapshot.mode}
- Retrieved sections: ${specSnapshot.retrievalEvidence.length > 0 ? specSnapshot.retrievalEvidence.join(", ") : "none"}`
  );

  const frList = parsedSpec.functionalRules.map((rule) => rule.text);
  const coreRule = frList[0] || "Deliver the approved feature scope with traceability.";
  const supportingRule = frList[1] || coreRule;
  const discoveryPain = readDiscoveryField(discoveryDoc, "Current pain") || "Pain evidence must be validated in discovery refinement.";
  const discoveryMetric = readDiscoveryField(discoveryDoc, "Success metrics") || "Define baseline and target KPI before implementation.";
  const discoveryAssumptions = readDiscoveryField(discoveryDoc, "Assumptions") || "Explicit assumptions pending validation with product and architecture.";
  const discoveryDependencies = readDiscoveryField(discoveryDoc, "Dependencies") || "External dependencies to be confirmed.";
  const discoveryConstraints = readDiscoveryField(discoveryDoc, "Constraints (business/technical/compliance)") || "Constraints to be confirmed.";
  const discoveryInterviewMode = normalizeDiscoveryDepth(readDiscoveryField(discoveryDoc, "Interview mode")) || "quick";
  const rigor = getDiscoveryRigorProfile(discoveryInterviewMode);

  // EVO-001 Phase 2: Auditor Mode — if agent has provided pre-generated artifacts,
  // validate traceability before writing. Fall back to inference generation otherwise.
  let agentContent = null;
  if (options.aiBacklog || options.aiTests) {
    const readAgentFile = (filePath, label) => {
      if (!filePath) return "";
      const resolved = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(resolved)) {
        console.log(`AI override: ${label} file not found: ${filePath}`);
        return null;
      }
      return fs.readFileSync(resolved, "utf8");
    };
    const agentBacklog = readAgentFile(options.aiBacklog, "--ai-backlog");
    const agentTests = readAgentFile(options.aiTests, "--ai-tests");
    const agentArchitecture = options.aiArchitecture
      ? readAgentFile(options.aiArchitecture, "--ai-architecture") || ""
      : "";

    if (agentBacklog === null || agentTests === null) return ERROR;

    console.log("Auditor Mode: validating agent-provided artifacts...");
    const audit = auditAgentContent({
      parsedSpec,
      agentContent: { backlog: agentBacklog, tests: agentTests, architecture: agentArchitecture }
    });

    if (!audit.ok) {
      console.log("AUDIT FAILED — traceability issues found:");
      audit.issues.forEach(issue => console.log("  - " + issue));
      console.log("\nFix the issues in your agent-generated files and re-run.");
      return ERROR;
    }

    console.log(`Audit passed: ${audit.stories.length} story/stories, ${audit.testsAudit.testCases.length} test case(s) validated.`);
    agentContent = { backlog: agentBacklog, tests: agentTests, architecture: agentArchitecture };
  }

  const generated = generatePlanArtifacts({
    feature,
    parsedSpec,
    rigor,
    qualityProfile,
    agentContent
  });

  planDoc = replaceSection(
    planDoc,
    "## 2. Discovery Review (Discovery Persona)",
    `### Problem framing
- ${discoveryPain}
- Core rule to preserve: ${coreRule}

### Constraints and dependencies
- Constraints: ${discoveryConstraints}
- Dependencies: ${discoveryDependencies}

### Success metrics
- ${discoveryMetric}

### Key assumptions
- ${discoveryAssumptions}

### Discovery rigor profile
- Discovery interview mode: ${rigor.mode}
- Planning policy: ${rigor.planningPolicy}
- Follow-up gate: ${rigor.followUpGate}`
  );

  planDoc = replaceSection(
    planDoc,
    "## 4. Product Review (Product Persona)",
    `### Business value
- Address user pain by enforcing: ${coreRule}
- Secondary value from supporting rule: ${supportingRule}

### Success metric
- Primary KPI: ${discoveryMetric}
- Ship only if metric has baseline and target.

### Assumptions to validate
- ${discoveryAssumptions}
- Validate dependency and constraint impact before implementation start.
- Discovery rigor policy: ${rigor.followUpGate}`
  );

  planDoc = replaceSection(
    planDoc,
    "## 5. Architecture (Architect Persona)",
    generated.architecture
  );

  planDoc = replaceSection(
    planDoc,
    "## 7. UX/UI Review (UX/UI Persona, if user-facing)",
    `### Primary user flow
- ${discoveryInterviewMode === "deep" ? "Flow must include complete state coverage and fallback paths." : "Flow must be explicit and testable."}

### Key states (empty/loading/error/success)
- Define deterministic behavior for empty/loading/error/success states.

### Accessibility baseline
- Keyboard and screen-reader baseline for user-facing interactions.

### Asset and placeholder strategy
- ${qualityProfile.assetStrategy}
- Avoid default primitive-only output when domain requires visual fidelity.`
  );

  const securityNotes = specSnapshot.security || "No security considerations specified in approved spec.";
  const securityThreats = parsedSpec.functionalRules
    .filter((fr) => /secur|auth|encrypt|sanitiz|inject|xss|csrf|token|session/i.test(fr.text))
    .map((fr) => `- ${fr.id}: ${fr.text}`)
    .join("\n") || "- Review spec for domain-specific threat model.";
  planDoc = replaceSection(
    planDoc,
    "## 6. Security (Security Persona)",
    `### Threats
${securityThreats}
- Derived from spec security section: ${String(securityNotes).split("\n")[0].trim()}

### Required controls
- ${securityNotes}

### Validation rules
- Security controls must be verified before delivery gate.`
  );

  // Inject pre-planning artifacts into the plan doc if they exist
  const root = process.cwd();
  const prePlanningArtifacts = [
    { key: "architecture-decision", file: ".aitri/architecture-decision.md", section: "## 5. Architecture (Architect Persona)" },
    { key: "security-review", file: ".aitri/security-review.md", section: "## 6. Security (Security Persona)" },
    { key: "ux-design", file: ".aitri/ux-design.md", section: "## 7. UX/UI Review (UX/UI Persona, if user-facing)" },
  ];
  for (const { file, section } of prePlanningArtifacts) {
    const artifactPath = path.join(root, file);
    if (fs.existsSync(artifactPath)) {
      const snippet = fs.readFileSync(artifactPath, "utf8").slice(0, 1500);
      planDoc = replaceSection(planDoc, section,
        `<!-- Pre-planning artifact injected from ${file} -->\n${snippet}\n<!-- End artifact -->`
      );
    }
  }
  // Inject QA plan into tests file context note if it exists
  const qaPlanPath = path.join(root, ".aitri/qa-plan.md");
  if (fs.existsSync(qaPlanPath)) {
    const qaSnippet = fs.readFileSync(qaPlanPath, "utf8").slice(0, 800);
    const qaNote = `\n<!-- QA Plan context (from aitri qa-plan) -->\n${qaSnippet}\n<!-- End QA Plan context -->\n`;
    fs.writeFileSync(testsFile, generated.tests + qaNote, "utf8");
  } else {
    fs.writeFileSync(testsFile, generated.tests, "utf8");
  }

  fs.writeFileSync(outPlanFile, planDoc, "utf8");
  if (!fs.existsSync(testsFile)) fs.writeFileSync(testsFile, generated.tests, "utf8");
  fs.writeFileSync(backlogFile, generated.backlog, "utf8");

  console.log("Plan created: " + path.relative(process.cwd(), outPlanFile));
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "plan",
    feature
  }));
  return OK;
}
