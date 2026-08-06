import { BOSS_ENEMY_SAFE_DISTANCE, WORLD } from "./constants";
import { CAMPS, type EnemyKind } from "./enemies";
import { clamp, rand } from "./math";

export type WorldPath = { x: number; y: number; w: number; h: number };
export type WorldDecor =
  | { type: "stone"; x: number; y: number; w: number; h: number }
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

  for (let index = 0; index < 36; index += 1) {
    const side = index % 4;
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;
    if (side === 0) { x = rand(140, WORLD.w - 410); y = rand(85, 260); width = rand(110, 280); height = rand(35, 70); }
    if (side === 1) { x = rand(WORLD.w - 260, WORLD.w - 85); y = rand(140, WORLD.h - 410); width = rand(35, 70); height = rand(110, 280); }
    if (side === 2) { x = rand(140, WORLD.w - 410); y = rand(WORLD.h - 260, WORLD.h - 85); width = rand(110, 280); height = rand(35, 70); }
    if (side === 3) { x = rand(85, 260); y = rand(140, WORLD.h - 410); width = rand(35, 70); height = rand(110, 280); }
    decor.push({ type: "stone", x, y, w: width, h: height });
  }

  const groveCenters: Point[] = [];
  let treeVariant = 0;
  for (let grove = 0; grove < 18; grove += 1) {
    let center: Point | null = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = { x: rand(180, WORLD.w - 180), y: rand(180, WORLD.h - 180) };
      if (isOnRoad(candidate.x, candidate.y, 150)) continue;
      if (Math.hypot(candidate.x - playerSpawn.x, candidate.y - playerSpawn.y) < 620) continue;
      if (groveCenters.some((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < 390)) continue;
      center = candidate;
      break;
    }
    if (!center) continue;
    groveCenters.push(center);

    const treeCount = Math.floor(rand(5, 10));
    const radiusX = rand(90, 185);
    const radiusY = rand(70, 150);
    for (let tree = 0; tree < treeCount; tree += 1) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const angle = rand(0, Math.PI * 2);
        const distance = Math.sqrt(Math.random());
        const x = center.x + Math.cos(angle) * radiusX * distance;
        const y = center.y + Math.sin(angle) * radiusY * distance;
        if (x < 65 || x > WORLD.w - 65 || y < 65 || y > WORLD.h - 65) continue;
        if (isOnRoad(x, y, 65)) continue;
        if (Math.hypot(x - playerSpawn.x, y - playerSpawn.y) < 500) continue;
        decor.push({ type: "tree", x, y, s: rand(0.72, 1.32), variant: treeVariant++ % 16 });
        break;
      }
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
