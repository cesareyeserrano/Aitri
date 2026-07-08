/**
 * Module: format — single source of truth for Aitri's terminal output vocabulary.
 * Purpose: one place that owns Aitri's status glyphs, the color-on predicate, the
 *          horizontal rule, and the stderr diagnostic helpers — so the CLI stops
 *          drifting into three spellings of "OK" (✅/✓/✔) and emitting ANSI escape
 *          codes into piped/agent-read output.
 *
 * Scope of ownership — Aitri's OWN emitted status is the EMOJI vocabulary below.
 * Emoji are unambiguously Aitri's: no test runner emits ✅/❌/⚠️, so a lint pin
 * (test/format-pin.test.js) can forbid these literals anywhere but here.
 *
 * Deliberately NOT owned here — the TEXT glyphs ✓ ✔ ✗ ✖ × ⊘. They have two
 * legitimate non-status uses that must keep their raw literals:
 *   - foreign-output MATCHING — lib/verify-parsers.js matches the ✓/✗/✔/✖ a runner
 *     (node:test, Vitest, Jest, Playwright) prints; those are patterns, not Aitri output.
 *   - compact COUNT markers — lib/verify-display.js renders `(P ✓ F ✗ D ⊘)` with an
 *     intentional visual contrast to the ✅/❌ verdict badge (see its header).
 * Forcing those through here would break parsing and erase a documented design choice.
 */

// ── Aitri status vocabulary (emoji — pin-enforced single source) ────────────────
export const OK   = '✅';
export const FAIL = '❌';
export const WARN = '⚠️';
export const INFO = 'ℹ️';

// ── Color ───────────────────────────────────────────────────────────────────────
// Color is emitted ONLY into an interactive terminal with NO_COLOR unset. Piped or
// agent-read output (the primary consumer) stays free of escape codes. One predicate
// so no call site re-derives it (help.js was the only emitter and checked neither).
export function useColor() {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}

// Wrap a string in an ANSI SGR sequence, or return it unchanged when color is off.
// `code` is the SGR body, e.g. '1' (bold), '2' (dim), '38;5;75' (256-color).
export function paint(code, str) {
  return useColor() ? `\x1b[${code}m${str}\x1b[0m` : str;
}

// ── Layout ────────────────────────────────────────────────────────────────────
// Horizontal rule. Default width 60 is the dominant width already in the codebase.
export function divider(width = 60, ch = '─') {
  return ch.repeat(width);
}

// ── Streams ─────────────────────────────────────────────────────────────────────
// Diagnostics belong on stderr so stdout stays the machine-readable channel (--json
// purity, agent-read briefings). Newline-normalized. Sites keep their own prefixes.
export function warn(msg) {
  process.stderr.write(String(msg).endsWith('\n') ? String(msg) : `${msg}\n`);
}
export function error(msg) {
  process.stderr.write(String(msg).endsWith('\n') ? String(msg) : `${msg}\n`);
}
