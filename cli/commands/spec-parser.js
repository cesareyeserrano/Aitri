import { escapeRegExp, extractSection, normalizeLine } from "../lib.js";

function extractFirstSection(content, headings) {
  for (const heading of headings) {
    const section = extractSection(content, heading).trim();
    if (section) return section;
  }
  return "";
}

function compactList(lines, fallback = "Not specified in spec.", maxItems = 12) {
  const items = lines
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .filter((line) => !/^#+\s+/.test(line))
    .filter((line) => !/^[-*]\s*$/.test(line))
    .slice(0, maxItems);
  return items.length > 0 ? items : [fallback];
}

function extractBullets(sectionText) {
  const lines = String(sectionText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line));
  if (lines.length > 0) {
    return lines.map((line) => line.replace(/^[-*]\s+/, "").trim());
  }
  return String(sectionText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#+\s+/.test(line));
}

function extractTaggedItems(content, tagPrefix) {
  const lines = String(content || "").split("\n");
  const items = [];
  const headerRe = new RegExp(`^\\s*[-*]\\s*(${tagPrefix}-\\d+)\\s*:\\s*(.+)$`, "i");
  let i = 0;
  let itemIndex = 1;
  while (i < lines.length) {
    const hm = headerRe.exec(lines[i]);
    if (hm) {
      const id = hm[1].trim();
      const mainText = normalizeLine(hm[2]);
      const subTexts = [];
      let j = i + 1;
      while (j < lines.length) {
        const line = lines[j];
        if (line.trim() === "") break;
        if (/^[ \t]{2,}/.test(line)) {
          const trimmed = line.replace(/^[ \t]+[-*]?\s*/, "").trim();
          if (trimmed) subTexts.push(normalizeLine(trimmed));
          j++;
        } else {
          break;
        }
      }
      const fullText = subTexts.length > 0
        ? `${mainText} ${subTexts.join(" ")}`
        : mainText;
      items.push({ id, text: normalizeLine(fullText), index: itemIndex++ });
      i = j;
    } else {
      i++;
    }
  }
  return items;
}

function parseGherkinFromText(value) {
  const text = normalizeLine(value);
  const gherkin = text.match(/\bGiven\b\s+(.+?),\s*\bwhen\b\s+(.+?),\s*\bthen\b\s+(.+?)(?:[.;]|$)/i);
  if (gherkin) {
    return {
      given: normalizeLine(gherkin[1]),
      when: normalizeLine(gherkin[2]),
      then: normalizeLine(gherkin[3]),
      explicit: true
    };
  }

  const lower = text.toLowerCase();
  const whenPos = lower.indexOf(" when ");
  const thenPos = lower.indexOf(" then ");
  if (whenPos !== -1 && thenPos !== -1 && whenPos < thenPos) {
    return {
      given: normalizeLine(text.slice(0, whenPos).replace(/^given\s+/i, "")),
      when: normalizeLine(text.slice(whenPos + 6, thenPos)),
      then: normalizeLine(text.slice(thenPos + 6)),
      explicit: false
    };
  }
  return null;
}

function extractUiScreens(sectionText) {
  const screens = [];
  const screenPattern = /^Screen:\s*(.+)$/gim;
  let match;
  while ((match = screenPattern.exec(sectionText)) !== null) {
    const name = match[1].trim();
    const afterMatch = sectionText.slice(match.index + match[0].length);
    const nextScreen = afterMatch.search(/^Screen:\s/m);
    const rawBlock = nextScreen !== -1 ? afterMatch.slice(0, nextScreen) : afterMatch;
    const boundary = rawBlock.search(/^(Flow:|###\s|[-*]\s*UI-REF-)/m);
    const block = boundary !== -1 ? rawBlock.slice(0, boundary) : rawBlock;
    const components = [...block.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
    screens.push({ name, components, raw: block.trim() });
  }
  return screens;
}

function extractUiFlows(sectionText) {
  const flows = [];
  const flowPattern = /^Flow:\s*(.+?)\s*→\s*(.+)$/gim;
  let match;
  while ((match = flowPattern.exec(sectionText)) !== null) {
    flows.push({ from: match[1].trim(), to: match[2].trim() });
  }
  return flows;
}

function extractUiRefs(sectionText) {
  const refs = [];
  const refPattern = /^[-*]\s*(UI-REF-\d+)\s*:\s*([^→\n]+?)\s*→\s*([^\n]+)$/gim;
  let match;
  while ((match = refPattern.exec(sectionText)) !== null) {
    const id = match[1].trim();
    const refPath = match[2].trim();
    const acIds = [...match[3].matchAll(/AC-\d+/g)].map((m) => m[0]);
    refs.push({ id, path: refPath, acIds });
  }
  return refs;
}

function detectTechStack(specContent) {
  // Prefer explicit Tech Stack field when present (e.g. "Tech Stack: Node.js + React")
  const explicitMatch = String(specContent || "").match(/^Tech Stack:\s*(.+)$/im);
  if (explicitMatch) {
    const declared = explicitMatch[1].trim().toLowerCase();
    if (/python|fastapi|django|flask/.test(declared)) {
      return { id: "python", label: "Python", framework: "Python service", testFramework: "pytest", confidence: "explicit" };
    }
    if (/golang|\bgo\b/.test(declared)) {
      return { id: "go", label: "Go", framework: "Go service", testFramework: "go test", confidence: "explicit" };
    }
    if (/react|next\.?js|frontend|web/.test(declared)) {
      return { id: "node-web", label: "Node.js + Web", framework: "Node.js service + web UI", testFramework: "node:test", confidence: "explicit" };
    }
    if (/node|cli|terminal/.test(declared)) {
      return { id: "node-cli", label: "Node.js CLI", framework: "Node.js CLI modules", testFramework: "node:test", confidence: "explicit" };
    }
  }

  const text = String(specContent || "").toLowerCase();
  const checks = [
    {
      id: "node-web",
      label: "Node.js + Web",
      framework: "Node.js service + web UI",
      testFramework: "node:test",
      sourcePatterns: [/\breact\b/, /\bnext(\.js)?\b/, /\bfrontend\b/, /\bweb app\b/, /\bweb dashboard\b/]
    },
    {
      id: "node-cli",
      label: "Node.js CLI",
      framework: "Node.js CLI modules",
      testFramework: "node:test",
      sourcePatterns: [/\bnode\.?js\b/, /\bcommand line\b/, /\bterminal\b/, /\bcli\b/]
    },
    {
      id: "python",
      label: "Python",
      framework: "Python service",
      testFramework: "pytest",
      sourcePatterns: [/\bpython\b/, /\bfastapi\b/, /\bdjango\b/, /\bflask\b/]
    },
    {
      id: "go",
      label: "Go",
      framework: "Go service",
      testFramework: "go test",
      sourcePatterns: [/\bgolang\b/, /\bgo service\b/, /\bgo api\b/, /\bgo\b/]
    }
  ];

  const score = checks.map((candidate) => ({
    ...candidate,
    score: candidate.sourcePatterns.reduce((sum, pattern) => (pattern.test(text) ? sum + 1 : sum), 0)
  })).sort((a, b) => b.score - a.score);

  const selected = score[0];
  if (!selected || selected.score === 0) {
    return {
      id: "node-cli",
      label: "Node.js CLI",
      framework: "Node.js CLI modules",
      testFramework: "node:test",
      confidence: "fallback"
    };
  }

  return {
    id: selected.id,
    label: selected.label,
    framework: selected.framework,
    testFramework: selected.testFramework,
    confidence: selected.score >= 2 ? "high" : "medium"
  };
}

function extractFeatureFromSpec(specContent) {
  const header = String(specContent || "").match(/^#\s+AF-SPEC:\s*(.+)$/im);
  return header ? normalizeLine(header[1]) : "";
}

function keywordTokens(value) {
  return [...new Set(
    normalizeLine(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
  )];
}

function linkActorsToRules(actors, rules) {
  if (actors.length === 0 || rules.length === 0) return {};
  const linked = {};
  rules.forEach((rule) => {
    const ruleTokens = keywordTokens(rule.text);
    let bestActor = actors[rule.index % actors.length];
    let bestScore = -1;
    actors.forEach((actor) => {
      const actorTokens = keywordTokens(actor);
      const overlap = actorTokens.filter((token) => ruleTokens.includes(token)).length;
      if (overlap > bestScore) {
        bestActor = actor;
        bestScore = overlap;
      }
    });
    linked[rule.id] = bestActor;
  });
  return linked;
}

export function parseApprovedSpec(specContent, options = {}) {
  const contextSection = extractFirstSection(specContent, ["## 1. Context"]);
  const actorsSection = extractFirstSection(specContent, ["## 2. Actors", "## 2. Actor"]);
  const edgeCasesSection = extractFirstSection(specContent, ["## 4. Edge Cases"]);
  const securitySection = extractFirstSection(specContent, ["## 7. Security Considerations"]);
  const outOfScopeSection = extractFirstSection(specContent, ["## 8. Out of Scope"]);

  const actors = compactList(
    extractBullets(actorsSection),
    "Primary actor"
  );
  const functionalRules = extractTaggedItems(specContent, "FR");
  const acceptanceCriteria = extractTaggedItems(specContent, "AC").map((item) => ({
    ...item,
    gherkin: parseGherkinFromText(item.text)
  }));

  const edgeCases = compactList(
    extractBullets(edgeCasesSection),
    "Edge behavior not specified."
  );
  const securityNotes = compactList(
    extractBullets(securitySection),
    "Security controls not specified."
  );
  const outOfScope = compactList(
    extractBullets(outOfScopeSection),
    "Out-of-scope constraints not specified."
  );

  const uiSectionText = extractFirstSection(specContent, ["## 6. UI Structure"]);
  const hasUiSection = uiSectionText.length > 0;
  const uiStructure = {
    hasUiSection,
    screens: hasUiSection ? extractUiScreens(uiSectionText) : [],
    flows: hasUiSection ? extractUiFlows(uiSectionText) : [],
    refs: hasUiSection ? extractUiRefs(uiSectionText) : []
  };

  const featureFromSpec = extractFeatureFromSpec(specContent);
  const feature = String(options.feature || featureFromSpec || "feature").trim();
  const techStack = detectTechStack(specContent);
  const actorByRule = linkActorsToRules(actors, functionalRules);

  return {
    feature,
    context: compactList(
      String(contextSection || "").split("\n"),
      "Context not specified.",
      6
    ),
    actors,
    functionalRules,
    acceptanceCriteria,
    edgeCases,
    securityNotes,
    outOfScope,
    techStack,
    actorByRule,
    uiStructure
  };
}
