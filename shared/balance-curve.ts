import { DEFAULT_ATTACK_INTERVAL, MAX_PLAYER_STAT, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from './rules';
import { attacksPerSecondFromSpeed } from './attack-speed-rating';

/**
 * The per-map balance curve.
 *
 * On map y (campaign 1..15, then Endless N as y = 15 + N) each camp type
 * (damage, health, regen, armor, attack speed) is farmed `clears(y)` times, a
 * clear being `groupSize` kills, to finish the map's build:
 * - damage one-shots the map's damage camp;
 * - health survives `survivalHits` of the map's hits after armor;
 * - regen heals `regenShare` of a hit, after armor, each second;
 * - armor blocks on curveArmorReduction;
 * - Speed, a rating like armor, grows like armor from `speedMap1`; see
 *   attack-speed-rating.ts for how it becomes attacks per second.
 * Each map's build is `arrivalBlows` times the last one's
 * (`endlessArrivalBlows` past the campaign), so a player arrives needing that
 * many blows a kill, and taking hits that many times bigger, and farms to
 * one-shots. A kill's reward is the map's step shared over its kills; with a
 * step that big every map pays more per kill than the one before, so each
 * newly opened map is worth farming. Map 1 comes from its anchors instead.
 * A map's boss checks the finished build and pays nothing but the next map.
 */
export type BalanceCurve = {
  /** Clears of each camp type on map 1. */
  clearsX: number;
  /** How fast clears grow per map: clears(y) = X × (1 + Y × (y − 1)); 1 makes map 15 take 15X. */
  clearsY: number;
  /** Kills in one clear. */
  groupSize: number;
  /** Blows a kill takes on arriving at a new campaign map: how much each map's build grows. */
  arrivalBlows: number;
  /** The same for Endless maps. Lower keeps Endless clear of the stat cap for longer. */
  endlessArrivalBlows: number;
  /** Map 1's damage camp enemy: its health (one-shot at the end of map 1) and its hit. */
  map1EnemyHp: number;
  map1EnemyHit: number;
  /** Map 1's armor target. */
  armorMap1: number;
  /** Hits a finished map's health survives, after armor. */
  survivalHits: number;
  /** Share of a hit, after armor, that a finished map's regen heals each second. */
  regenShare: number;
  /** Map 1's Speed target. */
  speedMap1: number;
  /** Seconds a boss takes at the finished map's damage and attack speed. */
  bossFightSeconds: number;
  /** A boss's heaviest hit, after armor, as a share of the finished map's health. */
  bossHitShare: number;
  /** Elites: health and reward as multiples of their camp's regulars, and their hit. */
  eliteHealth: number;
  eliteHit: number;
};

export const DEFAULT_BALANCE_CURVE: Readonly<BalanceCurve> = Object.freeze({
  clearsX: 20, clearsY: 1, groupSize: 7, arrivalBlows: 7, endlessArrivalBlows: 7,
  map1EnemyHp: 24, map1EnemyHit: 20, armorMap1: 50,
  survivalHits: 12, regenShare: .5, speedMap1: 50,
  bossFightSeconds: 45, bossHitShare: .25, eliteHealth: 5, eliteHit: 3,
});

/** The knobs a developer may set, and their ranges. */
export const BALANCE_CURVE_LIMITS: Readonly<Record<keyof BalanceCurve, readonly [number, number]>> = Object.freeze({
  clearsX: [1, 1000], clearsY: [0, 10], groupSize: [1, 50], arrivalBlows: [1.1, 20], endlessArrivalBlows: [1.1, 20],
  map1EnemyHp: [1, 1e6], map1EnemyHit: [1, 1e6], armorMap1: [1, 1e6],
  survivalHits: [1, 100], regenShare: [0, 10], speedMap1: [1, 1e6],
  bossFightSeconds: [5, 600], bossHitShare: [.01, 1], eliteHealth: [1, 100], eliteHit: [.1, 100],
});

/** Campaign maps before Endless; Endless N is map CAMPAIGN_LENGTH + N. */
export const CAMPAIGN_LENGTH = 15;

/**
 * Armor's block: every 10× armor moves damage 10% closer to fully blocked.
 * 10 armor blocks 10%, 100 19%, 1,000 27%, a million 47%: it keeps paying at
 * every size and never reaches 100%.
 */
export function curveArmorReduction(armor: number) {
  const value = Number.isFinite(armor) ? armor : 0;
  return value <= 1 ? 0 : 1 - .9 ** Math.log10(value);
}

/** A new run's stats, before map 1: what a prestige and a respec return to. */
export const CURVE_START = Object.freeze({
  damage: PLAYER_BASE_DAMAGE, maxHp: PLAYER_BASE_HP, regen: PLAYER_BASE_REGEN, armor: 0, speed: 0, attackSpeed: 1 / DEFAULT_ATTACK_INTERVAL,
});

/** `speed` is the rating; `attackSpeed` is the attacks per second it gives. */
export type CurveTargets = { damage: number; maxHp: number; regen: number; armor: number; speed: number; attackSpeed: number; enemyHit: number };
const cap = (value: number) => Number.isFinite(value) ? Math.min(MAX_PLAYER_STAT, value) : MAX_PLAYER_STAT;

/** Clears of each camp type on map y, and the kills they take. */
export function curveClears(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  return curve.clearsX * (1 + curve.clearsY * (Math.max(1, y) - 1));
}
export function curveKills(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  return curveClears(y, curve) * curve.groupSize;
}

/** How many times map 1's build map y's is: arrivalBlows a campaign map, then endlessArrivalBlows. */
function mapScale(y: number, curve: BalanceCurve) {
  const campaign = Math.min(y, CAMPAIGN_LENGTH) - 1, endless = Math.max(0, y - CAMPAIGN_LENGTH);
  return curve.arrivalBlows ** campaign * curve.endlessArrivalBlows ** endless;
}

/** The build a player has once map y's camps are farmed; y = 0 is a new run. */
export function curveTargets(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE): CurveTargets {
  if (y <= 0) return { ...CURVE_START, enemyHit: 0 };
  const scale = mapScale(y, curve);
  const speed = cap(curve.speedMap1 * scale);
  const armor = cap(Math.max(CURVE_START.armor, curve.armorMap1) * scale);
  const enemyHit = cap(curve.map1EnemyHit * scale), landed = enemyHit * (1 - curveArmorReduction(armor));
  return {
    damage: cap(Math.max(CURVE_START.damage, curve.map1EnemyHp) * scale),
    maxHp: cap(Math.max(CURVE_START.maxHp, curve.survivalHits * landed)),
    regen: cap(Math.max(CURVE_START.regen, curve.regenShare * landed)),
    armor, speed, attackSpeed: attacksPerSecondFromSpeed(speed), enemyHit,
  };
}

export type CurveRewardStat = 'damage' | 'health' | 'regen' | 'armor' | 'speed';
/** One regular kill's reward on map y: the step from the last map's build to this one's, over its kills. */
export function curveRewardPerKill(y: number, stat: CurveRewardStat, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const field = ({ damage: 'damage', health: 'maxHp', regen: 'regen', armor: 'armor', speed: 'speed' } as const)[stat];
  const step = curveTargets(y, curve)[field] - curveTargets(y - 1, curve)[field];
  return cap(Math.max(0, step) / curveKills(y, curve));
}

/**
 * What each camp is about. A regular is sized from the finished map's build:
 * health 1 dies to one of its blows, hit 1 is the map's hit, attack speed 1
 * swings once a second. Each camp leans on the stat it pays:
 * - damage hits hardest;
 * - health takes the most blows;
 * - attack speed swings fastest, with lighter hits;
 * - regen heals `regen` of its health a second;
 * - armor wears `armor` times the map's armor target, on the curve's block.
 */
export type CurveRole = { health: number; hit: number; attackSpeed: number; regen: number; armor: number };
export const CURVE_ROLES: Readonly<Record<CurveRewardStat, Readonly<CurveRole>>> = Object.freeze({
  damage: { health: 1, hit: 2, attackSpeed: 1, regen: 0, armor: 0 },
  health: { health: 3, hit: .8, attackSpeed: 1, regen: 0, armor: 0 },
  speed: { health: 1, hit: .5, attackSpeed: 2.5, regen: 0, armor: 0 },
  regen: { health: 1.5, hit: .8, attackSpeed: 1, regen: .2, armor: 0 },
  armor: { health: 1, hit: 1, attackSpeed: 1, regen: 0, armor: 1 },
});

/** `regen` is health a second; `armor` blocks on curveArmorReduction. */
export type CurveEnemy = { hp: number; damage: number; attackSpeed: number; regen: number; armor: number; reward: { type: CurveRewardStat; amount: number } };
export function curveEnemy(y: number, stat: CurveRewardStat, elite: boolean, curve: BalanceCurve = DEFAULT_BALANCE_CURVE): CurveEnemy {
  const targets = curveTargets(y, curve), role = CURVE_ROLES[stat];
  const tough = elite ? curve.eliteHealth : 1;
  const hp = cap(targets.damage * role.health * tough);
  return {
    hp,
    damage: cap(targets.enemyHit * role.hit * (elite ? curve.eliteHit : 1)),
    attackSpeed: role.attackSpeed,
    regen: cap(hp * role.regen),
    armor: cap(targets.armor * role.armor),
    reward: { type: stat, amount: cap(curveRewardPerKill(y, stat, curve) * tough) },
  };
}

/**
 * Map y's boss, tuned to the finished build: it lasts `bossFightSeconds` at
 * that build's damage and attack speed, and its heaviest hit takes
 * `bossHitShare` of that build's health through its armor. It pays nothing:
 * beating it opens the next map.
 */
export function curveBoss(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const targets = curveTargets(y, curve);
  return {
    hp: cap(targets.damage * targets.attackSpeed * curve.bossFightSeconds),
    heaviestHit: cap(curve.bossHitShare * targets.maxHp / (1 - curveArmorReduction(targets.armor))),
  };
}
