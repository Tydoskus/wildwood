#!/usr/bin/env node
// Bakes the Trade Chrysanthemum's sprites (scripts/art/market-sprites.ts) into one sheet. Headless Chrome draws each
// at 1.5 px a world unit (the visual-check harness's market-bake scene); they are packed into
// public/assets/wildstat/market/market-sprites.webp, their frames into src/game/market-sprites.json.
//
//   node scripts/art/bake-market-sprites.mjs [--no-build]
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { buildHarness, cleanup, cleanupAsync, connect, launchChrome, portFree, repo, startServer, waitFor } from "../../tools/visual-check/chrome-runner.mjs";

const sharp = createRequire(import.meta.url)("sharp");
const BUILD_DIR = join(repo, "local-data/visual-check-build-bake");
const PORT = 4537, CDP_PORT = 9371;
/** The sheet's width, kept under every phone's texture limit, and the gap between sprites. */
const SHEET_WIDTH = 2048, GAP = 2;

/** Rows of sprites, tallest first, each row as tall as its first. */
function pack(sprites) {
  const placed = [];
  let x = 0, y = 0, rowHeight = 0;
  for (const sprite of [...sprites].sort((a, b) => b.height - a.height || a.name.localeCompare(b.name))) {
    if (sprite.width > SHEET_WIDTH) throw new Error(`${sprite.name} is wider than the sheet`);
    if (x + sprite.width > SHEET_WIDTH) { x = 0; y += rowHeight + GAP; rowHeight = 0; }
    placed.push({ ...sprite, x, y });
    x += sprite.width + GAP;
    rowHeight = Math.max(rowHeight, sprite.height);
  }
  return { placed, height: y + rowHeight };
}

async function main() {
  if (!(await portFree(PORT)) || !(await portFree(CDP_PORT))) throw new Error(`Port ${PORT} or ${CDP_PORT} is in use`);
  if (!process.argv.includes("--no-build")) buildHarness(BUILD_DIR);
  const { server } = await startServer(PORT, [BUILD_DIR, join(repo, "public")]);
  cleanup.server = server;
  const { target } = await launchChrome(CDP_PORT, join(repo, "local-data/.bake-chrome-profile"));
  const cdp = await connect(target.webSocketDebuggerUrl);
  cleanup.cdp = cdp;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/visual-check.html#market-bake` });
  const evaluate = async expression => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
  await waitFor(() => evaluate("window.__visualReady === true && Array.isArray(window.__marketBake)"), 60_000, "the market sprites");
  const sprites = JSON.parse(await evaluate("JSON.stringify(window.__marketBake)"));
  await cleanupAsync();

  const { placed, height } = pack(sprites);
  if (height > SHEET_WIDTH) throw new Error(`The sheet would be ${height} px tall; keep it within ${SHEET_WIDTH}`);
  const layers = placed.map(sprite => ({ input: Buffer.from(sprite.data.split(",")[1], "base64"), left: sprite.x, top: sprite.y }));
  const outDir = join(repo, "public/assets/wildstat/market");
  mkdirSync(outDir, { recursive: true });
  await sharp({ create: { width: SHEET_WIDTH, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(join(outDir, "market-sprites.webp"));
  const frames = Object.fromEntries(placed.sort((a, b) => a.name.localeCompare(b.name))
    .map(sprite => [sprite.name, [sprite.x, sprite.y, sprite.width, sprite.height, sprite.ax, sprite.ay]]));
  writeFileSync(join(repo, "src/game/market-sprites.json"), `${JSON.stringify({ scale: 1.5, frames }, null, 1)}\n`);
  console.log(`${placed.length} sprites in a ${SHEET_WIDTH}x${height} sheet`);
}

main().catch(async error => { console.error(error); await cleanupAsync(); process.exit(1); });
