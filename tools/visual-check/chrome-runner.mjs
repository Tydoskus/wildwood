// Headless Chrome and a static server for the visual-check tools (capture.mjs, perf.mjs). Whatever way a run ends,
// Chrome, its helpers and the server are stopped.
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";

export const repo = resolve(import.meta.dirname, "../..");
const CHROME = process.env.VISUAL_CHECK_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** The real GPU, vsync and the frame cap off, so a frame takes as long as its work. */
const GPU_FLAGS = ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"];

/** Builds the harness into `buildDir`. */
export function buildHarness(buildDir) {
  console.log(`Building the harness into ${buildDir}`);
  const build = spawnSync("npx", ["vite", "build", "--config", "config/vite.visual-check.config.ts", "--logLevel", "warn"], {
    cwd: repo, stdio: "inherit", env: { ...process.env, VISUAL_CHECK_OUT_DIR: buildDir },
  });
  if (build.status !== 0) throw new Error("Harness build failed");
}

export function portFree(port) {
  return new Promise(resolvePort => {
    const probe = createNetServer();
    probe.once("error", () => resolvePort(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolvePort(true)));
  });
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".map": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".webmanifest": "application/manifest+json",
};

/** The harness build first, then public/ for the art and the game's index.html and stylesheets. */
export function startServer(port, roots) {
  const missing = new Set();
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const relative = normalize(path === "/" ? "/index.html" : path).replace(/^([/\\])+/, "");
    for (const root of roots) {
      const file = join(root, relative);
      if (!file.startsWith(root + sep) && file !== root) continue;
      if (existsSync(file) && statSync(file).isFile()) {
        response.writeHead(200, { "content-type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
        createReadStream(file).pipe(response);
        return;
      }
    }
    missing.add(path);
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolveServer({ server, missing }));
  });
}

/** A DevTools protocol connection over Node's built-in WebSocket. */
export async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", () => reject(new Error(`DevTools socket ${url} failed`)), { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.reject(new Error(`${call.method}: ${message.error.message}`));
      else call?.resolve(message.result);
    } else for (const listener of listeners) listener(message);
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveCall, reject) => pending.set(id, { resolve: resolveCall, reject, method }));
    },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { try { socket.close(); } catch { /* already closed */ } },
  };
}

export const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

export async function waitFor(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
    await sleep(100);
  }
}

// Everything that has to be undone, whatever way the run ends.
export const cleanup = { chrome: null, watchdog: null, server: null, cdp: null, profile: null, done: false };

function killChrome() {
  const chrome = cleanup.chrome;
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    try { process.kill(chrome.pid, "SIGKILL"); } catch { /* gone */ }
  }
  // Anything still running on this run's own profile (helpers included).
  if (cleanup.profile) spawnSync("pkill", ["-9", "-f", `--user-data-dir=${cleanup.profile}`]);
}

function cleanupSync() {
  if (cleanup.done) return;
  cleanup.done = true;
  cleanup.cdp?.close();
  if (cleanup.watchdog) { try { process.kill(cleanup.watchdog.pid, "SIGKILL"); } catch { /* gone */ } }
  killChrome();
  cleanup.server?.close();
  cleanup.server?.closeAllConnections?.();
  if (cleanup.profile) rmSync(cleanup.profile, { recursive: true, force: true });
}

export async function cleanupAsync() {
  if (cleanup.done) return;
  try { await Promise.race([cleanup.cdp?.send("Browser.close"), sleep(1_500)]); } catch { /* killed below */ }
  const chrome = cleanup.chrome;
  if (chrome) await Promise.race([new Promise(resolveExit => chrome.exitCode !== null || chrome.signalCode !== null ? resolveExit() : chrome.once("exit", resolveExit)), sleep(3_000)]);
  cleanupSync();
}

process.on("exit", cleanupSync);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => { console.error(`\n${signal}: stopping Chrome and the server`); cleanupSync(); process.exit(130); });
}
process.on("uncaughtException", error => { console.error(error); cleanupSync(); process.exit(1); });

export async function launchChrome(cdpPort, profile, { gpu = false } = {}) {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (set VISUAL_CHECK_CHROME)`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  cleanup.profile = profile;
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--mute-audio", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--force-color-profile=srgb", ...(gpu ? GPU_FLAGS : ["--disable-gpu"]), "--remote-allow-origins=*", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  cleanup.chrome = chrome;
  let stderr = "";
  chrome.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4_000); });
  // If this process dies without running its handlers (kill -9), the watchdog takes Chrome down with it.
  cleanup.watchdog = spawn("/bin/sh", ["-c", `while kill -0 ${process.pid} 2>/dev/null; do sleep 1; done; kill -9 ${chrome.pid} 2>/dev/null; pkill -9 -f -- '--user-data-dir=${profile}' 2>/dev/null`], { detached: true, stdio: "ignore" });
  cleanup.watchdog.unref();
  const version = await waitFor(async () => {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited (${chrome.exitCode}): ${stderr}`);
    try { return await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json(); } catch { return null; }
  }, 20_000, "Chrome's DevTools endpoint");
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
  return { version, target };
}

