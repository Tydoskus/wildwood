import type { ItemLevel } from "../../../../shared/items";
import type { CardTotals } from "../../../../shared/card-effects";
import { critPowerFactor, effectivePlayerPowerStats, unroundedPlayerPower, type PlayerPowerProgress, type PlayerPowerResearch, type PlayerPowerStats } from '../../../../shared/player-power';
import { addAttackSpeedRating, attackCapInterval, type AttackCapArg } from '../../../../shared/stat-rating';
import type { FarmEvaluation, FarmReward } from './auto-farm-plan';
import { isProceduralMap, proceduralMapNumber } from '../../../../shared/procedural-maps';
import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../../shared/rules';
import { recommendedBossPower, recommendedMapPower } from './auto-farm-power';
import { mapReadiness } from '../../../../shared/map-readiness';
import { recordConnectionDiagnostic } from '../../../coop/services/connection-diagnostic-runtime';
import { bossReadiness } from './boss-readiness';
import type { MapBalanceSnapshot } from '../../../../shared/map-balance-types';
import { STAFF_DPS_FACTOR, isStaff, staffSkillBossDamageMultiplier, type StaffSkillRoll } from '../../../../shared/staff-skills';

/**
 * A staff's damage a second on a camp against a bow of the same tier: its slower casts on one target, with the
 * bursts that catch a second enemy now and then (autofarm sim, camp fights).
 */
export const STAFF_CAMP_DPS_SHARE = .83;

/**
 * Prices a kill's reward against the player's live build, for autofarm to
 * choose by: the power the game shows. Effective stats come from the same
 * calculation as the profile and leaderboard.
 */
export function createFarmEvaluator(deps: {
  base: () => PlayerPowerStats;
  equipment: () => Omit<PlayerPowerProgress, keyof PlayerPowerStats>;
  research: () => PlayerPowerResearch | null | undefined;
  /** An item's slot tier and refine (coop itemLevel). */
  upgradeLevel: (itemId: string) => ItemLevel;
  /** The active cards in play (coop activeCardTotals), as the shown power counts them. */
  cards?: () => CardTotals | null | undefined;
  rewardMultiplier: () => number;
  /** The attack speed cap (stat-rating.ts AttackCap). */
  minAttackInterval: () => AttackCapArg;
  criticalChance: () => number;
  /** The crit multiplier, with this much more crit rating when asked (a crit reward's worth). */
  criticalMultiplier: (extraRating?: number) => number;
}) {
  function build(reward?: FarmReward) {
    // Power counts crits (critPowerFactor), as the power the game shows does.
    const stats: PlayerPowerStats = { ...deps.base(), critChance: deps.criticalChance(), critMultiplier: deps.criticalMultiplier() };
    if (reward) {
      // A soul kill's reward is flat: research and prestige never grow it.
      const amount = reward.amount * (reward.flat ? 1 : deps.rewardMultiplier());
      // As applyReward does it (player-combat-controller.ts).
      if (reward.type === 'damage') stats.damage += amount;
      else if (reward.type === 'health') stats.maxHp += amount;
      else if (reward.type === 'armor') stats.armor += amount;
      else if (reward.type === 'regen') stats.regen += amount;
      else if (reward.type === 'speed') stats.attackRate = addAttackSpeedRating(stats.attackRate, amount, deps.minAttackInterval());
      else if (reward.type === 'crit') stats.critMultiplier = deps.criticalMultiplier(amount);
    }
    return effectivePlayerPowerStats({ ...stats, ...deps.equipment() }, deps.research(), deps.upgradeLevel, deps.cards?.() ?? undefined, deps.minAttackInterval());
  }
  return {
    evaluate: (reward?: FarmReward): FarmEvaluation => { const stats = build(reward); return { power: unroundedPlayerPower(stats), stats }; },
    /** Damage per second against a regular enemy, with crits: for how long a kill takes. */
    dps() {
      const stats = build();
      return stats.damage * critPowerFactor(stats) / Math.max(attackCapInterval(deps.minAttackInterval()), stats.attackRate);
    },
  };
}

type FarmPortal = { x: number; y: number; height: number; destination: string };
type LiveBoss = { x: number; y: number; r: number; hp: number; maxHp: number; dead?: boolean; isBoss?: boolean; ry?: number; hitboxOffsetY?: number };

/** How deep a map is: the campaign in order, then Endless. Forward is a higher rank. */
export function farmMapRank(mapId: string) {
  return isProceduralMap(mapId) ? 1_000 + (proceduralMapNumber(mapId) ?? 0) : CAMPAIGN_MAP_IDS.indexOf(mapId as never);
}

/**
 * Everything autofarm's planning reads from the live game, as controller
 * options: the build and its power, this map's standing boss, and the
 * unlocked portals.
 */
export function createAutoFarmProgress(deps: Parameters<typeof createFarmEvaluator>[0] & {
  mapId: () => string;
  mapBoss: () => LiveBoss | null | undefined;
  portals: () => readonly (FarmPortal | null | undefined)[];
  portalUnlocked: (portal: FarmPortal) => boolean;
  reflectOnly: () => boolean;
  /** A map's live balance, fetched once (coop.mapIndexBalance): Move On and Fight Bosses read readiness from it. */
  fetchBalance?: (mapId: string) => Promise<MapBalanceSnapshot | null> | MapBalanceSnapshot | undefined;
  /** The worn weapon's skill roll: a staff's Meteor adds to its boss damage. */
  weaponSkills?: () => Partial<StaffSkillRoll> | null | undefined;
}) {
  const evaluator = createFarmEvaluator(deps);
  const balanceFor = deps.fetchBalance ? createRetryingBalanceCache(deps.fetchBalance) : null;
  /** The live build as readiness reads it: effective stats, gear, research and crit in. */
  const liveStats = () => evaluator.evaluate().stats!;
  /** As readiness prices the weapon: a staff's casts are slower, its bursts help on a camp and only Meteor adds on a boss. */
  const readinessStats = (against: 'map' | 'boss') => {
    const stats = liveStats(), equipped = deps.equipment(), weapon = equipped.equippedRightHand || equipped.equippedLeftHand;
    if (!isStaff(weapon)) return stats;
    const share = against === 'boss' ? STAFF_DPS_FACTOR * staffSkillBossDamageMultiplier(deps.weaponSkills?.()) : STAFF_CAMP_DPS_SHARE;
    return { ...stats, damage: stats.damage * share };
  };
  const ranked = (direction: 1 | -1) => {
    const here = farmMapRank(deps.mapId());
    return deps.portals().find((portal): portal is FarmPortal => Boolean(portal) && Math.sign(farmMapRank(portal!.destination) - here) === direction && deps.portalUnlocked(portal!)) ?? null;
  };
  const point = (portal: FarmPortal | null) => portal ? { x: portal.x, y: portal.y - portal.height * .32, destination: portal.destination } : null;
  return {
    evaluate: evaluator.evaluate,
    power: () => evaluator.evaluate().power,
    farmDps: () => evaluator.dps(),
    mapBoss: () => { const boss = deps.mapBoss(); return boss && !boss.dead ? boss : null; },
    /** The unlocked portal forward; whether to take it is the controller's call. */
    nextPortal: () => point(ranked(1)),
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
    /** That locked way forward's map: the boss is fought once Move On would be ready for it. */
    lockedNextMap: () => {
      const here = farmMapRank(deps.mapId());
      return deps.portals().find(portal => Boolean(portal) && farmMapRank(portal!.destination) > here && !deps.portalUnlocked(portal!))?.destination ?? null;
    },
    reflectOnly: deps.reflectOnly,
    /** A map's recommended power (auto-farm-power.ts), and this map's boss's: used only without live balance. */
    mapPower: recommendedMapPower,
    bossPower: () => recommendedBossPower(deps.mapId()),
    /** A death while farming, to the connection diagnostics (where Auto Farm dies, from real play). */
    reportDeath: (detail: string) => recordConnectionDiagnostic('autofarm-death', { detail, mapId: deps.mapId() }),
    /** Readiness from the map's live enemies (map-readiness.ts); undefined while its balance loads. */
    mapReady: balanceFor ? (mapId: string, margin: number) => {
      const balance = balanceFor(mapId);
      return balance === undefined ? undefined : mapReadiness(mapId, readinessStats('map'), balance ?? undefined, margin);
    } : undefined,
    bossReady: balanceFor ? (margin: number) => {
      const mapId = deps.mapId(), balance = balanceFor(mapId);
      return balance === undefined ? undefined : bossReadiness(mapId, balance?.boss, readinessStats('boss'), margin);
    } : undefined,
  };
}

/**
 * Each map's live balance, fetched once and read synchronously after: undefined while it loads. A failed
 * fetch (no connection yet) is tried again after a while rather than kept, so readiness never settles on
 * the authored stats for a whole session.
 */
export function createRetryingBalanceCache(fetch: (mapId: string) => Promise<MapBalanceSnapshot | null> | MapBalanceSnapshot | undefined, retryMs = 30_000, now = () => Date.now()) {
  const balances = new Map<string, { value: MapBalanceSnapshot | null | undefined; at: number }>();
  return (mapId: string): MapBalanceSnapshot | null | undefined => {
    const entry = balances.get(mapId);
    if (entry && !(entry.value === null && now() - entry.at > retryMs)) return entry.value;
    const pending = fetch(mapId);
    // A snapshot in hand (the autofarm sim resolves its own) is kept at once.
    if (pending && !(pending instanceof Promise)) { balances.set(mapId, { value: pending, at: now() }); return pending; }
    const next = { value: pending ? undefined : null, at: now() } as { value: MapBalanceSnapshot | null | undefined; at: number };
    balances.set(mapId, next);
    void pending?.then(snapshot => { next.value = snapshot; next.at = now(); }, () => { next.value = null; next.at = now(); });
    return next.value;
  };
}
