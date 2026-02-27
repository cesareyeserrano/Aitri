// cli/persona-loader.js
// Loads persona .md files from core/personas/ as LLM system prompts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VALID_PERSONAS = [
  "discovery",
  "product",
  "ux-ui",
  "architect",
  "security",
  "qa",
  "developer",
];

// cli/ → project root → core/personas/
const PERSONAS_DIR = path.join(__dirname, "..", "core", "personas");

/**
 * Loads a persona .md file and returns it as a cleaned system prompt string.
 * Strips the "## Invocation Policy" section (operator meta-guidance, not for LLMs).
 *
 * @param {string} name — One of VALID_PERSONAS
 * @returns {{ ok: boolean, systemPrompt?: string, error?: string }}
 */
export function loadPersonaSystemPrompt(name) {
  if (!VALID_PERSONAS.includes(name)) {
    return {
      ok: false,
      error: `Unknown persona '${name}'. Valid: ${VALID_PERSONAS.join(", ")}`,
    };
  }

  const filePath = path.join(PERSONAS_DIR, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Persona file not found: ${filePath}` };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    // Strip "## Invocation Policy" section and everything after it
    const cleaned = raw.replace(/\n## Invocation Policy[\s\S]*$/, "").trim();
    return { ok: true, systemPrompt: cleaned };
  } catch (err) {
    return { ok: false, error: `Failed to read persona file: ${err.message}` };
  }
}

/**
 * Returns the absolute path to a persona file (for diagnostics).
 * @param {string} name
 * @returns {string}
 */
export function personaFilePath(name) {
  return path.join(PERSONAS_DIR, `${name}.md`);
}
