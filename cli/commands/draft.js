import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeFeatureName, smartExtractSpec } from "../lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractInputSection(content, heading) {
  const lines = String(content || "").split("\n");
  let inSection = false;
  const result = [];
  for (const line of lines) {
    if (new RegExp(`^## ${heading}\\s*$`, "i").test(line)) { inSection = true; continue; }
    if (inSection && /^## /.test(line)) break;
    if (inSection) result.push(line);
  }
  return result.join("\n").replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function parseFeatureInput(content) {
  const text = String(content || "");
  const problem = extractInputSection(text, "Problem");
  const actorsRaw = extractInputSection(text, "Actors");
  const rulesRaw = extractInputSection(text, "Business Rules");
  const examplesRaw = extractInputSection(text, "Examples");
  const criteriaRaw = extractInputSection(text, "Success Criteria");
  const outOfScopeRaw = extractInputSection(text, "Out of Scope");
  const techStackRaw = extractInputSection(text, "Tech Stack");
  const priorityRaw = extractInputSection(text, "Priority");

  const actors = actorsRaw.split("\n")
    .filter((l) => /^[-*]/.test(l.trim()))
    .map((l) => l.trim())
    .filter(Boolean);

  const rules = rulesRaw.split("\n")
    .filter((l) => /^[-*]/.test(l.trim()) && !/^[-*]\s*</.test(l.trim()))
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  // Parse Input/Output example pairs
  const examples = [];
  let pendingInput = null;
  for (const line of examplesRaw.split("\n")) {
    const inputM = line.match(/^[-*]?\s*Input:\s*(.+)/i);
    const outputM = line.match(/^\s+Output:\s*(.+)/i) || line.match(/^[-*]?\s*Output:\s*(.+)/i);
    if (inputM && !/^[-*]?\s*Input:\s*</.test(line)) {
      pendingInput = inputM[1].trim();
    } else if (outputM && pendingInput && !/Output:\s*</.test(line)) {
      examples.push({ input: pendingInput, output: outputM[1].trim() });
      pendingInput = null;
    }
  }

  const criteria = criteriaRaw.split("\n")
    .filter((l) => /^[-*]/.test(l.trim()) && !/^[-*]\s*Given\s*</.test(l.trim()))
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  const outOfScope = outOfScopeRaw.split("\n")
    .filter((l) => /^[-*]/.test(l.trim()) && !/^[-*]\s*</.test(l.trim()))
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .join("; ") || "Not specified.";

  const techStack = (techStackRaw.split("\n")[0] || "")
    .replace(/^optional.*$/i, "").replace(/<[^>]+>/g, "").trim();
  const priority = (priorityRaw.split("\n")[0] || "").trim();

  return {
    problem,
    actors,
    rules,
    examples,
    criteria,
    outOfScope,
    techStack: /^P[012]$/.test(techStack) ? "" : techStack,
    priority: /^P[012]$/.test(priority) ? priority : "",
    valid: problem.length > 10 && rules.length > 0
  };
}

function printGuidedDraftWizard() {
  console.log("\nGuided Draft Wizard (English prompts)");
  console.log("Answer explicitly. Aitri structures your inputs but does not invent requirements.");
  console.log("All requirements in the draft must be provided by you.");
  console.log("Example feature name: user-login\n");
}

export async function runDraftCommand({
  options,
  ask,
  askRequired,
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
    const prompted = await ask("Feature name in kebab-case (example: user-login): ");
    feature = normalizeFeatureName(prompted);
    if (!feature && String(prompted || "").trim()) {
      console.log("Invalid feature name. Use kebab-case (example: user-login).");
      return ERROR;
    }
  }
  if (!feature) {
    console.log("Feature name is required. Use kebab-case (example: user-login).");
    return ERROR;
  }

  let idea = options.idea || "";
  let wizardSections = null;

  if (options.input) {
    // Structured input mode: parse FEATURE_INPUT_TEMPLATE.md
    const inputFile = path.resolve(process.cwd(), String(options.input));
    if (!fs.existsSync(inputFile)) {
      console.log(`Input file not found: ${inputFile}`);
      return ERROR;
    }
    const inputContent = fs.readFileSync(inputFile, "utf8");
    const parsed = parseFeatureInput(inputContent);
    if (!parsed.valid) {
      console.log("Input file is invalid or incomplete.");
      console.log("Required: ## Problem (10+ chars) and at least one ## Business Rules item.");
      console.log(`Template: core/templates/FEATURE_INPUT_TEMPLATE.md`);
      return ERROR;
    }

    const frLines = parsed.rules.map((rule, i) => {
      const fr = `- FR-${i + 1}: ${rule}`;
      const ex = parsed.examples[i];
      return ex ? `${fr}\n  - Example — Input: ${ex.input} → Output: ${ex.output}` : fr;
    }).join("\n");

    const acLines = parsed.criteria.length > 0
      ? parsed.criteria.map((c, i) => `- AC-${i + 1}: ${c}`).join("\n")
      : "- AC-1: Given <context>, when <action>, then <expected outcome>.";

    const contextLines = [
      parsed.problem,
      parsed.priority ? `Priority: ${parsed.priority}` : null,
      "Requirement source: Provided explicitly by user via --input structured template."
    ].filter(Boolean).join("\n");

    wizardSections = {
      context: contextLines,
      actors: parsed.actors.length > 0 ? parsed.actors.join("\n") : "- [CLARIFY: who uses this feature?]",
      functionalRules: frLines,
      edgeCases: "- [CLARIFY: refine during spec review]",
      security: "- [CLARIFY: authentication and input validation requirements]",
      acceptanceCriteria: acLines,
      outOfScope: parsed.outOfScope,
      techStack: parsed.techStack
    };
    idea = contextLines;
  } else if (options.guided && !options.nonInteractive) {
    // Full guided wizard — produces complete spec sections
    printGuidedDraftWizard();
    const summary = idea || await askRequired("1) What do you want to build?\n   Example: \"A zombie survival game with waves, power-ups, and a scoring system\"\n   > ");
    const actor = await askRequired("2) Who uses it?\n   Example: \"Player\", \"Admin\", \"Support agent\"\n   > ");
    const outcome = await askRequired("3) What should happen when it works?\n   Example: \"Player can survive zombie waves, collect power-ups, and see their score\"\n   > ");
    const inScope = await askRequired("4) What's included?\n   Example: \"Game mechanics, scoring, 3 zombie types, health system\"\n   > ");
    const outOfScope = await ask("5) What's excluded? (optional, press Enter to skip)\n   Example: \"Multiplayer, leaderboard server, account system\"\n   > ");
    const technology = await ask("6) Preferred stack (optional):\n   Example: \"React + Node.js + PostgreSQL\"\n   > ");
    const resolvedTech = technology || "Not specified by user.";

    console.log("\nNow let's define the key rules and quality criteria.");
    console.log("Tip: be specific. Aitri uses these to generate tests and validate delivery.\n");

    const fr1 = await askRequired("7) Main functional rule — what MUST the system do?\n   Example: \"The system must spawn a new zombie wave every 30 seconds with increasing difficulty\"\n   > ");
    const fr2 = await ask("8) Second rule (optional, press Enter to skip)\n   Example: \"The system must save the player's high score locally\"\n   > ");

    const edge1 = await askRequired("9) An edge case — what could go wrong or be unexpected?\n   Example: \"Player dies while a power-up animation is active\"\n   > ");

    const sec1 = await askRequired("10) A security consideration\n   Example: \"Sanitize user input in the score submission form\"\n   > ");

    const ac1 = await askRequired("11) Acceptance criterion — describe a testable scenario:\n   Example: \"Given a player with full health, when hit by a zombie, then health decreases by 20\"\n   > ");
    const resourceStrategy = await ask("12) Resource strategy (optional):\n   Example: \"Assets provided by user in /assets\" or \"No external assets required\"\n   > ");

    wizardSections = {
      context: [
        summary || "TBD",
        "",
        `Primary actor: ${actor || "TBD"}`,
        `Expected outcome: ${outcome || "TBD"}`,
        `In scope: ${inScope || "TBD"}`,
        `Out of scope: ${outOfScope || "Not specified by user."}`,
        `Technology: ${resolvedTech}`,
        "Requirement source: Provided explicitly by user in guided draft."
      ].join("\n"),
      actors: `- ${actor}`,
      functionalRules: [
        `- FR-1: ${fr1}`,
        fr2 ? `- FR-2: ${fr2}` : null
      ].filter(Boolean).join("\n"),
      edgeCases: `- ${edge1}`,
      security: `- ${sec1}`,
      acceptanceCriteria: `- AC-1: ${ac1}`,
      outOfScope: outOfScope || "Not specified by user.",
      resourceStrategy: resourceStrategy.trim()
    };

    idea = wizardSections.context;

  } else if (options.guided && options.nonInteractive) {
    // Non-interactive guided — no inferred requirements.
    if (!idea) {
      console.log("In non-interactive mode, provide --idea \"<summary>\".");
      return ERROR;
    }
    if (idea.trim().length < 15) {
      console.log("Idea is too short. Provide at least 15 characters describing what you want to build.");
      console.log("Example: --idea \"A REST API for tracking expense entries with validation and audit logs\"");
      return ERROR;
    }
    idea = [
      `Summary (provided by user): ${idea}`,
      "Requirement source: provided explicitly by user via --idea.",
      "No inferred requirements were added by Aitri."
    ].join("\n");
  } else {
    // Raw mode (--raw): free-form idea text
    if (!idea && !options.nonInteractive) {
      idea = await ask("Describe the idea in 1-3 lines: ");
    }
  }
  if (!idea) {
    console.log("Idea is required. Provide --idea in non-interactive mode.");
    return ERROR;
  }

  const outDir = project.paths.specsDraftsDir;
  const outFile = project.paths.draftSpecFile(feature);

  const plan = [
    `Create: ${path.relative(process.cwd(), outDir)}`,
    `Create: ${path.relative(process.cwd(), outFile)}`
  ];

  console.log("PLAN:");
  plan.forEach((p) => console.log("- " + p));

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

  let specContent;
  if (wizardSections) {
    // Generate complete spec from wizard answers — no template placeholders
    const parts = [
      `# AF-SPEC: ${feature}`,
      "",
      "STATUS: DRAFT",
      ""
    ];
    if (wizardSections.techStack) {
      parts.push(`Tech Stack: ${wizardSections.techStack}`, "");
    }
    parts.push(
      "## 1. Context",
      wizardSections.context,
      "",
      "## 2. Actors",
      wizardSections.actors,
      "",
      "## 3. Functional Rules (traceable)",
      wizardSections.functionalRules,
      "",
      "## 4. Edge Cases",
      wizardSections.edgeCases,
      "",
      "## 5. Failure Conditions",
      "- TBD (refine during review)",
      "",
      "## 6. Non-Functional Requirements",
      "- TBD (refine during review)",
      "",
      "## 7. Security Considerations",
      wizardSections.security,
      "",
      "## 8. Out of Scope",
      `- ${wizardSections.outOfScope}`,
      "",
      "## 9. Acceptance Criteria",
      wizardSections.acceptanceCriteria,
      "",
      "## 10. Requirement Source Statement",
      "- All requirements in this draft were provided explicitly by the user.",
      "- Aitri structured the content and did not invent requirements."
    );
    if (wizardSections.resourceStrategy) {
      parts.push("", "## 11. Resource Strategy", `- ${wizardSections.resourceStrategy}`);
    }
    parts.push("");
    specContent = parts.join("\n");
  } else {
    // Raw mode — smart extraction when idea is detailed, template fallback otherwise
    const rawIdea = String(options.idea || idea || "");
    const extracted = smartExtractSpec(rawIdea);

    if (extracted.confidence !== "low") {
      // Pre-fill sections from the idea — only mark genuinely unknown things
      const parts = [
        `# AF-SPEC: ${feature}`, "", "STATUS: DRAFT", "",
        "## 1. Context",
        `Summary (provided by user): ${rawIdea}`,
        "Requirement source: provided explicitly by user via --idea.", "",
        "## 2. Actors",
        extracted.actors || "- [CLARIFY: Who are the primary actors/users of this system?]", "",
        "## 3. Functional Rules (traceable)",
        extracted.frs || "- FR-1: [CLARIFY: List the functional rules as verifiable statements]", "",
        "## 4. Edge Cases",
        "- [CLARIFY: What happens with invalid inputs, empty states, or concurrent requests?]", "",
        "## 5. Failure Conditions",
        "- [CLARIFY: How should the system behave when things go wrong?]", "",
        "## 6. Non-Functional Requirements",
        extracted.nfrs || "- [CLARIFY: Performance, scalability, or technology constraints]", "",
        "## 7. Security Considerations",
        extracted.security || "- [CLARIFY: Authentication, authorization, and input validation requirements]", "",
        "## 8. Out of Scope",
        "- [CLARIFY: What is explicitly excluded from this version?]", "",
        "## 9. Acceptance Criteria (Given/When/Then)",
        "- AC-1: Given <context>, when <action>, then <expected outcome>.", "",
        "## 10. Requirement Source Statement",
        "- Requirements provided explicitly by the user via --idea.",
        `- Aitri extracted ${extracted.frs ? "functional rules" : "context"} from the brief. Verify and complete placeholders before approve.`,
        ""
      ];
      specContent = parts.join("\n");
      console.log(`Smart extraction: ${extracted.confidence} confidence — ${extracted.frs ? "FRs pre-filled" : "context captured"}. Complete [CLARIFY] sections before approve.`);
    } else {
      const templatePath = path.resolve(__dirname, "..", "..", "core", "templates", "af_spec.md");
      if (!fs.existsSync(templatePath)) {
        console.log(`Template not found at: ${templatePath}`);
        return ERROR;
      }
      const template = fs.readFileSync(templatePath, "utf8");
      specContent = template.replace(
        "## 1. Context\nDescribe the problem context.",
        `## 1. Context\n${idea}\n\n---\n\n(Complete all requirement sections with explicit user-provided requirements before approve.)`
      );
      specContent = `${specContent}\n## 10. Requirement Source Statement\n- Requirements must be provided explicitly by the user.\n- Aitri does not invent requirements.\n`;
    }
  }

  // Inject pre-planning context if dev-roadmap exists
  const roadmapPath = path.join(process.cwd(), ".aitri/dev-roadmap.md");
  if (fs.existsSync(roadmapPath)) {
    const roadmapSnippet = fs.readFileSync(roadmapPath, "utf8").slice(0, 1200);
    const prePlanningNote = `\n## Pre-Planning Context (from dev-roadmap)\n<!-- Auto-injected by aitri draft — do not edit this section manually -->\n${roadmapSnippet}\n<!-- End pre-planning context -->\n`;
    specContent = specContent + prePlanningNote;
  }

  fs.writeFileSync(outFile, specContent, "utf8");

  console.log(`Draft spec created: ${path.relative(process.cwd(), outFile)}`);
  printCheckpointSummary(runAutoCheckpoint({
    enabled: options.autoCheckpoint,
    phase: "draft",
    feature
  }));
  console.log(`Next recommended command: aitri approve --feature ${feature}`);
  return OK;
}
