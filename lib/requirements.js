// Single source of truth for "does this requirement count as a hard-block MUST?".
//
// A requirement is MUST when it is explicitly priority:"MUST", OR when it is a
// regression NFR (category:"Regression"). A Must-Not-Break commitment is a MUST by
// definition, so it is enforced even when the agent omits priority — REG-GATE-0621:
// the canonical NFR schema (templates/phases/requirements.md) historically omitted
// `priority`, so a regression NFR written per that schema got priority:undefined and
// silently escaped every MUST gate (forced-TC at Phase 3, traceability at Phase 5,
// the deploy advisory) while still looking documented and rigorous. The category arm
// makes `category:"Regression"` mechanically load-bearing — it was decorative before.
//
// FRs have no `category` field, so the category arm never changes FR behavior.
// Match `category` case/whitespace-insensitively: an agent typo like "regression" or
// "Regression " must not let a Must-Not-Break NFR silently escape the MUST gates (ADV-0622-06).
export function isMustRequirement(r) {
  // Guard the type: a hand-authored non-string `category` (array/number/object) must degrade
  // to "not a regression", not throw — the strict-equality original never crashed, and
  // verify-complete has no try/catch around this filter (ADV-0622-06 follow-up).
  const cat = typeof r?.category === 'string' ? r.category.trim().toLowerCase() : '';
  return r?.priority === 'MUST' || cat === 'regression';
}

// Single source of truth for the claim-vs-evidence rule, shared by the Phase-5 deploy gate
// (phase5.js validate) AND the `aitri export traceability` renderer (export.js). They MUST agree:
// the gate REJECTS a high compliance claim not backed by test evidence, so the rendered matrix has
// to FLAG that same claim, not print it as authoritative QA truth. AUDIT-0629-E: export kept its own
// copy that also accepted "manual", so it rendered a clean "complete" over an FR the gate rejects.
// One definition here, imported by both — they can no longer drift.
//   A compliance entry whose level is in HIGH_COMPLIANCE_LEVELS is evidence-backed only when its
//   FR's fr_coverage status is in EVIDENCE_OK_STATUSES. A verified manual TC is recorded pass →
//   status "covered"; a pending "manual" is NOT acceptable evidence.
export const HIGH_COMPLIANCE_LEVELS = new Set(['complete', 'production_ready']);
export const EVIDENCE_OK_STATUSES   = new Set(['covered']);
