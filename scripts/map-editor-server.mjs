import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const editorDirectory = join(projectRoot, "tools/map-editor");
const designFile = join(projectRoot, "src/game/map-designs.json");
const gameplayFile = join(projectRoot, "shared/map-editor-overrides.ts");
const backupDirectory = join(projectRoot, "art-source/map-editor-backups");
const snapshotScript = join(projectRoot, "scripts/map-editor-snapshot.ts");
const tsxBinary = join(projectRoot, "node_modules/.bin/tsx");
const port = Number(process.env.WILDSTAT_MAP_EDITOR_PORT || 4174);
const host = "127.0.0.1";
const maximumBodyBytes = 12 * 1024 * 1024;
const idleLifetimeMs = 24 * 60 * 60 * 1_000;
let lastRequestAt = Date.now();

const knownMapIds = new Set([
  "tutorial_forest",
  "beginner_desert",
  "intermediate_snowlands",
  "advanced_lava_wastes",
  "infernal_depths",
  "water_reach",
  "samurai_garden",
  "cloudspire",
  "moonfen",
]);
const liveMapConnections = {
  tutorial_forest: ["beginner_desert"],
  beginner_desert: ["tutorial_forest", "intermediate_snowlands"],
  intermediate_snowlands: ["beginner_desert", "advanced_lava_wastes"],
  advanced_lava_wastes: ["intermediate_snowlands", "infernal_depths"],
  infernal_depths: ["advanced_lava_wastes", "water_reach"],
  water_reach: ["infernal_depths", "samurai_garden"],
  samurai_garden: ["water_reach", "cloudspire"],
  cloudspire: ["samurai_garden", "moonfen"],
  moonfen: ["cloudspire"],
};
const decorTypes = new Set([
  "tree", "grass", "petal", "cherryPetal", "cactus", "rock", "desertGrass",
  "snowPine", "snowTuft", "upgradeBench", "lavaPool", "lavaRock", "charredTree",
  "coral", "shell", "cloud", "skyShard", "glowMushroom", "lilyPad",
]);
const scalableDecor = new Set([
  "tree", "cactus", "rock", "snowPine", "upgradeBench", "lavaPool", "lavaRock",
  "charredTree", "coral", "shell", "cloud", "skyShard", "glowMushroom", "lilyPad",
]);
const variantDecor = new Set([
  "tree", "grass", "petal", "cherryPetal", "cactus", "rock", "desertGrass",
  "snowTuft", "lavaPool", "lavaRock", "charredTree", "coral", "shell", "cloud",
  "skyShard", "glowMushroom", "lilyPad",
]);
const formations = new Set(["scatter", "crescent", "shoal", "ranks"]);
const cssColorPattern = /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([\d\s.,%+-]+\)|hsla?\([\d\s.,%+-]+\))$/i;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function jsonResponse(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function number(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return Math.round(value * 1000) / 1000;
}

function point(value, label) {
  if (!value || typeof value !== "object") throw new Error(`${label} is missing.`);
  return {
    x: number(value.x, `${label} X`, 0, 4800),
    y: number(value.y, `${label} Y`, 0, 4800),
  };
}

function text(value, label, maximum = 80) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${label} must be 1–${maximum} characters.`);
  }
  return value.trim();
}

function color(value, label) {
  if (typeof value !== "string" || value.length > 48 || !cssColorPattern.test(value.trim())) {
    throw new Error(`${label} is not a supported CSS color.`);
  }
  return value.trim();
}

function mapId(value, label = "Map ID") {
  const id = text(value, label, 64).toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(id)) {
    throw new Error(`${label} must use lowercase letters, numbers, and underscores.`);
  }
  return id;
}

function loadSnapshot() {
  const result = spawnSync(tsxBinary, [snapshotScript], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Could not build the map snapshot.");
  return JSON.parse(result.stdout);
}

function normalizeDesign(value, enemyKinds, enemyRewards) {
  if (!value || typeof value !== "object") throw new Error("Map data is missing.");
  const id = mapId(value.id);
  const theme = value.theme;
  if (!theme || typeof theme !== "object") throw new Error("Map theme is missing.");
  const decorColors = {};
  if (theme.decorColors && typeof theme.decorColors === "object") {
    for (const [type, colors] of Object.entries(theme.decorColors)) {
      if (!decorTypes.has(type) || !Array.isArray(colors) || colors.length > 8) continue;
      decorColors[type] = colors.map((entry, index) => color(entry, `${type} color ${index + 1}`));
    }
  }
  if (!Array.isArray(value.paths) || value.paths.length > 2_000) throw new Error("A map can have at most 2,000 paths.");
  const paths = value.paths.map((path, index) => ({
    x: number(path?.x, `Path ${index + 1} X`, 0, 4800),
    y: number(path?.y, `Path ${index + 1} Y`, 0, 4800),
    w: number(path?.w, `Path ${index + 1} width`, 10, 4800),
    h: number(path?.h, `Path ${index + 1} height`, 10, 4800),
  }));
  if (!Array.isArray(value.decor) || value.decor.length > 15_000) throw new Error("A map can have at most 15,000 decorations.");
  const decor = value.decor.map((item, index) => {
    if (!item || typeof item !== "object" || !decorTypes.has(item.type)) throw new Error(`Decoration ${index + 1} has an unknown type.`);
    const normalized = {
      type: item.type,
      x: number(item.x, `Decoration ${index + 1} X`, 0, 4800),
      y: number(item.y, `Decoration ${index + 1} Y`, 0, 4800),
    };
    if (scalableDecor.has(item.type)) normalized.s = number(item.s ?? 1, `Decoration ${index + 1} scale`, .1, 5);
    if (variantDecor.has(item.type)) normalized.variant = Math.round(number(item.variant ?? 0, `Decoration ${index + 1} variant`, 0, 999));
    if (item.color) normalized.color = color(item.color, `Decoration ${index + 1} color`);
    if (item.type === "upgradeBench") normalized.label = "Upgrade Bench";
    return normalized;
  });
  if (knownMapIds.has(id)) {
    const upgradeBenchCount = decor.filter((item) => item.type === "upgradeBench").length;
    if (id === "intermediate_snowlands" && upgradeBenchCount !== 1) {
      throw new Error("Intermediate Snowlands must keep exactly one functional Upgrade Bench.");
    }
    if (id !== "intermediate_snowlands" && upgradeBenchCount > 0) {
      throw new Error("The functional Upgrade Bench can only be placed in Intermediate Snowlands.");
    }
  }
  if (!Array.isArray(value.spawnCamps) || value.spawnCamps.length > 100) throw new Error("A map can have at most 100 enemy camps.");
  const spawnCamps = value.spawnCamps.map((camp, index) => {
    if (!Array.isArray(camp?.types) || camp.types.length === 0 || camp.types.length > 20 || camp.types.some((kind) => !enemyKinds.has(kind))) {
      throw new Error(`Camp ${index + 1} must contain valid enemy types.`);
    }
    const normalized = {
      name: text(camp.name, `Camp ${index + 1} name`, 60),
      ...point(camp, `Camp ${index + 1}`),
      minRadius: number(camp.minRadius ?? 0, `Camp ${index + 1} inner radius`, 0, 1200),
      radius: number(camp.radius, `Camp ${index + 1} radius`, 0, 1400),
      count: Math.round(number(camp.count, `Camp ${index + 1} count`, 1, 100)),
      types: [...camp.types],
    };
    if (normalized.minRadius > normalized.radius) throw new Error(`Camp ${index + 1} inner radius cannot exceed its radius.`);
    if (camp.formation && formations.has(camp.formation)) normalized.formation = camp.formation;
    if (camp.rotation !== undefined) normalized.rotation = number(camp.rotation, `Camp ${index + 1} rotation`, -6.284, 6.284);
    if (camp.ground) normalized.ground = color(camp.ground, `Camp ${index + 1} ground color`);
    if (camp.ring) normalized.ring = color(camp.ring, `Camp ${index + 1} ring color`);
    if (new Set(normalized.types.map((kind) => enemyRewards.get(kind))).size > 1) {
      throw new Error(`Camp ${index + 1} mixes enemies that grant different reward stats.`);
    }
    return normalized;
  });
  for (let left = 0; left < spawnCamps.length; left += 1) {
    for (let right = left + 1; right < spawnCamps.length; right += 1) {
      const first = spawnCamps[left];
      const second = spawnCamps[right];
      if (Math.hypot(first.x - second.x, first.y - second.y) < first.radius + second.radius + 160) {
        throw new Error(`${first.name} overlaps ${second.name}. Move the camps farther apart or reduce their radii.`);
      }
    }
  }
  const gameplay = value.gameplay;
  if (!gameplay || typeof gameplay !== "object" || !Array.isArray(gameplay.portals) || gameplay.portals.length < 1 || gameplay.portals.length > 2) {
    throw new Error("A map needs one or two portals.");
  }
  const portals = gameplay.portals.map((portal, index) => ({
    ...point(portal, `Portal ${index + 1}`),
    width: number(portal.width, `Portal ${index + 1} width`, 40, 600),
    height: number(portal.height, `Portal ${index + 1} height`, 40, 600),
    depth: number(portal.depth ?? portal.y, `Portal ${index + 1} depth`, 0, 4800),
    destination: mapId(portal.destination, `Portal ${index + 1} destination`),
  }));
  if (knownMapIds.has(id) && portals.some((portal) => !knownMapIds.has(portal.destination) || portal.destination === id)) {
    throw new Error("Live-map portals must point to another existing game map.");
  }
  const expectedPortalCount = id === "tutorial_forest" || id === "moonfen" ? 1 : 2;
  if (knownMapIds.has(id) && portals.length !== expectedPortalCount) {
    throw new Error(`This game map must keep ${expectedPortalCount === 1 ? "one portal" : "its two portals"} so progression stays connected.`);
  }
  if (knownMapIds.has(id) && portals.some((portal, index) => portal.destination !== liveMapConnections[id][index])) {
    throw new Error("Live-map portal destinations are locked so the campaign route cannot be disconnected.");
  }
  const bootsPickup = gameplay.bootsPickup ? point(gameplay.bootsPickup, "Trailblazer Boots pickup") : null;
  if (id === "tutorial_forest" && !bootsPickup) {
    throw new Error("Tutorial Forest must keep its Trailblazer Boots pickup.");
  }
  if (knownMapIds.has(id) && id !== "tutorial_forest" && bootsPickup) {
    throw new Error("The Trailblazer Boots pickup can only be placed in Tutorial Forest.");
  }
  return {
    id,
    name: text(value.name, "Map name", 60),
    templateId: mapId(value.templateId || id, "Template ID"),
    status: knownMapIds.has(id) ? "live" : "draft",
    updatedAt: new Date().toISOString(),
    theme: {
      ground: color(theme.ground, "Ground color"),
      path: color(theme.path, "Path color"),
      pathDetail: color(theme.pathDetail, "Path detail color"),
      decorColors,
    },
    paths,
    decor,
    spawnCamps,
    gameplay: {
      arrival: point(gameplay.arrival, "Arrival"),
      boss: point(gameplay.boss, "Boss"),
      ...(bootsPickup ? { bootsPickup } : {}),
      portals,
    },
  };
}

async function readDesignDocument() {
  return JSON.parse(await readFile(designFile, "utf8"));
}

async function backUpDesignDocument(current, id) {
  await mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  await writeFile(join(backupDirectory, `${timestamp}-${id}.json`), `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

function generatedGameplaySource(document) {
  const overrides = Object.fromEntries(Object.entries(document.maps ?? {})
    .filter(([, design]) => design.gameplayEdited)
    .map(([id, design]) => {
      const upgradeBench = upgradeBenchPosition(design);
      return [id, {
        name: design.name,
        arrival: design.gameplay.arrival,
        boss: design.gameplay.boss,
        ...(design.gameplay.bootsPickup ? { bootsPickup: design.gameplay.bootsPickup } : {}),
        ...(upgradeBench ? { upgradeBench } : {}),
        portals: design.gameplay.portals,
      }];
    }));
  return `/**\n * Generated by the local WildStat Map Editor.\n * Do not hand-edit this file; the editor validates and replaces it atomically.\n */\nexport type MapEditorGameplayOverride = {\n  name: string;\n  arrival: { x: number; y: number };\n  boss: { x: number; y: number };\n  bootsPickup?: { x: number; y: number };\n  upgradeBench?: { x: number; y: number };\n  portals: {\n    x: number;\n    y: number;\n    width: number;\n    height: number;\n    depth: number;\n    destination: string;\n  }[];\n};\n\nexport const MAP_EDITOR_GAMEPLAY_OVERRIDES: Readonly<Record<string, MapEditorGameplayOverride>> = ${JSON.stringify(overrides, null, 2)};\n`;
}

function upgradeBenchPosition(map) {
  const bench = map?.decor.find((item) => item.type === "upgradeBench");
  return bench ? { x: bench.x, y: bench.y } : null;
}

async function writeDesignDocument(document) {
  const designTemp = `${designFile}.tmp`;
  const gameplayTemp = `${gameplayFile}.tmp`;
  await writeFile(designTemp, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await writeFile(gameplayTemp, generatedGameplaySource(document), "utf8");
  await rename(designTemp, designFile);
  await rename(gameplayTemp, gameplayFile);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodyBytes) throw new Error("Map data is too large to save.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function saveMap(request, response) {
  const body = await readJsonBody(request);
  const snapshot = loadSnapshot();
  const enemyKinds = new Set(snapshot.enemyKinds.map((enemy) => typeof enemy === "string" ? enemy : enemy.id));
  const enemyRewards = new Map(snapshot.enemyKinds.map((enemy) => typeof enemy === "string" ? [enemy, "unknown"] : [enemy.id, enemy.reward]));
  const design = normalizeDesign(body.map, enemyKinds, enemyRewards);
  const document = await readDesignDocument();
  const prior = document.maps?.[design.id];
  const effectiveBeforeSave = snapshot.maps.find((map) => map.id === design.id);
  design.gameplayEdited = design.status === "live" && Boolean(
    prior?.gameplayEdited ||
    (effectiveBeforeSave && (
      JSON.stringify(effectiveBeforeSave.gameplay) !== JSON.stringify(design.gameplay) ||
      JSON.stringify(upgradeBenchPosition(effectiveBeforeSave)) !== JSON.stringify(upgradeBenchPosition(design))
    )),
  );
  await backUpDesignDocument(document, design.id);
  if (design.status === "live") document.maps[design.id] = design;
  else document.drafts[design.id] = design;
  if (body.originalId && body.originalId !== design.id && !knownMapIds.has(body.originalId)) delete document.drafts[body.originalId];
  await writeDesignDocument(document);
  jsonResponse(response, 200, {
    ok: true,
    map: design,
    message: design.status === "live"
      ? `${design.name} was saved to the game source.`
      : `${design.name} was created as a map draft.`,
    serverPublishNeeded: Boolean(design.gameplayEdited),
  });
}

async function removeSavedMap(request, response, id) {
  const normalizedId = mapId(id);
  const document = await readDesignDocument();
  const exists = knownMapIds.has(normalizedId) ? document.maps[normalizedId] : document.drafts[normalizedId];
  if (!exists) return jsonResponse(response, 404, { error: "That map has no saved editor data." });
  await backUpDesignDocument(document, normalizedId);
  if (knownMapIds.has(normalizedId)) delete document.maps[normalizedId];
  else delete document.drafts[normalizedId];
  await writeDesignDocument(document);
  jsonResponse(response, 200, { ok: true, removed: normalizedId });
}

async function serveFile(response, pathname) {
  const editorPrefix = "/tools/map-editor/";
  const requestedPath = pathname === "/" || pathname === "/tools/map-editor"
    ? "index.html"
    : pathname.startsWith(editorPrefix)
      ? decodeURIComponent(pathname.slice(editorPrefix.length)) || "index.html"
      : null;
  if (!requestedPath) return jsonResponse(response, 404, { error: "Not found." });
  const absolutePath = resolve(editorDirectory, requestedPath);
  if (relative(editorDirectory, absolutePath).startsWith("..")) return jsonResponse(response, 403, { error: "Forbidden." });
  let filePath = normalize(absolutePath);
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(contents);
  } catch {
    jsonResponse(response, 404, { error: "Not found." });
  }
}

function hasAllowedMutationOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === `http://${host}:${port}` || origin === `http://localhost:${port}`;
}

const server = createServer(async (request, response) => {
  lastRequestAt = Date.now();
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/api/maps") {
      return jsonResponse(response, 200, loadSnapshot());
    }
    if ((request.method === "POST" || request.method === "DELETE") && !hasAllowedMutationOrigin(request)) {
      return jsonResponse(response, 403, { error: "Map changes are only accepted from the local editor." });
    }
    if (request.method === "POST" && url.pathname === "/api/maps/save") {
      return await saveMap(request, response);
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/maps/")) {
      return await removeSavedMap(request, response, decodeURIComponent(url.pathname.slice("/api/maps/".length)));
    }
    if (request.method !== "GET") return jsonResponse(response, 405, { error: "Method not allowed." });
    return await serveFile(response, url.pathname);
  } catch (error) {
    jsonResponse(response, 400, { error: error instanceof Error ? error.message : "Map editor request failed." });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`WildStat Map Editor: http://${host}:${port}/tools/map-editor/\n`);
});

const idleTimer = setInterval(() => {
  if (Date.now() - lastRequestAt >= idleLifetimeMs) server.close();
}, 60_000);
idleTimer.unref();
