import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractSealedBlocks, computeBlockHash,
  writeHashes, readHashes, verifyAllHashes
} from "../../cli/lib/sealed-hashes.js";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aitri-sealed-"));
}

const SEALED_CONTENT = `// TC-1: test stub
import test from "node:test";
// --- SPEC-SEALED: DO NOT MODIFY ---
const INPUT = { name: "Alpha" };
const EXPECTED = { status: 201 };
// --- SPEC-SEALED: END ---
// TODO: complete test
`;

test("extractSealedBlocks finds block in content", () => {
  const blocks = extractSealedBlocks(SEALED_CONTENT);
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].content.includes("SPEC-SEALED: DO NOT MODIFY"));
  assert.ok(blocks[0].content.includes("INPUT"));
  assert.ok(blocks[0].content.includes("SPEC-SEALED: END"));
});

test("extractSealedBlocks returns empty for content without blocks", () => {
  const blocks = extractSealedBlocks("// plain test file\nconst x = 1;");
  assert.equal(blocks.length, 0);
});

test("extractSealedBlocks handles multiple blocks", () => {
  const multi = SEALED_CONTENT + "\n" + SEALED_CONTENT;
  const blocks = extractSealedBlocks(multi);
  assert.equal(blocks.length, 2);
});

test("computeBlockHash returns consistent SHA-256", () => {
  const hash1 = computeBlockHash("some content");
  const hash2 = computeBlockHash("some content");
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64); // SHA-256 hex
});

test("computeBlockHash returns different hash for different content", () => {
  const hash1 = computeBlockHash("content A");
  const hash2 = computeBlockHash("content B");
  assert.notEqual(hash1, hash2);
});

test("writeHashes + readHashes round-trips data", () => {
  const tmp = makeTmpDir();
  const hashMap = { "TC-1": { file: "tests/feat/generated/tc-1.test.mjs", hash: "abc123" } };
  writeHashes(tmp, "feat", hashMap);
  const stored = readHashes(tmp);
  assert.ok(stored["feat"]);
  assert.equal(stored["feat"].hashes["TC-1"].hash, "abc123");
});

test("readHashes returns null for missing file", () => {
  const tmp = makeTmpDir();
  assert.equal(readHashes(tmp), null);
});

test("verifyAllHashes ok:true when no sealed-hashes.json exists", () => {
  const tmp = makeTmpDir();
  const result = verifyAllHashes(tmp, "feat");
  assert.equal(result.ok, true);
  assert.equal(result.missing, true);
});

test("verifyAllHashes detects hash mismatch", () => {
  const tmp = makeTmpDir();
  // Write a test file with sealed block
  const testDir = path.join(tmp, "tests", "feat", "generated");
  fs.mkdirSync(testDir, { recursive: true });
  const stubFile = path.join(testDir, "tc-1.test.mjs");
  fs.writeFileSync(stubFile, SEALED_CONTENT, "utf8");

  // Store a WRONG hash
  const hashMap = { "TC-1": { file: "tests/feat/generated/tc-1.test.mjs", hash: "wrong-hash-000" } };
  writeHashes(tmp, "feat", hashMap);

  const result = verifyAllHashes(tmp, "feat");
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].tcId, "TC-1");
});

test("verifyAllHashes passes with correct hash", () => {
  const tmp = makeTmpDir();
  const testDir = path.join(tmp, "tests", "feat", "generated");
  fs.mkdirSync(testDir, { recursive: true });
  const stubFile = path.join(testDir, "tc-1.test.mjs");
  fs.writeFileSync(stubFile, SEALED_CONTENT, "utf8");

  // Compute actual hash and store it
  const blocks = extractSealedBlocks(SEALED_CONTENT);
  const correctHash = computeBlockHash(blocks[0].content);
  const hashMap = { "TC-1": { file: "tests/feat/generated/tc-1.test.mjs", hash: correctHash } };
  writeHashes(tmp, "feat", hashMap);

  const result = verifyAllHashes(tmp, "feat");
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test("verifyAllHashes reports missing file as violation", () => {
  const tmp = makeTmpDir();
  const hashMap = { "TC-1": { file: "tests/feat/generated/nonexistent.mjs", hash: "abc" } };
  writeHashes(tmp, "feat", hashMap);

  const result = verifyAllHashes(tmp, "feat");
  assert.equal(result.ok, false);
  assert.ok(result.violations[0].reason.includes("file not found"));
});
