/**
 * Module: Phase 1 semantic checks — shared constants and helpers.
 *
 * Single source of truth for the vagueness / duplicate-AC rules introduced in
 * v0.1.82. Consumed by:
 *   - lib/phases/phase1.js::validate()             — throws on first violation
 *   - lib/upgrade/migrations/from-0.1.65.js        — reports VALIDATOR-GAP findings
 *
 * Both consumers must agree on the exact regex set. Before v2.0.0 these
 * constants were duplicated in from-0.1.65.js with a `MIRROR` comment as the
 * only coupling mechanism — a drift-prone design. This module removes the
 * duplication; `from-0.1.65.js` and `phase1.js` both import the same values.
 *
 * When changing a rule:
 *   1. Edit the constant here.
 *   2. Run `npm run test:all` — phase1 tests + upgrade VALIDATOR-GAP tests
 *      both exercise the rules; one failing set tells you which consumer
 *      broke.
 *   3. Consider whether the change is retroactive: existing projects might
 *      fail the new rule. If yes, the upgrade protocol's VALIDATOR-GAP
 *      finding will report it on next `adopt --upgrade` — no code change
 *      needed on the upgrade side because it already consumes from here.
 */

/**
 * Qualitative vagueness regex — domain-specific qualifiers that MUST FRs with
 * type `ux` / `visual` / `audio` must offset with an observable metric.
 * Narrower than BROAD_VAGUE because qualitative domains legitimately use some
 * abstract words ("smooth animation") but still need a measurable anchor.
 */
export const VAGUE = /\b(good|nice|beautiful|pretty|clean|fast|smooth|responsive|immersive|modern|intuitive|elegant|polished)\b/i;

/**
 * Broad vagueness regex — fires for ALL MUST FR types, both English and
 * Spanish (Aitri supports bilingual projects). Catches "correctly",
 * "efficiently", "seguramente", etc. — words that assert quality without
 * naming a concrete behavior.
 */
export const BROAD_VAGUE = /\b(good|nice|beautiful|pretty|clean|fast|smooth|properly|correctly|efficiently|reliably|appropriately|securely|safely|effectively|adequately|seamlessly|correctamente|adecuadamente|apropiadamente|eficientemente|confiablemente|seguramente|efectivamente|debidamente|bonito|suave|limpio)\b/i;

/**
 * Observable-metric regex — counts as "specific" any AC that contains a
 * number, a unit, or a threshold keyword.
 */
export const HAS_METRIC = /\d|px|ms|%|fps|kb|mb|ratio|:\d|viewport|breakpoint/i;

/**
 * Title-stopword regex — tokens stripped from an FR title before counting
 * "substantive" words. Bilingual (EN + ES) to match BROAD_VAGUE's coverage.
 */
export const TITLE_STOP = /^(the|a|an|la|el|los|las|un|una|de|del|must|should|be|to|is|are|y|o|and|or|in|on|it|this|that|all|debe|se|que|por|para|con|sin|es|app|sistema|system|makes|make|can|will|that|for|of)$/i;

/**
 * Normalize an acceptance_criterion for Jaccard-similarity comparison:
 * lowercase, punctuation stripped (preserving Spanish accented letters),
 * whitespace collapsed.
 */
export const normalizeAC = ac =>
  String(ac).toLowerCase().replace(/[^\w\sáéíóúñ]/gi, ' ').replace(/\s+/g, ' ').trim();

/**
 * Tier-A seed-input vocabulary — the ground-truth fields a producing agent
 * cannot reliably infer and whose error propagates silently down the whole
 * artifact chain (garbage-in at the seed). These are exactly the five IDEA.md
 * Pre-flight criteria in templates/phases/requirements.md, promoted from soft
 * briefing text into a mechanical contract.
 *
 * Used by:
 *   - lib/phases/phase1.js::validate()   — the provenance gate (fresh seed only)
 *   - templates/phases/requirements.md   — instructs the agent to emit them
 *   - test/phases/phase1.test.js         — gate coverage
 *
 * Provenance contract: 01_REQUIREMENTS.json may carry an optional
 * `idea_provenance` object keyed by these fields, each value "confirmed"
 * (the human stated or approved it) or "assumed" (the agent inferred it).
 * On a fresh seed (Phase 1 not yet approved) the gate requires the object and
 * blocks any "assumed" critical field that is not carried in
 * project_summary.idea_gaps — turning silent inference into a loud, tracked gap.
 * Aitri cannot verify provenance of free text; the gate makes the agent's
 * path of least resistance "ask & confirm" and makes omission auditable.
 */
export const IDEA_PROVENANCE_FIELDS = ['problem', 'users', 'baseline', 'success_metric', 'no_go_zone'];

/** Valid provenance values for each Tier-A field. */
export const PROVENANCE_VALUES = ['confirmed', 'assumed'];

/**
 * Canonical FR/NFR priority vocabulary (REQ-RICHNESS-0711 addendum, rc.174).
 * `priority` is the join key the whole MUST-gate family filters on — the
 * type/metric/vagueness/US-AC checks in phase1, the 3× TC floor at Phase 3,
 * the compliance proof at Phase 5. Every consumer compares with exact-match
 * (`priority === 'MUST'`), so an off-vocabulary value ("must", "Must", a typo)
 * silently exempted the requirement from every MUST gate while looking
 * prioritized. phase1.validate() enforces membership at the entry gate so
 * downstream filters can trust the key. (The template teaches this enum at
 * the FR schema literal; this constant makes it mechanical.)
 */
export const PRIORITIES = ['MUST', 'SHOULD', 'NICE'];

/**
 * Textual content of an acceptance criterion in any accepted form — plain
 * string, { id, text }, { id, description } (the legacy join forms the
 * integrations contract still accepts — ARTIFACTS.md "Structured AC ids"), or
 * { id, given, when, then } (REQ-RICHNESS-0711 addendum, rc.174). The presence
 * gates key on this so a content-free element ('', '   ', {}, null) cannot
 * satisfy them: presence means "at least one criterion with actual content",
 * never a particular form (the ADR-061 line — form stays ungated). NOTE:
 * normalizeAC() above is NOT suitable here — it String()-coerces, so `{}`
 * becomes "object object" (non-empty) and would false-pass. Shared here so
 * both validate() consumers read one definition.
 */
export const acContent = ac =>
  typeof ac === 'string' ? ac.trim()
  : (ac && typeof ac === 'object')
    ? [ac.text, ac.description, ac.given, ac.when, ac.then].filter(v => typeof v === 'string').join(' ').trim()
    : '';

/** ≥1 acceptance criterion with actual content, in any accepted form. */
export const hasContentfulAC = list =>
  Array.isArray(list) && list.some(ac => acContent(ac).length > 0);
