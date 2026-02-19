export function normalizeFeatureName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : "";
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSection(content, heading) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n##\\s+\\d+\\.|$)`, "i");
  const match = String(content || "").match(pattern);
  return match ? match[1] : "";
}

export function extractSubsection(content, heading) {
  const pattern = new RegExp(`${escapeRegExp(heading)}([\\s\\S]*?)(?=\\n###\\s+|$)`, "i");
  const match = String(content || "").match(pattern);
  return match ? match[1] : "";
}

export function normalizeLine(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts spec sections from a detailed idea string.
 * Returns pre-filled content for sections where confidence is high,
 * and [CLARIFY: ...] hints for genuinely unknown things.
 */
export function smartExtractSpec(idea) {
  const text = String(idea || "");
  const sentences = text.split(/(?<=[.!?])\s+|(?:\n)+/).map(s => s.trim()).filter(Boolean);

  const frs = [];
  const nfrs = [];
  const securityHints = [];
  const actors = new Set();

  // HTTP endpoint patterns → FRs
  const httpPattern = /\b(POST|GET|PUT|DELETE|PATCH)\s+(\/\S+)/gi;
  for (const m of text.matchAll(httpPattern)) {
    const context = sentences.find(s => s.includes(m[0])) || m[0];
    frs.push(context.trim());
  }

  // Action verb patterns → FRs (if no HTTP patterns found)
  if (frs.length === 0) {
    const actionVerbs = /\b(creates?|reads?|updates?|deletes?|lists?|fetches?|sends?|submits?|calculates?|generates?|validates?|authenticates?|returns?|stores?|tracks?|manages?)\b/i;
    for (const s of sentences) {
      if (actionVerbs.test(s) && s.length > 10 && s.length < 200) {
        frs.push(s);
      }
    }
  }

  // NFR patterns
  const nfrPattern = /\b(no external|zero.?dep|without.*(?:lib|framework|package)|uses?\s+node:|uses?\s+native|in.?memory|stateless|no database)\b/i;
  for (const s of sentences) {
    if (nfrPattern.test(s)) nfrs.push(s);
  }

  // Actor patterns
  const actorPattern = /\b(user|admin|administrator|client|operator|manager|customer|developer|agent|viewer|editor)\b/gi;
  for (const m of text.matchAll(actorPattern)) {
    const a = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    actors.add(a);
  }

  // Security hints
  const secPattern = /\b(auth(?:entication|orization)?|encrypt|token|session|csrf|xss|sql.?injection|rate.?limit|input.?valid|sanitiz)\b/i;
  for (const s of sentences) {
    if (secPattern.test(s)) securityHints.push(s);
  }

  const confidence = frs.length >= 3 ? "high" : frs.length >= 1 ? "medium" : "low";

  return {
    confidence,
    frs: frs.length > 0
      ? frs.map((fr, i) => `- FR-${i + 1}: ${fr}`).join("\n")
      : null,
    nfrs: nfrs.length > 0
      ? nfrs.map(n => `- ${n}`).join("\n")
      : null,
    actors: actors.size > 0
      ? [...actors].map(a => `- ${a}`).join("\n")
      : null,
    security: securityHints.length > 0
      ? securityHints.map(s => `- ${s}`).join("\n")
      : null
  };
}

export function resolveFeature(options, getStatusReportOrExit) {
  const rawFeature = String(options.feature || options.positional[0] || "").trim();
  const fromArgs = normalizeFeatureName(rawFeature);
  if (rawFeature && !fromArgs) {
    throw new Error("Invalid feature name. Use kebab-case (example: user-login).");
  }
  if (fromArgs) return fromArgs;
  const report = getStatusReportOrExit();
  if (report.selection?.issue) {
    throw new Error(report.selection.message || "Feature context is required.");
  }
  if (report.approvedSpec?.feature) return report.approvedSpec.feature;
  throw new Error("Feature name is required. Use --feature <name> or ensure an approved spec exists.");
}
