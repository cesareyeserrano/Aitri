/**
 * Module: context-assets
 * Purpose: Shared helpers for the project's supporting-asset folders
 *          (idea_context/ at root, feature_context/ in a feature sub-pipeline,
 *          and the legacy idea/ that is no longer scanned).
 *
 * Used by the source-capture audit (review.js 'phase1' scope) and the early
 * legacy-folder notices (init, adopt --upgrade). run-phase keeps its own
 * briefing-time listing — it is coupled to the idempotent-re-read flow there and
 * intentionally not refactored through here.
 */

import fs from 'fs';
import path from 'path';

// Material Aitri cannot read mechanically (no vision, zero-dep) — its coverage
// can only be confirmed by a human/agent, never gated. Used to flag visual/binary
// assets for explicit confirmation rather than pretending they were ingested.
const VISUAL_RE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|pdf|fig|sketch|psd|ai|xd)$/i;

/**
 * Asset filenames in `dir/folder`, excluding README.md and dotfiles.
 * @returns {string[]} [] if the folder is absent or unreadable.
 */
export function listAssets(dir, folder) {
  const d = path.join(dir, folder);
  if (!fs.existsSync(d)) return [];
  try {
    return fs.readdirSync(d).filter(f => f !== 'README.md' && !f.startsWith('.'));
  } catch {
    return [];
  }
}

/**
 * Subset of `assets` that look like visual/binary material Aitri cannot read.
 * @param {string[]} assets
 * @returns {string[]}
 */
export function visualAssets(assets) {
  return assets.filter(f => VISUAL_RE.test(f));
}
