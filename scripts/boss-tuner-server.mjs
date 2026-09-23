#!/usr/bin/env node
/**
 * The local editor behind tools/boss-tuner.
 *
 * A boss's presentation is spread across four files: the collision radius is a
 * server constant, its ellipse lives in shared/, the status bar's anchor and
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
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.BOSS_TUNER_PORT ?? 8765);

const HITBOX_FILE = "shared/boss-hitbox.ts";
const CONSTANTS_FILE = "src/game/constants.ts";
const COMBAT_FILE = "spacetimedb/src/boss-combat.ts";
const CROPS_FILE = "src/game/boss-frame-crops.json";

/**
 * Mirrors the draw call in boss-renderer.ts. These are literals in the
 * renderer rather than data, so the tool carries its own copy; the preview is
 * wrong if they drift, which the sheet's own dimensions make obvious.
 */
const BOSSES = [
  { id: "SPIDER", name: "Spider", sheet: "desert-scorpion-boss-spritesheet-v1.webp", frames: 4, drawWidth: 330, drawHeight: 0, groundBaseline: 0.88, spriteY: 0, shadowWidth: 220, defaultGroundOffset: 55, spriteYConstant: "SPIDER_STAND_OFFSET", frameNames: ['walk 1', 'walk 2', 'walk 3', 'walk 4'], frameNote: "Walk cycle: every frame plays, always." },
  { id: "FROSTCLAW", name: "Frostclaw", sheet: "frostclaw-boss-spritesheet.webp", frames: 4, drawWidth: 330, drawHeight: 440, spriteY: -12, shadowWidth: 210 , frameNames: ['idle 1 / —', 'idle 2 / rift', 'idle 3 / roar', 'idle 4 / icefall'], frameNote: "Idle cycles through all four; the same frames double as rift, roar and icefall." },
  { id: "MAGMALISK", name: "Magmalisk", sheet: "magmalisk-boss-spritesheet.webp", frames: 4, drawWidth: 390, drawHeight: 520, spriteY: -8, shadowWidth: 240 , frameNames: ['idle', 'bite', 'erupt', 'never drawn'], frameNote: "Only three frames are ever chosen." },
  { id: "GLOOMROOT", name: "Gloomroot", sheet: "gloomroot-boss-spritesheet-v1.webp", frames: 2, rows: 2, drawWidth: 430, drawHeight: 430, spriteY: -18, shadowWidth: 250 , frameNames: ['idle', 'sweep', 'never drawn', 'bloom'], frameNote: "Frame 2 is never chosen." },
  { id: "TIDEWYRM", name: "Tidewyrm", sheet: "tidewyrm-boss-spritesheet-v1.webp", frames: 4, drawWidth: 440, drawHeight: 440, spriteY: -28, shadowWidth: 255 , frameNames: ['idle', 'surge', 'surge windup', 'whirlpool'] },
  { id: "KOI_SHOGUN", name: "Koi Shogun", sheet: "koi-shogun-boss-spritesheet-v1.webp", frames: 4, drawWidth: 330, drawHeight: 440, spriteY: -30, shadowWidth: 210 , frameNames: ['idle', 'slash', 'slash windup', 'whirlpool'] },
  { id: "TEMPEST_KIRIN", name: "Tempest Kirin", sheet: "tempest-kirin-boss-spritesheet-v1.webp", frames: 4, drawWidth: 356, drawHeight: 542, spriteY: -42, shadowWidth: 230 , frameNames: ['idle', 'charge windup', 'charge', 'thunderbolt'] },
  { id: "MIREMAW", name: "Miremaw", sheet: "miremaw-boss-spritesheet-v1.webp", frames: 4, drawWidth: 470, drawHeight: 532, spriteY: -45, shadowWidth: 285 , frameNames: ['idle', 'tongue windup', 'tongue', 'bog burst'] },
];

const readNumber = (source, name) => {
  const match = source.match(new RegExp(`export const ${name} = (-?[\\d.]+);`));
  return match ? Number(match[1]) : null;
};

/** Rewrites an existing constant, or appends one when the boss has none yet. */
function writeNumber(source, name, value, comment) {
  const pattern = new RegExp(`(export const ${name} = )(-?[\\d.]+)(;)`);
  if (pattern.test(source)) return source.replace(pattern, `$1${value}$3`);
  return `${source.trimEnd()}\n\n${comment ? `/** ${comment} */\n` : ""}export const ${name} = ${value};\n`;
}

async function loadBosses() {
  const [hitbox, constants, combat, cropsJson] = await Promise.all(
    [HITBOX_FILE, CONSTANTS_FILE, COMBAT_FILE, CROPS_FILE].map((file) => readFile(join(root, file), "utf8")),
  );
  const crops = JSON.parse(cropsJson || "{}");
  return BOSSES.map((boss) => ({
    crops: crops[boss.id] ?? {},
    ...boss,
    radius: readNumber(combat, `${boss.id}_RADIUS`) ?? 170,
    verticalRadius: readNumber(hitbox, `${boss.id}_VERTICAL_RADIUS`),
    hitboxOffsetY: readNumber(hitbox, `${boss.id}_HITBOX_OFFSET_Y`) ?? 0,
    artTop: readNumber(constants, `${boss.id}_ART_TOP`),
    spriteY: readNumber(constants, boss.spriteYConstant ?? `${boss.id}_SPRITE_Y_OFFSET`) ?? boss.spriteY,
    depthOffset: readNumber(constants, `${boss.id}_DEPTH_OFFSET`) ?? 0,
    groundOffset: readNumber(constants, `${boss.id}_SPRITE_GROUND_OFFSET`) ?? boss.defaultGroundOffset ?? 0,
  }));
}

async function saveBosses(edits) {
  let hitbox = await readFile(join(root, HITBOX_FILE), "utf8");
  let constants = await readFile(join(root, CONSTANTS_FILE), "utf8");
  let combat = await readFile(join(root, COMBAT_FILE), "utf8");
  const changed = [];
  for (const edit of edits) {
    const boss = BOSSES.find((row) => row.id === edit.id);
    if (!boss) continue;
    const round = (value) => Math.round(Number(value));
    combat = writeNumber(combat, `${boss.id}_RADIUS`, round(edit.radius));
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
  const crops = {};
  for (const edit of edits) {
    const kept = Object.fromEntries(Object.entries(edit.crops ?? {})
      .map(([frame, crop]) => [frame, Object.fromEntries(Object.entries(crop)
        .filter(([, value]) => Number(value) !== 0)
        .map(([field, value]) => [field, Number(value)]))])
      .filter(([, crop]) => Object.keys(crop).length > 0));
    if (Object.keys(kept).length > 0) crops[edit.id] = kept;
  }
  await Promise.all([
    writeFile(join(root, HITBOX_FILE), hitbox),
    writeFile(join(root, CONSTANTS_FILE), constants),
    writeFile(join(root, COMBAT_FILE), combat),
    writeFile(join(root, CROPS_FILE), `${JSON.stringify(crops, null, 2)}\n`),
  ]);
  return changed;
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };

const server = createServer(async (request, response) => {
  const send = (status, body, type = "application/json") => {
    response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    response.end(body);
  };
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/bosses") return send(200, JSON.stringify(await loadBosses()));
    if (url.pathname === "/api/save" && request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const edits = JSON.parse(Buffer.concat(chunks).toString() || "[]");
      return send(200, JSON.stringify({ saved: await saveBosses(edits) }));
    }
    // Everything else is the page itself or the artwork it draws.
    const path = url.pathname === "/" ? "tools/boss-tuner/index.html"
      : url.pathname.startsWith("/assets/") ? `public${url.pathname}`
        : `tools/boss-tuner${url.pathname}`;
    const file = resolve(root, path);
    if (!file.startsWith(root)) return send(403, "{}");
    send(200, await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
  } catch (error) {
    send(error?.code === "ENOENT" ? 404 : 500, JSON.stringify({ error: String(error?.message ?? error) }));
  }
});

const address = `http://127.0.0.1:${port}/`;
const open = () => { if (!process.argv.includes("--no-open")) spawn("open", [address], { stdio: "ignore" }); };

// A tuner left running from earlier is the common case, and a stack trace is
// no way to say so: point the browser at the one that is already up.
server.on("error", (error) => {
  if (error?.code !== "EADDRINUSE") throw error;
  console.log(`A boss tuner is already running on ${address} — opening that one.`);
  open();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Boss tuner: ${address}\nEdits write straight to the constants. Control-C stops it.`);
  open();
});
