import { createExpansionLayout } from "./expansion-layouts";
import { BOSS_ENEMY_SAFE_DISTANCE, WORLD } from "./constants";
import { CAMPS, ENEMY_TYPES, type EnemyKind } from "./enemies";
import { savedMapDesign } from "./map-design";
import { clamp } from "./math";

export type WorldPath = { x: number; y: number; w: number; h: number };
type WorldDecorPlacement = { x: number; y: number; color?: string };
export type WorldDecor = WorldDecorPlacement & (
  | { type: "tree"; s: number; variant: number }
  | { type: "grass"; variant: number }
  | { type: "petal"; variant: number }
  | { type: "cherryPetal"; variant: number }
  | { type: "cactus"; s: number; variant: number }
  | { type: "rock"; s: number; variant: number }
  | { type: "desertGrass"; variant: number }
  | { type: "snowPine"; s: number }
  | { type: "snowTuft"; variant: number }
  | { type: "upgradeBench"; s: number; label: "Upgrade Bench" }
  | { type: "lavaPool"; s: number; variant: number }
  | { type: "lavaRock"; s: number; variant: number }
  | { type: "charredTree"; s: number; variant: number }
  | { type: "coral"; s: number; variant: number }
  | { type: "shell"; s: number; variant: number }
  | { type: "cloud"; s: number; variant: number }
  | { type: "gear"; s: number; variant: number }
  | { type: "pumpkin"; s: number; variant: number }
  | { type: "skyShard"; s: number; variant: number }
  | { type: "glowMushroom"; s: number; variant: number }
  | { type: "lilyPad"; s: number; variant: number }
);
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
export const CLOUDSPIRE_MAP_ID = "cloudspire";
export const MOONFEN_MAP_ID = "moonfen";
export const CRYSTAL_HOLLOWS_MAP_ID = "crystal_hollows";
export const CLOCKWORK_RUINS_MAP_ID = "clockwork_ruins";
export const DUSKFALL_ORCHARD_MAP_ID = "duskfall_orchard";
const editedUpgradeBench = savedMapDesign(INTERMEDIATE_SNOWLANDS_MAP_ID)?.decor.find((decor) => decor.type === "upgradeBench");
export const UPGRADE_BENCH_POSITION = editedUpgradeBench
  ? { x: editedUpgradeBench.x, y: editedUpgradeBench.y }
  : { x: 800, y: 710 } as const;
export type MapId =
  | typeof TUTORIAL_FOREST_MAP_ID
  | typeof BEGINNER_DESERT_MAP_ID
  | typeof INTERMEDIATE_SNOWLANDS_MAP_ID
  | typeof ADVANCED_LAVA_WASTES_MAP_ID
  | typeof INFERNAL_DEPTHS_MAP_ID
  | typeof WATER_REACH_MAP_ID
  | typeof SAMURAI_GARDEN_MAP_ID
  | typeof CLOUDSPIRE_MAP_ID
  | typeof MOONFEN_MAP_ID
  | typeof CRYSTAL_HOLLOWS_MAP_ID | typeof CLOCKWORK_RUINS_MAP_ID | typeof DUSKFALL_ORCHARD_MAP_ID;

type SpawnFormation = "scatter" | "crescent" | "shoal" | "ranks";
export type SpawnCamp = {
  name: string;
  x: number;
  y: number;
  minRadius: number;
  radius: number;
  count: number;
  types: EnemyKind[];
  formation?: SpawnFormation;
  rotation?: number;
  ground?: string;
  ring?: string;
};

const DESERT_CAMPS: SpawnCamp[] = [
  { name: "Sunbaked Burrow", x: 1120, y: 1160, minRadius: 150, radius: 350, count: 6, types: ["Dune Raider"] },
  { name: "Copper Flats", x: 2780, y: 1260, minRadius: 180, radius: 410, count: 6, types: ["Dune Archer", "Dune Archer", "Dune Archer", "Dune Archer", "Dune Archer", "Dune Regent"] },
  { name: "Oracle Mesa", x: 4140, y: 780, minRadius: 90, radius: 230, count: 3, types: ["Blight Oracle"] },
  { name: "Reaper Approach", x: 1740, y: 1420, minRadius: 0, radius: 0, count: 1, types: ["Wastes Reaper"] },
  { name: "Needle Dunes", x: 3950, y: 2550, minRadius: 200, radius: 470, count: 7, types: ["Venom Guard"] },
  { name: "Drybone Basin", x: 2050, y: 3650, minRadius: 210, radius: 490, count: 7, types: ["Venom Guard"] },
];

const SNOW_CAMPS: SpawnCamp[] = [
  { name: "Rimegate Trail", x: 950, y: 1350, minRadius: 250, radius: 440, count: 6, types: ["Frost Raider"], formation: "crescent", rotation: -.4 },
  { name: "Glacier Crossing", x: 3000, y: 850, minRadius: 220, radius: 400, count: 6, types: ["Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Regent"], formation: "ranks", rotation: .25 },
  { name: "Whiteout Hollow", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Rime Guard"], formation: "crescent", rotation: 1.3 },
  { name: "Aurora Shelf", x: 1350, y: 3750, minRadius: 230, radius: 420, count: 5, types: ["Aurora Oracle"], formation: "ranks", rotation: -.15 },
  { name: "Reaper's Rest", x: 2700, y: 2700, minRadius: 100, radius: 180, count: 1, types: ["Whiteout Reaper"], formation: "crescent", rotation: 1.8 },
];

const LAVA_CAMPS: SpawnCamp[] = [
  { name: "Searing Approach", x: 950, y: 1350, minRadius: 230, radius: 400, count: 6, types: ["Ember Raider"], formation: "crescent", rotation: -.35 },
  { name: "Magma Causeway", x: 3000, y: 850, minRadius: 230, radius: 400, count: 6, types: ["Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Regent"], formation: "ranks", rotation: .2 },
  { name: "Obsidian Crater", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Magma Guard"], formation: "crescent", rotation: 1.2 },
  { name: "Ashen Shelf", x: 1050, y: 3650, minRadius: 240, radius: 420, count: 7, types: ["Ash Reaper"], formation: "ranks", rotation: -.2 },
  { name: "Inferno Caldera", x: 2700, y: 3900, minRadius: 210, radius: 380, count: 4, types: ["Inferno Oracle"], formation: "crescent", rotation: 2.4 },
];

const INFERNAL_CAMPS: SpawnCamp[] = [
  { name: "Moonless Gate", x: 1050, y: 1500, minRadius: 230, radius: 400, count: 6, types: ["Depth Raider"], formation: "crescent", rotation: -.45 },
  { name: "Blackbough Trail", x: 3150, y: 950, minRadius: 230, radius: 400, count: 6, types: ["Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Regent"], formation: "ranks", rotation: .35 },
  { name: "Hollow Grove", x: 4100, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Obsidian Colossus"], formation: "crescent", rotation: 1.1 },
  { name: "Dreadwood", x: 950, y: 3500, minRadius: 240, radius: 420, count: 7, types: ["Doom Reaper"], formation: "ranks", rotation: -.3 },
  { name: "Witching Glade", x: 2650, y: 4050, minRadius: 210, radius: 380, count: 4, types: ["Nether Oracle"], formation: "crescent", rotation: 2.35 },
];

const WATER_CAMPS: SpawnCamp[] = [
  { name: "Shallows Landing", x: 1100, y: 1200, minRadius: 230, radius: 400, count: 6, types: ["Tide Raider"], formation: "shoal", rotation: .2 },
  { name: "Kelp Channel", x: 3050, y: 900, minRadius: 230, radius: 400, count: 6, types: ["Reef Archer", "Reef Archer", "Reef Archer", "Reef Archer", "Reef Archer", "Reef Regent"], formation: "shoal", rotation: .9 },
  { name: "Coral Citadel", x: 4150, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Coral Colossus"], formation: "shoal", rotation: -.35 },
  { name: "Drowned Trench", x: 950, y: 3550, minRadius: 240, radius: 420, count: 7, types: ["Drowned Reaper"], formation: "shoal", rotation: .65 },
  { name: "Mooncurrent Shrine", x: 2600, y: 4000, minRadius: 210, radius: 380, count: 4, types: ["Tidal Oracle"], formation: "shoal", rotation: -.2 },
];

const SAMURAI_CAMPS: SpawnCamp[] = [
  { name: "Lantern Gate", x: 950, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Sakura Ronin"], formation: "ranks", rotation: 0 },
  { name: "Blossom Walk", x: 2900, y: 850, minRadius: 230, radius: 400, count: 6, types: ["Petal Archer", "Petal Archer", "Petal Archer", "Petal Archer", "Petal Archer", "Petal Regent"], formation: "ranks", rotation: .35 },
  { name: "Bamboo Court", x: 4050, y: 2300, minRadius: 250, radius: 440, count: 7, types: ["Bamboo Guardian"], formation: "ranks", rotation: -.25 },
  { name: "Moonbridge", x: 1150, y: 3650, minRadius: 240, radius: 420, count: 7, types: ["Moonblade Reaper"], formation: "ranks", rotation: .55 },
  { name: "Sakura Shrine", x: 2650, y: 4050, minRadius: 210, radius: 380, count: 4, types: ["Shrine Oracle"], formation: "ranks", rotation: 0 },
];

const CLOUDSPIRE_CAMPS: SpawnCamp[] = [
  { name: "Zephyr Landing", x: 1050, y: 1350, minRadius: 230, radius: 400, count: 6, types: ["Gale Prowler"], formation: "crescent", rotation: -.25 },
  { name: "Nimbus Causeway", x: 3000, y: 900, minRadius: 230, radius: 400, count: 6, types: ["Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Regent"], formation: "ranks", rotation: .2 },
  { name: "Sunvault Bastion", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Skyguard Colossus"], formation: "crescent", rotation: 1.15 },
  { name: "Thunderhead", x: 1000, y: 3600, minRadius: 240, radius: 420, count: 7, types: ["Thunder Reaper"], formation: "crescent", rotation: -.45 },
  { name: "Eye of the Storm", x: 2600, y: 4050, minRadius: 210, radius: 380, count: 4, types: ["Tempest Oracle"], formation: "ranks", rotation: .15 },
];

const MOONFEN_CAMPS: SpawnCamp[] = [
  { name: "Firefly Landing", x: 1050, y: 1350, minRadius: 230, radius: 400, count: 6, types: ["Fen Prowler"], formation: "crescent", rotation: -.3 },
  { name: "Glowcap Crossing", x: 3000, y: 900, minRadius: 230, radius: 400, count: 6, types: ["Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Regent"], formation: "ranks", rotation: .25 },
  { name: "Sunken Bulwark", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Bog Colossus"], formation: "crescent", rotation: 1.1 },
  { name: "Moonmire Hollow", x: 1000, y: 3600, minRadius: 240, radius: 420, count: 7, types: ["Moonmire Reaper"], formation: "crescent", rotation: -.5 },
  { name: "Wispwater Shrine", x: 2600, y: 4050, minRadius: 210, radius: 380, count: 4, types: ["Wisp Oracle"], formation: "ranks", rotation: .1 },
];
const CRYSTAL_HOLLOWS_CAMPS: SpawnCamp[] = [
  { name: "Quartz Landing", x: 1100, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Shard Hopper"], formation: "crescent", rotation: .4 },
  { name: "Amethyst Gallery", x: 3000, y: 1000, minRadius: 230, radius: 400, count: 6, types: ["Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Regent"], formation: "ranks", rotation: -.35 },
  { name: "Geode Bastion", x: 3750, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Geode Guardian"], formation: "crescent", rotation: 1.4 },
  { name: "Prismatic Cut", x: 1050, y: 3300, minRadius: 240, radius: 420, count: 7, types: ["Prism Reaver"], formation: "crescent", rotation: -.8 },
  { name: "Resonant Vault", x: 2600, y: 3950, minRadius: 210, radius: 380, count: 4, types: ["Hollow Oracle"], formation: "ranks", rotation: .35 },
];
const CLOCKWORK_RUINS_CAMPS: SpawnCamp[] = [
  { name: "Foundry Gate", x: 1100, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Gear Prowler"], formation: "crescent", rotation: .4 },
  { name: "Rivet Arcade", x: 3000, y: 1000, minRadius: 230, radius: 400, count: 6, types: ["Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Gear Regent"], formation: "ranks", rotation: -.35 },
  { name: "Ironworks", x: 3750, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Iron Guardian"], formation: "crescent", rotation: 1.4 },
  { name: "Scrap Yard", x: 1050, y: 3300, minRadius: 240, radius: 420, count: 7, types: ["Scrap Reaver"], formation: "crescent", rotation: -.8 },
  { name: "Dynamo Vault", x: 2600, y: 3950, minRadius: 210, radius: 380, count: 4, types: ["Spark Oracle"], formation: "ranks", rotation: .35 },
];
const DUSKFALL_ORCHARD_CAMPS: SpawnCamp[] = [
  { name: "Lantern Landing", x: 1100, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Gourd Prowler"], formation: "crescent", rotation: .4 },
  { name: "Seedling Rows", x: 3000, y: 1000, minRadius: 230, radius: 400, count: 6, types: ["Seed Spitter", "Seed Spitter", "Seed Spitter", "Seed Spitter", "Seed Spitter", "Harvest Regent"], formation: "ranks", rotation: -.35 },
  { name: "Hollow Trunk", x: 3750, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Husk Guardian"], formation: "crescent", rotation: 1.4 },
  { name: "Briar Patch", x: 1050, y: 3300, minRadius: 240, radius: 420, count: 7, types: ["Thorn Reaver"], formation: "crescent", rotation: -.8 },
  { name: "Harvest Shrine", x: 2600, y: 3950, minRadius: 210, radius: 380, count: 4, types: ["Harvest Oracle"], formation: "ranks", rotation: .35 },
];

const CAMP_CLEARANCE = 160;

function assertCampContracts(camps: readonly SpawnCamp[]) {
  for (const camp of camps) {
    if (!camp.types.length) throw new Error(`${camp.name} has no enemy type.`);
    const rewardTypes = new Set(camp.types.map((type) => ENEMY_TYPES[type].reward.type));
    if (rewardTypes.size !== 1) {
      throw new Error(`${camp.name} mixes reward types: ${[...rewardTypes].join(", ")}.`);
    }
  }
  for (let left = 0; left < camps.length; left += 1) {
    for (let right = left + 1; right < camps.length; right += 1) {
      const first = camps[left];
      const second = camps[right];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (distance < first.radius + second.radius + CAMP_CLEARANCE) {
        throw new Error(`${first.name} overlaps ${second.name}.`);
      }
    }
  }
}

function isNearSpawnCamp(camps: readonly SpawnCamp[], x: number, y: number, padding: number) {
  return camps.some((camp) => Math.hypot(x - camp.x, y - camp.y) < camp.radius + padding);
}

function seededUnit(index: number, salt: number) {
  const value = Math.sin(index * 91.713 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

function stableStringSeed(value: string) {
  let seed = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

function seededCampTypes(camp: SpawnCamp, campIndex: number, mapSeed: number) {
  const types = Array.from({ length: camp.count }, (_, index) => camp.types[index % camp.types.length]);
  if (!mapSeed || types.length < 2) return types;
  for (let index = types.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(seededUnit(index + campIndex * 31, mapSeed + 97) * (index + 1));
    [types[index], types[swapIndex]] = [types[swapIndex], types[index]];
  }
  return types;
}

function rotateOffset(x: number, y: number, rotation: number) {
  return {
    x: x * Math.cos(rotation) - y * Math.sin(rotation),
    y: x * Math.sin(rotation) + y * Math.cos(rotation),
  };
}

function campSpawnOffset(camp: SpawnCamp, index: number, campIndex: number, mapSeed: number) {
  const variation = mapSeed ? 1 : 0;
  const rotationJitter = (seededUnit(campIndex + 1, mapSeed + 11) - .5) * .36 * variation;
  const rotation = (camp.rotation ?? campIndex * .71) + rotationJitter;
  const angleJitter = (seededUnit(index + campIndex * 17, mapSeed + 23) - .5) * .18 * variation;
  const distanceScale = 1 + (seededUnit(index + campIndex * 19, mapSeed + 41) - .5) * .12 * variation;
  if (camp.formation === "crescent") {
    const progress = camp.count <= 1 ? .5 : index / (camp.count - 1);
    const angle = rotation + (progress - .5) * 2.35 + angleJitter;
    const baseDistance = camp.minRadius + (camp.radius - camp.minRadius) * (.62 + (index % 2) * .33);
    const distance = clamp(baseDistance * distanceScale, camp.minRadius, camp.radius);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  }
  if (camp.formation === "shoal") {
    const centeredIndex = index - (camp.count - 1) / 2;
    const spacing = Math.min(142, camp.radius * .36);
    const jitter = Math.min(16, spacing * .16) * variation;
    const localX = centeredIndex * spacing + (seededUnit(index, mapSeed + 53) - .5) * jitter * 2;
    const localY = Math.abs(centeredIndex) * spacing * .46 - camp.radius * .2 +
      (seededUnit(index, mapSeed + 59) - .5) * jitter * 2;
    return rotateOffset(localX, localY, rotation);
  }
  if (camp.formation === "ranks") {
    const columns = 3;
    const row = Math.floor(index / columns);
    const rowStart = row * columns;
    const itemsInRow = Math.min(columns, camp.count - rowStart);
    const column = index - rowStart;
    const rows = Math.ceil(camp.count / columns);
    const spacingX = Math.min(170, camp.radius * .42);
    const spacingY = Math.min(185, camp.radius * .44);
    const jitter = Math.min(14, spacingX * .12) * variation;
    const localX = (column - (itemsInRow - 1) / 2) * spacingX +
      (seededUnit(index, mapSeed + 67) - .5) * jitter * 2;
    const localY = (row - (rows - 1) / 2) * spacingY +
      (seededUnit(index, mapSeed + 71) - .5) * jitter * 2;
    return rotateOffset(localX, localY, rotation);
  }
  const angle = index * 2.399963 + rotation + angleJitter;
  const fraction = mapSeed
    ? seededUnit(index + campIndex * 29, mapSeed + 83)
    : ((index * 37 + campIndex * 19) % 101) / 100;
  const distance = camp.minRadius + (camp.radius - camp.minRadius) * fraction;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
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
    if (isOnRoad(x, y, 55) || Math.hypot(x - 360, y - 680) < 340 || isNearSpawnCamp(DESERT_CAMPS, x, y, 70)) continue;
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
    if (isOnRoad(x, y, 18) || isNearSpawnCamp(DESERT_CAMPS, x, y, 45)) continue;
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
    if (isOnRoad(x, y, 70) || Math.hypot(x - 360, y - 770) < 360 || isNearSpawnCamp(SNOW_CAMPS, x, y, 70)) continue;
    decor.push({ type: "snowPine", x: Math.round(x), y: Math.round(y), s: .62 + seededUnit(index, 23) * .48 });
  }
  for (let index = 0; index < 400; index += 1) {
    const x = 26 + seededUnit(index, 24) * (WORLD.w - 52);
    const y = 26 + seededUnit(index, 25) * (WORLD.h - 52);
    if (!isOnRoad(x, y, 10) && !isNearSpawnCamp(SNOW_CAMPS, x, y, 20)) decor.push({ type: "snowTuft", x: Math.round(x), y: Math.round(y), variant: index % 4 });
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
    if (isOnRoad(x, y, 150) || isNearArrival(x, y) || isNearMagmalisk(x, y) || isNearSpawnCamp(LAVA_CAMPS, x, y, 95)) continue;
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
    if (isOnRoad(x, y, 60) || isNearArrival(x, y) || isNearMagmalisk(x, y) || isNearSpawnCamp(LAVA_CAMPS, x, y, 65)) continue;
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
    if (isOnRoad(x, y, 80) || isNearArrival(x, y) || isNearMagmalisk(x, y) || isNearSpawnCamp(LAVA_CAMPS, x, y, 75)) continue;
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
  const isNearGloomroot = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 660;
  const placed: { x: number; y: number; radius: number }[] = [];
  const placeTrees = (target: number, salt: number) => {
    let count = 0;
    for (let index = 0; count < target && index < 5_000; index += 1) {
      const x = 85 + seededUnit(index, salt) * (WORLD.w - 170);
      const y = 100 + seededUnit(index, salt + 1) * (WORLD.h - 200);
      const s = .68 + seededUnit(index, salt + 2) * .5;
      const radius = 47 * s;
      if (isOnPath(x, y, 62) || isNearArrival(x, y) || isNearSpawnCamp(INFERNAL_CAMPS, x, y, 120) || isNearGloomroot(x, y)) continue;
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
  const isNearWaterBoss = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 700;

  for (let index = 0; index < 130; index += 1) {
    const x = 70 + seededUnit(index, 61) * (WORLD.w - 140);
    const y = 70 + seededUnit(index, 62) * (WORLD.h - 140);
    if (isOnPath(x, y, 42) || isNearArrival(x, y) || isNearSpawnCamp(WATER_CAMPS, x, y, 105) || isNearWaterBoss(x, y)) continue;
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
    if (!isOnPath(x, y, 6) || isNearArrival(x, y) || isNearSpawnCamp(WATER_CAMPS, x, y, 30) || isNearWaterBoss(x, y)) continue;
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
  const placedTrees: { x: number; y: number; radius: number }[] = [];

  for (let index = 0; placedTrees.length < 148 && index < 8_000; index += 1) {
    const x = 80 + seededUnit(index, 71) * (WORLD.w - 160);
    const y = 95 + seededUnit(index, 72) * (WORLD.h - 190);
    const s = .7 + seededUnit(index, 73) * .48;
    const radius = 45 * s;
    if (isOnPath(x, y, 68) || isNearArrival(x, y) || isNearSpawnCamp(SAMURAI_CAMPS, x, y, 115)) continue;
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

function createCloudspireLayout() {
  const decor: WorldDecor[] = [];
  // A stepped causeway climbs through five sky courts before reaching the
  // Tempest Kirin's storm platform in the southeast.
  const paths: WorldPath[] = [
    { x: 300, y: 640, w: 920, h: 150 },
    { x: 1040, y: 640, w: 150, h: 980 },
    { x: 1040, y: 1450, w: 2050, h: 150 },
    { x: 2920, y: 1450, w: 150, h: 980 },
    { x: 1980, y: 2280, w: 1090, h: 150 },
    { x: 1980, y: 2280, w: 150, h: 1450 },
    { x: 1980, y: 3570, w: 1250, h: 150 },
    { x: 3060, y: 3570, w: 150, h: 520 },
    { x: 3060, y: 3940, w: 1050, h: 150 },
    { x: 2920, y: 2280, w: 1160, h: 150 },
  ];
  const isOnPath = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  const isNearArrival = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 350;
  const isNearBoss = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 720;

  for (let index = 0; index < 190; index += 1) {
    const x = 55 + seededUnit(index, 81) * (WORLD.w - 110);
    const y = 55 + seededUnit(index, 82) * (WORLD.h - 110);
    if (isOnPath(x, y, 20) || isNearArrival(x, y) || isNearBoss(x, y) || isNearSpawnCamp(CLOUDSPIRE_CAMPS, x, y, 70)) continue;
    decor.push({
      type: "cloud",
      x: Math.round(x),
      y: Math.round(y),
      s: .55 + seededUnit(index, 83) * .85,
      variant: index % 4,
    });
  }
  for (let index = 0; index < 125; index += 1) {
    const x = 45 + seededUnit(index, 84) * (WORLD.w - 90);
    const y = 45 + seededUnit(index, 85) * (WORLD.h - 90);
    if (isOnPath(x, y, 30) || isNearArrival(x, y) || isNearBoss(x, y) || isNearSpawnCamp(CLOUDSPIRE_CAMPS, x, y, 55)) continue;
    decor.push({
      type: "skyShard",
      x: Math.round(x),
      y: Math.round(y),
      s: .62 + seededUnit(index, 86) * .72,
      variant: index % 3,
    });
  }
  return { decor, paths };
}

function createMoonfenLayout() {
  const decor: WorldDecor[] = [];
  // Raised stone walks wind through the flooded marsh toward Miremaw's pool.
  const paths: WorldPath[] = [
    { x: 300, y: 640, w: 1260, h: 150 },
    { x: 1390, y: 640, w: 150, h: 980 },
    { x: 1390, y: 1470, w: 1760, h: 150 },
    { x: 2980, y: 1470, w: 150, h: 1010 },
    { x: 1810, y: 2320, w: 1320, h: 150 },
    { x: 1810, y: 2320, w: 150, h: 1450 },
    { x: 1810, y: 3620, w: 1400, h: 150 },
    { x: 3040, y: 3620, w: 150, h: 470 },
    { x: 3040, y: 3940, w: 1070, h: 150 },
    { x: 2980, y: 2320, w: 1110, h: 150 },
  ];
  const isOnPath = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  const isNearArrival = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 350;
  const isNearBoss = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 720;

  for (let index = 0; index < 190; index += 1) {
    const x = 55 + seededUnit(index, 91) * (WORLD.w - 110);
    const y = 55 + seededUnit(index, 92) * (WORLD.h - 110);
    if (isOnPath(x, y, 20) || isNearArrival(x, y) || isNearBoss(x, y) || isNearSpawnCamp(MOONFEN_CAMPS, x, y, 70)) continue;
    decor.push({
      type: "glowMushroom",
      x: Math.round(x),
      y: Math.round(y),
      s: .62 + seededUnit(index, 93) * .8,
      variant: index % 4,
    });
  }
  for (let index = 0; index < 145; index += 1) {
    const x = 45 + seededUnit(index, 94) * (WORLD.w - 90);
    const y = 45 + seededUnit(index, 95) * (WORLD.h - 90);
    if (isOnPath(x, y, 28) || isNearArrival(x, y) || isNearBoss(x, y) || isNearSpawnCamp(MOONFEN_CAMPS, x, y, 55)) continue;
    decor.push({
      type: "lilyPad",
      x: Math.round(x),
      y: Math.round(y),
      s: .65 + seededUnit(index, 96) * .78,
      variant: index % 3,
    });
  }
  return { decor, paths };
}
function createCrystalHollowsLayout() {
  const decor: WorldDecor[] = [];
  // A connected mining loop with five broad galleries and a southeast boss
  // chamber. The return branch avoids retracing the entire progression route.
  const paths: WorldPath[] = [
    { x: 300, y: 640, w: 1280, h: 180 },
    { x: 1400, y: 640, w: 180, h: 2780 },
    { x: 980, y: 1360, w: 600, h: 180 },
    { x: 980, y: 1360, w: 180, h: 2060 },
    { x: 1400, y: 920, w: 1780, h: 180 },
    { x: 3000, y: 920, w: 180, h: 1600 },
    { x: 1400, y: 2340, w: 2520, h: 180 },
    { x: 3740, y: 2340, w: 180, h: 660 },
    { x: 980, y: 3240, w: 1800, h: 180 },
    { x: 2500, y: 3240, w: 180, h: 800 },
    { x: 2500, y: 3860, w: 1640, h: 180 },
    { x: 3960, y: 3860, w: 180, h: 370 },
    { x: 2500, y: 2820, w: 1420, h: 180 },
    { x: 2500, y: 2820, w: 180, h: 600 },
  ];
  const isOnPath = (x: number, y: number, margin = 0) => paths.some((path) =>
    x > path.x - margin && x < path.x + path.w + margin &&
    y > path.y - margin && y < path.y + path.h + margin);
  const isNearArrival = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 350;
  const isNearBoss = (x: number, y: number) => Math.hypot(x - 4050, y - 4050) < 720;

  for (let index = 0; index < 210; index += 1) {
    const x = 90 + seededUnit(index, 111) * (WORLD.w - 180);
    const y = 130 + seededUnit(index, 112) * (WORLD.h - 260);
    if (isOnPath(x, y, 95) || isNearArrival(x, y) || isNearBoss(x, y) || isNearSpawnCamp(CRYSTAL_HOLLOWS_CAMPS, x, y, 100)) continue;
    // Clustered, differently sized facets read as geodes. Existing procedural
    // shards remain individually movable, scalable, and tintable in the editor.
    decor.push({ type: "rock", x: Math.round(x), y: Math.round(y + 4), s: 1.1, variant: index % 4 });
    for (let facet = 0; facet < 3; facet += 1) {
      decor.push({
        type: "skyShard", x: Math.round(x + (facet - 1) * 17), y: Math.round(y + (facet === 1 ? -5 : 3)),
        s: facet === 1 ? 1.9 + seededUnit(index, 113) * 1.25 : 1 + seededUnit(index + facet, 114) * .7,
        variant: index % 3,
      });
    }
  }
  for (let index = 0; index < 160; index += 1) {
    const x = 45 + seededUnit(index, 115) * (WORLD.w - 90);
    const y = 45 + seededUnit(index, 116) * (WORLD.h - 90);
    if (isOnPath(x, y, 25) || isNearArrival(x, y) || isNearBoss(x, y) || isNearSpawnCamp(CRYSTAL_HOLLOWS_CAMPS, x, y, 55)) continue;
    decor.push({
      type: "rock", x: Math.round(x), y: Math.round(y),
      s: .55 + seededUnit(index, 117) * .8, variant: index % 4,
    });
  }
  return { decor, paths };
}
function createClockworkRuinsLayout() { return createExpansionLayout(false, CLOCKWORK_RUINS_CAMPS); }
function createDuskfallOrchardLayout() { return createExpansionLayout(true, DUSKFALL_ORCHARD_CAMPS); }

export function createWorldLayout(playerSpawn: Point, mapId: MapId = TUTORIAL_FOREST_MAP_ID) {
  const saved = savedMapDesign(mapId);
  if (saved) {
    return {
      decor: saved.decor.map((item) => ({ ...item })),
      paths: saved.paths.map((path) => ({ ...path })),
    };
  }
  if (mapId === BEGINNER_DESERT_MAP_ID) return createDesertLayout();
  if (mapId === INTERMEDIATE_SNOWLANDS_MAP_ID) return createSnowLayout();
  if (mapId === ADVANCED_LAVA_WASTES_MAP_ID) return createLavaLayout();
  if (mapId === INFERNAL_DEPTHS_MAP_ID) return createNightForestLayout();
  if (mapId === WATER_REACH_MAP_ID) return createWaterLayout();
  if (mapId === SAMURAI_GARDEN_MAP_ID) return createSamuraiGardenLayout();
  if (mapId === CLOUDSPIRE_MAP_ID) return createCloudspireLayout();
  if (mapId === MOONFEN_MAP_ID) return createMoonfenLayout();
  if (mapId === CLOCKWORK_RUINS_MAP_ID) return createClockworkRuinsLayout(); else if (mapId === DUSKFALL_ORCHARD_MAP_ID) return createDuskfallOrchardLayout(); else if (mapId === CRYSTAL_HOLLOWS_MAP_ID) return createCrystalHollowsLayout();
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
      if (isNearSpawnCamp(CAMPS, x, y, 75)) continue;
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
    const x = 24 + seededUnit(index, 101) * (WORLD.w - 48);
    const y = 24 + seededUnit(index, 102) * (WORLD.h - 48);
    if (!isOnRoad(x, y, 8)) decor.push({ type: "grass", x, y, variant: index % 4 });
  }

  for (let index = 0; index < 115; index += 1) {
    const x = 24 + seededUnit(index, 103) * (WORLD.w - 48);
    const y = 24 + seededUnit(index, 104) * (WORLD.h - 48);
    if (!isOnRoad(x, y, 8)) decor.push({ type: "petal", x, y, variant: index % 3 });
  }
  return { decor, paths };
}

export function mapSpawnCamps(mapId: MapId = TUTORIAL_FOREST_MAP_ID): readonly SpawnCamp[] {
  const saved = savedMapDesign(mapId);
  if (saved?.spawnCamps.length) return saved.spawnCamps.map((camp) => ({ ...camp, types: [...camp.types] }));
  return mapId === BEGINNER_DESERT_MAP_ID
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
              : mapId === CLOUDSPIRE_MAP_ID
                ? CLOUDSPIRE_CAMPS
                : mapId === MOONFEN_MAP_ID
                  ? MOONFEN_CAMPS
                  : mapId === CRYSTAL_HOLLOWS_MAP_ID
                    ? CRYSTAL_HOLLOWS_CAMPS
                    : mapId === CLOCKWORK_RUINS_MAP_ID ? CLOCKWORK_RUINS_CAMPS : mapId === DUSKFALL_ORCHARD_MAP_ID ? DUSKFALL_ORCHARD_CAMPS : CAMPS;
}

export function createSpawnSites(boss: Point, mapId: MapId = TUTORIAL_FOREST_MAP_ID): SpawnSite[] {
  const sites: SpawnSite[] = [];
  const camps = mapSpawnCamps(mapId);
  assertCampContracts(camps);
  // Tutorial remains deliberately readable. Later maps use a fixed map seed:
  // layouts gain variety, but every client still derives identical sites.
  // This seed is part of the existing world layout, independent of the game's display name.
  const mapSeed = mapId === TUTORIAL_FOREST_MAP_ID ? 0 : stableStringSeed(`wildwood-spawns-v2:${mapId}`);
  const editedBoss = savedMapDesign(mapId)?.gameplay.boss;
  let id = 0;
  for (let campIndex = 0; campIndex < camps.length; campIndex += 1) {
    const camp = camps[campIndex];
    const campTypes = seededCampTypes(camp, campIndex, mapSeed);
    for (let index = 0; index < camp.count; index += 1) {
      const offset = campSpawnOffset(camp, index, campIndex, mapSeed);
      let x = clamp(camp.x + offset.x, 45, WORLD.w - 45);
      let y = clamp(camp.y + offset.y, 45, WORLD.h - 45);
      if (mapId === TUTORIAL_FOREST_MAP_ID || mapId === ADVANCED_LAVA_WASTES_MAP_ID || mapId === INFERNAL_DEPTHS_MAP_ID || mapId === WATER_REACH_MAP_ID || mapId === SAMURAI_GARDEN_MAP_ID || mapId === CLOUDSPIRE_MAP_ID || mapId === MOONFEN_MAP_ID || mapId === CRYSTAL_HOLLOWS_MAP_ID || mapId === CLOCKWORK_RUINS_MAP_ID || mapId === DUSKFALL_ORCHARD_MAP_ID) {
        const activeBoss = editedBoss ?? (mapId === TUTORIAL_FOREST_MAP_ID ? boss : { x: 4050, y: 4050 });
        const bossDx = x - activeBoss.x;
        const bossDy = y - activeBoss.y;
        const bossDistance = Math.hypot(bossDx, bossDy) || 1;
        if (bossDistance < BOSS_ENEMY_SAFE_DISTANCE) {
          const safeDistance = BOSS_ENEMY_SAFE_DISTANCE + 1;
          x = clamp(activeBoss.x + bossDx / bossDistance * safeDistance, 45, WORLD.w - 45);
          y = clamp(activeBoss.y + bossDy / bossDistance * safeDistance, 45, WORLD.h - 45);
        }
      }
      const type = campTypes[index];
      sites.push({
        id: id++, x, y, campName: camp.name, type,
        leashRange: Math.max(420, camp.radius * 0.9),
        alive: false, respawnAt: 0,
      });
    }
  }
  return sites;
}
