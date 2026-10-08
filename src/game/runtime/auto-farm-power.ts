import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../shared/rules';

/**
 * The power the Balance Lab expects a player to bring to each campaign map:
 * its entry build's power in one Lab campaign from a fresh character
 * (autofarm-sim/reference-builds.ts campaignReferenceBuilds, the build the
 * maps are tuned to), at balance revision 79. The game has no recommended
 * power of its own; this is its balance curve. Endless and the Soul Dimension
 * have none. After a rebalance, regenerate it with
 * AUTOFARM_POWER_TABLE=1 npx vitest run src/game/runtime/auto-farm-power.test.ts
 */
export const MAP_POWER_REVISION = 79;
export const MAP_ENTRY_POWER: Readonly<Record<string, number>> = {
  tutorial_forest: 105,
  beginner_desert: 5_969,
  intermediate_snowlands: 7_123,
  advanced_lava_wastes: 69_472,
  infernal_depths: 140_670,
  water_reach: 443_709,
  samurai_garden: 1_567_863,
  cloudspire: 6_865_938,
  moonfen: 25_390_034,
  crystal_hollows: 172_922_884,
  clockwork_ruins: 718_373_799,
  duskfall_orchard: 3_237_142_381,
  neon_bastion: 48_144_219_200,
  verdant_catacombs: 110_744_967_136,
  ion_citadel: 451_676_171_019,
};

/** A map's recommended power: what Move On waits for before going there. Null where there is none (Endless, the Soul Dimension). */
export function recommendedMapPower(mapId: string): number | null {
  return MAP_ENTRY_POWER[mapId] ?? null;
}

/**
 * A map's boss's recommended power: the power the Lab leaves the map with (the
 * next campaign map's entry), which is what the boss is sized for; the map's
 * own where there is no map after it. Null where the map has none.
 */
export function recommendedBossPower(mapId: string): number | null {
  const index = CAMPAIGN_MAP_IDS.indexOf(mapId);
  if (index < 0) return null;
  return MAP_ENTRY_POWER[CAMPAIGN_MAP_IDS[index + 1]] ?? recommendedMapPower(mapId);
}
