import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function detectStartCommand(root) {
  const packageJsonPath = path.join(root, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      const scripts = pkg.scripts || {};
      for (const key of ["dev", "start", "preview", "serve"]) {
        if (scripts[key]) return { runner: "npm", cmd: `npm run ${key}`, source: `package.json scripts.${key}` };
      }
    } catch { /* ignore parse errors */ }
  }

  const pyFiles = ["app.py", "main.py", "manage.py"];
  for (const py of pyFiles) {
    if (fs.existsSync(path.join(root, py))) {
      return { runner: "python", cmd: `python ${py}`, source: py };
    }
  }

  if (fs.existsSync(path.join(root, "pyproject.toml"))) {
    const toml = fs.readFileSync(path.join(root, "pyproject.toml"), "utf8");
    if (/uvicorn/i.test(toml)) return { runner: "python", cmd: "uvicorn app:app --reload", source: "pyproject.toml (uvicorn)" };
    if (/flask/i.test(toml)) return { runner: "python", cmd: "flask run", source: "pyproject.toml (flask)" };
  }

  if (fs.existsSync(path.join(root, "go.mod"))) {
    return { runner: "go", cmd: "go run .", source: "go.mod" };
  }

  const makefile = path.join(root, "Makefile");
  if (fs.existsSync(makefile)) {
    const content = fs.readFileSync(makefile, "utf8");
    for (const target of ["dev", "run", "start", "serve"]) {
      if (new RegExp(`^${target}\\s*:`, "m").test(content)) {
        return { runner: "make", cmd: `make ${target}`, source: `Makefile (${target})` };
      }
    }
  }

  return null;
}

export async function runPreviewCommand({ options, getProjectContextOrExit, exitCodes }) {
  const { OK, ERROR } = exitCodes;
  getProjectContextOrExit();
  const root = process.cwd();

  const detected = detectStartCommand(root);
  if (!detected) {
    console.log("PREVIEW: no start command detected.");
    console.log("Add a dev/start/preview script to package.json, or create app.py / go.mod / Makefile.");
    return ERROR;
  }

  console.log(`PREVIEW: detected ${detected.source}`);
  console.log(`Running: ${detected.cmd}`);

  const parts = detected.cmd.split(/\s+/);
  const result = spawnSync(parts[0], parts.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env }
  });

  if (result.error) {
    console.log(`PREVIEW: failed to start — ${result.error.message}`);
    return ERROR;
  }

  return result.status === 0 ? OK : ERROR;
}
