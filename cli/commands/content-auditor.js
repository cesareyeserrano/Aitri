/**
 * EVO-001: Auditor Mode — content audit functions.
 *
 * Validates agent-provided backlog and test content against the parsed spec.
 * The CLI becomes a validator, not an author: agents write, aitri audits.
 *
 * agentContent shape: { backlog: string, tests: string, architecture: string }
 */

/**
 * Extract User Stories from agent-provided backlog markdown.
 * Returns [{ id, traces }] where traces are FR-* and AC-* IDs.
 */
function extractAgentStories(backlogMarkdown) {
  const stories = [];
  const chunks = (backlogMarkdown || "").split(/(?=###\s+US-\d+)/i);
  for (const chunk of chunks) {
    const idMatch = chunk.match(/###\s+(US-\d+)/i);
    if (!idMatch) continue;
    const id = idMatch[1].toUpperCase();
    const traceMatch = chunk.match(/Trace:\s*([^\n]+)/i);
    const traces = traceMatch
      ? traceMatch[1].split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
      : [];
    stories.push({ id, traces });
  }
  return stories;
}

/**
 * Extract Test Cases from agent-provided tests markdown.
 * Returns [{ id, traces }] where traces are US-*, FR-*, AC-* IDs.
 */
function extractAgentTestCases(testsMarkdown) {
  const cases = [];
  const chunks = (testsMarkdown || "").split(/(?=###\s+TC-\d+)/i);
  for (const chunk of chunks) {
    const idMatch = chunk.match(/###\s+(TC-\d+)/i);
    if (!idMatch) continue;
    const id = idMatch[1].toUpperCase();
    const traceMatch = chunk.match(/Trace:\s*([^\n]+)/i);
    const traces = traceMatch
      ? traceMatch[1].split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
      : [];
    cases.push({ id, traces });
  }
  return cases;
}

/**
 * Audit agent-provided backlog markdown against the parsed spec.
 * Returns { ok, stories, issues }
 */
export function auditBacklog(agentBacklog, parsedSpec) {
  const frIds = new Set((parsedSpec.functionalRules || []).map(r => r.id.toUpperCase()));
  const acIds = new Set((parsedSpec.acceptanceCriteria || []).map(a => a.id.toUpperCase()));
  const stories = extractAgentStories(agentBacklog);
  const issues = [];

  if (stories.length === 0) {
    issues.push("No User Stories (### US-N) found in agent backlog.");
    return { ok: false, stories, issues };
  }

  for (const story of stories) {
    const frRefs = story.traces.filter(t => t.startsWith("FR-"));
    const acRefs = story.traces.filter(t => t.startsWith("AC-"));

    if (frRefs.length === 0) {
      issues.push(`${story.id}: missing Trace — must reference at least one FR-*.`);
    }
    for (const frId of frRefs) {
      if (!frIds.has(frId)) {
        issues.push(`${story.id}: references ${frId} which does not exist in spec FRs (${[...frIds].join(", ")}).`);
      }
    }
    for (const acId of acRefs) {
      if (!acIds.has(acId)) {
        issues.push(`${story.id}: references ${acId} which does not exist in spec ACs.`);
      }
    }
  }

  return { ok: issues.length === 0, stories, issues };
}

/**
 * Audit agent-provided tests markdown against spec and audited stories.
 * Returns { ok, testCases, issues }
 */
export function auditTests(agentTests, parsedSpec, auditedStories) {
  const frIds = new Set((parsedSpec.functionalRules || []).map(r => r.id.toUpperCase()));
  const storyIds = new Set(auditedStories.map(s => s.id));
  const testCases = extractAgentTestCases(agentTests);
  const issues = [];

  if (testCases.length === 0) {
    issues.push("No Test Cases (### TC-N) found in agent tests.");
    return { ok: false, testCases, issues };
  }

  for (const tc of testCases) {
    const usRefs = tc.traces.filter(t => t.startsWith("US-"));
    const frRefs = tc.traces.filter(t => t.startsWith("FR-"));

    if (usRefs.length === 0 && frRefs.length === 0) {
      issues.push(`${tc.id}: missing Trace — must reference at least one US-* or FR-*.`);
    }
    for (const usId of usRefs) {
      if (!storyIds.has(usId)) {
        issues.push(`${tc.id}: references ${usId} which does not exist in agent backlog.`);
      }
    }
    for (const frId of frRefs) {
      if (!frIds.has(frId)) {
        issues.push(`${tc.id}: references ${frId} which does not exist in spec FRs.`);
      }
    }
  }

  return { ok: issues.length === 0, testCases, issues };
}

/**
 * Full audit of agent-provided content (backlog + tests + architecture).
 * Returns { ok, issues, backlogAudit, testsAudit, stories }
 *
 * This is the main public entry point for Auditor Mode.
 */
export function auditAgentContent({ parsedSpec, agentContent }) {
  const backlogAudit = auditBacklog(agentContent.backlog || "", parsedSpec);
  const testsAudit = auditTests(agentContent.tests || "", parsedSpec, backlogAudit.stories);

  const allIssues = [
    ...backlogAudit.issues.map(i => `[backlog] ${i}`),
    ...testsAudit.issues.map(i => `[tests] ${i}`)
  ];

  return {
    ok: backlogAudit.ok && testsAudit.ok,
    issues: allIssues,
    backlogAudit,
    testsAudit,
    stories: backlogAudit.stories
  };
}
