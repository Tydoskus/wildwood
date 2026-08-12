import { BOSS_ENEMY_SAFE_DISTANCE, WORLD } from "./constants";
import { CAMPS, type EnemyKind } from "./enemies";
import { clamp, rand } from "./math";

export type WorldPath = { x: number; y: number; w: number; h: number };
export type WorldDecor =
  | { type: "tree"; x: number; y: number; s: number; variant: number }
  | { type: "grass"; x: number; y: number; variant: number }
  | { type: "petal"; x: number; y: number; variant: number };
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

export function createWorldLayout(playerSpawn: Point) {
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

export function createSpawnSites(boss: Point): SpawnSite[] {
  const sites: SpawnSite[] = [];
  let id = 0;
  for (let campIndex = 0; campIndex < CAMPS.length; campIndex += 1) {
    const camp = CAMPS[campIndex];
    for (let index = 0; index < camp.count; index += 1) {
      const angle = index * 2.399963 + campIndex * 0.71;
      const fraction = ((index * 37 + campIndex * 19) % 101) / 100;
      const distance = camp.minRadius + (camp.radius - camp.minRadius) * fraction;
      let x = clamp(camp.x + Math.cos(angle) * distance, 45, WORLD.w - 45);
      let y = clamp(camp.y + Math.sin(angle) * distance, 45, WORLD.h - 45);
      const bossDx = x - boss.x;
      const bossDy = y - boss.y;
      const bossDistance = Math.hypot(bossDx, bossDy) || 1;
      if (bossDistance < BOSS_ENEMY_SAFE_DISTANCE) {
        x = clamp(boss.x + bossDx / bossDistance * BOSS_ENEMY_SAFE_DISTANCE, 45, WORLD.w - 45);
        y = clamp(boss.y + bossDy / bossDistance * BOSS_ENEMY_SAFE_DISTANCE, 45, WORLD.h - 45);
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
