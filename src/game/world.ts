import { BOSS_ENEMY_SAFE_DISTANCE, WORLD } from "./constants";
import { CAMPS, type EnemyKind } from "./enemies";
import { clamp, rand } from "./math";

export type WorldPath = { x: number; y: number; w: number; h: number };
export type WorldDecor =
  | { type: "tree"; x: number; y: number; s: number; variant: number }
  | { type: "grass"; x: number; y: number; variant: number }
  | { type: "petal"; x: number; y: number; variant: number }
  | { type: "cactus"; x: number; y: number; s: number; variant: number }
  | { type: "rock"; x: number; y: number; s: number; variant: number }
  | { type: "desertGrass"; x: number; y: number; variant: number }
  | { type: "snowPine"; x: number; y: number; s: number }
  | { type: "snowTuft"; x: number; y: number; variant: number }
  | { type: "upgradeBench"; x: number; y: number; s: number; label: "Upgrade Bench" }
  | { type: "lavaPool"; x: number; y: number; s: number; variant: number }
  | { type: "lavaRock"; x: number; y: number; s: number; variant: number }
  | { type: "charredTree"; x: number; y: number; s: number; variant: number }
  | { type: "lavaEmber"; x: number; y: number; variant: number };
export type SpawnSite = {
  id: number;
  x: number;
  y: number;
  campName: string;
  type: EnemyKind;
  leashRange: number;
  alive: boolean;
  respawnAt: number;
};

type Point = { x: number; y: number };
export const TUTORIAL_FOREST_MAP_ID = "tutorial_forest";
export const BEGINNER_DESERT_MAP_ID = "beginner_desert";
export const INTERMEDIATE_SNOWLANDS_MAP_ID = "intermediate_snowlands";
export const ADVANCED_LAVA_WASTES_MAP_ID = "advanced_lava_wastes";
export type MapId =
  | typeof TUTORIAL_FOREST_MAP_ID
  | typeof BEGINNER_DESERT_MAP_ID
  | typeof INTERMEDIATE_SNOWLANDS_MAP_ID
  | typeof ADVANCED_LAVA_WASTES_MAP_ID;

const DESERT_CAMPS = [
  { name: "Sunbaked Burrow", x: 1120, y: 1160, minRadius: 150, radius: 350, count: 6, types: ["Dune Raider"] as EnemyKind[] },
  { name: "Copper Flats", x: 2780, y: 1260, minRadius: 180, radius: 410, count: 6, types: ["Dune Archer"] as EnemyKind[] },
  { name: "Oracle Mesa", x: 4140, y: 780, minRadius: 90, radius: 230, count: 3, types: ["Blight Oracle"] as EnemyKind[] },
  { name: "Reaper Approach", x: 1740, y: 1420, minRadius: 0, radius: 0, count: 1, types: ["Wastes Reaper"] as EnemyKind[] },
  { name: "Needle Dunes", x: 3950, y: 2550, minRadius: 200, radius: 470, count: 7, types: ["Venom Guard"] as EnemyKind[] },
  { name: "Drybone Basin", x: 2050, y: 3650, minRadius: 210, radius: 490, count: 7, types: ["Venom Guard"] as EnemyKind[] },
];

const SNOW_CAMPS = [
  { name: "Rimegate Trail", x: 1120, y: 1160, minRadius: 140, radius: 330, count: 6, types: ["Frost Raider"] as EnemyKind[] },
  { name: "Glacier Crossing", x: 2800, y: 1240, minRadius: 170, radius: 390, count: 6, types: ["Glacier Archer"] as EnemyKind[] },
  { name: "Whiteout Hollow", x: 4050, y: 2570, minRadius: 180, radius: 440, count: 7, types: ["Rime Guard"] as EnemyKind[] },
  { name: "Aurora Shelf", x: 2120, y: 3650, minRadius: 170, radius: 430, count: 6, types: ["Aurora Oracle", "Aurora Oracle", "Aurora Oracle", "Whiteout Reaper"] as EnemyKind[] },
];

const LAVA_CAMPS = [
  { name: "Searing Approach", x: 1120, y: 1160, minRadius: 140, radius: 330, count: 6, types: ["Ember Raider"] as EnemyKind[] },
  { name: "Magma Causeway", x: 2800, y: 1240, minRadius: 170, radius: 390, count: 6, types: ["Cinder Archer"] as EnemyKind[] },
  { name: "Obsidian Crater", x: 4050, y: 2570, minRadius: 180, radius: 440, count: 7, types: ["Magma Guard"] as EnemyKind[] },
  { name: "Ashen Shelf", x: 1850, y: 3650, minRadius: 170, radius: 430, count: 5, types: ["Ash Reaper"] as EnemyKind[] },
  { name: "Inferno Caldera", x: 3900, y: 3960, minRadius: 170, radius: 420, count: 6, types: ["Inferno Oracle", "Inferno Oracle", "Ash Reaper"] as EnemyKind[] },
];

function seededUnit(index: number, salt: number) {
  const value = Math.sin(index * 91.713 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

function createDesertLayout() {
  const decor: WorldDecor[] = [];
  const paths: WorldPath[] = [
    { x: 280, y: 360, w: 3900, h: 150 },
    { x: 1040, y: 430, w: 150, h: 3300 },
    { x: 1050, y: 2380, w: 3000, h: 150 },
    { x: 1960, y: 2380, w: 150, h: 1350 },
  ];
  const isOnRoad = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);

  for (let index = 0; index < 78; index += 1) {
    const x = 90 + seededUnit(index, 1) * (WORLD.w - 180);
    const y = 90 + seededUnit(index, 2) * (WORLD.h - 180);
    if (isOnRoad(x, y, 55) || Math.hypot(x - 360, y - 680) < 340) continue;
    decor.push({
      type: "cactus",
      x: Math.round(x),
      y: Math.round(y),
      s: .72 + seededUnit(index, 3) * .52,
      variant: index % 4,
    });
  }

  for (let index = 0; index < 125; index += 1) {
    const x = 50 + seededUnit(index, 4) * (WORLD.w - 100);
    const y = 50 + seededUnit(index, 5) * (WORLD.h - 100);
    if (isOnRoad(x, y, 18)) continue;
    decor.push({
      type: "rock",
      x: Math.round(x),
      y: Math.round(y),
      s: .55 + seededUnit(index, 6) * .7,
      variant: index % 3,
    });
  }

  for (let index = 0; index < 310; index += 1) {
    decor.push({
      type: "desertGrass",
      x: Math.round(30 + seededUnit(index, 7) * (WORLD.w - 60)),
      y: Math.round(30 + seededUnit(index, 8) * (WORLD.h - 60)),
      variant: index % 3,
    });
  }

  return { decor, paths };
}

function createSnowLayout() {
  const decor: WorldDecor[] = [
    { type: "upgradeBench", x: 800, y: 710, s: 1, label: "Upgrade Bench" },
  ];
  const paths: WorldPath[] = [
    { x: 300, y: 600, w: 3800, h: 150 },
    { x: 970, y: 600, w: 150, h: 3150 },
    { x: 1080, y: 2300, w: 2980, h: 150 },
    { x: 2000, y: 2420, w: 150, h: 1250 },
  ];
  const isOnRoad = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  for (let index = 0; index < 58; index += 1) {
    const x = 100 + seededUnit(index, 21) * (WORLD.w - 200);
    const y = 100 + seededUnit(index, 22) * (WORLD.h - 200);
    if (isOnRoad(x, y, 70) || Math.hypot(x - 360, y - 770) < 360) continue;
    decor.push({ type: "snowPine", x: Math.round(x), y: Math.round(y), s: .62 + seededUnit(index, 23) * .48 });
  }
  for (let index = 0; index < 400; index += 1) {
    const x = 26 + seededUnit(index, 24) * (WORLD.w - 52);
    const y = 26 + seededUnit(index, 25) * (WORLD.h - 52);
    if (!isOnRoad(x, y, 10)) decor.push({ type: "snowTuft", x: Math.round(x), y: Math.round(y), variant: index % 4 });
  }
  return { decor, paths };
}

function createLavaLayout() {
  const decor: WorldDecor[] = [];
  const paths: WorldPath[] = [
    { x: 300, y: 600, w: 3800, h: 150 },
    { x: 980, y: 600, w: 150, h: 3160 },
    { x: 1090, y: 2300, w: 2970, h: 150 },
    { x: 2000, y: 2420, w: 150, h: 1250 },
    { x: 2980, y: 700, w: 150, h: 1420 },
  ];
  const isOnRoad = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  const isNearArrival = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 380;

  for (let index = 0; index < 24; index += 1) {
    const x = 180 + seededUnit(index, 31) * (WORLD.w - 360);
    const y = 180 + seededUnit(index, 32) * (WORLD.h - 360);
    if (isOnRoad(x, y, 150) || isNearArrival(x, y)) continue;
    decor.push({
      type: "lavaPool",
      x: Math.round(x),
      y: Math.round(y),
      s: .62 + seededUnit(index, 33) * .68,
      variant: index % 3,
    });
  }
  for (let index = 0; index < 72; index += 1) {
    const x = 90 + seededUnit(index, 34) * (WORLD.w - 180);
    const y = 90 + seededUnit(index, 35) * (WORLD.h - 180);
    if (isOnRoad(x, y, 60) || isNearArrival(x, y)) continue;
    decor.push({
      type: "lavaRock",
      x: Math.round(x),
      y: Math.round(y),
      s: .48 + seededUnit(index, 36) * .62,
      variant: index % 3,
    });
  }
  for (let index = 0; index < 48; index += 1) {
    const x = 100 + seededUnit(index, 37) * (WORLD.w - 200);
    const y = 100 + seededUnit(index, 38) * (WORLD.h - 200);
    if (isOnRoad(x, y, 80) || isNearArrival(x, y)) continue;
    decor.push({
      type: "charredTree",
      x: Math.round(x),
      y: Math.round(y),
      s: .72 + seededUnit(index, 39) * .62,
      variant: index % 2,
    });
  }
  for (let index = 0; index < 360; index += 1) {
    const x = 25 + seededUnit(index, 40) * (WORLD.w - 50);
    const y = 25 + seededUnit(index, 41) * (WORLD.h - 50);
    if (!isOnRoad(x, y, 8)) decor.push({ type: "lavaEmber", x: Math.round(x), y: Math.round(y), variant: index % 4 });
  }
  return { decor, paths };
}

export function createWorldLayout(playerSpawn: Point, mapId: MapId = TUTORIAL_FOREST_MAP_ID) {
  if (mapId === BEGINNER_DESERT_MAP_ID) return createDesertLayout();
  if (mapId === INTERMEDIATE_SNOWLANDS_MAP_ID) return createSnowLayout();
  if (mapId === ADVANCED_LAVA_WASTES_MAP_ID) return createLavaLayout();
  const decor: WorldDecor[] = [];
  const paths: WorldPath[] = [];
  const centerX = WORLD.w / 2;
  const centerY = WORLD.h / 2;

  paths.push({ x: centerX - 105, y: 0, w: 210, h: WORLD.h });
  paths.push({ x: 0, y: centerY - 105, w: WORLD.w, h: 210 });
  paths.push({ x: 760, y: 840, w: 1640, h: 120 });
  paths.push({ x: 2400, y: 700, w: 1570, h: 120 });
  paths.push({ x: 780, y: 2790, w: 1620, h: 120 });
  paths.push({ x: 2400, y: 2720, w: 1430, h: 120 });
  paths.push({ x: 1500, y: 3950, w: 2100, h: 120 });

  const isOnRoad = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);

  const groveCenters: Point[] = [
    { x: 740, y: 620 }, { x: 1310, y: 520 }, { x: 1990, y: 500 },
    { x: 2860, y: 500 }, { x: 3720, y: 610 }, { x: 4360, y: 930 },
    { x: 560, y: 1390 }, { x: 1190, y: 2250 }, { x: 4100, y: 2360 },
    { x: 620, y: 3020 }, { x: 1390, y: 3650 }, { x: 2640, y: 3670 },
    { x: 4210, y: 3430 }, { x: 780, y: 4320 }, { x: 2440, y: 4380 },
  ];
  const treeOffsets = [
    { x: -118, y: -54 }, { x: 104, y: -66 }, { x: -72, y: 86 }, { x: 126, y: 104 },
  ];
  let treeVariant = 0;
  for (let groveIndex = 0; groveIndex < groveCenters.length; groveIndex += 1) {
    const center = groveCenters[groveIndex];
    for (let offsetIndex = 0; offsetIndex < treeOffsets.length; offsetIndex += 1) {
      const offset = treeOffsets[(offsetIndex + groveIndex) % treeOffsets.length];
      const x = center.x + offset.x;
      const y = center.y + offset.y;
      if (isOnRoad(x, y, 78)) continue;
      if (Math.hypot(x - playerSpawn.x, y - playerSpawn.y) < 430) continue;
      decor.push({
        type: "tree",
        x: Math.round(x),
        y: Math.round(y),
        s: [0.82, 0.94, 1.06, 0.88][(groveIndex + offsetIndex) % 4],
        variant: treeVariant++ % 16,
      });
    }
  }

  for (let index = 0; index < 430; index += 1) {
    const x = rand(24, WORLD.w - 24);
    const y = rand(24, WORLD.h - 24);
    if (!isOnRoad(x, y, 8)) decor.push({ type: "grass", x, y, variant: index % 4 });
  }

  for (let index = 0; index < 115; index += 1) {
    const x = rand(24, WORLD.w - 24);
    const y = rand(24, WORLD.h - 24);
    if (!isOnRoad(x, y, 8)) decor.push({ type: "petal", x, y, variant: index % 3 });
  }
  return { decor, paths };
}

export function loadTreeSpritesheet(onSettled?: () => void) {
  const image = new Image();
  if (onSettled) {
    image.addEventListener("load", onSettled, { once: true });
    image.addEventListener("error", onSettled, { once: true });
  }
  image.src = "assets/wildwood/tree-spritesheet-v1.png";
  return image;
}

export function createSpawnSites(boss: Point, mapId: MapId = TUTORIAL_FOREST_MAP_ID): SpawnSite[] {
  const sites: SpawnSite[] = [];
  const camps = mapId === BEGINNER_DESERT_MAP_ID
    ? DESERT_CAMPS
    : mapId === INTERMEDIATE_SNOWLANDS_MAP_ID
      ? SNOW_CAMPS
      : mapId === ADVANCED_LAVA_WASTES_MAP_ID
        ? LAVA_CAMPS
        : CAMPS;
  let id = 0;
  for (let campIndex = 0; campIndex < camps.length; campIndex += 1) {
    const camp = camps[campIndex];
    for (let index = 0; index < camp.count; index += 1) {
      const angle = index * 2.399963 + campIndex * 0.71;
      const fraction = ((index * 37 + campIndex * 19) % 101) / 100;
      const distance = camp.minRadius + (camp.radius - camp.minRadius) * fraction;
      let x = clamp(camp.x + Math.cos(angle) * distance, 45, WORLD.w - 45);
      let y = clamp(camp.y + Math.sin(angle) * distance, 45, WORLD.h - 45);
      if (mapId === TUTORIAL_FOREST_MAP_ID) {
        const bossDx = x - boss.x;
        const bossDy = y - boss.y;
        const bossDistance = Math.hypot(bossDx, bossDy) || 1;
        if (bossDistance < BOSS_ENEMY_SAFE_DISTANCE) {
          x = clamp(boss.x + bossDx / bossDistance * BOSS_ENEMY_SAFE_DISTANCE, 45, WORLD.w - 45);
          y = clamp(boss.y + bossDy / bossDistance * BOSS_ENEMY_SAFE_DISTANCE, 45, WORLD.h - 45);
        }
      }
      const type = camp.types[index % camp.types.length];
      sites.push({
        id: id++, x, y, campName: camp.name, type,
        leashRange: Math.max(420, camp.radius * 0.9),
        alive: false, respawnAt: 0,
      });
    }
  }
  return sites;
}
