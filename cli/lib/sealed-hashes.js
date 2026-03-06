// cli/lib/sealed-hashes.js — SPEC-SEALED block hash utilities
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const SEALED_HASHES_FILE = ".aitri/sealed-hashes.json";
const BLOCK_START = "--- SPEC-SEALED: DO NOT MODIFY ---";
const BLOCK_END = "--- SPEC-SEALED: END ---";

export function sealedHashesPath(root) {
  return path.join(root, SEALED_HASHES_FILE);
}

/**
 * Extract all SPEC-SEALED blocks from a file's content.
 * Returns array of { start, end, content } (line indices + raw content).
 */
export function extractSealedBlocks(fileContent) {
  const lines = String(fileContent || "").split("\n");
  const blocks = [];
  let inBlock = false;
  let blockLines = [];
  let startLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(BLOCK_START)) {
      inBlock = true;
      blockLines = [lines[i]];
      startLine = i;
    } else if (inBlock) {
      blockLines.push(lines[i]);
      if (lines[i].includes(BLOCK_END)) {
        blocks.push({ start: startLine, end: i, content: blockLines.join("\n") });
        inBlock = false;
        blockLines = [];
      }
    }
  }
  return blocks;
}

export function computeBlockHash(blockContent) {
  return createHash("sha256").update(String(blockContent)).digest("hex");
}

/**
 * Write hash map to .aitri/sealed-hashes.json.
 * hashMap: { [tcId]: { file: string, hash: string } }
 */
export function writeHashes(root, feature, hashMap) {
  const file = sealedHashesPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readHashes(root) || {};
  existing[feature] = { generatedAt: new Date().toISOString(), hashes: hashMap };
  fs.writeFileSync(file, JSON.stringify(existing, null, 2), "utf8");
}

export function readHashes(root) {
  const file = sealedHashesPath(root);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Verify all SPEC-SEALED blocks for a feature against stored hashes.
 * Returns { ok: boolean, violations: Array<{tcId, file, expected, actual}> }
 */
export function verifyAllHashes(root, feature) {
  const stored = readHashes(root);
  if (!stored || !stored[feature]) {
    return { ok: true, violations: [], missing: true };
  }
  const hashMap = stored[feature].hashes || {};
  const violations = [];

  for (const [tcId, entry] of Object.entries(hashMap)) {
    const absFile = path.join(root, entry.file);
    if (!fs.existsSync(absFile)) {
      violations.push({ tcId, file: entry.file, expected: entry.hash, actual: null, reason: "file not found" });
      continue;
    }
    const content = fs.readFileSync(absFile, "utf8");
    const blocks = extractSealedBlocks(content);
    if (blocks.length === 0) {
      violations.push({ tcId, file: entry.file, expected: entry.hash, actual: null, reason: "SPEC-SEALED block not found" });
      continue;
    }
    // Use first block (each TC stub should have exactly one)
    const actual = computeBlockHash(blocks[0].content);
    if (actual !== entry.hash) {
      violations.push({ tcId, file: entry.file, expected: entry.hash, actual, reason: "hash mismatch — block was modified" });
    }
  }
  return { ok: violations.length === 0, violations };
}
