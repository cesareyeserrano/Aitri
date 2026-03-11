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
export function render(name, data) {
  const template = readFileSync(join(TEMPLATES_DIR, `${name}.md`), 'utf8');

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
