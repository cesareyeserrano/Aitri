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
export function isMustRequirement(r) {
  return r?.priority === 'MUST' || r?.category === 'Regression';
}
