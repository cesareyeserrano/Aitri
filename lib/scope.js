/**
 * Module: Scope helpers
 * Purpose: Single source of truth for constructing scope-aware command strings
 *          and template variables. A "feature pipeline" is dispatched by
 *          `feature.js` with `featureRoot` set to the parent project dir and
 *          `scopeName` set to the feature directory name. Every command and
 *          briefing instruction printed during a feature run must include the
 *          `feature ` token before the verb AND the `<scopeName>` argument
 *          after the verb so an agent following the instruction literally
 *          targets the feature, not the parent.
 *
 * History:
 *   v2.0.0-alpha.6 (2026-04-27) — first attempt: a single `commandPrefix`
 *     returning `feature <name> ` placed before the verb. WRONG: the CLI
 *     grammar is `aitri feature <verb> <name> <phase>`, not
 *     `aitri feature <name> <verb> <phase>`. Ultron canary (8 handoffs)
 *     surfaced the regression — every emitted command looked plausible but
 *     failed under literal copy-paste because feature.js parses the first
 *     token after `feature` as the verb (run-phase/complete/etc), so
 *     `aitri feature network-monitoring complete ux` was interpreted as
 *     "feature with verb 'network-monitoring'" → "Unknown feature
 *     sub-command".
 *
 *   v2.0.0-alpha.7 (2026-04-27) — current: two injection points. The verb
 *     gets `feature ` prefixed (token ends with a trailing space), and the
 *     `<scopeName>` is injected as a leading-space argument AFTER the verb
 *     and BEFORE any phase or further arguments. Templates use two
 *     placeholders `{{SCOPE_VERB}}` and `{{SCOPE_ARG}}` instead of one.
 *
 *   This redesign matches the actual CLI grammar enforced by `feature.js`:
 *     aitri feature run-phase <name> <phase>
 *     aitri feature complete  <name> <phase>
 *     aitri feature approve   <name> <phase>
 *     aitri feature reject    <name> <phase> --feedback "..."
 *     aitri feature verify-run        <name>
 *     aitri feature verify-complete   <name>
 *     aitri feature rehash    <name> <phase>
 *     aitri feature status            <name>
 */

import path from 'node:path';

/**
 * Compute the two scope tokens for command emission.
 *
 * Returns an object `{ verb, arg }`:
 *   - Root context (no featureRoot or no scopeName):
 *       { verb: '', arg: '' }
 *     Splice: `aitri ${verb}<verb-token> <phase>` → `aitri <verb-token> <phase>`
 *
 *   - Feature context:
 *       { verb: 'feature ', arg: ' <scopeName>' }
 *     Splice: `aitri ${verb}<verb-token>${arg} <phase>`
 *           → `aitri feature <verb-token> <scopeName> <phase>`
 *
 * The trailing space on `verb` and leading space on `arg` are deliberate so
 * callers can splice without conditional space logic at every call site.
 *
 * Templates: use as `{{SCOPE_VERB}}` and `{{SCOPE_ARG}}` in the same shape:
 *   `aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} 1`
 *   → root:    `aitri complete 1`
 *   → feature: `aitri feature complete <name> 1`
 *
 * @param {string|null|undefined} featureRoot
 * @param {string|null|undefined} scopeName
 * @returns {{ verb: string, arg: string }}
 */
export function scopeTokens(featureRoot, scopeName) {
  if (!featureRoot || !scopeName) return { verb: '', arg: '' };
  return { verb: 'feature ', arg: ` ${scopeName}` };
}

/**
 * Derive the scope name from a feature directory path. Used as a fallback when
 * `scopeName` was not threaded explicitly through the call chain.
 */
export function scopeNameFromDir(dir) {
  return path.basename(dir);
}
