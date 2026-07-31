/**
 * Module: Build-plan reader (PLAN-ARTIFACT-0715 S2)
 * Purpose: Tolerant, ADVISORY parser for BUILD_PLAN.md — epic ids, statuses, and id
 *          references, for display (the status epic-progress line) and Hub visibility (status --json).
 *
 * BUILD_PLAN.md stays a WORKING FILE, not a contract (ARTIFACTS.md working-files class):
 * nothing gates on this parse, so the correct failure posture is degrade-to-null —
 * a malformed, legacy, or absent plan simply yields no epic display. (A GATING reader
 * would need the refuse posture instead — do not repurpose this parser for a gate.)
 * Dependencies: none (pure).
 */

/**
 * Parse epics out of a BUILD_PLAN.md working file.
 *
 * Accepts the rc.2+ skeleton (`## EP-01 — Name   [status: done]`) and the rc.170 legacy
 * heading (`## Epic 1 — Name [status: …]`) so in-flight plans still display. Extracts
 * per epic: id, title, status (pending|in-progress|done; unknown tokens tolerated as-is),
 * and the Delivers / Makes pass id lists (display + derivation aids — NOT trusted keys).
 *
 * @param {string} content - BUILD_PLAN.md content
 * @returns {{epics: Array<{id: string, title: string, status: string, delivers: string[], makes_pass: string[]}>}|null}
 *          null when nothing parseable (absent/legacy-free-form/malformed) — never throws.
 */
export function parseBuildPlan(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  // Line-by-line, linear time (adversarial finding: a single combined regex with a lazy
  // title + optional trailing group backtracked catastrophically on padded headings —
  // hanging every status/resume/validate call). Fenced code blocks are skipped so a plan
  // quoting a concrete `## EP-01` example does not parse phantom epics.
  const epics = [];
  let current = null;
  let inFence = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = line.match(/^##\s+(EP-\d+|Epic\s+\d+)\s*(?:—|-|:)\s*(.*)$/i);
    if (h) {
      let rest = h[2].trimEnd();
      let status = 'pending';
      const s = rest.match(/\[status:\s*([^\]]*)\]\s*$/i);
      if (s) { status = (s[1].trim() || 'pending').toLowerCase(); rest = rest.slice(0, s.index).trimEnd(); }
      current = {
        id: h[1].replace(/\s+/g, ' ').trim(),
        title: rest.trim(),
        status,
        delivers: [],
        makes_pass: [],
      };
      epics.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s*(Delivers|Makes pass):\s*(.+)$/i);
    if (field) {
      const ids = field[2].match(/\b(?:US|FR|TC|NFR)-[\w.]+/g) || [];
      if (/^delivers$/i.test(field[1])) current.delivers = ids;
      else current.makes_pass = ids;
    }
  }
  return epics.length ? { epics } : null;
}

/**
 * One-line progress summary for display: "2/5 epics done · in progress: EP-03 — Reports".
 * @param {{epics: Array}} plan - parseBuildPlan() output (non-null)
 * @returns {string}
 */
export function summarizeEpicProgress(plan) {
  const done = plan.epics.filter(e => e.status === 'done').length;
  const current = plan.epics.find(e => e.status === 'in-progress' || e.status === 'in_progress');
  const next = plan.epics.find(e => e.status === 'pending');
  const tail = current
    ? ` · in progress: ${current.id} — ${current.title}`
    : (next ? ` · next: ${next.id} — ${next.title}` : '');
  return `${done}/${plan.epics.length} epic(s) done${tail}`;
}
