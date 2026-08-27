import { BOSS_ENEMY_SAFE_DISTANCE, WORLD } from "./constants";
import { CAMPS, type EnemyKind } from "./enemies";
import { clamp, rand } from "./math";

export type WorldPath = { x: number; y: number; w: number; h: number };
export type WorldDecor =
  | { type: "tree"; x: number; y: number; s: number; variant: number }
  | { type: "grass"; x: number; y: number; variant: number }
  | { type: "petal"; x: number; y: number; variant: number }
  | { type: "cherryPetal"; x: number; y: number; variant: number }
  | { type: "cactus"; x: number; y: number; s: number; variant: number }
  | { type: "rock"; x: number; y: number; s: number; variant: number }
  | { type: "desertGrass"; x: number; y: number; variant: number }
  | { type: "snowPine"; x: number; y: number; s: number }
  | { type: "snowTuft"; x: number; y: number; variant: number }
  | { type: "upgradeBench"; x: number; y: number; s: number; label: "Upgrade Bench" }
  | { type: "lavaPool"; x: number; y: number; s: number; variant: number }
  | { type: "lavaRock"; x: number; y: number; s: number; variant: number }
  | { type: "charredTree"; x: number; y: number; s: number; variant: number }
  | { type: "coral"; x: number; y: number; s: number; variant: number }
  | { type: "shell"; x: number; y: number; s: number; variant: number };
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
export const INFERNAL_DEPTHS_MAP_ID = "infernal_depths";
export const WATER_REACH_MAP_ID = "water_reach";
export const SAMURAI_GARDEN_MAP_ID = "samurai_garden";
export const UPGRADE_BENCH_POSITION = { x: 800, y: 710 } as const;
export type MapId =
  | typeof TUTORIAL_FOREST_MAP_ID
  | typeof BEGINNER_DESERT_MAP_ID
  | typeof INTERMEDIATE_SNOWLANDS_MAP_ID
  | typeof ADVANCED_LAVA_WASTES_MAP_ID
  | typeof INFERNAL_DEPTHS_MAP_ID
  | typeof WATER_REACH_MAP_ID
  | typeof SAMURAI_GARDEN_MAP_ID;

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
  { name: "Inferno Caldera", x: 3050, y: 3950, minRadius: 170, radius: 420, count: 6, types: ["Inferno Oracle", "Inferno Oracle", "Ash Reaper"] as EnemyKind[] },
];

const INFERNAL_CAMPS = [
  { name: "Moonless Gate", x: 1120, y: 1160, minRadius: 140, radius: 330, count: 6, types: ["Depth Raider"] as EnemyKind[] },
  { name: "Blackbough Trail", x: 2800, y: 1240, minRadius: 170, radius: 390, count: 6, types: ["Abyss Archer"] as EnemyKind[] },
  { name: "Hollow Grove", x: 4050, y: 2570, minRadius: 180, radius: 440, count: 7, types: ["Obsidian Colossus"] as EnemyKind[] },
  { name: "Dreadwood", x: 1850, y: 3650, minRadius: 170, radius: 430, count: 5, types: ["Doom Reaper"] as EnemyKind[] },
  { name: "Witching Glade", x: 3050, y: 3950, minRadius: 170, radius: 420, count: 6, types: ["Nether Oracle", "Nether Oracle", "Doom Reaper"] as EnemyKind[] },
];

const WATER_CAMPS = [
  { name: "Shallows Landing", x: 1120, y: 1160, minRadius: 140, radius: 330, count: 6, types: ["Tide Raider"] as EnemyKind[] },
  { name: "Kelp Channel", x: 2800, y: 1240, minRadius: 170, radius: 390, count: 6, types: ["Reef Archer"] as EnemyKind[] },
  { name: "Coral Citadel", x: 4050, y: 2570, minRadius: 180, radius: 440, count: 7, types: ["Coral Colossus"] as EnemyKind[] },
  { name: "Drowned Trench", x: 1850, y: 3650, minRadius: 170, radius: 430, count: 5, types: ["Drowned Reaper"] as EnemyKind[] },
  { name: "Mooncurrent Shrine", x: 3050, y: 3950, minRadius: 170, radius: 420, count: 6, types: ["Tidal Oracle", "Tidal Oracle", "Drowned Reaper"] as EnemyKind[] },
];

const SAMURAI_CAMPS = [
  { name: "Lantern Gate", x: 1120, y: 1160, minRadius: 140, radius: 330, count: 6, types: ["Sakura Ronin"] as EnemyKind[] },
  { name: "Blossom Walk", x: 2800, y: 1240, minRadius: 170, radius: 390, count: 6, types: ["Petal Archer"] as EnemyKind[] },
  { name: "Bamboo Court", x: 4050, y: 2570, minRadius: 180, radius: 440, count: 7, types: ["Bamboo Guardian"] as EnemyKind[] },
  { name: "Moonbridge", x: 1850, y: 3650, minRadius: 170, radius: 430, count: 5, types: ["Moonblade Reaper"] as EnemyKind[] },
  { name: "Sakura Shrine", x: 3050, y: 3950, minRadius: 170, radius: 420, count: 6, types: ["Shrine Oracle", "Shrine Oracle", "Moonblade Reaper"] as EnemyKind[] },
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
    { type: "upgradeBench", ...UPGRADE_BENCH_POSITION, s: 1, label: "Upgrade Bench" },
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
  const isNearMagmalisk = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 640;

  for (let index = 0; index < 24; index += 1) {
    const x = 180 + seededUnit(index, 31) * (WORLD.w - 360);
    const y = 180 + seededUnit(index, 32) * (WORLD.h - 360);
    if (isOnRoad(x, y, 150) || isNearArrival(x, y) || isNearMagmalisk(x, y)) continue;
    decor.push({
      type: "lavaPool",
      x: Math.round(x),
      y: Math.round(y),
      s: .62 + seededUnit(index, 33) * .68,
      variant: index % 3,
    });
  }
  const lavaRocks: Extract<WorldDecor, { type: "lavaRock" }>[] = [];
  const lavaRockTarget = 72 * 7;
  for (let index = 0; lavaRocks.length < lavaRockTarget && index < 20_000; index += 1) {
    const x = 90 + seededUnit(index, 34) * (WORLD.w - 180);
    const y = 90 + seededUnit(index, 35) * (WORLD.h - 180);
    const s = .48 + seededUnit(index, 36) * .62;
    const radius = 75 * s;
    if (isOnRoad(x, y, 60) || isNearArrival(x, y) || isNearMagmalisk(x, y)) continue;
    if (lavaRocks.some((rock) => Math.hypot(x - rock.x, y - rock.y) < radius + 75 * rock.s + 6)) continue;
    if (decor.some((item) => item.type === "lavaPool" && Math.hypot(x - item.x, y - item.y) < radius + 150 * item.s + 12)) continue;
    lavaRocks.push({
      type: "lavaRock",
      x: Math.round(x),
      y: Math.round(y),
      s,
      variant: lavaRocks.length % 3,
    });
  }
  decor.push(...lavaRocks);
  for (let index = 0; index < 48; index += 1) {
    const x = 100 + seededUnit(index, 37) * (WORLD.w - 200);
    const y = 100 + seededUnit(index, 38) * (WORLD.h - 200);
    if (isOnRoad(x, y, 80) || isNearArrival(x, y) || isNearMagmalisk(x, y)) continue;
    const s = .72 + seededUnit(index, 39) * .62;
    if (lavaRocks.some((rock) => Math.hypot(x - rock.x, y - rock.y) < 75 * rock.s + 48 * s + 8)) continue;
    decor.push({
      type: "charredTree",
      x: Math.round(x),
      y: Math.round(y),
      s,
      variant: index % 2,
    });
  }
  return { decor, paths };
}

function createNightForestLayout() {
  const decor: WorldDecor[] = [];
  const paths: WorldPath[] = [
    { x: 300, y: 640, w: 900, h: 130 },
    { x: 1040, y: 640, w: 130, h: 850 },
    { x: 1040, y: 1120, w: 1880, h: 130 },
    { x: 2740, y: 1120, w: 130, h: 1360 },
    { x: 2740, y: 2350, w: 1390, h: 130 },
    { x: 3980, y: 2350, w: 130, h: 420 },
    { x: 1810, y: 2350, w: 1060, h: 130 },
    { x: 1810, y: 2350, w: 130, h: 1430 },
    { x: 1810, y: 3570, w: 1320, h: 130 },
    { x: 2990, y: 3570, w: 130, h: 500 },
  ];
  const isOnPath = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  const isNearArrival = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 330;
  const isNearCamp = (x: number, y: number) => INFERNAL_CAMPS.some((camp) =>
    Math.hypot(x - camp.x, y - camp.y) < camp.radius + 120);
  const isNearGloomroot = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 660;
  const placed: { x: number; y: number; radius: number }[] = [];
  const placeTrees = (target: number, salt: number) => {
    let count = 0;
    for (let index = 0; count < target && index < 5_000; index += 1) {
      const x = 85 + seededUnit(index, salt) * (WORLD.w - 170);
      const y = 100 + seededUnit(index, salt + 1) * (WORLD.h - 200);
      const s = .68 + seededUnit(index, salt + 2) * .5;
      const radius = 47 * s;
      if (isOnPath(x, y, 62) || isNearArrival(x, y) || isNearCamp(x, y) || isNearGloomroot(x, y)) continue;
      if (placed.some((tree) => Math.hypot(x - tree.x, y - tree.y) < radius + tree.radius + 18)) continue;
      placed.push({ x, y, radius });
      decor.push({ type: "tree", x: Math.round(x), y: Math.round(y), s, variant: (index + count) % 16 });
      count += 1;
    }
  };

  placeTrees(166, 51);
  return { decor, paths };
}

function createWaterLayout() {
  const decor: WorldDecor[] = [];
  // Broad sandbars create a readable route while the open blue ground still
  // feels like shallow water instead of a recolored land map.
  const paths: WorldPath[] = [
    { x: 300, y: 640, w: 920, h: 150 },
    { x: 1040, y: 640, w: 150, h: 850 },
    { x: 1040, y: 1120, w: 1900, h: 150 },
    { x: 2760, y: 1120, w: 150, h: 1380 },
    { x: 2760, y: 2350, w: 1370, h: 150 },
    { x: 3980, y: 2350, w: 150, h: 430 },
    { x: 1810, y: 2350, w: 1100, h: 150 },
    { x: 1810, y: 2350, w: 150, h: 1450 },
    { x: 1810, y: 3570, w: 1330, h: 150 },
    { x: 2990, y: 3570, w: 150, h: 520 },
    { x: 2990, y: 3940, w: 1120, h: 150 },
  ];
  const isOnPath = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  const isNearArrival = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 330;
  const isNearCamp = (x: number, y: number) => WATER_CAMPS.some((camp) =>
    Math.hypot(x - camp.x, y - camp.y) < camp.radius + 105);
  const isNearWaterBoss = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 700;

  for (let index = 0; index < 130; index += 1) {
    const x = 70 + seededUnit(index, 61) * (WORLD.w - 140);
    const y = 70 + seededUnit(index, 62) * (WORLD.h - 140);
    if (isOnPath(x, y, 42) || isNearArrival(x, y) || isNearCamp(x, y) || isNearWaterBoss(x, y)) continue;
    decor.push({
      type: "coral",
      x: Math.round(x),
      y: Math.round(y),
      s: .55 + seededUnit(index, 63) * .72,
      variant: index % 5,
    });
  }
  for (let index = 0; index < 220; index += 1) {
    const x = 45 + seededUnit(index, 64) * (WORLD.w - 90);
    const y = 45 + seededUnit(index, 65) * (WORLD.h - 90);
    if (!isOnPath(x, y, 6) || isNearArrival(x, y) || isNearWaterBoss(x, y)) continue;
    decor.push({
      type: "shell",
      x: Math.round(x),
      y: Math.round(y),
      s: .52 + seededUnit(index, 66) * .55,
      variant: index % 4,
    });
  }
  return { decor, paths };
}

function createSamuraiGardenLayout() {
  const decor: WorldDecor[] = [];
  // The path follows the same readable progression route as Water Reach, but
  // wider intersections and a central crossroad make it feel like a formal
  // garden instead of another wilderness corridor.
  const paths: WorldPath[] = [
    { x: 300, y: 640, w: 920, h: 150 },
    { x: 1040, y: 640, w: 150, h: 850 },
    { x: 1040, y: 1120, w: 1900, h: 150 },
    { x: 2760, y: 1120, w: 150, h: 1380 },
    { x: 2760, y: 2350, w: 1370, h: 150 },
    { x: 3980, y: 2350, w: 150, h: 430 },
    { x: 1810, y: 2350, w: 1100, h: 150 },
    { x: 1810, y: 2350, w: 150, h: 1450 },
    { x: 1810, y: 3570, w: 1330, h: 150 },
    { x: 2990, y: 3570, w: 150, h: 520 },
    { x: 2300, y: 1650, w: 150, h: 850 },
    { x: 2300, y: 1650, w: 610, h: 150 },
  ];
  const isOnPath = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  const isNearArrival = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 350;
  const isNearCamp = (x: number, y: number) => SAMURAI_CAMPS.some((camp) =>
    Math.hypot(x - camp.x, y - camp.y) < camp.radius + 115);
  const placedTrees: { x: number; y: number; radius: number }[] = [];

  for (let index = 0; placedTrees.length < 148 && index < 8_000; index += 1) {
    const x = 80 + seededUnit(index, 71) * (WORLD.w - 160);
    const y = 95 + seededUnit(index, 72) * (WORLD.h - 190);
    const s = .7 + seededUnit(index, 73) * .48;
    const radius = 45 * s;
    if (isOnPath(x, y, 68) || isNearArrival(x, y) || isNearCamp(x, y)) continue;
    if (placedTrees.some((tree) => Math.hypot(x - tree.x, y - tree.y) < radius + tree.radius + 16)) continue;
    placedTrees.push({ x, y, radius });
    decor.push({ type: "tree", x: Math.round(x), y: Math.round(y), s, variant: placedTrees.length % 16 });
  }

  for (let index = 0; index < 360; index += 1) {
    const x = 35 + seededUnit(index, 74) * (WORLD.w - 70);
    const y = 35 + seededUnit(index, 75) * (WORLD.h - 70);
    if (isNearArrival(x, y) || (!isOnPath(x, y, 18) && seededUnit(index, 76) > .42)) continue;
    decor.push({
      type: "cherryPetal",
      x: Math.round(x),
      y: Math.round(y),
      variant: index % 4,
    });
  }
  return { decor, paths };
}

export function createWorldLayout(playerSpawn: Point, mapId: MapId = TUTORIAL_FOREST_MAP_ID) {
  if (mapId === BEGINNER_DESERT_MAP_ID) return createDesertLayout();
  if (mapId === INTERMEDIATE_SNOWLANDS_MAP_ID) return createSnowLayout();
  if (mapId === ADVANCED_LAVA_WASTES_MAP_ID) return createLavaLayout();
  if (mapId === INFERNAL_DEPTHS_MAP_ID) return createNightForestLayout();
  if (mapId === WATER_REACH_MAP_ID) return createWaterLayout();
  if (mapId === SAMURAI_GARDEN_MAP_ID) return createSamuraiGardenLayout();
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
        : mapId === INFERNAL_DEPTHS_MAP_ID
          ? INFERNAL_CAMPS
          : mapId === WATER_REACH_MAP_ID
            ? WATER_CAMPS
            : mapId === SAMURAI_GARDEN_MAP_ID
              ? SAMURAI_CAMPS
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
      if (mapId === TUTORIAL_FOREST_MAP_ID || mapId === ADVANCED_LAVA_WASTES_MAP_ID || mapId === INFERNAL_DEPTHS_MAP_ID || mapId === WATER_REACH_MAP_ID) {
        const activeBoss = mapId === TUTORIAL_FOREST_MAP_ID ? boss : { x: 4050, y: 4050 };
        const bossDx = x - activeBoss.x;
        const bossDy = y - activeBoss.y;
        const bossDistance = Math.hypot(bossDx, bossDy) || 1;
        if (bossDistance < BOSS_ENEMY_SAFE_DISTANCE) {
          const safeDistance = BOSS_ENEMY_SAFE_DISTANCE + 1;
          x = clamp(activeBoss.x + bossDx / bossDistance * safeDistance, 45, WORLD.w - 45);
          y = clamp(activeBoss.y + bossDy / bossDistance * safeDistance, 45, WORLD.h - 45);
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
