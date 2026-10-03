import { generateMap, mapRandom, type ProceduralMapId } from "./procedural-maps";
import type { EnemyKind } from "./enemy-definitions";
import { ENEMY_TYPES } from "./enemy-definitions";
// The Tutorial Forest's slimes and its golem stay in the forest (0.867).
const FOREST_ONLY: ReadonlySet<string> = new Set(["Bramble", "Needle", "Mossback", "Spitter", "Brood", "Cindermaw", "King Slime", "Dread Warden"]);
/**
 * Every enemy with art outside the forest, one picked per Endless map; only
 * that map's sprites are loaded. Endless enemies take the art's behaviour, so a
 * map that draws an archer or a spitter fights at range. New enemies join on
 * their own.
 */
export const GENERATED_ENEMY_ART: readonly EnemyKind[] = (Object.keys(ENEMY_TYPES) as EnemyKind[])
  .filter(kind => !FOREST_ONLY.has(kind));
/** No bigger than the old pool's largest, so a Colossus's art does not bring a bigger hitbox. */
export const GENERATED_ENEMY_MAX_RADIUS = 31;
export function generatedEnemyArt(id: ProceduralMapId): EnemyKind {
  const map = generateMap(id);
  const random = mapRandom(map.seed ^ 0x34ac913);
  return GENERATED_ENEMY_ART[Math.floor(random() * GENERATED_ENEMY_ART.length)];
}
