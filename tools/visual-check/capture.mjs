#!/usr/bin/env node
// Captures the visual-check scenes as PNGs with headless Chrome. Builds the harness, serves it with public/
// behind it on 127.0.0.1, drives Chrome over the DevTools protocol, and always kills Chrome and the server.
//
//   node tools/visual-check/capture.mjs --out <dir> [--scenes plates,gear] [--dpr 1,2] [--cap 2|3] [--no-build]
//     [--build-dir <dir>] [--public-dir <dir>] [--port 4517] [--cdp-port 9351]
// A scene can name its one width and pixel ratio: --scenes plates@2,hud:390@1 (the rest use --dpr and every width).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildHarness, cleanup, cleanupAsync, connect, launchChrome, portFree, repo, startServer, waitFor } from "./chrome-runner.mjs";

/** Viewports each scene is captured at. `full` captures the whole page; otherwise just the viewport. */
const VIEWPORTS = {
  plates: [{ width: 390, height: 844, full: true }],
  gear: [{ width: 1280, height: 800, full: true }],
  enemies: [{ width: 1280, height: 800, full: true }],
  parts: [{ width: 1280, height: 800, full: true }],
  "combat-hits": [{ width: 390, height: 844, full: true }],
  world: [{ width: 1280, height: 800, full: true }],
  town: [{ width: 1280, height: 800, full: true }],
  "town-grid": [{ width: 1280, height: 800, full: true }],
  grove: [{ width: 1280, height: 800, full: true }],
  forest: [{ width: 1280, height: 800, full: true }],
  bosses: [{ width: 1280, height: 800, full: true }],
  "guild-battlefield": [{ width: 1280, height: 800, full: true }],
  icons: [{ width: 390, height: 844, full: true }, { width: 1280, height: 800, full: true }],
  hud: [{ width: 390, height: 844, full: false }, { width: 1280, height: 800, full: false }],
  "hud-arrow": [{ width: 390, height: 844, full: false }, { width: 1280, height: 800, full: false }],
  "prestige-runs": [{ width: 390, height: 844, full: false }, { width: 1280, height: 800, full: false }],
  wordmark: [{ width: 390, height: 844, full: false }, { width: 1280, height: 800, full: false }],
  shops: [{ width: 390, height: 844, full: true }, { width: 1280, height: 800, full: true }],
  "gem-shop": [{ width: 390, height: 844, full: true }],
  "server-boost": [{ width: 390, height: 844, full: true }],
  grades: [{ width: 460, height: 320, full: true }],
  "guild-hall": [{ width: 390, height: 844, full: false }],
  "settings-search": [{ width: 390, height: 844, full: false }],
  "quest-tracker": [{ width: 390, height: 844, full: false }],
  "dps-breakdown": [{ width: 390, height: 844, full: false }, { width: 1280, height: 800, full: false }],
  builds: [{ width: 390, height: 700, full: true }],
  "world-map-town": [{ width: 390, height: 844, full: true }, { width: 1280, height: 800, full: false }],
  "offline-choice": [{ width: 390, height: 640, full: false }, { width: 1280, height: 720, full: false }],
  "exchange-window": [{ width: 1240, height: 700, full: true }],
  "chat-announcement": [{ width: 390, height: 844, full: true }, { width: 1280, height: 800, full: true }],
  "profile-own": [{ width: 390, height: 844, full: false }],
  "item-window": [{ width: 390, height: 844, full: false }],
  "card-window": [{ width: 390, height: 844, full: false }],
  "item-window-worn": [{ width: 390, height: 844, full: false }],
  "profile-other": [{ width: 390, height: 844, full: false }],
};
const DEFAULT_VIEWPORT = [{ width: 1280, height: 800, full: true }];
/** Chrome cannot paint one capture taller than this many device pixels; taller pages are taken in bands. */
const MAX_BAND_PIXELS = 8_000;

function parseArgs(argv) {
  const args = { build: true, dpr: [1, 2], cap: null, port: 4517, cdpPort: 9351, scenes: null, out: null, buildDir: null, publicDir: join(repo, "public") };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    if (flag === "--out") args.out = resolve(value());
    else if (flag === "--scenes") args.scenes = value().split(",").filter(Boolean).map(parseScene);
    else if (flag === "--dpr") args.dpr = value().split(",").map(Number);
    else if (flag === "--cap") args.cap = Number(value());
    else if (flag === "--no-build") args.build = false;
    else if (flag === "--build-dir") args.buildDir = resolve(value());
    else if (flag === "--public-dir") args.publicDir = resolve(value());
    else if (flag === "--port") args.port = Number(value());
    else if (flag === "--cdp-port") args.cdpPort = Number(value());
    else if (flag === "--help" || flag === "-h") { console.log(readUsage()); process.exit(0); }
    else throw new Error(`Unknown flag ${flag}\n${readUsage()}`);
  }
  if (!args.out) throw new Error(`--out <dir> is required\n${readUsage()}`);
  if (args.dpr.some(dpr => !(dpr > 0))) throw new Error("--dpr takes numbers, e.g. 1,2");
  if (args.cap !== null && args.cap !== 2 && args.cap !== 3) throw new Error("--cap is 2 (the game's default) or 3 (Settings > High Resolution)");
  if ([args.port, args.cdpPort].some(port => port === 3000 || port === 8000)) throw new Error("Ports 3000 and 8000 belong to the local game server and dev site; pick another.");
  args.buildDir ??= join(repo, "local-data/visual-check-build");
  return args;
}

/** "plates", "plates@2" or "hud:390@1": the scene, and optionally its one width and pixel ratio. */
function parseScene(spec) {
  const match = /^([\w-]+)(?::(\d+))?(?:@([\d.]+))?$/.exec(spec);
  if (!match) throw new Error(`Bad scene "${spec}"; use name, name@dpr or name:width@dpr`);
  return { name: match[1], width: match[2] ? Number(match[2]) : null, dpr: match[3] ? Number(match[3]) : null };
}

function readUsage() {
  return "usage: node tools/visual-check/capture.mjs --out <dir> [--scenes plates,gear] [--dpr 1,2] [--cap 2|3] [--no-build] [--build-dir <dir>] [--public-dir <dir>] [--port 4517] [--cdp-port 9351]";
}

async function capture(cdp, url, viewport, dpr) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: dpr, mobile: viewport.width < 768 });
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const inflight = new Set();
  const failures = [];
  const off = cdp.on(message => {
    if (message.method === "Network.requestWillBeSent") inflight.add(message.params.requestId);
    else if (message.method === "Network.loadingFinished") inflight.delete(message.params.requestId);
    else if (message.method === "Network.loadingFailed") { inflight.delete(message.params.requestId); failures.push(`${message.params.errorText} ${message.params.type ?? ""}`.trim()); }
    else if (message.method === "Runtime.exceptionThrown") failures.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text);
  });
  try {
    await cdp.send("Page.navigate", { url });
    const evaluate = async expression => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
    await waitFor(() => evaluate("window.__visualReady === true"), 120_000, `${url} to report ready`);
    const error = await evaluate("window.__visualError ?? null");
    if (error) throw new Error(`Scene failed: ${error}`);
    // Quiet network for a moment: nothing late (a lazily loaded look) is still on its way.
    let quietSince = Date.now();
    await waitFor(() => { if (inflight.size > 0) quietSince = Date.now(); return Date.now() - quietSince > 300; }, 30_000, "the network to go quiet");
    const metrics = await cdp.send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const width = viewport.width;
    const height = viewport.full ? Math.max(viewport.height, Math.ceil(size.height)) : viewport.height;
    const bandHeight = Math.max(1, Math.floor(MAX_BAND_PIXELS / dpr));
    const bands = [];
    for (let top = 0; top < height; top += bandHeight) {
      const result = await cdp.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: viewport.full, fromSurface: true,
        clip: { x: 0, y: top, width, height: Math.min(bandHeight, height - top), scale: 1 },
      });
      bands.push(Buffer.from(result.data, "base64"));
    }
    return { bands, width, height, failures };
  } finally {
    off();
  }
}

async function stitch(bands) {
  if (bands.length === 1) return bands[0];
  const { default: sharp } = await import("sharp");
  const metas = await Promise.all(bands.map(band => sharp(band).metadata()));
  const width = metas[0].width;
  const height = metas.reduce((sum, meta) => sum + meta.height, 0);
  let top = 0;
  const layers = bands.map((input, index) => { const layer = { input, left: 0, top }; top += metas[index].height; return layer; });
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(await portFree(args.port))) throw new Error(`Port ${args.port} is in use; pass --port <free port> (never 3000 or 8000).`);
  if (!(await portFree(args.cdpPort))) throw new Error(`DevTools port ${args.cdpPort} is in use; pass --cdp-port <free port>. Is another headless Chrome still running? ps aux | grep remote-debugging-port`);
  if (args.build) buildHarness(args.buildDir);
  if (!existsSync(join(args.buildDir, "visual-check.html"))) throw new Error(`No harness build at ${args.buildDir}; run without --no-build`);
  mkdirSync(args.out, { recursive: true });

  const { server, missing } = await startServer(args.port, [args.buildDir, args.publicDir]);
  cleanup.server = server;
  const profile = resolve(process.env.VISUAL_CHECK_PROFILE ?? join(args.out, "..", ".visual-chrome-profile"));
  const { target, version } = await launchChrome(args.cdpPort, profile);
  const cdp = await connect(target.webSocketDebuggerUrl);
  cleanup.cdp = cdp;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });

  const base = `http://127.0.0.1:${args.port}/visual-check.html`;
  const cap = args.cap === null ? "" : `&cap=${args.cap}`;
  let run = 0;
  const listed = await capture(cdp, `${base}?run=${run++}#__list`, DEFAULT_VIEWPORT[0], 1).catch(() => null);
  const available = JSON.parse((await cdp.send("Runtime.evaluate", { expression: "JSON.stringify(window.__visualScenes ?? [])", returnByValue: true })).result.value);
  if (!listed && !available.length) throw new Error("The harness did not load; see the build output above");
  const scenes = args.scenes ?? available.map(name => ({ name, width: null, dpr: null }));
  const unknown = scenes.map(scene => scene.name).filter(scene => !available.includes(scene));
  if (unknown.length) throw new Error(`Unknown scene(s) ${unknown.join(", ")}; available: ${available.join(", ")}`);

  const manifest = [];
  let failed = 0;
  for (const { name: scene, width, dpr: sceneDpr } of scenes) {
    const viewports = (VIEWPORTS[scene] ?? DEFAULT_VIEWPORT).filter(viewport => width === null || viewport.width === width);
    if (!viewports.length) throw new Error(`Scene ${scene} has no ${width}px viewport`);
    for (const viewport of viewports) {
      for (const dpr of sceneDpr ? [sceneDpr] : args.dpr) {
        const name = `${scene}-${viewport.width}w@${dpr}x${args.cap === null ? "" : `-cap${args.cap}`}.png`;
        const started = Date.now();
        try {
          const shot = await capture(cdp, `${base}?run=${run++}${cap}#${scene}`, viewport, dpr);
          writeFileSync(join(args.out, name), await stitch(shot.bands));
          manifest.push({ scene, file: name, width: viewport.width, cssHeight: shot.height, dpr, cap: args.cap ?? 2, failures: shot.failures });
          console.log(`  ${name}  ${viewport.width}×${shot.height} css  ${Date.now() - started}ms${shot.failures.length ? `  (${shot.failures.length} load errors)` : ""}`);
        } catch (error) {
          failed += 1;
          console.error(`  ${name}  FAILED: ${error.message}`);
        }
      }
    }
  }
  writeFileSync(join(args.out, "manifest.json"), JSON.stringify({ capturedAt: new Date().toISOString(), chrome: version?.Browser, buildDir: args.buildDir, captures: manifest, missing: [...missing] }, null, 2));
  if (missing.size) console.warn(`Not found on the server (${missing.size}): ${[...missing].slice(0, 12).join(", ")}${missing.size > 12 ? " …" : ""}`);
  console.log(`${manifest.length} capture(s) in ${args.out}${failed ? `, ${failed} failed` : ""}`);
  return failed ? 1 : 0;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error(error.message ?? error);
} finally {
  await cleanupAsync();
}
process.exit(exitCode);
