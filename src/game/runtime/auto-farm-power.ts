import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../shared/rules';
import { ENDLESS_STEPS } from '../../../shared/map-balance';
import { proceduralMapNumber } from '../../../shared/procedural-maps';

/**
 * The power the Balance Lab expects a player to bring to each campaign map:
 * its entry build's power in one Lab campaign from a fresh character
 * (autofarm-sim/reference-builds.ts campaignReferenceBuilds, the build the
 * maps are tuned to), at balance revision 79. The game has no recommended
 * power of its own; this is its balance curve. Endless carries it on by the
 * live balance's per-stage growth (endlessMapPower); the Soul Dimension's
 * enemies are sized to the player, so it has none. After a rebalance, regenerate it with
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

/**
 * How much more power each Endless stage asks than the one before. The live
 * balance grows every Endless stage's enemy health by ENDLESS_STEPS.health and
 * their hits by ENDLESS_STEPS.hit (shared/map-balance.ts resolveMapBalance);
 * power counts damage and health alike, so it grows by the two's geometric
 * mean, about 5.4x a stage.
 */
export const ENDLESS_STAGE_GROWTH = Math.sqrt(ENDLESS_STEPS.health * ENDLESS_STEPS.hit);
/** Endless N's recommended power: the last campaign map's, grown one Endless step per stage. */
export function endlessMapPower(number: number): number {
  return MAP_ENTRY_POWER[CAMPAIGN_MAP_IDS[CAMPAIGN_MAP_IDS.length - 1]] * ENDLESS_STAGE_GROWTH ** Math.max(1, number);
}

/** A map's recommended power: what Move On waits for before going there. Null where there is none (Endless, the Soul Dimension). */
export function recommendedMapPower(mapId: string): number | null {
  const endless = proceduralMapNumber(mapId);
  return endless !== null ? endlessMapPower(endless) : MAP_ENTRY_POWER[mapId] ?? null;
}

/**
 * A map's boss's recommended power: the power the Lab leaves the map with (the
 * next campaign map's entry), which is what the boss is sized for; the map's
 * own where there is no map after it. Null where the map has none.
 */
export function recommendedBossPower(mapId: string): number | null {
  // An Endless boss gates the next stage: it is sized for that stage's entry.
  const endless = proceduralMapNumber(mapId);
  if (endless !== null) return endlessMapPower(endless + 1);
  const index = CAMPAIGN_MAP_IDS.indexOf(mapId);
  if (index < 0) return null;
  // The last campaign map's boss opens Endless 1.
  return index === CAMPAIGN_MAP_IDS.length - 1 ? endlessMapPower(1) : MAP_ENTRY_POWER[CAMPAIGN_MAP_IDS[index + 1]] ?? recommendedMapPower(mapId);
}
