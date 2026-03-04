// cli/lib/draft-utils.js
// EVO-047: Extracted from cli/commands/draft.js to stay within file-size budget

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
