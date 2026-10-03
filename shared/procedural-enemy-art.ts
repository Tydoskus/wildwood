import { generateMap, mapRandom, type ProceduralMapId } from "./procedural-maps";
import type { EnemyKind } from "./enemy-definitions";
// A bounded pool of existing art. Only this map's selected sprites are loaded.
// No Tutorial Forest slimes (0.867): Endless draws from the later maps' melee regulars.
export const GENERATED_ENEMY_ART: readonly EnemyKind[] = [
  "Dune Raider",
  "Frost Raider",
  "Ember Raider",
  "Depth Raider",
  "Tide Raider",
  "Sakura Ronin",
  "Gale Prowler",
  "Fen Prowler",
  "Shard Hopper",
  "Gear Prowler",
  "Gourd Prowler",
  "Ion Patrol",
];
export function generatedEnemyArt(id: ProceduralMapId): EnemyKind {
  const map = generateMap(id);
  const random = mapRandom(map.seed ^ 0x34ac913);
  return GENERATED_ENEMY_ART[Math.floor(random() * GENERATED_ENEMY_ART.length)];
}
