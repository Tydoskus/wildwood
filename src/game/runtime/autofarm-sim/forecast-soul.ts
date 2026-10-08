/**
 * The Soul Dimension for the calibration harness. The game's soul runtime
 * (soul-dimension-runtime.ts) fills Tutorial Forest's camps with soul enemies
 * built at the player's strength; the virtual player does not run it, so the
 * calibration test hands the world these sites instead, built the same way at
 * the build's strength as it starts. Their kills pay the soul reward as a run
 * reward of the same stat, which is the same thing for a build with no reward
 * multiplier (the soul build has no research or prestige).
 */
import { ENEMY_TYPES } from '../../enemies';
import { mapSpawnCamps, createSpawnSites, type MapId, type SpawnSite } from '../../world';
import { regionSpawnPoints } from '../../region-scatter';
import { soulCampName, soulCampStat, SOUL_ENEMY_SPECIES } from '../../soul-world';
import { farmGroupOf } from '../auto-farm-priority';
import { isSoulMap, SOUL_CAMPS, SOUL_STAT_DETAILS, soulEnemyStats, type SoulStatId } from '../../../../shared/soul-dimension';
import { effectivePlayerPowerStats } from '../../../../shared/player-power';
import { isProceduralMap, type ProceduralMapId } from '../../../../shared/procedural-maps';
import { TUTORIAL_FOREST_MAP_ID } from '../../../../shared/rules';
import { createEmptyResearchRanks } from '../../../../shared/research';
import { prestigePerkValue } from '../../../../shared/prestige-perks';
import { generatedMapContent } from '../../procedural-maps';
import type { CalibrationBuild } from './forecast-builds';
import type { VirtualPlayerProfile } from './virtual-player';

const RUN_STAT: Record<SoulStatId, 'damage' | 'health' | 'armor' | 'regen' | 'speed'> = {
  damage: 'damage', health: 'health', armor: 'armor', regen: 'regen', attackSpeed: 'speed', critDamage: 'damage',
};

/** The soul sites the runtime would fill for this build at `tier`. */
export function soulSites(profile: VirtualPlayerProfile, tier: number): SpawnSite[] {
  const research = { ...createEmptyResearchRanks(), ...profile.research };
  const stats = effectivePlayerPowerStats({ ...profile.base, equippedHead: profile.head ?? '', equippedChest: profile.chest ?? '', equippedRightHand: profile.weapon }, research);
  const critChance = research.criticalChance * .01 + prestigePerkValue(profile.perks, 'keenEdge');
  const critMultiplier = 1.05 + research.criticalDamage * .05;
  const dps = stats.damage * (1 + Math.min(1, critChance) * (critMultiplier - 1)) * Math.max(1, profile.projectileCount ?? 1) / Math.max(.05, stats.attackRate);
  const built = soulEnemyStats({ dps, maxHp: stats.maxHp, armor: stats.armor, regen: stats.regen });
  const sites: SpawnSite[] = [];
  for (const [index, camp] of mapSpawnCamps(TUTORIAL_FOREST_MAP_ID).entries()) {
    const soulCamp = SOUL_CAMPS[index];
    const stat = soulCamp ? soulCampStat(soulCamp, tier) : null;
    if (!soulCamp || !stat) continue;
    const species = ENEMY_TYPES[SOUL_ENEMY_SPECIES[stat]];
    for (const point of regionSpawnPoints(camp).slice(0, camp.count)) {
      sites.push({ id: sites.length, x: point.x, y: point.y, type: SOUL_ENEMY_SPECIES[stat], campName: soulCampName(stat, soulCamp),
        groupAggro: false, leashRange: Math.max(420, camp.radius * .9), alive: false, respawnAt: 0,
        definition: { ...species, hp: built.hp, damage: built.damage, attackSpeed: built.attackSpeed, regen: 0, armor: 0,
          reward: { type: RUN_STAT[stat], amount: stat === 'critDamage' ? 0 : SOUL_STAT_DETAILS[stat].reward } } });
    }
  }
  return sites;
}

/** Hands the mocked world this build's soul sites while it runs in the Soul Dimension. */
export function installSoulSites(build: CalibrationBuild, profile: VirtualPlayerProfile) {
  (globalThis as { __forecastSoulSites?: (mapId: string) => SpawnSite[] | null }).__forecastSoulSites = mapId =>
    isSoulMap(mapId) && build.soulTier ? soulSites(profile, build.soulTier) : null;
}

/** A map's sites as the game builds them (the Soul Dimension's from the build). */
export function calibrationSites(mapId: string, build: CalibrationBuild, profile: VirtualPlayerProfile = build.profile): SpawnSite[] {
  if (isSoulMap(mapId)) return soulSites(profile, build.soulTier ?? 1);
  if (isProceduralMap(mapId)) return generatedMapContent(mapId as ProceduralMapId).sites;
  return createSpawnSites({ x: 0, y: 0 }, mapId as MapId);
}

/** The stat groups a calibration run may farm on `mapId`: every group with power to give. */
export function calibrationMapGroups(mapId: string, build: CalibrationBuild) {
  const groups = new Set(calibrationSites(mapId, build).map(site => farmGroupOf(site)));
  groups.delete('soul:critDamage');
  return [...groups];
}
