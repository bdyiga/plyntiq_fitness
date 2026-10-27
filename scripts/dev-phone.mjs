#!/usr/bin/env node
/**
 * `npm run dev:phone`: run the app locally and open it on a phone by scanning a QR code.
 *
 * A Cloudflare quick tunnel gives the Vite dev server a temporary public
 * https://*.trycloudflare.com URL, and the Worker is started with APP_ORIGIN and
 * BETTER_AUTH_URL set to that URL so the origin check and auth accept it.
 * The URL works from any network (campus Wi-Fi, mobile data) and dies on Ctrl+C.
 * Anyone with the URL can reach the dev app while it runs: use test data only.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "apps/api");
const WEB_PORT = 5173;
const isWindows = process.platform === "win32";
const children = [];

function log(msg) {
  console.log(`\x1b[36m[dev:phone]\x1b[0m ${msg}`);
}

/** Pipe a child's output with a prefix so the three processes stay readable. */
function run(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: ROOT, shell: isWindows, detached: !isWindows, ...opts });
  const prefix = (line) => line && console.log(`\x1b[90m[${name}]\x1b[0m ${line}`);
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => chunk.split(/\r?\n/).forEach(prefix));
  }
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log(`${name} exited (code ${code}). Stopping everything.`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

/** .dev.vars is git-ignored; create it with a fresh secret on first run. */
function ensureDevVars() {
  const file = join(API_DIR, ".dev.vars");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (/^BETTER_AUTH_SECRET=.{32,}/m.test(current)) return;
  const line = `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}\n`;
  writeFileSync(file, current ? `${current.trimEnd()}\n${line}` : line);
  log("Created apps/api/.dev.vars with a new BETTER_AUTH_SECRET.");
}

/** Use cloudflared from PATH, or download Cloudflare's standalone binary (no admin needed). */
async function findCloudflared() {
  if (spawnSync("cloudflared", ["--version"], { stdio: "ignore", shell: isWindows }).status === 0) {
    return "cloudflared";
  }
  if (!isWindows) {
    console.error("cloudflared not found. Install it (macOS: `brew install cloudflared`), then rerun.");
    process.exit(1);
  }
  const dir = join(process.env.LOCALAPPDATA ?? homedir(), "plyntiq");
  const exe = join(dir, "cloudflared.exe");
  if (existsSync(exe)) return exe;
  log("Downloading cloudflared (one time) from github.com/cloudflare/cloudflared ...");
  const url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cloudflared download failed: HTTP ${res.status}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(exe, Buffer.from(await res.arrayBuffer()));
  log(`Saved to ${exe}`);
  return exe;
}

/** Start the tunnel first: the Worker needs its URL as APP_ORIGIN. */
function startTunnel(cloudflared) {
  return new Promise((resolve, reject) => {
    const tunnel = run("tunnel", `"${cloudflared}"`, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${WEB_PORT}`], {
      shell: true,
    });
    const timer = setTimeout(() => reject(new Error("Timed out waiting for the tunnel URL.")), 60_000);
    tunnel.stderr.on("data", (chunk) => {
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
}

ensureDevVars();
log("Applying local D1 migrations ...");
if (spawnSync("npm", ["run", "db:migrate:local"], { cwd: ROOT, stdio: "inherit", shell: isWindows }).status !== 0) {
  process.exit(1);
}

const url = await startTunnel(await findCloudflared());
mkdirSync(join(ROOT, "apps/web/dist"), { recursive: true });
run("api", "npx", ["wrangler", "dev", "--var", `APP_ORIGIN:${url}`, "--var", `BETTER_AUTH_URL:${url}`], { cwd: API_DIR });
run("web", "npm", ["run", "dev", "--workspace", "@plyntiq/web"], { env: { ...process.env, PLYNTIQ_TUNNEL: "1" } });

// Let the tunnel's DNS settle and the servers boot before showing the code.
setTimeout(() => {
  spawnSync("npx", ["-y", "qrcode-terminal@0.12.0", url], { stdio: "inherit", shell: isWindows });
  log(`Scan the QR code, or open ${url} on your phone.`);
  log("Use this same URL on the laptop too (localhost won't pass the origin check). Ctrl+C to stop.");
}, 8_000);
