import { DEFAULT_ATTACK_INTERVAL, MAX_PLAYER_STAT, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from './rules';
import { attacksPerSecondFromSpeed } from './attack-speed-rating';

/**
 * The per-map balance curve.
 *
 * Map y is campaign 1..15, then Endless N as y = 15 + N. Two builds matter on
 * each map: the one a player arrives with (the last map's finished build, or
 * a new run's on map 1) and the one they finish it with.
 *
 * Rewards decide the pace. Map 1's damage camp pays `map1DamageReward` a
 * kill, and a new run farms it from 3 damage to one-shot its `map1EnemyHp`:
 * that sets map 1's kills per camp type (0.5 a kill from 3 to 24 is 42 kills,
 * six groups of 7). Every map after asks for more kills,
 * kills(y) = kills(1) × (1 + Y × (y − 1)). Each camp's reward is its step
 * from the arrival build to the finished one, shared over those kills.
 *
 * Every finished stat is its map-1 target grown `arrivalBlows` times a map
 * (`endlessArrivalBlows` past the campaign), so a player arrives needing that
 * many blows a kill and farms to one-shots.
 *
 * Enemies are sized against the arrival build, attack speed included:
 * - health: the damage camp takes the finished damage, which on arrival is
 *   `arrivalBlows` blows;
 * - hit: one arrival fight against a regular costs `arrivalFightShare` of the
 *   arrival health, through the arrival armor, however long the arrival
 *   attack speed makes that fight;
 * - regen camps heal a share of the arrival damage per second (DPS);
 * - each camp leans on its own stat (CURVE_ROLES).
 * A map's boss checks the finished build and pays nothing but the next map.
 */
export type BalanceCurve = {
  /** What map 1's damage camp pays a kill. With map1EnemyHp it sets map 1's kills. */
  map1DamageReward: number;
  /** How fast kills grow per map: kills(y) = kills(1) × (1 + Y × (y − 1)); 1 makes map 15 take 15×. */
  clearsY: number;
  /** Kills in one group, for counting clears. */
  groupSize: number;
  /** How much each campaign map's finished build grows: the blows a kill takes on arrival. */
  arrivalBlows: number;
  /** The same for Endless maps. Lower keeps Endless clear of the stat cap for longer. */
  endlessArrivalBlows: number;
  /** Map 1's damage camp health: one blow of map 1's finished damage. */
  map1EnemyHp: number;
  /** Map 1's finished health, regen, armor and Attack Speed. */
  map1MaxHp: number;
  map1Regen: number;
  armorMap1: number;
  speedMap1: number;
  /** Share of the arrival health one arrival fight against a regular costs. */
  arrivalFightShare: number;
  /** Seconds a boss takes at the finished map's damage and attack speed. */
  bossFightSeconds: number;
  /** A boss's heaviest hit, after armor, as a share of the finished map's health. */
  bossHitShare: number;
  /** Elites: health and reward as multiples of their camp's regulars, and their hit. */
  eliteHealth: number;
  eliteHit: number;
};

export const DEFAULT_BALANCE_CURVE: Readonly<BalanceCurve> = Object.freeze({
  map1DamageReward: .5, clearsY: 1, groupSize: 7, arrivalBlows: 7, endlessArrivalBlows: 7,
  map1EnemyHp: 24, map1MaxHp: 200, map1Regen: 2, armorMap1: 50, speedMap1: 50,
  arrivalFightShare: .06, bossFightSeconds: 45, bossHitShare: .25, eliteHealth: 5, eliteHit: 3,
});

/** The knobs a developer may set, and their ranges. */
export const BALANCE_CURVE_LIMITS: Readonly<Record<keyof BalanceCurve, readonly [number, number]>> = Object.freeze({
  map1DamageReward: [.001, 1e6], clearsY: [0, 10], groupSize: [1, 50], arrivalBlows: [1.1, 20], endlessArrivalBlows: [1.1, 20],
  map1EnemyHp: [4, 1e6], map1MaxHp: [101, 1e6], map1Regen: [.21, 1e6], armorMap1: [1, 1e6], speedMap1: [1, 1e6],
  arrivalFightShare: [.001, 1], bossFightSeconds: [5, 600], bossHitShare: [.01, 1], eliteHealth: [1, 100], eliteHit: [.1, 100],
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

/** `speed` is the Attack Speed rating; `attackSpeed` is the attacks per second it gives. */
export type CurveTargets = { damage: number; maxHp: number; regen: number; armor: number; speed: number; attackSpeed: number };
const cap = (value: number) => Number.isFinite(value) ? Math.min(MAX_PLAYER_STAT, value) : MAX_PLAYER_STAT;

/** Kills of each camp type on map y, and the groups they make. */
export function curveKills(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const map1 = Math.max(1, (curve.map1EnemyHp - CURVE_START.damage) / curve.map1DamageReward);
  return map1 * (1 + curve.clearsY * (Math.max(1, y) - 1));
}
export function curveClears(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  return curveKills(y, curve) / curve.groupSize;
}

/** How many times map 1's build map y's is: arrivalBlows a campaign map, then endlessArrivalBlows. */
function mapScale(y: number, curve: BalanceCurve) {
  const campaign = Math.min(y, CAMPAIGN_LENGTH) - 1, endless = Math.max(0, y - CAMPAIGN_LENGTH);
  return curve.arrivalBlows ** campaign * curve.endlessArrivalBlows ** endless;
}

/** The build a player has once map y's camps are farmed; y = 0 is a new run. */
export function curveTargets(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE): CurveTargets {
  if (y <= 0) return { ...CURVE_START };
  const scale = mapScale(y, curve);
  const speed = cap(curve.speedMap1 * scale);
  return {
    damage: cap(curve.map1EnemyHp * scale),
    maxHp: cap(curve.map1MaxHp * scale),
    regen: cap(curve.map1Regen * scale),
    armor: cap(curve.armorMap1 * scale),
    speed, attackSpeed: attacksPerSecondFromSpeed(speed),
  };
}

export type CurveRewardStat = 'damage' | 'health' | 'regen' | 'armor' | 'speed';
/** One regular kill's reward on map y: the step from the arrival build to the finished one, over its kills. */
export function curveRewardPerKill(y: number, stat: CurveRewardStat, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const field = ({ damage: 'damage', health: 'maxHp', regen: 'regen', armor: 'armor', speed: 'speed' } as const)[stat];
  const step = curveTargets(y, curve)[field] - curveTargets(y - 1, curve)[field];
  return cap(Math.max(0, step) / curveKills(y, curve));
}

/**
 * The hit of a regular on map y, sized against the arrival build: an arrival
 * fight lasts the arrival blows at the arrival attack speed, and costs
 * arrivalFightShare of the arrival health through the arrival armor.
 */
export function curveEnemyHit(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const arrival = curveTargets(y - 1, curve);
  const fightSeconds = curveTargets(y, curve).damage / arrival.damage / arrival.attackSpeed;
  return cap(curve.arrivalFightShare * arrival.maxHp / fightSeconds / (1 - curveArmorReduction(arrival.armor)));
}

/**
 * What each camp is about, next to a regular that dies to one finished blow,
 * hits for curveEnemyHit and swings once a second. Each camp leans on the
 * stat it pays:
 * - damage hits hardest;
 * - health takes the most blows;
 * - attack speed swings fastest, with lighter hits;
 * - regen heals `regen` of the arrival build's damage per second (DPS);
 * - armor wears `armor` times the map's armor target, on the curve's block;
 *   its health is counted after that block, so it takes `health` times the
 *   blows however strong its armor grows.
 */
export type CurveRole = { health: number; hit: number; attackSpeed: number; regen: number; armor: number };
export const CURVE_ROLES: Readonly<Record<CurveRewardStat, Readonly<CurveRole>>> = Object.freeze({
  damage: { health: 1, hit: 2, attackSpeed: 1, regen: 0, armor: 0 },
  health: { health: 3, hit: .8, attackSpeed: 1, regen: 0, armor: 0 },
  speed: { health: 1, hit: .5, attackSpeed: 2.5, regen: 0, armor: 0 },
  regen: { health: 1.5, hit: .8, attackSpeed: 1, regen: .5, armor: 0 },
  armor: { health: 2, hit: 1, attackSpeed: 1, regen: 0, armor: 1 },
});

/** `regen` is health a second; `armor` blocks on curveArmorReduction. */
export type CurveEnemy = { hp: number; damage: number; attackSpeed: number; regen: number; armor: number; reward: { type: CurveRewardStat; amount: number } };
export function curveEnemy(y: number, stat: CurveRewardStat, elite: boolean, curve: BalanceCurve = DEFAULT_BALANCE_CURVE): CurveEnemy {
  const targets = curveTargets(y, curve), arrival = curveTargets(y - 1, curve), role = CURVE_ROLES[stat];
  const tough = elite ? curve.eliteHealth : 1;
  const armor = cap(targets.armor * role.armor);
  return {
    hp: cap(targets.damage * role.health * tough * (1 - curveArmorReduction(armor))),
    damage: cap(curveEnemyHit(y, curve) * role.hit * (elite ? curve.eliteHit : 1)),
    attackSpeed: role.attackSpeed,
    regen: cap(arrival.damage * arrival.attackSpeed * role.regen),
    armor,
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
