#!/usr/bin/env node
/**
 * The local editor behind tools/boss-tuner.
 *
 * A boss's presentation is spread across four files: the collision radius is a
 * shared constant, its ellipse lives in shared/, the status bar's anchor and
 * the shadow are client constants, and the draw size is a literal inside the
 * renderer. Tuning any of it meant editing numbers in different places and
 * reloading the game to see what they did.
 *
 * This reads those constants, serves them with the artwork, and writes the
 * edited values straight back to the same named constants. It only ever
 * rewrites a line it can find by name, and only on 127.0.0.1.
 *
 *     npm run boss:tuner
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import ts from "typescript";
import { loadBossCatalog } from "./boss-tuner-catalog.mjs";

const root = resolve(import.meta.dirname, "..");
let port = Number(process.env.BOSS_TUNER_PORT ?? 8765);
const editorFiles = ["scripts/boss-tuner-server.mjs", "tools/boss-tuner/index.html", "tools/boss-tuner/boss-tuner.js", "tools/boss-tuner/boss-tuner.css", "src/game/runtime/sprite-pixels.ts", "src/game/runtime/boss-frame-geometry.ts", "scripts/boss-tuner-catalog.mjs", "src/game/boss-art.json", "src/game/runtime/actor-shadow-geometry.ts"];
const editorVersion = createHash("sha256").update((await Promise.all(editorFiles.map((file) => readFile(join(root, file))))).map((bytes) => bytes.toString("utf8")).join("\n")).digest("hex");

const HITBOX_FILE = "shared/boss-hitbox.ts";
const CONSTANTS_FILE = "src/game/constants.ts";
const CROPS_FILE = "src/game/boss-frame-crops.json";

let BOSSES = await loadBossCatalog(root);

const readNumber = (source, name) => {
  const match = source.match(new RegExp(`export const ${name} = (-?[\\d.]+);`));
  return match ? Number(match[1]) : null;
};

/** Rewrites an existing constant, or appends one when the boss has none yet. */
function writeNumber(source, name, value, comment) {
  const pattern = new RegExp(`(export const ${name} = )(-?[\\d.]+)(;)`);
  if (pattern.test(source)) return source.replace(pattern, (_match, prefix, _old, suffix) => `${prefix}${value}${suffix}`);
  return `${source.trimEnd()}\n\n${comment ? `/** ${comment} */\n` : ""}export const ${name} = ${value};\n`;
}

const FIELD_LIMITS = {
  radius: [40, 320], verticalRadius: [20, 320], hitboxOffsetY: [-160, 220],
  spriteY: [-320, 320], artTop: [-400, 40], groundOffset: [-60, 320], depthOffset: [-60, 400],
};
const CROP_LIMITS = {
  clipLeft: [-400, 400], clipRight: [-400, 400], clipTop: [-400, 400], clipBottom: [-400, 400],
  sourceX: [-200, 200], sourceY: [-200, 200], sourceWidth: [-400, 400], sourceHeight: [-400, 400],
  offsetX: [-200, 200], offsetY: [-200, 200], scale: [-0.6, 0.6],
  statusOffsetY: [-200, 200],
};
class InputError extends Error {}

function validateEdits(edits) {
  if (!Array.isArray(edits)) throw new InputError("Expected a list of edited bosses.");
  const seen = new Set();
  for (const edit of edits) {
    const boss = BOSSES.find((row) => row.id === edit?.id);
    if (!boss || seen.has(edit.id)) throw new InputError("Unknown or repeated boss in save request.");
    seen.add(edit.id);
    for (const [key, [min, max]] of Object.entries(FIELD_LIMITS)) {
      if (typeof edit[key] !== "number" || !Number.isFinite(edit[key]) || edit[key] < min || edit[key] > max) {
        throw new InputError(`${boss.name}: ${key} must be between ${min} and ${max}.`);
      }
    }
    for (const [index, crop] of Object.entries(edit.crops ?? {})) {
      if (!/^\d+$/.test(index) || Number(index) >= boss.frames * (boss.rows ?? 1) || !crop || typeof crop !== "object") {
        throw new InputError(`${boss.name}: invalid frame correction.`);
      }
      for (const [key, value] of Object.entries(crop)) {
        const limits = CROP_LIMITS[key];
        if (!limits || typeof value !== "number" || !Number.isFinite(value) || value < limits[0] || value > limits[1]) {
          throw new InputError(`${boss.name}: invalid ${key} correction.`);
        }
      }
    }
  }
}

async function loadBosses() {
  BOSSES = await loadBossCatalog(root);
  const [hitbox, constants, cropsJson] = await Promise.all(
    [HITBOX_FILE, CONSTANTS_FILE, CROPS_FILE].map((file) => readFile(join(root, file), "utf8")),
  );
  const crops = JSON.parse(cropsJson || "{}");
  return BOSSES.map((boss) => ({
    crops: crops[boss.id] ?? {},
    ...boss,
    radius: readNumber(hitbox, `${boss.id}_RADIUS`) ?? 170,
    verticalRadius: readNumber(hitbox, `${boss.id}_VERTICAL_RADIUS`),
    hitboxOffsetY: readNumber(hitbox, `${boss.id}_HITBOX_OFFSET_Y`) ?? 0,
    artTop: readNumber(constants, `${boss.id}_ART_TOP`) ?? boss.artTop ?? null,
    spriteY: readNumber(constants, boss.spriteYConstant ?? `${boss.id}_SPRITE_Y_OFFSET`) ?? boss.spriteY,
    depthOffset: readNumber(constants, `${boss.id}_DEPTH_OFFSET`) ?? 0,
    groundOffset: readNumber(constants, `${boss.id}_SPRITE_GROUND_OFFSET`) ?? boss.defaultGroundOffset ?? 0,
  }));
}

async function saveBosses(edits) {
  validateEdits(edits);
  if (!edits.length) return [];
  let hitbox = await readFile(join(root, HITBOX_FILE), "utf8");
  let constants = await readFile(join(root, CONSTANTS_FILE), "utf8");
  const crops = JSON.parse(await readFile(join(root, CROPS_FILE), "utf8"));
  const changed = [];
  for (const edit of edits) {
    const boss = BOSSES.find((row) => row.id === edit.id);
    const round = (value) => Math.round(Number(value));
    hitbox = writeNumber(hitbox, `${boss.id}_RADIUS`, round(edit.radius));
    hitbox = writeNumber(hitbox, `${boss.id}_VERTICAL_RADIUS`, round(edit.verticalRadius),
      `${boss.name}'s body height. Tuned in tools/boss-tuner.`);
    hitbox = writeNumber(hitbox, `${boss.id}_HITBOX_OFFSET_Y`, round(edit.hitboxOffsetY),
      `Where ${boss.name}'s body sits relative to its anchor.`);
    constants = writeNumber(constants, `${boss.id}_ART_TOP`, round(edit.artTop),
      `Where ${boss.name}'s pixels start, which the status bar hangs from.`);
    constants = writeNumber(constants, `${boss.id}_SPRITE_GROUND_OFFSET`, round(edit.groundOffset));
    constants = writeNumber(constants, boss.spriteYConstant ?? `${boss.id}_SPRITE_Y_OFFSET`, round(edit.spriteY),
      `Where ${boss.name}'s artwork sits, apart from its shadow and its depth.`);
    constants = writeNumber(constants, `${boss.id}_DEPTH_OFFSET`, round(edit.depthOffset),
      `Where ${boss.name} sorts against a player beside it.`);
    changed.push(boss.id);
  }
  // Frame corrections are data, not constants: only the frames a boss has
  // actually been nudged on are written, so the file stays readable.
  for (const edit of edits) {
    const kept = Object.fromEntries(Object.entries(edit.crops ?? {})
      .map(([frame, crop]) => [frame, Object.fromEntries(Object.entries(crop)
        .filter(([, value]) => Number(value) !== 0)
        .map(([field, value]) => [field, Number(value)]))])
      .filter(([, crop]) => Object.keys(crop).length > 0));
    if (Object.keys(kept).length > 0) crops[edit.id] = kept;
    else delete crops[edit.id];
  }
  await Promise.all([
    writeFile(join(root, HITBOX_FILE), hitbox),
    writeFile(join(root, CONSTANTS_FILE), constants),
    writeFile(join(root, CROPS_FILE), `${JSON.stringify(crops, null, 2)}\n`),
  ]);
  return changed;
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };

const server = createServer(async (request, response) => {
  const send = (status, body, type = "application/json") => {
    response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    response.end(body);
  };
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/meta") return send(200, JSON.stringify({ root, editorVersion }));
    if (url.pathname === "/api/bosses") return send(200, JSON.stringify(await loadBosses()));
    if (["/sprite-pixels.js", "/boss-frame-geometry.js", "/actor-shadow-geometry.js"].includes(url.pathname)) {
      const source = await readFile(join(root, `src/game/runtime${url.pathname.replace(/\.js$/, ".ts")}`), "utf8");
      return send(200, ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText, "text/javascript");
    }
    if (url.pathname === "/api/save" && request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const edits = JSON.parse(Buffer.concat(chunks).toString() || "[]");
      return send(200, JSON.stringify({ saved: await saveBosses(edits) }));
    }
    // Everything else is the page itself or the artwork it draws.
    const path = url.pathname === "/" ? "tools/boss-tuner/index.html"
      : url.pathname.startsWith("/assets/") ? `public${decodeURIComponent(url.pathname)}`
        : `tools/boss-tuner${url.pathname}`;
    const file = resolve(root, path);
    if (!file.startsWith(root + sep)) return send(403, "{}");
    send(200, await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
  } catch (error) {
    send(error?.code === "ENOENT" ? 404 : error instanceof InputError || error instanceof SyntaxError ? 400 : 500,
      JSON.stringify({ error: String(error?.message ?? error) }));
  }
});

const address = () => `http://127.0.0.1:${port}/`;
const open = () => { if (!process.argv.includes("--no-open")) spawn("open", [address()], { stdio: "ignore" }); };

// Reuse a matching editor; use another local port if that process is stale or
// belongs to a different checkout. Opening an old tuner can silently write to
// the wrong project or show an outdated UI.
let occupiedPorts = 0;
server.on("error", async (error) => {
  if (error?.code !== "EADDRINUSE") {
    console.error(error);
    process.exitCode = 1;
    return;
  }
  try {
    const response = await fetch(`${address()}api/meta`, { signal: AbortSignal.timeout(1000) });
    const meta = response.ok ? await response.json() : null;
    if (meta?.root === root && meta?.editorVersion === editorVersion) {
      console.log(`A matching boss tuner is already running on ${address()} — opening it.`);
      open();
      return;
    }
  } catch { /* Occupied by another service or an older tuner. */ }
  if (++occupiedPorts > 20) {
    console.error("Could not find a free local port for the boss tuner.");
    process.exitCode = 1;
    return;
  }
  port += 1;
  server.listen(port, "127.0.0.1");
});

server.on("listening", () => {
  console.log(`Boss tuner: ${address()}\nEdits write straight to the constants. Control-C stops it.`);
  open();
});
server.listen(port, "127.0.0.1");
