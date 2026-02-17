import fs from "node:fs";
import path from "node:path";

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function parseDeclaredTcIds(testsContent) {
  return [...new Set(
    [...String(testsContent || "").matchAll(/\bTC-\d+\b/g)]
      .map((match) => match[0])
  )];
}

function walkFiles(rootDir, allowFile) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.forEach((entry) => {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        return;
      }
      if (!entry.isFile()) return;
      if (allowFile(abs)) out.push(abs);
    });
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function isTestLikeFile(file) {
  return /\.(mjs|cjs|js|ts|tsx|py|go)$/i.test(path.basename(file));
}

function markerInContent(content, tcId) {
  const escaped = tcId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = [
    new RegExp(`//\\s*${escaped}\\s*:`, "i"),
    new RegExp(`#\\s*${escaped}\\s*:`, "i"),
    new RegExp(`["']\\s*//\\s*${escaped}\\s*:`, "i")
  ];
  return candidates.some((regex) => regex.test(content));
}

function extractAcMarkersFromContent(content) {
  const match = content.match(/(?:\/\/|#)\s*Acceptance Criteria:\s*([^\n]+)/i);
  if (!match) return [];
  return [...new Set(
    [...match[1].matchAll(/\bAC-\d+\b/g)].map((m) => m[0])
  )];
}

export function scanTcMarkers({ root, feature, testsFile, generatedDir }) {
  if (!fs.existsSync(testsFile)) {
    return {
      available: false,
      mode: "missing_tests_file",
      filesScanned: [],
      map: {},
      declared: 0
    };
  }

  const testsContent = fs.readFileSync(testsFile, "utf8");
  const declaredTc = parseDeclaredTcIds(testsContent);
  if (!fs.existsSync(generatedDir)) {
    return {
      available: false,
      mode: "legacy",
      filesScanned: [],
      map: Object.fromEntries(declaredTc.map((id) => [id, { found: false, file: null }])),
      declared: declaredTc.length
    };
  }

  const files = walkFiles(generatedDir, isTestLikeFile);
  const map = {};
  declaredTc.forEach((tcId) => {
    map[tcId] = { found: false, file: null };
  });

  const acMarkers = {};
  files.forEach((abs) => {
    const rel = toPosix(path.relative(root, abs));
    const content = fs.readFileSync(abs, "utf8");
    declaredTc.forEach((tcId) => {
      if (map[tcId].found) return;
      if (markerInContent(content, tcId)) {
        map[tcId] = {
          found: true,
          file: rel
        };
      }
    });
    const fileAcIds = extractAcMarkersFromContent(content);
    if (fileAcIds.length > 0) {
      acMarkers[rel] = fileAcIds;
    }
  });

  return {
    available: true,
    mode: "scaffold",
    feature,
    filesScanned: files.map((file) => toPosix(path.relative(root, file))),
    map,
    acMarkers,
    declared: declaredTc.length
  };
}
