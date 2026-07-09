/**
 * Module: format — single source of ANSI color emission for Aitri's CLI output.
 * Purpose: one predicate for "is color on" and one emitter for SGR sequences, so no
 *          command re-derives TTY/NO_COLOR logic or hand-writes escape codes — piped
 *          and agent-read output (the primary consumer) stays escape-free.
 *
 * Pin: test/format-pin.test.js forbids ANSI escape literals anywhere in lib/ + bin/
 * except this file. New color goes through sgr()/useColor(), or the suite goes red.
 *
 * Deliberately NOT owned here — the status glyphs (✅/❌/⚠️ and the ✓/✗/⊘ family).
 * The UX-PRO-0707 glyph sweep was investigated and rejected as churn: the emoji are
 * already consistent at their call sites, lib/verify-parsers.js MATCHES the ✓/✗ a
 * foreign runner prints (patterns, not output), and lib/verify-display.js contrasts
 * ✓/✗/⊘ count markers against the ✅/❌ verdict badge by documented design. Centralizing
 * them would break parsing and erase that hierarchy for no defect prevented.
 */

// Color is emitted ONLY into an interactive terminal with NO_COLOR unset. One predicate
// so no call site re-derives it (help.js was the only emitter and checked neither).
export function useColor() {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}

// The opening SGR sequence for `code` (e.g. '1' bold, '2' dim, '38;5;75' 256-color),
// or '' when color is off — so call sites can interpolate freely and stay escape-free
// in piped/NO_COLOR output. Pair with sgr('0') to reset.
export function sgr(code) {
  return useColor() ? `\x1b[${code}m` : '';
}

// Horizontal rule. Default width 60 is the dominant width already in the codebase.
export function divider(width = 60, ch = '─') {
  return ch.repeat(width);
}
