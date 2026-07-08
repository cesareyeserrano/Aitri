/**
 * Module: Prompt Template Renderer
 * Purpose: Load and render .md templates from templates/ with data injection.
 * Dependencies: Node.js built-ins only (fs, url, path)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

/**
 * Render a prompt template with data injection.
 * Supports:
 *   {{KEY}}             — replaced with data[key] or ''
 *   {{#IF_KEY}}...{{/IF_KEY}} — block removed when data[key] is falsy
 *
 * @param {string} name - Template path relative to templates/ (without .md), e.g. 'phases/phase4'
 * @param {Record<string, string>} data - Placeholder values
 * @returns {string} Rendered prompt string
 */
/**
 * Guardrail (ADV-0622-17): the renderer is intentionally NON-nesting and only knows
 * `{{#IF_KEY}}…{{/IF_KEY}}` and `{{KEY}}`. A nested, mismatched, orphan, or unclosed
 * IF token would make the non-greedy block regex misbehave and leak raw template syntax
 * into a tier-1 prompt — with green tests. Validate the RAW template (never the rendered
 * output: a data VALUE may legitimately contain `{{`, e.g. an artifact pasted into a
 * placeholder) so the defect fails loud at generation time. Latent today (no template
 * nests) — the guard ships before the first one can leak silently.
 */
export function assertTemplateWellFormed(name, template) {
  const tokens = template.match(/\{\{#IF_\w+\}\}|\{\{\/IF_\w+\}\}/g) || [];
  const stack = [];
  for (const tok of tokens) {
    const isOpen = tok.startsWith('{{#');
    const key = tok.replace(/^\{\{#?\/?IF_/, '').replace(/\}\}$/, '');
    if (isOpen) {
      if (stack.length)
        throw new Error(`render(${name}): nested {{#IF_${key}}} inside {{#IF_${stack[stack.length - 1]}}} — the renderer does not support nested conditional blocks.`);
      stack.push(key);
    } else {
      if (!stack.length || stack[stack.length - 1] !== key)
        throw new Error(`render(${name}): unbalanced {{/IF_${key}}} — no matching open {{#IF_${key}}} block.`);
      stack.pop();
    }
  }
  if (stack.length)
    throw new Error(`render(${name}): unclosed {{#IF_${stack[stack.length - 1]}}} block — every {{#IF_KEY}} needs a {{/IF_KEY}}.`);
}

export function render(name, data) {
  const template = readFileSync(join(TEMPLATES_DIR, `${name}.md`), 'utf8');
  assertTemplateWellFormed(name, template);

  // Process conditional blocks first (non-greedy, no nesting)
  let result = template.replace(
    /\{\{#IF_(\w+)\}\}([\s\S]*?)\{\{\/IF_\1\}\}/g,
    (_, key, content) => (data[key] ? content : ''),
  );

  // Replace simple placeholders
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in data ? String(data[key]) : '',
  );

  return result;
}

/**
 * Extract the "## Human Review" checklist block from a phase template, raw
 * (conditional blocks unwrapped, placeholders stripped). Single source: the
 * checklist lives in the template; `approve` prints it verbatim at approval
 * time so the human sees the real items without re-opening the briefing.
 *
 * @param {string} name - Template path relative to templates/ (without .md), e.g. 'phases/deploy'
 * @param {object} [data] - Values for the checklist's own placeholders (e.g. MIN_NGZ, scope
 *   tokens). A supplied key is rendered; an unsupplied one is dropped to '' as before. Without
 *   this, a checklist line like `≥{{MIN_NGZ}} items` printed as `≥ items` — the number lost.
 * @returns {string|null} The checklist block (header + items), or null if absent/unreadable
 */
export function extractHumanReview(name, data = {}) {
  let template;
  try { template = readFileSync(join(TEMPLATES_DIR, `${name}.md`), 'utf8'); }
  catch { return null; }
  // From the "## ... Human Review ..." header up to the next top-level "## " section or EOF.
  const m = template.match(/##+\s*Human Review[\s\S]*?(?=\n##\s|$)/);
  if (!m) return null;
  return m[0]
    .replace(/\{\{#IF_(\w+)\}\}([\s\S]*?)\{\{\/IF_\1\}\}/g, '$2')          // unwrap conditionals (keep body)
    .replace(/\{\{(\w+)\}\}/g, (_, key) => key in data ? String(data[key]) : '') // render known; drop unknown
    .trimEnd();
}
