import { normalizeLine } from "../lib.js";
import { auditAgentContent } from "./content-auditor.js";

function toTitleCase(value) {
  return normalizeLine(value)
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function keywordTokens(value) {
  const stopwords = new Set([
    "the", "and", "for", "that", "with", "this", "from", "must", "should", "when", "then", "given",
    "system", "feature", "rule", "user", "users", "into", "over", "under", "between", "within"
  ]);
  return unique(
    normalizeLine(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter((token) => !stopwords.has(token))
  );
}

function stripRulePrefix(text) {
  return normalizeLine(text)
    .replace(/^the system must\s+/i, "")
    .replace(/^the platform must\s+/i, "")
    .replace(/^must\s+/i, "");
}

/**
 * @deprecated Legacy heuristic — replaced by Auditor Mode (EVO-001).
 * Use `generatePlanArtifacts({ agentContent })` with agent-authored backlog instead.
 * Retained for backward compatibility with the inference path.
 */
function normalizeActor(actor, qualityProfile) {
  const value = normalizeLine(actor);
  if (!value) return fallbackActor(qualityProfile);
  if (/^(user|users|customer|customers|client|clients|person|people)$/i.test(value)) {
    return fallbackActor(qualityProfile);
  }
  return value;
}

/**
 * @deprecated Legacy heuristic — replaced by Auditor Mode (EVO-001).
 * Use `generatePlanArtifacts({ agentContent })` with agent-authored backlog instead.
 * Retained for backward compatibility with the inference path.
 */
function fallbackActor(qualityProfile) {
  const domain = String(qualityProfile?.id || "general");
  if (domain === "web") return "Support agent";
  if (domain === "game") return "Player";
  if (domain === "cli") return "Platform operator";
  return "Product operator";
}

function buildUiVocabularyHints(uiStructure) {
  if (!uiStructure?.hasUiSection) return null;
  return {
    screenNames: uiStructure.screens.map((s) => s.name),
    allComponents: uiStructure.screens.flatMap((s) => s.components),
    flowPairs: uiStructure.flows.map((f) => ({ from: f.from, to: f.to }))
  };
}

/**
 * @deprecated Legacy heuristic — replaced by Auditor Mode (EVO-001).
 * Use `generatePlanArtifacts({ agentContent })` with agent-authored tests instead.
 * Retained for backward compatibility with the inference path.
 */
function toGherkin(ac, ruleText, uiVocab = null) {
  if (ac?.gherkin?.given && ac?.gherkin?.when && ac?.gherkin?.then) {
    return {
      given: normalizeLine(ac.gherkin.given),
      when: normalizeLine(ac.gherkin.when),
      then: normalizeLine(ac.gherkin.then)
    };
  }

  if (uiVocab && uiVocab.screenNames.length > 0) {
    const screen = uiVocab.screenNames[0];
    const summary = normalizeLine(ac?.text || "");
    const ruleSummary = stripRulePrefix(ruleText);
    return {
      given: `the user is on the ${screen} screen`,
      when: summary ? summary.charAt(0).toLowerCase() + summary.slice(1) : `the user interacts with ${ruleSummary.toLowerCase()}`,
      then: `the system satisfies ${ruleSummary.toLowerCase()}`
    };
  }

  const summary = normalizeLine(ac?.text || "");
  const ruleSummary = stripRulePrefix(ruleText);
  return {
    given: `the ${ruleSummary.toLowerCase()} requirement is active`,
    when: summary ? summary.charAt(0).toLowerCase() + summary.slice(1) : `a request exercises ${ruleSummary.toLowerCase()}`,
    then: `the system satisfies ${ruleSummary.toLowerCase()}`
  };
}

function scoreCriterionAgainstRule(rule, criterion) {
  const ruleTokens = keywordTokens(rule.text);
  const acTokens = keywordTokens(criterion.text);
  const overlap = acTokens.filter((token) => ruleTokens.includes(token)).length;
  return overlap;
}

function selectCriteriaForRule(rule, allCriteria) {
  if (allCriteria.length === 0) return [];
  const ranked = allCriteria
    .map((criterion) => ({ criterion, score: scoreCriterionAgainstRule(rule, criterion) }))
    .sort((a, b) => b.score - a.score);

  const bestScore = ranked[0]?.score ?? 0;
  if (bestScore > 0) {
    return ranked.filter((item) => item.score === bestScore).slice(0, 2).map((item) => item.criterion);
  }

  const byIndex = allCriteria.find((criterion) => criterion.index === rule.index);
  if (byIndex) return [byIndex];
  return [allCriteria[Math.min(rule.index - 1, allCriteria.length - 1)]];
}

/**
 * @deprecated Legacy heuristic — replaced by Auditor Mode (EVO-001).
 * Use `generatePlanArtifacts({ agentContent })` with agent-authored backlog instead.
 * Retained for backward compatibility with the inference path.
 */
function inferBenefit(ruleText, actor) {
  const text = stripRulePrefix(ruleText).toLowerCase();
  if (/\bauth|login|credential|session\b/.test(text)) return `${actor.toLowerCase()}s can access the right capabilities safely`;
  if (/\breject|invalid|error|fail\b/.test(text)) return `invalid behavior is handled with deterministic outcomes`;
  if (/\bnotify|alert|email|message\b/.test(text)) return `critical updates are visible without manual polling`;
  if (/\bsearch|find|query\b/.test(text)) return `relevant information can be located quickly`;
  return `the workflow remains reliable and traceable`;
}

/**
 * @deprecated Legacy heuristic — replaced by Auditor Mode (EVO-001).
 * Use `generatePlanArtifacts({ agentContent })` with agent-authored backlog instead.
 * Retained for backward compatibility with the inference path.
 */
function inferCapability(ruleText) {
  const summary = stripRulePrefix(ruleText);
  const lowered = summary.charAt(0).toLowerCase() + summary.slice(1);
  return lowered.endsWith(".") ? lowered.slice(0, -1) : lowered;
}

function buildUserStories(parsedSpec, qualityProfile) {
  const uiVocab = buildUiVocabularyHints(parsedSpec.uiStructure);
  const rules = parsedSpec.functionalRules.length > 0
    ? parsedSpec.functionalRules
    : [{ id: "FR-1", text: "deliver approved scope with explicit traceability", index: 1 }];
  const actors = parsedSpec.actors.length > 0 ? parsedSpec.actors : [fallbackActor(qualityProfile)];
  const stories = rules.map((rule, index) => {
    const actorCandidate = parsedSpec.actorByRule?.[rule.id] || actors[index % actors.length];
    const actor = normalizeActor(actorCandidate, qualityProfile);
    const criteria = selectCriteriaForRule(rule, parsedSpec.acceptanceCriteria);
    const acceptance = criteria.map((criterion) => ({
      id: criterion.id,
      ...toGherkin(criterion, rule.text, uiVocab)
    }));
    if (acceptance.length === 0) {
      acceptance.push(toGherkin(null, rule.text, uiVocab));
    }

    return {
      id: `US-${index + 1}`,
      actor,
      capability: inferCapability(rule.text),
      benefit: inferBenefit(rule.text, actor),
      frIds: [rule.id],
      acIds: unique(criteria.map((criterion) => criterion.id)),
      acceptance
    };
  });
  return stories;
}

function inferEpicOutcome(stories, index) {
  const first = stories[0];
  if (!first) return `Deliver core capability slice ${index + 1}`;
  return `${toTitleCase(first.capability)} with verified coverage`;
}

function buildComponentHints(parsedSpec, feature) {
  const components = new Set();
  components.add(`${feature}-service`);
  const fullText = `${parsedSpec.functionalRules.map((rule) => rule.text).join(" ")} ${parsedSpec.acceptanceCriteria.map((ac) => ac.text).join(" ")}`.toLowerCase();

  if (/\bauth|login|credential|session\b/.test(fullText)) components.add("auth-service");
  if (/\bprofile|account|user\b/.test(fullText)) components.add("account-repository");
  if (/\bsearch|query|filter\b/.test(fullText)) components.add("query-adapter");
  if (/\bpayment|invoice|billing\b/.test(fullText)) components.add("billing-gateway");
  if (/\bnotification|alert|email|sms\b/.test(fullText)) components.add("notification-adapter");
  if (/\bqueue|job|async|worker\b/.test(fullText)) components.add("job-worker");

  return [...components].slice(0, 6);
}

function buildArchitectureByStack(parsedSpec, qualityProfile, feature) {
  const stack = parsedSpec.techStack?.id || "node-cli";
  const components = buildComponentHints(parsedSpec, feature);

  if (stack === "python") {
    return {
      components: [
        "FastAPI/Flask entrypoint",
        ...components.map((name) => `Python module: ${name}`)
      ],
      dataFlow: [
        "HTTP request enters Python API route with schema validation.",
        "Service module enforces FR constraints and calls dependency adapters.",
        "Repository/integration layer persists state and returns normalized response."
      ],
      observability: [
        "Structured logs (JSON) with request_id.",
        "Metrics for success/failure and latency per route.",
        "Trace correlation across external integrations."
      ]
    };
  }

  if (stack === "go") {
    return {
      components: [
        "Go HTTP handler or CLI entrypoint",
        ...components.map((name) => `Go package: ${name}`)
      ],
      dataFlow: [
        "Request enters Go handler and is validated at boundary.",
        "Service package applies FR rules and coordinates adapters.",
        "Storage/integration package persists data and returns typed results."
      ],
      observability: [
        "Context-aware logs with request identifiers.",
        "Metrics for route latency and failure classes.",
        "Tracing spans for external calls."
      ]
    };
  }

  if (stack === "node-web") {
    return {
      components: [
        "Web UI shell (React/Next route layer)",
        "Node.js application service",
        ...components.map((name) => `Module: ${name}`)
      ],
      dataFlow: [
        "User interaction triggers UI action and API request.",
        "Node service validates input, enforces FR policy, and executes domain workflow.",
        "Persistence/integration modules return deterministic success or typed error."
      ],
      observability: [
        "Structured logs with correlation IDs across UI/API boundary.",
        "Metrics for conversion success rate, latency, and error categories.",
        "Trace spans from UI action to service completion."
      ]
    };
  }

  return {
    components: [
      "CLI command parser",
      "Command handler service",
      ...components.map((name) => `Module: ${name}`)
    ],
    dataFlow: [
      "Operator executes command with validated inputs.",
      "Service layer enforces FR logic and delegates to adapters.",
      "Result is persisted/emitted with deterministic status and error text."
    ],
    observability: [
      "Structured command logs with feature and story IDs.",
      "Metrics for command success/failure and runtime duration.",
      "Trace markers for dependency boundaries."
    ]
  };
}

function formatAcceptanceCriteria(story) {
  return story.acceptance
    .map((ac) => `  - Given ${ac.given}, when ${ac.when}, then ${ac.then}.`)
    .join("\n");
}

export function generateArchitectureSection({ feature, parsedSpec, qualityProfile }) {
  const architecture = buildArchitectureByStack(parsedSpec, qualityProfile, feature);
  const stackLabel = parsedSpec.techStack?.label || "Detected stack";
  const stackFramework = parsedSpec.techStack?.framework || "Modular service architecture";

  return `### Components
- ${architecture.components.join("\n- ")}

### Data flow
- ${architecture.dataFlow.join("\n- ")}

### Key decisions
- Keep FR to implementation traceability explicit by preserving story and TC identifiers.
- Use ${stackFramework} aligned with detected stack (${stackLabel}).
- Favor deterministic error paths over silent fallback behavior.

### Risks & mitigations
- Spec-to-code drift risk: enforce FR/US/TC traces in generated artifacts.
- Integration fragility risk: isolate external calls behind adapters with clear contracts.
- Scope drift risk: block changes not linked to approved FR/AC entries.

### Observability (logs/metrics/tracing)
- ${architecture.observability.join("\n- ")}

### Domain quality profile
- Domain: ${qualityProfile.label} (${qualityProfile.id})
- Stack constraint: ${qualityProfile.stackConstraint}
- Forbidden defaults: ${qualityProfile.forbiddenDefaults}`;
}

export function generateBacklogContent({
  feature,
  parsedSpec,
  rigor,
  qualityProfile
}) {
  const stories = buildUserStories(parsedSpec, qualityProfile);
  const epicGroups = stories.length <= 2
    ? [stories]
    : [stories.slice(0, Math.ceil(stories.length / 2)), stories.slice(Math.ceil(stories.length / 2))];

  const epicsMarkdown = epicGroups.map((group, index) => {
    const trace = unique(group.flatMap((story) => story.frIds)).join(", ");
    const outcome = inferEpicOutcome(group, index);
    return `- EP-${index + 1}: ${outcome}
  - Notes: Covers ${group.length} story slice(s) with explicit acceptance traces.
  - Trace: ${trace}`;
  }).join("\n");

  const storiesMarkdown = stories.map((story) => {
    const traceParts = [
      ...story.frIds,
      ...story.acIds
    ];
    return `### ${story.id}
- As a ${story.actor}, I want ${story.capability}, so that ${story.benefit}.
- Trace: ${traceParts.join(", ")}
- Acceptance Criteria:
${formatAcceptanceCriteria(story)}`;
  }).join("\n\n");

  return {
    stories,
    markdown: `# Backlog: ${feature}

> Generated by \`aitri plan\`.
> Spec-driven rule: every story MUST reference one or more Functional Rules (FR-*) and, when applicable, Acceptance Criteria (AC-*).
> Discovery rigor profile: ${rigor.mode}.
> Planning rule: ${rigor.backlogPolicy}
> Quality profile: ${qualityProfile.label} (${qualityProfile.id}).
> Domain constraint: ${qualityProfile.stackConstraint}
> Asset strategy: ${qualityProfile.assetStrategy}
> Story contract: ${qualityProfile.storyContract}

## Epics
${epicsMarkdown}

## User Stories

${storiesMarkdown}
`
  };
}

export function generateTestsContent({
  feature,
  parsedSpec,
  rigor,
  qualityProfile,
  stories
}) {
  const functionalCases = stories.map((story, index) => {
    const firstAc = story.acceptance[0] || {
      given: "the approved requirement exists",
      when: "the flow is executed",
      then: "the expected outcome is returned"
    };
    const trace = unique([...story.frIds, ...story.acIds]).join(", ");
    return `### TC-${index + 1}
- Title: Validate ${story.id.toLowerCase()} primary behavior.
- Trace: ${story.id}, ${trace}
- Steps:
  1) Given ${firstAc.given}
  2) When ${firstAc.when}
  3) Then ${firstAc.then}`;
  }).join("\n\n");

  let tcCursor = stories.length + 1;
  const negativeCases = parsedSpec.edgeCases.slice(0, 2).map((edgeCase) => {
    const primaryStory = stories[0];
    const primaryFr = primaryStory?.frIds?.[0] || "FR-1";
    const primaryUs = primaryStory?.id || "US-1";
    const title = normalizeLine(edgeCase).replace(/\.$/, "");
    const tc = `### TC-${tcCursor}
- Title: Handle edge behavior - ${title}.
- Trace: ${primaryUs}, ${primaryFr}
- Steps:
  1) Given ${title.toLowerCase()}
  2) When the relevant workflow is executed
  3) Then the system returns a deterministic failure-safe response`;
    tcCursor += 1;
    return tc;
  }).join("\n\n");

  const securityCases = parsedSpec.securityNotes.slice(0, 2).map((note) => {
    const primaryStory = stories[0];
    const primaryFr = primaryStory?.frIds?.[0] || "FR-1";
    const primaryUs = primaryStory?.id || "US-1";
    const title = normalizeLine(note).replace(/\.$/, "");
    const tc = `### TC-${tcCursor}
- Title: Enforce security control - ${title}.
- Trace: ${primaryUs}, ${primaryFr}
- Steps:
  1) Given threat scenario: ${title.toLowerCase()}
  2) When an invalid or abusive action is attempted
  3) Then access is blocked and evidence is logged`;
    tcCursor += 1;
    return tc;
  }).join("\n\n");

  let uiFlowsCases = "";
  if (parsedSpec.uiStructure?.hasUiSection && parsedSpec.uiStructure.flows.length > 0) {
    const primaryStory = stories[0];
    const primaryFr = primaryStory?.frIds?.[0] || "FR-1";
    const primaryUs = primaryStory?.id || "US-1";
    uiFlowsCases = parsedSpec.uiStructure.flows.map((flow) => {
      const tc = `### TC-${tcCursor}
- Title: Validate UI flow - ${flow.from} to ${flow.to}.
- Trace: ${primaryUs}, ${primaryFr}
- Steps:
  1) Given user is on the ${flow.from} screen
  2) When user completes the ${flow.from} action
  3) Then user is navigated to the ${flow.to} screen`;
      tcCursor += 1;
      return tc;
    }).join("\n\n");
  }

  const uiFlowsSection = uiFlowsCases
    ? `\n\n## UI Flows\n\n${uiFlowsCases}`
    : "";

  return `# Test Cases: ${feature}

> Generated by \`aitri plan\`.
> Spec-driven rule: every test MUST trace to a User Story (US-*) and one or more Functional Rules (FR-*). Include AC-* when applicable.
> Discovery rigor profile: ${rigor.mode}.
> QA rule: ${rigor.qaPolicy}
> Quality profile: ${qualityProfile.label} (${qualityProfile.id}).

## Functional

${functionalCases}

## Negative / Abuse

${negativeCases || "### TC-" + tcCursor + "\n- Title: Negative coverage pending explicit edge-case input.\n- Trace: US-1, FR-1\n- Steps:\n  1) Given an invalid input condition\n  2) When the workflow executes\n  3) Then the action is rejected with clear error details"}

## Security

${securityCases || "### TC-" + (tcCursor + 1) + "\n- Title: Security control validation baseline.\n- Trace: US-1, FR-1\n- Steps:\n  1) Given an abuse attempt\n  2) When the control is evaluated\n  3) Then the attempt is blocked and logged"}${uiFlowsSection}

## Edge Cases

${parsedSpec.edgeCases.slice(0, 2).map((edgeCase, index) => `${index + 1}. ${normalizeLine(edgeCase)}`).join("\n") || "1. Edge behavior not specified."}
`;
}

export function generatePlanArtifacts({
  feature,
  parsedSpec,
  rigor,
  qualityProfile,
  agentContent = null
}) {
  // EVO-001: Auditor Mode — if agent has provided pre-generated artifacts, audit and merge them.
  // LEGACY PATH: when agentContent is null, falls back to heuristic inference functions
  // (inferBenefit, inferCapability, normalizeActor, toGherkin, fallbackActor).
  // These are deprecated — the preferred path is to supply agentContent from an LLM agent.
  if (agentContent) {
    return auditAndMergeAgentContent({ feature, parsedSpec, rigor, qualityProfile, agentContent });
  }

  const backlog = generateBacklogContent({
    feature,
    parsedSpec,
    rigor,
    qualityProfile
  });
  const tests = generateTestsContent({
    feature,
    parsedSpec,
    rigor,
    qualityProfile,
    stories: backlog.stories
  });
  const architecture = generateArchitectureSection({
    feature,
    parsedSpec,
    qualityProfile
  });

  return {
    backlog: backlog.markdown,
    tests,
    architecture,
    stories: backlog.stories
  };
}

/**
 * Internal: run audit and return plan artifacts, mixing agent content with
 * generated architecture when agent doesn't provide it.
 */
function auditAndMergeAgentContent({ feature, parsedSpec, rigor, qualityProfile, agentContent }) {
  const audit = auditAgentContent({ parsedSpec, agentContent });

  // Architecture: use agent's if provided, else generate
  const architecture = (agentContent.architecture && agentContent.architecture.trim())
    ? agentContent.architecture
    : generateArchitectureSection({ feature, parsedSpec, qualityProfile });

  return {
    backlog: agentContent.backlog || "",
    tests: agentContent.tests || "",
    architecture,
    stories: audit.stories,
    audit
  };
}
