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

const PERSONA_STATE_FILE = ".aitri/.persona-state.json";

/**
 * Extracts a 2–3 line summary from LLM output (first meaningful content).
 * @param {string} content
 * @returns {string}
 */
export function extractPersonaSummary(content) {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const meaningful = lines.filter(l => !l.startsWith("#") && !l.startsWith("<!--") && l.length > 20);
  return meaningful.slice(0, 3).join(" ").slice(0, 300);
}

/**
 * Persists the last persona contribution to .aitri/.persona-state.json.
 * @param {{ persona: string, command: string, summary: string, root: string }} opts
 */
export function savePersonaContribution({ persona, command, summary, root }) {
  try {
    const statePath = path.join(root, PERSONA_STATE_FILE);
    const state = { persona, command, summary, timestamp: new Date().toISOString() };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch {
    // non-fatal — badge and summary already shown in stdout
  }
}

/**
 * Loads the last persona contribution from .aitri/.persona-state.json.
 * @param {string} root
 * @returns {{ persona: string, command: string, summary: string, timestamp: string } | null}
 */
export function loadPersonaContribution(root) {
  try {
    const statePath = path.join(root, PERSONA_STATE_FILE);
    if (!fs.existsSync(statePath)) return null;
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

/** Display names for each persona key */
export const PERSONA_DISPLAY_NAMES = {
  discovery: "Discovery Facilitator",
  product: "Product Manager",
  "ux-ui": "Experience Designer",
  architect: "System Architect",
  security: "Security Champion",
  qa: "Quality Engineer",
  developer: "Lead Developer",
};
