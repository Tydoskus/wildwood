import { generateMap, mapRandom, type ProceduralMapId } from "./procedural-maps";
import type { EnemyKind } from "./enemy-definitions";
import { ENDLESS_ENEMY_ART } from "./endless-enemies";
/**
 * One art set per Endless map (0.867), never the slimes. The campaign's enemies
 * share about fifteen art sets (every Lava Lake enemy is an orange slime), so
 * the pool is by set: each non-slime campaign set by its melee enemy, with its
 * shooter on a third of the maps that draw it, and each Endless-only Layer Lab
 * capture. Endless enemies take the chosen enemy's behaviour.
 */
const CAMPAIGN_ART_SETS: readonly { melee: EnemyKind; ranged: EnemyKind }[] = [
  { melee: "Dune Raider", ranged: "Dune Archer" }, { melee: "Frost Raider", ranged: "Glacier Archer" },
  { melee: "Depth Raider", ranged: "Abyss Archer" }, { melee: "Tide Raider", ranged: "Reef Archer" },
  { melee: "Sakura Ronin", ranged: "Petal Archer" }, { melee: "Gale Prowler", ranged: "Nimbus Archer" },
  { melee: "Fen Prowler", ranged: "Glowcap Archer" }, { melee: "Shard Hopper", ranged: "Crystal Spitter" },
  { melee: "Gear Prowler", ranged: "Rivet Spitter" }, { melee: "Gourd Prowler", ranged: "Seed Spitter" },
  { melee: "Circuit Prowler", ranged: "Pulse Spitter" }, { melee: "Mossbound Stalker", ranged: "Spore Slinger" },
  { melee: "Ion Patrol", ranged: "Capacitor Gunner" },
];
const ART_SETS: readonly { melee: EnemyKind; ranged?: EnemyKind }[] = [
  ...CAMPAIGN_ART_SETS,
  ...(Object.keys(ENDLESS_ENEMY_ART) as EnemyKind[]).map(melee => ({ melee })),
];
/** Every enemy an Endless map can draw, for asset checks and tools. */
export const GENERATED_ENEMY_ART: readonly EnemyKind[] = ART_SETS.flatMap(set => set.ranged ? [set.melee, set.ranged] : [set.melee]);
/** No bigger than the old pool's largest, so big art brings no bigger hitbox. */
export const GENERATED_ENEMY_MAX_RADIUS = 31;
export function generatedEnemyArt(id: ProceduralMapId): EnemyKind {
  const map = generateMap(id);
  const random = mapRandom(map.seed ^ 0x34ac913);
  const set = ART_SETS[Math.floor(random() * ART_SETS.length)];
  return set.ranged && random() < 1 / 3 ? set.ranged : set.melee;
}
