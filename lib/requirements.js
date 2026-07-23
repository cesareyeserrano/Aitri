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

// Single source of truth for the security-NFR predicates (SEC-THREADING-0722). Three gates
// and two nudges key on the same two questions — "did this project declare a security
// posture?" and "is any of it an active promise (vs an explicit exclusion)?" — so the
// classification must live in ONE place: the phase-1 decision gate, the phase-2
// Security-Design body gate, the verify security-gate nudge, and audit.js's
// buildSecurityNfrSummary (which feeds the resume nudge and the audit-security briefing)
// all import from here. Divergence here is the exact drift class this module exists to
// prevent (see hasUxRequiringFr above).
//
// Exclusion idiom: an NFR whose `requirement` (or legacy `title`) OPENS with
// "Not applicable" / "N/A" / "Does not apply" / "No aplica" is an explicit exclusion
// decision — a recorded "security does not apply here", not a promise to protect.
// ("no aplica" is intentional non-English: Spanish-authored requirement sets are a
// supported input — same precedent as the bilingual vague-title gates.)
// The phrase must be terminated — ":", ".", ";", end-of-text, or a dash PRECEDED BY
// WHITESPACE ("Not applicable — offline tool") — so that a real promise that merely
// STARTS with those letters is never silently classified as an exclusion. A comma and
// an unspaced hyphen are deliberately NOT terminators (rc.7 adversarial finding):
// "Not applicable, except the login form which must validate all input" is an
// exclusion-with-exception — i.e. a PROMISE — and "NA-region access control must…" /
// "Not-applicable-fields must be encrypted" are promises that only look like the idiom.
// All of those classify ACTIVE. Mis-exclusion silently disables blocking gates (the bad
// direction); mis-active costs one teaching rephrase (the safe one).
// Leading markdown decoration (quotes, bullets, emphasis) is stripped before matching.
export const SECURITY_EXCLUSION_RE =
  /^(?:not[\s-]*applicable|n\/?a|does\s+not\s+apply|no\s+aplica)(?:\s*[:.;]|\s+[—–-]|\s*$)/i;

export function securityNfrText(n) {
  const raw = n?.requirement ?? n?.title ?? '';
  return typeof raw === 'string' ? raw : String(raw);
}

export function isSecurityExclusion(n) {
  const text = securityNfrText(n).replace(/^[\s>*_•-]+/, '');
  return SECURITY_EXCLUSION_RE.test(text);
}

// All NFRs that carry the security category — the "posture was decided" set
// (an explicit exclusion still counts as a decision).
export function securityNfrs(reqs) {
  return (reqs?.non_functional_requirements || [])
    .filter(n => typeof n?.category === 'string' && /security/i.test(n.category));
}

// The declared security PROMISES — security-category NFRs minus explicit exclusions.
// Non-empty ⇒ the project owes a real security design (phase 2), a mechanical re-check
// (verify nudge), and eventually an adversarial audit (resume nudge).
export function activeSecurityNfrs(reqs) {
  return securityNfrs(reqs).filter(n => !isSecurityExclusion(n));
}

// Security-typed FRs force the posture decision even in a feature sub-pipeline
// (a feature adding an auth endpoint must not inherit "not applicable" silently).
export function hasSecurityFr(reqs) {
  return (reqs?.functional_requirements || [])
    .some(fr => typeof fr?.type === 'string' && /security/i.test(fr.type));
}
