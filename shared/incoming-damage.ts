import { armorDamageReduction } from "./combat";
import { referenceBuildForMap } from "./progression";

export const LATE_MAP_DAMAGE_TIER = {
  samurai_garden: 0,
  cloudspire: 1,
  moonfen: 2,
  crystal_hollows: 3, clockwork_ruins: 4, duskfall_orchard: 5,
} as const;
export type LateDamageMap = keyof typeof LATE_MAP_DAMAGE_TIER;

// Samurai is campaign tier 5 (Desert is tier 0).
export const LATE_DAMAGE_REFERENCE = { tier: 3, ...referenceBuildForMap(8) } as const;
export const LATE_REGULAR_MIN_HIT_SHARE = .08;
export const LATE_BOSS_HIT_MULTIPLIERS = { heavy: 4, area: 2.8, contact: 2 } as const;

export function lateMapReferenceBuild(tier: number) {
  if (!Number.isInteger(tier) || tier < 0) throw new RangeError("Invalid late-map tier");
  const build = referenceBuildForMap(tier + 5);
  return { maxHp: build.maxHp, armor: build.armor };
}

export function lateMapMinimumHitDamage(tier: number) {
  const build = lateMapReferenceBuild(tier);
  return build.maxHp * LATE_REGULAR_MIN_HIT_SHARE / (1 - armorDamageReduction(build.armor));
}

/** Preserve authored relative hit sizes, with the weakest at the tier's target. */
export function lateMapDamageProfile<Key extends string>(
  map: LateDamageMap,
  shapedDamage: Record<Key, number>,
): Record<Key, number> {
  const entries = Object.entries(shapedDamage) as [Key, number][];
  const weakest = Math.min(...entries.map(([, damage]) => damage));
  if (!entries.length || entries.some(([, damage]) => !Number.isFinite(damage) || damage <= 0)) {
    throw new RangeError("Damage profiles must contain positive, finite hits");
  }
  const scale = lateMapMinimumHitDamage(LATE_MAP_DAMAGE_TIER[map]) / weakest;
  return Object.fromEntries(entries.map(([key, damage]) => [key, damage * scale])) as Record<Key, number>;
}
