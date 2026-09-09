/**
 * Module: gitignore helper (ADR-045)
 * Purpose: Keep a project's `.gitignore` correct for the split `.aitri` layout. The
 *          shared `.aitri` file IS committed (it carries the drift baseline and approval
 *          state that teammates need); only the per-machine sibling `.aitri.local` and
 *          the lock are ignored.
 *
 * Risk-mitigation (ADR-045 risk #2 — touching the user's file): this is SURGICAL.
 * It removes only the legacy bare-`.aitri` ignore (which would hide the now-shared
 * `.aitri`) and its stale comment, appends the per-machine entries if missing, preserves
 * every other line and comment verbatim, writes only when something changed, and is
 * idempotent (running twice is a no-op).
 */

import fs from 'fs';
import path from 'path';

const HEADER  = '# Aitri — per-machine state (the shared .aitri IS committed)';
const ENTRIES = ['.aitri.local', '.aitri.lock'];

// Whole, trimmed lines the legacy default added that are now WRONG (they would hide the
// shared config). Removed on sight. Matched exactly — never `.aitri/...` or other paths.
const LEGACY = new Set([
  '.aitri',
  '# Aitri config (project-specific, not shared)',
]);

/**
 * Ensure `<dir>/.gitignore` ignores the per-machine Aitri state and NOT the shared
 * config. Creates the file's Aitri block if absent; fixes a legacy bare-`.aitri`.
 * @returns {{ removedLegacy: boolean, added: string[] }}
 */
export function ensureAitriGitignore(dir, { extra = [] } = {}) {
  const p = path.join(dir, '.gitignore');
  const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  let lines = prev === null ? [] : prev.split('\n');

  const removedLegacy = lines.some(l => LEGACY.has(l.trim()));
  lines = lines.filter(l => !LEGACY.has(l.trim()));

  // `extra`: layout-dependent derived files (rc.12: `<layoutRoot>/features/INDEX.md`) —
  // the caller knows the layout, this helper does not. Same block, same surgical rules.
  // A slash-anchored pattern (`/aitri/features/INDEX.md`) ignores the same path — count it
  // as present rather than adding a duplicate (rc.12 adversarial D6).
  const present = new Set(lines.map(l => l.trim().replace(/^\//, '')));
  const wanted  = [...ENTRIES, ...extra];
  const added   = wanted.filter(e => !present.has(e));
  if (added.length) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();  // drop trailing blanks
    const at = lines.findIndex(l => l.trim() === HEADER);
    if (at !== -1) {
      // Block already exists (template or an earlier run): extend it in place, right after
      // the LAST Aitri entry we know about — not at the end of the contiguous run, which
      // would land our line after the user's own patterns when they follow the block with
      // no blank line (the owner's real .gitignore does exactly that).
      const known = new Set(wanted);
      let end = at + 1;
      while (end < lines.length && known.has(lines[end].trim().replace(/^\//, ''))) end++;
      lines.splice(end, 0, ...added);
    } else {
      if (lines.length) lines.push('');                                          // one blank separator
      lines.push(HEADER, ...added);
    }
  }

  let next = lines.join('\n');
  if (next && !next.endsWith('\n')) next += '\n';
  if (next !== prev) fs.writeFileSync(p, next);
  return { removedLegacy, added };
}
