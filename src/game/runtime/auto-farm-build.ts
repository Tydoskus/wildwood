import { damageAfterArmor } from '../../../shared/combat';
import { bossHitsToDefeat, bossRegenFractionFor } from '../../../shared/boss-regeneration';
import { effectivePlayerPowerStats, unroundedPlayerPower, type PlayerPowerProgress, type PlayerPowerResearch, type PlayerPowerStats } from '../../../shared/player-power';
import { SAFE_CAMP_DANGER, type FarmEvaluation, type FarmReward } from './auto-farm-plan';
import { runtimeMapBalance } from '../../../shared/map-balance-runtime';
import { isProceduralMap, proceduralMapNumber } from '../../../shared/procedural-maps';
import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../shared/rules';
import { offlineEnemyRoster, simulateOfflineFarming, type OfflineEnemy } from '../../../shared/offline-progress';
import { worldReflectDamage } from '../../../shared/prestige-perks';
import { farmStatGroup, type AutoFarmGroup } from './auto-farm-priority';
import type { RewardType } from '../enemies';
import { createDamageMeter } from './damage-meter';
import { referenceBuildForMap } from '../../../shared/progression';

/** A boss's hits: the hardest one, the average one, and how often one lands on a player who stands and fights. */
export type FarmBoss = { hp: number; strongestHit: number; averageHit?: number; regenFraction?: number; mapId: string };
/**
 * Bosses telegraph an attack about every three seconds (their attack clocks
 * reset to 2.5–3 s), and autofarm stands in it rather than dodging.
 */
export const BOSS_ATTACK_SECONDS = 3;
/**
 * Enemies that reach a player who is not pulling: the target and the one or
 * two of its camp it wakes. A pulled group comes all at once.
 */
export const UNPULLED_ATTACKERS = 3;
/** How far measured damage may move the estimate: a short or odd sample cannot swing it further. */
export const CALIBRATION_MIN = .5;
export const CALIBRATION_MAX = 20;

/** One kind of enemy in a stat group, as a fight sees it. */
export type GroupEnemy = Pick<OfflineEnemy, 'hp' | 'damage' | 'attacksPerSecond' | 'population'>;
export type GroupFighter = {
  maxHp: number; armor: number; regen: number;
  /** Weapon damage per second against one enemy; zero in Reflect Only. */
  dps: number;
  /** Chance a hit taken is thrown back (Riposte), and whether it is uncapped (Reflect Only). */
  reflectChance: number; reflectOnly: boolean;
  /** Share of max health healed per kill (Second Wind). */
  healPerKill: number;
};

/**
 * The most health a fight against a whole group takes out of the player at
 * any moment, as a share of max health: enemies killed one at a time while
 * up to `attackers` of them hit back, less regeneration, Second Wind and what
 * Reflect returns. Above 1 the player dies before the group does.
 */
export function groupFightDanger(group: readonly GroupEnemy[], fighter: GroupFighter, attackers: number) {
  const population = group.reduce((sum, entry) => sum + entry.population, 0);
  if (!population) return 0;
  const average = (value: (entry: GroupEnemy) => number) => group.reduce((sum, entry) => sum + entry.population * value(entry), 0) / population;
  const hp = average(entry => entry.hp);
  // What one attacker takes off the player, and throws back at itself, each second.
  const incoming = average(entry => damageAfterArmor(entry.damage, fighter.armor) * entry.attacksPerSecond);
  const reflected = fighter.reflectChance * average(entry => worldReflectDamage(entry.damage, fighter.maxHp, fighter.reflectOnly) * entry.attacksPerSecond);
  let lost = 0, worst = 0;
  for (let remaining = population; remaining > 0; remaining -= 1) {
    const hitting = Math.min(Math.max(1, attackers), remaining);
    const rate = fighter.dps + hitting * reflected;
    if (!(rate > 0)) return Number.POSITIVE_INFINITY;
    const seconds = hp / rate;
    lost = Math.max(0, lost + (hitting * incoming - fighter.regen) * seconds);
    worst = Math.max(worst, lost);
    lost = Math.max(0, lost - fighter.healPerKill * fighter.maxHp);
  }
  return worst / Math.max(1, fighter.maxHp);
}

/** How long a build lasts against a group's hardest-hitting attackers, standing: the defence half of the map gate. */
export function groupSurvivalSeconds(group: readonly GroupEnemy[], stats: Pick<PlayerPowerStats, 'maxHp' | 'armor' | 'regen'>, attackers = UNPULLED_ATTACKERS) {
  const population = group.reduce((sum, entry) => sum + entry.population, 0);
  if (!population) return Number.POSITIVE_INFINITY;
  const incoming = Math.min(attackers, population) * group.reduce((sum, entry) =>
    sum + entry.population * damageAfterArmor(entry.damage, stats.armor) * entry.attacksPerSecond, 0) / population - stats.regen;
  return incoming > 0 ? stats.maxHp / incoming : Number.POSITIVE_INFINITY;
}

/**
 * Whether a build is at least what the balance expects on arrival at a
 * campaign map (shared/progression.ts referenceBuildForMap): its real damage
 * per second, and how long it lasts against the map's hardest-hitting group.
 * Ryan saw autofarm move on with half the stats a map needs; a map with one
 * easy camp passed the old "any camp is safe" test. Null off the campaign.
 */
export function meetsMapReference(mapId: string, stats: PlayerPowerStats, realDps: number) {
  const index = CAMPAIGN_MAP_IDS.indexOf(mapId as never);
  if (index < 0) return null;
  const reference = referenceBuildForMap(index);
  if (realDps < reference.damage / reference.attackInterval) return false;
  const groups = [...mapStatGroups(mapId).values()];
  const hardest = groups.reduce((worst, group) => groupSurvivalSeconds(group, reference) < groupSurvivalSeconds(worst, reference) ? group : worst, groups[0] ?? []);
  return groupSurvivalSeconds(hardest, stats) >= groupSurvivalSeconds(hardest, reference);
}

/** A map's enemies by the stat they pay, as autofarm groups them. */
export function mapStatGroups(mapId: string) {
  const groups = new Map<AutoFarmGroup, GroupEnemy[]>();
  for (const entry of offlineEnemyRoster(mapId, runtimeMapBalance(mapId) ?? undefined)) {
    const key = farmStatGroup(entry.reward.type as RewardType);
    groups.set(key, [...groups.get(key) ?? [], entry]);
  }
  return groups;
}

/**
 * Prices a kill's reward against the player's live build, for autofarm to
 * choose by: the power the game shows, and the two boss numbers the balance
 * simulator gates on (fight time with crits and boss regen, and the hardest
 * hit after armor as a share of max health). Effective stats come from the
 * same calculation as the profile and leaderboard.
 */
export function createFarmEvaluator(deps: {
  base: () => PlayerPowerStats;
  equipment: () => Omit<PlayerPowerProgress, keyof PlayerPowerStats>;
  research: () => PlayerPowerResearch | null | undefined;
  upgradeLevel: (itemId: string) => number;
  rewardMultiplier: () => number;
  minAttackInterval: () => number;
  criticalChance: () => number;
  criticalMultiplier: () => number;
  boss: () => FarmBoss | null;
  /** Riposte's chance to throw a hit back; 0 without it. */
  reflectChance?: () => number;
  reflectOnly?: () => boolean;
  /** Second Wind: share of max health healed per regular kill. */
  healPerKill?: () => number;
  /** Boss Slayer: extra damage on bosses, as a share (0.2 is +20%). */
  bossSlayer?: () => number;
  /** The weapon damage per second actually landing (damage-meter.ts), or null before there is enough to go on. */
  measuredDps?: () => number | null;
}) {
  function build(reward?: FarmReward) {
    const stats = { ...deps.base() };
    if (reward) {
      const amount = reward.amount * deps.rewardMultiplier();
      // As applyReward does it (player-combat-controller.ts).
      if (reward.type === 'damage') stats.damage += amount;
      else if (reward.type === 'health') stats.maxHp += amount;
      else if (reward.type === 'armor') stats.armor += amount;
      else if (reward.type === 'regen') stats.regen += amount;
      else if (reward.type === 'speed') stats.attackRate = 1 / Math.min(1 / deps.minAttackInterval(), 1 / stats.attackRate + amount);
    }
    return effectivePlayerPowerStats({ ...stats, ...deps.equipment() }, deps.research(), deps.upgradeLevel);
  }
  const interval = (stats: PlayerPowerStats) => Math.max(deps.minAttackInterval(), stats.attackRate);
  const averageHit = (stats: PlayerPowerStats) => {
    const chance = Math.min(1, Math.max(0, deps.criticalChance()));
    return stats.damage * (1 + chance * (Math.max(1, deps.criticalMultiplier()) - 1));
  };
  /**
   * Measured over modelled damage for the live build: what multishot, Double
   * Strike, bow skills and the rest add on top of damage and crits. Applied to
   * every estimate, so a reward's worth scales with what the build really does.
   */
  const calibration = () => {
    const measured = deps.measuredDps?.();
    const modelled = averageHit(build()) / interval(build());
    return measured && modelled > 0 ? Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, measured / modelled)) : 1;
  };
  const realHit = (stats: PlayerPowerStats, scale: number) => averageHit(stats) * scale;
  const weaponDps = (stats: PlayerPowerStats, scale = calibration()) => deps.reflectOnly?.() ? 0 : realHit(stats, scale) / interval(stats);
  const fighter = (stats: PlayerPowerStats): GroupFighter => ({ maxHp: stats.maxHp, armor: stats.armor, regen: stats.regen, dps: weaponDps(stats),
    reflectChance: Math.max(0, deps.reflectChance?.() ?? 0), reflectOnly: Boolean(deps.reflectOnly?.()), healPerKill: Math.max(0, deps.healPerKill?.() ?? 0) });
  return {
    evaluate(reward?: FarmReward): FarmEvaluation {
      const stats = build(reward);
      const boss = deps.boss();
      if (!boss) return { power: unroundedPlayerPower(stats), fightSeconds: null, hitShare: null, fightDamageShare: null };
      const step = interval(stats);
      // Reflect fights the boss too: each of its hits, some of the time, comes straight back.
      const averageBossHit = boss.averageHit ?? boss.strongestHit;
      const reflectDps = Math.max(0, deps.reflectChance?.() ?? 0) * worldReflectDamage(averageBossHit, stats.maxHp, Boolean(deps.reflectOnly?.())) / BOSS_ATTACK_SECONDS;
      const bossHit = realHit(stats, calibration()) * (1 + Math.max(0, deps.bossSlayer?.() ?? 0));
      const hit = (deps.reflectOnly?.() ? 0 : bossHit) + reflectDps * step;
      const hits = hit > 0 ? bossHitsToDefeat(boss.hp, hit, step, boss.regenFraction ?? bossRegenFractionFor(boss.mapId)) : Number.POSITIVE_INFINITY;
      const fightSeconds = Number.isFinite(hits) ? hits * step : Number.POSITIVE_INFINITY;
      // Every hit it lands over the whole fight, less regeneration: one hit at
      // 30% of health looked safe, but a 90-second fight is some thirty of them.
      const taken = Number.isFinite(fightSeconds)
        ? (Math.floor(fightSeconds / BOSS_ATTACK_SECONDS) * damageAfterArmor(averageBossHit, stats.armor) - stats.regen * fightSeconds) / Math.max(1, stats.maxHp)
        : Number.POSITIVE_INFINITY;
      return {
        power: unroundedPlayerPower(stats),
        fightSeconds,
        hitShare: damageAfterArmor(boss.strongestHit, stats.armor) / Math.max(1, stats.maxHp),
        fightDamageShare: Math.max(0, taken),
      };
    },
    /** The live build's effective stats. */
    stats: () => build(),
    /** Damage per second against a regular enemy, as the player really deals it. */
    dps() {
      const stats = build();
      return realHit(stats, calibration()) / interval(stats);
    },
    /** How much more (or less) the build really deals than damage and crits predict. */
    calibration,
    /** How close a fight with this group comes to killing the live build: see groupFightDanger. */
    danger(group: readonly GroupEnemy[], pulled: boolean) {
      const population = group.reduce((sum, entry) => sum + entry.population, 0);
      return groupFightDanger(group, fighter(build()), pulled ? population : UNPULLED_ATTACKERS);
    },
  };
}

type FarmPortal = { x: number; y: number; height: number; destination: string };
type LiveBoss = { x: number; y: number; r: number; dead?: boolean; isBoss?: boolean; ry?: number; hitboxOffsetY?: number };
/**
 * Long enough that a map that only kills slowly still counts as too hard.
 * Players reported autofarm beating a boss and walking on to a map it could
 * not hold, which cost a night of farming.
 */
export const NEXT_MAP_HOLD_SECONDS = 30 * 60;

/** How deep a map is: the campaign in order, then Endless. Forward is a higher rank. */
export function farmMapRank(mapId: string) {
  return isProceduralMap(mapId) ? 1_000 + (proceduralMapNumber(mapId) ?? 0) : CAMPAIGN_MAP_IDS.indexOf(mapId as never);
}

/**
 * Everything autofarm's planning reads from the live game, as controller
 * options: the build evaluator, kill speed, this map's standing boss (with its
 * balance), and the unlocked portal forward.
 */
export function createAutoFarmProgress(deps: Omit<Parameters<typeof createFarmEvaluator>[0], 'boss'> & {
  mapId: () => string;
  mapBoss: () => LiveBoss | null | undefined;
  portals: () => readonly (FarmPortal | null | undefined)[];
  portalUnlocked: (portal: FarmPortal) => boolean;
  reflectOnly: () => boolean;
  /** Whether "Pull whole group" is on, which brings a group in all at once. */
  pullAll?: () => boolean;
  now?: () => number;
}) {
  const meter = createDamageMeter(deps.now ?? (() => performance.now()));
  const evaluator = createFarmEvaluator({ ...deps, measuredDps: () => meter.dps(), boss: () => {
    const boss = runtimeMapBalance(deps.mapId())?.boss;
    if (!boss) return null;
    const attacks = Object.values(boss.attacks).filter(value => value > 0);
    return { hp: boss.hp, strongestHit: Math.max(boss.damage, ...attacks), regenFraction: boss.regenFraction, mapId: deps.mapId(),
      averageHit: attacks.length ? attacks.reduce((sum, value) => sum + value, 0) / attacks.length : boss.damage };
  } });
  const ranked = (direction: 1 | -1) => {
    const here = farmMapRank(deps.mapId());
    return deps.portals().find((portal): portal is FarmPortal => Boolean(portal) && Math.sign(farmMapRank(portal!.destination) - here) === direction && deps.portalUnlocked(portal!)) ?? null;
  };
  const statsKey = () => { const stats = evaluator.stats(); return `${stats.maxHp}:${stats.damage}:${stats.armor}:${stats.regen}:${stats.attackRate}`; };
  // Per map: the server's own offline estimate (can this build hold the map,
  // unattended?) and whether one of its stat groups can be fought standing.
  // The offline estimate alone counts one enemy at a time, a quarter of their
  // swings landing; autofarm walked on and died in the first group.
  const holdable = new Map<string, { key: string; ok: boolean }>();
  const canHold = (mapId: string) => {
    const key = `${statsKey()}:${deps.pullAll?.() ? 1 : 0}:${evaluator.calibration().toFixed(2)}`;
    const cached = holdable.get(mapId);
    if (cached?.key === key) return cached.ok;
    // The offline estimate prices damage alone; give it the damage the build really deals.
    const stats = evaluator.stats();
    const ok = meetsMapReference(mapId, stats, evaluator.dps()) !== false
      && simulateOfflineFarming(mapId, { ...stats, damage: stats.damage * evaluator.calibration() }, NEXT_MAP_HOLD_SECONDS).survivable
      && [...mapStatGroups(mapId).values()].some(group => evaluator.danger(group, Boolean(deps.pullAll?.())) <= SAFE_CAMP_DANGER);
    holdable.set(mapId, { key, ok });
    return ok;
  };
  let groups: { mapId: string; groups: Map<AutoFarmGroup, GroupEnemy[]> } | null = null;
  const point = (portal: FarmPortal | null) => portal ? { x: portal.x, y: portal.y - portal.height * .32, destination: portal.destination } : null;
  return {
    evaluate: (reward?: FarmReward) => evaluator.evaluate(reward),
    farmDps: () => evaluator.dps(),
    /** How close fighting this stat group comes to killing the player (above 1, it does). */
    campDanger: (group: AutoFarmGroup) => {
      if (groups?.mapId !== deps.mapId()) groups = { mapId: deps.mapId(), groups: mapStatGroups(deps.mapId()) };
      const enemies = groups.groups.get(group);
      return enemies ? evaluator.danger(enemies, Boolean(deps.pullAll?.())) : 0;
    },
    mapBoss: () => { const boss = deps.mapBoss(); return boss && !boss.dead ? boss : null; },
    nextPortal: () => { const portal = ranked(1); return portal && canHold(portal.destination) ? point(portal) : null; },
    nextMapTooHard: () => { const portal = ranked(1); return Boolean(portal && !canHold(portal.destination)); },
    /** The portal back to the previous map, for a farm that keeps dying here. */
    previousPortal: () => point(ranked(-1)),
    /**
     * Whether beating this map's boss opens anything: a way forward that is
     * still locked. Bosses pay no stats, so once the next map is open a fight
     * is time not spent farming (players watched autofarm kill one boss three times).
     */
    bossUnlocksNext: () => {
      const here = farmMapRank(deps.mapId());
      return deps.portals().some(portal => Boolean(portal) && farmMapRank(portal!.destination) > here && !deps.portalUnlocked(portal!));
    },
    /** A hit the player's weapon landed, for the damage meter. */
    recordDamage: (damage: number) => meter.record(damage),
    reflectOnly: deps.reflectOnly,
  };
}
