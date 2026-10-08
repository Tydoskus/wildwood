/**
 * The growth forecast's inputs (growth-forecast.ts), built from what the game
 * has: this map's live spawn sites, another map's live balance (the snapshot
 * coop.mapIndexBalance fetches), and the build autofarm already prices kills
 * against (auto-farm-build.ts). Pure: callers pass everything in.
 */
import type { MapBalanceSnapshot } from '../../../shared/map-balance-types';
import { armorDamageReduction as authoredArmorReduction } from '../../../shared/combat';
import { curveArmorReduction } from '../../../shared/balance-curve';
import { CAMPAIGN_GATEWAYS } from '../../../shared/map-gateways';
import { generateMap, isProceduralMap, type ProceduralMapId } from '../../../shared/procedural-maps';
import { isSoulMap, SOUL_ARRIVAL } from '../../../shared/soul-dimension';
import { enemyRespawnSecondsWithResearch } from '../../../shared/utility-research';
import { preparePlayerPowerStats, type PlayerPowerProgress, type PlayerPowerResearch, type PlayerPowerStats } from '../../../shared/player-power';
import { REGULAR_ENEMY_RESPAWN_SECONDS } from '../../../shared/rules';
import type { BowSkillRoll } from '../../../shared/bow-skills';
import { ENEMY_TYPES, type EnemyDefinition } from '../enemies';
import { createSpawnSites, type MapId, type SpawnSite } from '../world';
import { generatedMapContent } from '../procedural-maps';
import { soulStatOfCampName } from '../soul-world';
import { farmGroupOf, soulFarmReward } from './auto-farm-priority';
import { balancedSiteDefinition } from './map-balance-enemies';
import type { ForecastBuild, ForecastMap, ForecastSite } from './growth-forecast';

/** A hit after armor on a map's rule: the curve's, or the authored one (rounded, at least 1). */
export function armorRule(curve: boolean) {
  return (damage: number, armor: number) => {
    const incoming = Math.max(0, Number.isFinite(damage) ? damage : 0);
    return curve ? incoming * (1 - curveArmorReduction(armor)) : Math.max(1, Math.round(incoming * (1 - authoredArmorReduction(armor))));
  };
}

/** Where a map's travellers (and the dead) arrive. */
export function mapArrival(mapId: string): { x: number; y: number } | null {
  if (isSoulMap(mapId)) return { ...SOUL_ARRIVAL };
  if (isProceduralMap(mapId)) return { ...generateMap(mapId as ProceduralMapId).arrival };
  const gateways = CAMPAIGN_GATEWAYS[mapId];
  return gateways ? { ...gateways.arrival } : null;
}

/** The portal on `mapId` that leads to `destination`, at its trigger point (auto-farm-build.ts). */
export function mapPortalTo(mapId: string, destination: string): { x: number; y: number } | null {
  const portals: readonly { x: number; y: number; height: number; destination: string }[] = isProceduralMap(mapId)
    ? generateMap(mapId as ProceduralMapId).portals
    : CAMPAIGN_GATEWAYS[mapId]?.portals ?? [];
  const portal = portals.find(entry => entry.destination === destination);
  return portal ? { x: portal.x, y: portal.y - portal.height * .32 } : null;
}

/** One site as the forecast prices it: its group, and its reward (a soul kill's flat soul stat). */
export function forecastSite(site: SpawnSite, definition: EnemyDefinition, respawnIn = 0): ForecastSite {
  const soul = soulStatOfCampName(site.campName);
  return {
    id: site.id, x: site.x, y: site.y, campName: site.campName, groupAggro: site.groupAggro, leashRange: site.leashRange,
    definition, group: farmGroupOf(site), reward: soul ? soulFarmReward(soul) : definition.reward, respawnIn,
  };
}

/**
 * This map's sites as they stand: each one's definition as combat has it, and
 * how long a dead one has left (`respawnIn`, from its respawnAt on the game clock).
 */
export function liveForecastSites(sites: readonly SpawnSite[], respawnIn: (site: SpawnSite) => number = () => 0): ForecastSite[] {
  return sites.map(site => forecastSite(site, site.definition ?? ENEMY_TYPES[site.type], site.alive ? 0 : Math.max(0, respawnIn(site))));
}

/** Another map's sites at full strength, built as the game builds them and priced from that map's balance. */
export function balancedForecastSites(mapId: string, snapshot: MapBalanceSnapshot): ForecastSite[] {
  const procedural = isProceduralMap(mapId);
  const sites = procedural ? generatedMapContent(mapId as ProceduralMapId).sites : createSpawnSites({ x: 0, y: 0 }, mapId as MapId);
  const camps = procedural ? generateMap(mapId as ProceduralMapId).camps : null;
  return sites.map(site => forecastSite(site, balancedSiteDefinition(snapshot, site, camps) ?? site.definition ?? ENEMY_TYPES[site.type]));
}

/** A map for the forecast. `snapshot` is its live balance (respawn and armor rule); null keeps the installed defaults. */
export function forecastMap(mapId: string, sites: readonly ForecastSite[], options: {
  snapshot?: MapBalanceSnapshot | null;
  /** The player's Enemy Respawn research rank. */
  enemyRespawnRank?: number;
  /** The installed armor rule (combat.ts damageAfterArmor), for the map the player stands on. */
  hitAfterArmor?: (damage: number, armor: number) => number;
  arrival?: { x: number; y: number };
} = {}): ForecastMap {
  const base = options.snapshot?.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS;
  return {
    mapId, sites,
    arrival: options.arrival ?? mapArrival(mapId) ?? { x: 0, y: 0 },
    respawnSeconds: enemyRespawnSecondsWithResearch(base, options.enemyRespawnRank ?? 0),
    hitAfterArmor: options.hitAfterArmor ?? armorRule(options.snapshot?.rules?.ARMOR_CURVE === 1),
  };
}

/** The build as autofarm's evaluator sees it (auto-farm-build.ts createFarmEvaluator's deps), plus what combat adds. */
export function forecastBuild(deps: {
  base: PlayerPowerStats;
  equipment: Omit<PlayerPowerProgress, keyof PlayerPowerStats>;
  research: PlayerPowerResearch | null | undefined;
  upgradeLevel: (itemId: string) => number;
  rewardMultiplier: number;
  minAttackInterval: number;
  criticalChance: number;
  criticalMultiplier: number;
  projectileCount: number;
  melee: boolean;
  reach: number;
  projectileSpeed: number;
  moveSpeed: number;
  bowSkills?: Partial<BowSkillRoll> | null;
  perks?: { doubleStrike?: number; splitShot?: number; reflect?: number; secondWind?: number };
  reflectOnly?: boolean;
  damageCalibration?: number;
  incomingCalibration?: number;
}): ForecastBuild {
  const prepared = preparePlayerPowerStats({ ...deps.base, ...deps.equipment }, deps.research, deps.upgradeLevel);
  return {
    base: { ...deps.base }, effective: prepared,
    rewardMultiplier: deps.rewardMultiplier, minAttackInterval: deps.minAttackInterval,
    criticalChance: deps.criticalChance, criticalMultiplier: deps.criticalMultiplier,
    projectileCount: deps.projectileCount, melee: deps.melee, reach: deps.reach, projectileSpeed: deps.projectileSpeed,
    moveSpeed: deps.moveSpeed, bowSkills: deps.bowSkills ?? null,
    doubleStrike: deps.perks?.doubleStrike ?? 0, splitShot: deps.perks?.splitShot ?? 0,
    reflect: deps.perks?.reflect ?? 0, secondWind: deps.perks?.secondWind ?? 0,
    reflectOnly: deps.reflectOnly, damageCalibration: deps.damageCalibration, incomingCalibration: deps.incomingCalibration,
  };
}
