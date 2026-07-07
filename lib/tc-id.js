/**
 * Module: Canonical TC-id grammar — single source of truth.
 * Purpose: One definition of what a valid TC id looks like, shared by the
 *          verify-run output parser (`extractTCId`) and the Phase 3 authoring
 *          gate (`isCanonicalTCId`). They MUST agree: verify-run links a parsed
 *          runner-output id to a plan id by string equality (`detected.get(tc.id)`
 *          in lib/commands/verify.js), so any plan id the parser cannot round-trip
 *          is silently unlinkable and drops to "skip". Keeping the grammar in one
 *          place is what prevents the parser and the gate from drifting apart.
 */

/**
 * Extract and normalize a TC ID from a single line of test output.
 *
 * Supports single-segment (TC-001, TC-020b) and multi-segment namespace
 * (TC-FE-001h, TC-E2E-001h, TC-API-USER-010f) IDs. Namespace segments are
 * alphanumeric (letters required, digits permitted) — `E2E`, `V1`, `S3` are
 * valid segment shapes. Handles both hyphen and underscore separators —
 * pytest function names use underscores (test_TC_FE_001h_...), test titles
 * typically use hyphens (TC-FE-001h).
 *
 * Returns the canonical form: uppercase "TC" + uppercase hyphen-separated
 * namespace + digits + original-case suffix.
 *
 * @param {string} line
 * @returns {string|null}
 */
export function extractTCId(line) {
  // Canonical form: TC[-_](namespace-segs[-_])*digits[suffix]
  // Namespace segments require at least one letter so the regex distinguishes
  // namespace from the final numeric block. Pure numeric segments would be
  // ambiguous with `(\d+)` and collapse the parse.
  const m = line.match(
    /(?<![A-Za-z0-9])[Tt][Cc]((?:[-_][A-Za-z][A-Za-z0-9]*)*)[-_](\d+)([A-Za-z0-9]*)(?![A-Za-z0-9])/
  );
  if (!m) return null;
  const [, namespace, digits, suffix] = m;
  return `TC${namespace.replace(/_/g, '-').toUpperCase()}-${digits}${suffix}`;
}

/**
 * Extract ALL distinct canonical TC ids from a single line, in order of
 * appearance. Same grammar as `extractTCId` (which stays the crediting
 * parser — only the FIRST id in a line is ever credited). This exists so
 * verify-run can WARN when a test title carries more than one id: crediting
 * all of them would let one assertion set bless N TCs (e.g. a happy-path run
 * crediting a negative TC), so the extra ids deliberately drop to skip — but
 * they must drop loudly, not silently (VERIFY-TC-VISIBILITY-0706).
 *
 * @param {string} line
 * @returns {string[]} distinct canonical ids, [] when none
 */
export function extractAllTCIds(line) {
  const out = [];
  const re = /(?<![A-Za-z0-9])[Tt][Cc]((?:[-_][A-Za-z][A-Za-z0-9]*)*)[-_](\d+)([A-Za-z0-9]*)(?![A-Za-z0-9])/g;
  for (const m of line.matchAll(re)) {
    const [, namespace, digits, suffix] = m;
    const id = `TC${namespace.replace(/_/g, '-').toUpperCase()}-${digits}${suffix}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * True when `id` is already in canonical stored form — i.e. feeding it back
 * through the parser yields the exact same string. This is the precise set of
 * ids verify-run can link to runner output: a plan id that does not round-trip
 * (no numeric block like `TC-e2eFolderScan`, or a non-normalized namespace like
 * `TC-fe-001h` → `TC-FE-001h`) can never be matched and silently drops to skip.
 *
 * @param {unknown} id
 * @returns {boolean}
 */
export function isCanonicalTCId(id) {
  return typeof id === 'string' && extractTCId(id) === id;
}

/**
 * For a non-canonical id, return the deterministic canonical form when — and
 * only when — there is exactly ONE unambiguous reading. The single fixable shape
 * is a namespace of pure letters glued to a numeric block with an optional
 * single lowercase suffix (`TC-NFR010h` → `TC-NFR-010h`, `TC-S001` → `TC-S-001`):
 * the fix is to insert the missing separator before the digits.
 *
 * Anything else returns null on purpose — there is no safe single answer:
 *   - digit-bearing namespaces (`TC-E2E001h`) are genuinely ambiguous (is the
 *     namespace `E2E` or `E`?), which is the whole reason the separator exists;
 *   - digit-free / descriptive ids (`TC-e2eFolderScan`, `TC-app-version-h`) have
 *     no numeric block to anchor on — a human must assign the number.
 * The candidate is re-checked with `isCanonicalTCId` before it is returned, so a
 * suggestion is never offered unless it actually round-trips.
 *
 * @param {unknown} id
 * @returns {string|null}
 */
export function suggestCanonicalTCId(id) {
  if (typeof id !== 'string') return null;
  // TC + pure-letter namespace glued to digits + optional single lowercase suffix.
  const m = id.match(/^[Tt][Cc][-_]([A-Za-z]+)(\d+)([a-z])?$/);
  if (!m) return null;
  const [, namespace, digits, suffix = ''] = m;
  const candidate = `TC-${namespace.toUpperCase()}-${digits}${suffix}`;
  return isCanonicalTCId(candidate) ? candidate : null;
}
