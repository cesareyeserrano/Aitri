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
