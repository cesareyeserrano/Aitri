import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

function wantsJson(options) {
  if (options.json) return true;
  if ((options.format || "").toLowerCase() === "json") return true;
  return false;
}

/**
 * Detect the project stack from common project files.
 * Returns: "node" | "django" | "python" | "go" | "static" | null
 */
function detectStack(root) {
  if (fs.existsSync(path.join(root, "package.json"))) return "node";
  if (fs.existsSync(path.join(root, "manage.py"))) return "django";
  if (
    fs.existsSync(path.join(root, "app.py")) ||
    fs.existsSync(path.join(root, "main.py")) ||
    fs.existsSync(path.join(root, "wsgi.py")) ||
    fs.existsSync(path.join(root, "asgi.py"))
  ) return "python";
  if (
    fs.existsSync(path.join(root, "main.go")) ||
    fs.existsSync(path.join(root, "go.mod"))
  ) return "go";
  if (fs.existsSync(path.join(root, "index.html"))) return "static";
  return null;
}

/**
 * Resolve the start command for the detected stack.
 * Returns { cmd, args, label, defaultPort } or null.
 */
function resolveStartCommand(root, stack) {
  if (stack === "node") {
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); } catch (_) {}
    if (pkg.scripts?.dev)   return { cmd: "npm", args: ["run", "dev"],   label: "npm run dev",   defaultPort: 3000 };
    if (pkg.scripts?.start) return { cmd: "npm", args: ["start"],        label: "npm start",     defaultPort: 3000 };
    // fallback: look for common entry files
    for (const f of ["server.js", "app.js", "src/server.js", "src/app.js", "src/index.js", "index.js"]) {
      if (fs.existsSync(path.join(root, f))) {
        return { cmd: "node", args: [f], label: `node ${f}`, defaultPort: 3000 };
      }
    }
    return null;
  }
  if (stack === "django") {
    return { cmd: "python", args: ["manage.py", "runserver"], label: "python manage.py runserver", defaultPort: 8000 };
  }
  if (stack === "python") {
    for (const f of ["app.py", "main.py"]) {
      if (fs.existsSync(path.join(root, f))) {
        return { cmd: "python", args: [f], label: `python ${f}`, defaultPort: 5000 };
      }
    }
    return null;
  }
  if (stack === "go") {
    return { cmd: "go", args: ["run", "."], label: "go run .", defaultPort: 8080 };
  }
  if (stack === "static") {
    return { cmd: "npx", args: ["--yes", "serve", ".", "--listen", "3000"], label: "npx serve .", defaultPort: 3000 };
  }
  return null;
}

function parseEntryFlag(entry) {
  const parts = entry.trim().split(/\s+/);
  return { cmd: parts[0], args: parts.slice(1), label: entry.trim(), defaultPort: 3000 };
}

function openBrowser(url) {
  const platform = process.platform;
  const openCmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const openArgs = platform === "win32" ? ["/c", "start", url] : [url];
  spawnSync(openCmd, openArgs, { stdio: "ignore" });
}

export async function runServeCommand({
  options,
  getProjectContextOrExit,
  getStatusReportOrExit,
  exitCodes
}) {
  const { OK, ERROR } = exitCodes;
  const jsonOutput = wantsJson(options);

  const project = getProjectContextOrExit();
  const root = project.root || process.cwd();

  // Resolve feature for status check (optional — serve works without it)
  let report = null;
  try {
    report = getStatusReportOrExit(options.feature || null);
  } catch (_) {
    // status report may not exist for all project types
  }

  const buildReady = report?.factory?.buildReady ?? false;
  const proveOk    = report?.factory?.proveOk    ?? false;
  const feature    = options.feature || report?.approvedSpec?.feature || "";

  // Hard gate: build must exist
  if (!buildReady) {
    const msg = feature
      ? `Build not found. Run: aitri build --feature ${feature}`
      : "Build not found. Run: aitri build";
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, blocked: true, reason: "build_not_ready", message: msg }, null, 2));
    } else {
      console.error(msg);
    }
    return ERROR;
  }

  // Detect stack
  const stack = detectStack(root);
  const resolved = options.entry
    ? parseEntryFlag(options.entry)
    : resolveStartCommand(root, stack);

  if (!resolved) {
    const msg = stack
      ? `Stack detected as "${stack}" but could not resolve an entry point. Use --entry to specify the start command.`
      : "Could not detect project stack. Use --entry to specify the start command (e.g. --entry \"node server.js\").";
    if (jsonOutput) {
      console.log(JSON.stringify({ ok: false, blocked: true, reason: "entry_not_resolved", message: msg, stack }, null, 2));
    } else {
      console.error(msg);
    }
    return ERROR;
  }

  const url = `http://localhost:${resolved.defaultPort}`;

  const payload = {
    ok: true,
    feature,
    stack: stack || "unknown",
    command: resolved.label,
    url,
    qaWarning: !proveOk ? "QA not passed yet. Run aitri prove before delivery." : null
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    if (options.dryRun) return OK;
  }

  // Soft gate warning
  if (!proveOk) {
    console.log("⚠  QA not passed yet. Run aitri prove --feature " + (feature || "<feature>") + " before delivery.");
    console.log("   Serving anyway for local preview...");
    console.log("");
  }

  if (options.dryRun) {
    console.log(`Stack    ${stack || "unknown"}`);
    console.log(`Command  ${resolved.label}`);
    console.log(`URL      ${url}`);
    return OK;
  }

  console.log(`Stack    ${stack || "unknown"}`);
  console.log(`Command  ${resolved.label}`);
  console.log(`URL      ${url}`);
  console.log("");
  console.log("Starting dev server... (Ctrl+C to stop)");
  console.log("");

  if (options.open) {
    // Brief delay so server can start before opening browser
    setTimeout(() => openBrowser(url), 1500);
  }

  const proc = spawn(resolved.cmd, resolved.args, {
    cwd: root,
    stdio: "inherit",
    shell: false
  });

  return new Promise((resolve) => {
    proc.on("close", (code) => {
      resolve(code === 0 ? OK : ERROR);
    });
    proc.on("error", (err) => {
      console.error(`Failed to start server: ${err.message}`);
      resolve(ERROR);
    });
  });
}
