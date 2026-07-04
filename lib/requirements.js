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

// Single source of truth for "do these requirements force the UX phase before Architecture?".
// The FR-type list (ux/visual/audio) is the divergence-prone bit (UPLAN-0703 D4): approve.js
// (the `approve requirements` next-action) and snapshot.js (the status/resume ladder) both read
// it. snapshot.js's own comment said "Mirror the exact detection approve.js uses" — and one
// divergence was already caught (ADV-0622-29), where approve steered to `run-phase ux` while a
// later `status` pointed straight at Architecture (the architect would then design without the
// UX spec). One definition here, imported by both — they can no longer disagree on what counts.
//   Type-guarded: a hand-authored non-string `fr.type` (number/array/object) degrades to "not a
//   UX type" instead of throwing — both former copies used `fr.type?.toLowerCase()`, which throws
//   on a numeric type; the throw was swallowed by each call site's try/catch (→ uxRequired false).
//   For an all-malformed FR set the outcome is unchanged (false). The one reachable difference is a
//   MIXED set (a non-string type sitting before a valid ux/visual/audio FR): the old `.some` could
//   throw before reaching the real UX FR and steer false; this never loses that steer (it moves
//   false→true toward the correct answer — a real UX FR SHOULD force the UX phase). Never true→false.
export const UX_REQUIRING_FR_TYPES = new Set(['ux', 'visual', 'audio']);
export function hasUxRequiringFr(reqs) {
  return (reqs?.functional_requirements || [])
    .some(fr => UX_REQUIRING_FR_TYPES.has(typeof fr?.type === 'string' ? fr.type.toLowerCase() : ''));
}
