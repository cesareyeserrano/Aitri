import fs from "node:fs";
import path from "node:path";
import { ask } from "./lib.js";

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function rel(p) {
  return path.relative(process.cwd(), p);
}

export function fail(message) {
  console.log(message);
  process.exit(1);
}

export function failList(title, issues) {
  console.log(title);
  issues.forEach(i => console.log("- " + i));
  process.exit(1);
}
