/**
 * Module: lib/upgrade/diagnose.js — DIAGNOSE phase scaffold
 *
 * Produces a drift catalog for the five categories defined in ADR-027.
 * Corte A (this commit): skeleton only. Returns empty arrays in every
 * category. Per-version `lib/upgrade/migrations/from-<version>.js` modules
 * will plug in their own diagnose() and have their findings composed here
 * in subsequent commits.
 *
 * Contract (ADR-027 §DIAGNOSE):
 *   {
 *     blocking:      Drift[],  // artifact shapes downstream commands cannot read
 *     stateMissing:  Drift[],  // .aitri fields introduced in later versions
 *     validatorGap:  Drift[],  // artifacts that pass old validator, fail current
 *     capabilityNew: Drift[],  // opt-in features introduced after project adopted
 *     structure:     Drift[],  // project-layout inconsistencies
 *   }
 *
 * Each Drift entry (future shape): { version, target, before, after, reversible }.
 */

/**
 * Walk from the project's current aitriVersion toward the running CLI VERSION,
 * composing per-version migration module diagnoses. Returns a catalog grouped
 * by category.
 *
 * @param {string} _dir    Project root. Unused until migration modules land.
 * @param {object} _config Loaded .aitri config. Unused until migration modules land.
 * @returns {{ blocking: object[], stateMissing: object[], validatorGap: object[], capabilityNew: object[], structure: object[] }}
 */
export function diagnose(_dir, _config) {
  return {
    blocking:      [],
    stateMissing:  [],
    validatorGap:  [],
    capabilityNew: [],
    structure:     [],
  };
}
