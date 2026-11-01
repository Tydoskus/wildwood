#!/usr/bin/env node
// Times the game's world drawing on real maps (the harness's perf scene) in headless Chrome on the real GPU, and prints
// one row per map, zoom and variant: the game's own work a frame and the whole frame, median and slowest 5%.
//
//   node tools/visual-check/perf.mjs [--maps tutorial_forest,town] [--frames 150] [--phone] [--json <file>] [--shot <png>] [--no-build]
// --phone frames a 390×844 screen at the game's 2× canvas; the default is a 1280×800 desktop at 2×.
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildHarness, cleanup, cleanupAsync, connect, launchChrome, portFree, repo, startServer, waitFor } from "./chrome-runner.mjs";

function parseArgs(argv) {
  const args = { build: true, maps: null, frames: 150, phone: false, json: null, port: 4518, cdpPort: 9352 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index] ?? (() => { throw new Error(`${flag} needs a value`); })();
    if (flag === "--maps") args.maps = value();
    else if (flag === "--frames") args.frames = Number(value());
    else if (flag === "--phone") args.phone = true;
    else if (flag === "--json") args.json = resolve(value());
    else if (flag === "--no-build") args.build = false;
    else if (flag === "--shot") args.shot = resolve(value());
    else throw new Error(`Unknown flag ${flag}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const buildDir = join(repo, "local-data/visual-check-build");
  if (!(await portFree(args.port)) || !(await portFree(args.cdpPort))) throw new Error(`Port ${args.port} or ${args.cdpPort} is in use`);
  if (args.build) buildHarness(buildDir);
  if (!existsSync(join(buildDir, "visual-check.html"))) throw new Error("No harness build; run without --no-build");
  const { server } = await startServer(args.port, [buildDir, join(repo, "public")]);
  cleanup.server = server;
  const { target, version } = await launchChrome(args.cdpPort, join(repo, "local-data/.perf-chrome-profile"), { gpu: true });
  const cdp = await connect(target.webSocketDebuggerUrl);
  cleanup.cdp = cdp;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const screen = args.phone ? { width: 390, height: 844, mobile: true } : { width: 1280, height: 800, mobile: false };
  await cdp.send("Emulation.setDeviceMetricsOverride", { ...screen, deviceScaleFactor: 2 });
  const query = new URLSearchParams({ frames: String(args.frames), ...(args.maps ? { maps: args.maps } : {}), ...(args.shot ? { keep: "1" } : {}) });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${args.port}/visual-check.html?${query}#perf` });
  const evaluate = async expression => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  await waitFor(() => evaluate("window.__visualReady === true"), 600_000, "the perf scene to finish");
  const error = await evaluate("window.__visualError ?? null");
  if (error) throw new Error(`Perf scene failed: ${error}`);
  const results = await evaluate("window.__perfResults");
  const gpu = await evaluate(`(() => { const gl = document.createElement("canvas").getContext("webgl"); const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "no WebGL"; })()`);
  console.log(`${version?.Browser} · ${gpu} · ${screen.width}×${screen.height} @2x\n`);
  console.table(results.map(row => ({
    map: row.map, zoom: `${Math.round(row.cameraZoom * 100)}%`, variant: row.variant, renderer: row.renderer,
    "work ms": row.workMs, "work p95": row.workP95, "frame ms": row.frameMs, "frame p95": row.frameP95,
  })));
  if (args.shot) writeFileSync(args.shot, Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  if (args.json) writeFileSync(args.json, JSON.stringify({ chrome: version?.Browser, gpu, screen, results }, null, 2));
  return 0;
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
