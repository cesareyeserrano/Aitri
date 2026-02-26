import { escapeRegExp, extractSection } from "../lib.js";

function extractFirstSection(content, headings) {
  for (const heading of headings) {
    const section = extractSection(content, heading).trim();
    if (section) return section;
  }
  return "";
}

function compactSectionLines(content, maxLines = 4, fallback = "Not specified in spec.") {
  const lines = String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^###\s+/.test(line))
    .filter((line) => !/^<.*>$/.test(line))
    .filter((line) => line !== "-");

  if (lines.length === 0) return `- ${fallback}`;
  return lines
    .slice(0, maxLines)
    .map((line) => (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line) ? line : `- ${line}`))
    .join("\n");
}

function extractListById(content, idPrefix, fallback = "Not specified in spec.", maxItems = 6) {
  const pattern = new RegExp(`-\\s*${idPrefix}-\\d+\\s*:\\s*([^\\n]+)`, "gi");
  const items = [...String(content || "").matchAll(pattern)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  if (items.length === 0) return `- ${fallback}`;
  return items.slice(0, maxItems).map((item) => `- ${item}`).join("\n");
}

function buildSpecSectionSnapshot(specContent) {
  return {
    mode: "section-level",
    context: compactSectionLines(
      extractFirstSection(specContent, ["## 1. Context"]),
      3,
      "Context is missing."
    ),
    actors: compactSectionLines(
      extractFirstSection(specContent, ["## 2. Actors"]),
      3,
      "Actors are missing."
    ),
    functionalRules: extractListById(specContent, "FR", "Functional rules are missing."),
    acceptanceCriteria: extractListById(specContent, "AC", "Acceptance criteria are missing."),
    security: compactSectionLines(
      extractFirstSection(specContent, ["## 7. Security Considerations"]),
      3,
      "Security considerations are missing."
    ),
    outOfScope: compactSectionLines(
      extractFirstSection(specContent, ["## 8. Out of Scope"]),
      3,
      "Out-of-scope items are missing."
    ),
    retrievalEvidence: [
      "1. Context",
      "2. Actors",
      "3. Functional Rules",
      "7. Security Considerations",
      "8. Out of Scope",
      "9. Acceptance Criteria"
    ]
  };
}

const RETRIEVAL_STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "are", "was", "were", "have", "has", "had",
  "you", "your", "into", "under", "over", "when", "then", "than", "also", "must", "should", "would",
  "can", "could", "use", "using", "used", "not", "only", "its", "it's", "about", "what", "which",
  "where", "who", "how", "why", "any", "all", "our", "their", "them", "more", "less", "very",
  "user", "users", "feature", "system", "spec", "rule"
]);

function tokenizeRetrieval(text) {
  return [...new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !RETRIEVAL_STOPWORDS.has(token))
  )];
}

function splitSpecSections(specContent) {
  const lines = String(specContent || "").split("\n");
  const sections = [];
  let heading = "Document";
  let body = [];

  const flush = () => {
    const joined = body.join("\n").trim();
    if (joined) sections.push({ heading, body: joined });
  };

  lines.forEach((line) => {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flush();
      heading = h2[1].trim();
      body = [];
      return;
    }
    body.push(line);
  });
  flush();
  return sections;
}

function semanticRetrieve(specContent, query, fallback = "Not specified in spec.") {
  const tokens = tokenizeRetrieval(query);
  const sections = splitSpecSections(specContent);
  if (sections.length === 0) {
    return { text: `- ${fallback}`, headings: [] };
  }

  const ranked = sections.map((section) => {
    const headingLower = section.heading.toLowerCase();
    const bodyLower = section.body.toLowerCase();
    let score = 0;
    tokens.forEach((token) => {
      if (headingLower.includes(token)) score += 4;
      if (bodyLower.includes(token)) score += 1;
    });
    return { ...section, score };
  }).sort((a, b) => b.score - a.score);

  const selected = ranked.filter((item) => item.score > 0).slice(0, 2);
  const effective = selected.length > 0 ? selected : ranked.slice(0, 1);
  const combined = effective.map((item) => item.body).join("\n");
  return {
    text: compactSectionLines(combined, 3, fallback),
    headings: effective.map((item) => item.heading)
  };
}

function buildSpecSemanticSnapshot(specContent) {
  const contextRes = semanticRetrieve(specContent, "problem context business impact why now", "Context is missing.");
  const actorsRes = semanticRetrieve(specContent, "actors personas stakeholders users", "Actors are missing.");
  const securityRes = semanticRetrieve(specContent, "security controls threats auth authorization abuse", "Security considerations are missing.");
  const outOfScopeRes = semanticRetrieve(specContent, "out of scope excluded deferred not included", "Out-of-scope items are missing.");
  const evidence = [
    ...contextRes.headings,
    ...actorsRes.headings,
    ...securityRes.headings,
    ...outOfScopeRes.headings
  ];

  return {
    mode: "semantic-lite",
    context: contextRes.text,
    actors: actorsRes.text,
    functionalRules: extractListById(specContent, "FR", "Functional rules are missing."),
    acceptanceCriteria: extractListById(specContent, "AC", "Acceptance criteria are missing."),
    security: securityRes.text,
    outOfScope: outOfScopeRes.text,
    retrievalEvidence: [...new Set(evidence)]
  };
}

export function normalizeDiscoveryDepth(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "q" || raw === "quick") return "quick";
  if (raw === "s" || raw === "standard") return "standard";
  if (raw === "d" || raw === "deep") return "deep";
  return null;
}

export function normalizeRetrievalMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "section" || raw === "section-level" || raw === "section_level") return "section-level";
  if (raw === "semantic" || raw === "semantic-lite" || raw === "semantic_lite") return "semantic-lite";
  return null;
}

function compactBullets(text, maxChars) {
  return text.split("\n")
    .filter((l) => /^\s*[-*]/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .join("; ")
    .substring(0, maxChars || 300);
}

export function extractSpecContext(specContent) {
  if (!specContent) return null;
  const actors   = extractSection(specContent, "Actors");
  const context  = extractSection(specContent, "Context");
  const ac       = extractSection(specContent, "Acceptance Criteria");
  const oos      = extractSection(specContent, "Out of Scope");
  const nfr      = extractSection(specContent, "Non-Functional Requirements");
  const frs      = extractSection(specContent, "Functional Rules");

  // Spec is "rich" when it has real actors, real context and at least one AC
  const hasActors  = actors.length > 10 && !/TBD|placeholder/i.test(actors);
  const hasContext = context.length > 20;
  const hasAC      = /AC-\d+/i.test(ac);
  if (!hasActors || !hasContext || !hasAC) return null;

  return {
    primaryUsers:   compactBullets(actors, 200) || actors.substring(0, 200),
    jtbd:           context.split("\n").find((l) => l.trim().length > 10)?.trim().substring(0, 200) || context.substring(0, 200),
    currentPain:    context.substring(0, 200),
    constraints:    compactBullets(nfr, 200) || "Constraints identified in approved spec",
    dependencies:   "Dependencies identified in approved spec",
    successMetrics: compactBullets(ac, 300) || ac.substring(0, 300),
    assumptions:    "Assumptions embedded in approved spec scope",
    inScope:        compactBullets(frs, 300) || "Approved spec functional scope",
    outOfScope:     compactBullets(oos, 200) || oos.substring(0, 200) || "Anything not explicitly stated in approved spec",
    journey:        context.split("\n").find((l) => l.trim().length > 10)?.trim().substring(0, 150) || "Primary journey derived from approved spec context",
    interviewMode:  "spec-derived"
  };
}

export async function collectDiscoveryInterview(options, ask, specContent) {
  const defaults = {
    primaryUsers: "Users defined in approved spec",
    jtbd: "Deliver capability described in approved spec",
    currentPain: "Problem stated in approved spec context",
    constraints: "Constraints identified in approved spec",
    dependencies: "Dependencies identified in approved spec",
    successMetrics: "Acceptance criteria defined in approved spec",
    assumptions: "Assumptions embedded in approved spec scope",
    inScope: "Approved spec functional scope",
    outOfScope: "Anything not explicitly stated in approved spec",
    journey: "Primary journey derived from approved spec context",
    interviewMode: "quick"
  };

  const flaggedDepth = normalizeDiscoveryDepth(options.discoveryDepth);
  if (options.discoveryDepth && !flaggedDepth) {
    throw new Error("Invalid --discovery-depth value. Use quick, standard, or deep.");
  }

  // Spec-aware: if spec has rich fields and user hasn't forced --guided, skip interview
  if (!options.guided && specContent) {
    const fromSpec = extractSpecContext(specContent);
    if (fromSpec) {
      console.log("Spec context detected — skipping discovery interview (use --guided to run it manually).");
      return fromSpec;
    }
  }

  if (options.nonInteractive) {
    return {
      ...defaults,
      interviewMode: flaggedDepth || "quick"
    };
  }

  let guided = options.guided;
  if (!guided) {
    const answer = (await ask("Run guided discovery interview now? (Y/n): ")).toLowerCase();
    guided = (answer === "" || answer === "y" || answer === "yes");
  }
  if (!guided) return defaults;

  console.log("\nGuided Discovery Interview");
  console.log("Progressive mode: quick by default, with optional expansion when needed.\n");

  let depth = flaggedDepth;
  if (!depth) {
    while (true) {
      const choice = (await ask("Select interview depth [q=quick, s=standard, d=deep] (default q): ")).toLowerCase();
      if (!choice || choice === "q" || choice === "quick") {
        depth = "quick";
        break;
      }
      if (choice === "s" || choice === "standard") {
        depth = "standard";
        break;
      }
      if (choice === "d" || choice === "deep") {
        depth = "deep";
        break;
      }
      console.log("Invalid depth. Choose q, s, or d.");
    }
  }

  console.log(`\nInterview mode: ${depth}`);
  const primaryUsers = await ask("1) Primary users/segments: ");
  const jtbd = await ask("2) Jobs-to-be-done (what must users accomplish?): ");
  const currentPain = await ask("3) Current pain/impact (frequency/severity): ");
  const constraints = await ask("4) Constraints (business/technical/compliance): ");
  const dependencies = await ask("5) Dependencies (teams/systems/vendors): ");
  const successMetrics = await ask("6) Success metrics (baseline -> target): ");

  let collectAdvanced = depth !== "quick";
  if (!collectAdvanced) {
    const expand = (await ask("Need expanded discovery details now? (y/N): ")).toLowerCase();
    collectAdvanced = (expand === "y" || expand === "yes");
    if (collectAdvanced) depth = "standard";
  }

  let assumptions = defaults.assumptions;
  let inScope = defaults.inScope;
  let outOfScope = defaults.outOfScope;
  let journey = defaults.journey;
  let deepMetricBaseline = "";
  if (collectAdvanced) {
    assumptions = await ask("7) Key assumptions to validate: ");
    inScope = await ask("8) In-scope (atomic list): ");
    outOfScope = await ask("9) Out-of-scope (deferred): ");
    journey = await ask("10) Primary user journey in one line: ");
  }

  if (depth === "deep") {
    const urgencyNow = await ask("11) Why now (urgency trigger/event): ");
    const baselineToday = await ask("12) Baseline today (current metric value): ");
    const noGoZone = await ask("13) Explicit no-go zone (what must never be built now): ");
    if (urgencyNow) {
      assumptions = `${assumptions || defaults.assumptions}; Why now: ${urgencyNow}`;
    }
    if (baselineToday && successMetrics) {
      deepMetricBaseline = baselineToday;
    }
    if (noGoZone) {
      outOfScope = `${outOfScope || defaults.outOfScope}; No-go zone: ${noGoZone}`;
    }
  }

  return {
    primaryUsers: primaryUsers || defaults.primaryUsers,
    jtbd: jtbd || defaults.jtbd,
    currentPain: currentPain || defaults.currentPain,
    constraints: constraints || defaults.constraints,
    dependencies: dependencies || defaults.dependencies,
    successMetrics: deepMetricBaseline
      ? `${successMetrics || defaults.successMetrics}; Baseline: ${deepMetricBaseline}`
      : (successMetrics || defaults.successMetrics),
    assumptions: assumptions || defaults.assumptions,
    inScope: inScope || defaults.inScope,
    outOfScope: outOfScope || defaults.outOfScope,
    journey: journey || defaults.journey,
    interviewMode: depth
  };
}

export function buildSpecSnapshot(specContent, retrievalMode) {
  const mode = retrievalMode || "section-level";
  if (mode === "semantic-lite") return buildSpecSemanticSnapshot(specContent);
  return buildSpecSectionSnapshot(specContent);
}

export function detectRetrievalModeFromDiscovery(discoveryContent) {
  const mode = String(discoveryContent || "").match(/Retrieval mode:\s*(section-level|semantic-lite)/i);
  if (!mode) return null;
  return mode[1].toLowerCase();
}

export function detectQualityDomain(...sources) {
  const text = sources
    .map((value) => String(value || ""))
    .join("\n")
    .toLowerCase();

  if (/\b(game|gaming|phaser|three\.?js|sprite|sprites|canvas|3d|rendering engine)\b/.test(text)) {
    return "game";
  }
  if (/\b(cli|command line|terminal|console app|shell tool)\b/.test(text)) {
    return "cli";
  }
  if (/\b(web|saas|dashboard|portal|frontend|react|next\.?js|ui)\b/.test(text)) {
    return "web";
  }
  return "general";
}

export function getQualityProfile(domain) {
  const key = String(domain || "general");
  const profiles = {
    web: {
      id: "web",
      label: "Web/SaaS",
      stackConstraint: "Use a component-based UI stack (for example React + Tailwind/shadcn or equivalent). Avoid raw static HTML/CSS-only scaffolds.",
      forbiddenDefaults: "Raw HTML tables, default browser typography, and layout-only placeholders as final UI baseline.",
      assetStrategy: "Use credible placeholder/image/icon sources (for example placehold.co, Lucide/Heroicons) and define an explicit fallback strategy.",
      storyContract: "Stories must declare a specific actor role (avoid generic \"user\") and acceptance criteria should follow Given/When/Then."
    },
    game: {
      id: "game",
      label: "Game/Interactive",
      stackConstraint: "Use a rendering/game engine (for example Phaser or Three.js). Avoid raw primitive-only canvas logic as architecture baseline.",
      forbiddenDefaults: "Rectangle-only or geometry-only output without asset pipeline.",
      assetStrategy: "Use external asset loading (sprites/GLTF/audio) with public-domain packs or placeholders and document fallback behavior.",
      storyContract: "Stories must specify concrete player/system actors and acceptance criteria should follow Given/When/Then."
    },
    cli: {
      id: "cli",
      label: "CLI/Automation",
      stackConstraint: "Use structured command modules and formatted terminal output (for example chalk/ora or equivalent patterns).",
      forbiddenDefaults: "Unstructured raw console output as final UX baseline.",
      assetStrategy: "Define output templates/examples and fallback text for non-interactive logs.",
      storyContract: "Stories must specify concrete operator roles and acceptance criteria should follow Given/When/Then."
    },
    general: {
      id: "general",
      label: "General Product",
      stackConstraint: "Use modular architecture with explicit boundaries and avoid monolithic scaffolds.",
      forbiddenDefaults: "Single-file toy scaffolds without clear component/service boundaries.",
      assetStrategy: "Define credible placeholder strategy for user-facing artifacts and deterministic textual fallback for non-visual flows.",
      storyContract: "Stories should avoid generic actors and acceptance criteria should follow Given/When/Then where behavior matters."
    }
  };

  return profiles[key] || profiles.general;
}

export function readDiscoveryField(discovery, label) {
  const pattern = new RegExp(`-\\s*${escapeRegExp(label)}:\\s*\\n-\\s*(.+)`, "i");
  const match = String(discovery).match(pattern);
  return match ? match[1].trim() : "";
}

export function getDiscoveryRigorProfile(mode) {
  if (mode === "deep") {
    return {
      mode: "deep",
      planningPolicy: "Plan for full decomposition (explicit risks, constraints, and dependency handling).",
      followUpGate: "No extra discovery depth required before implementation unless scope changes.",
      backlogPolicy: "Stories may proceed to implementation after normal validate/verify/policy gates.",
      qaPolicy: "Include broad negative, abuse, and boundary coverage from the first implementation slice."
    };
  }
  if (mode === "standard") {
    return {
      mode: "standard",
      planningPolicy: "Plan for balanced decomposition with explicit risk tracking and key dependency checks.",
      followUpGate: "Escalate to deep discovery if major architectural uncertainty remains after first planning pass.",
      backlogPolicy: "Keep one hardening story in the first sprint to close remaining discovery gaps.",
      qaPolicy: "Include baseline negative and security scenarios before implementation handoff."
    };
  }
  return {
    mode: "quick",
    planningPolicy: "Plan a constrained first slice and keep assumptions explicit.",
    followUpGate: "Before broad implementation, re-run discovery in standard/deep mode if assumptions remain unresolved.",
    backlogPolicy: "Prioritize one thin vertical slice; delay scale/optimization stories until discovery is expanded.",
    qaPolicy: "Run smoke + core functional checks first, then expand abuse/edge coverage after discovery refinement."
  };
}
