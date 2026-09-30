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
 * kill, and a new run farms it from 3 damage to `map1EnemyHp`, map 1's
 * finished damage: that sets map 1's kills per camp type (0.5 a kill from 3
 * to 24 is 42 kills, six groups of 7). After that a kill pays `rewardGrowth`
 * times the last map's, while the build grows `arrivalBlows` times: the gap
 * is more kills, kills(y) = kills(1) × (arrivalBlows / (rewardGrowth ×
 * rewardBonusGrowth))^(y − 1), never fewer than the map before. Each camp's
 * reward is its step from the arrival build to the finished one, shared over
 * those kills.
 *
 * Every finished stat is its map-1 target grown `arrivalBlows` times a map,
 * so a player arrives needing that many blows a kill and farms to one-shots.
 * Endless N is map 15 + N on the same curve: nothing changes past the campaign.
 *
 * Enemies are sized against the arrival build, attack speed included:
 * - health: the damage camp takes the finished damage, which on arrival is
 *   `arrivalBlows` blows; map 1's instead has `map1SlimeHp`, a few blows of
 *   a new run's damage, so the first fights are quick;
 * - hit: map 1's damage camp hits for `map1DamageCampHit`; whatever share of
 *   a new run's health that costs over one fight, every later map's arrival
 *   fight costs the same share of its arrival health, through the arrival
 *   armor, however long the arrival attack speed makes that fight;
 * - regen camps heal a share of the arrival damage per second (DPS);
 * - each camp leans on its own stat (CURVE_ROLES).
 * A map's boss checks the finished build and pays nothing but the next map.
 *
 * Gear and research sit on top of the farmed stats and grow all campaign: the
 * Balance Lab measured a build hitting about 7% harder a map than its farmed
 * damage (2.6× by map 15), with about 6% more health and 2% more reward a
 * kill. The curve expects them, so enemies and bosses are sized against the
 * build with them and rewards shrink by research's share. Without that,
 * each map took fewer kills than the last asked. See curveBonus.
 *
 * A boss out-heals any build below `bossGate` of the finished damage, so a
 * half-farmed build cannot win however long it fights.
 */
export type BalanceCurve = {
  /** What map 1's damage camp pays a kill. With map1EnemyHp it sets map 1's kills. */
  map1DamageReward: number;
  /** How much more a kill pays than on the map before. Below arrivalBlows, each map asks for more kills. */
  rewardGrowth: number;
  /** Kills in one group, for counting clears. */
  groupSize: number;
  /** How much each map's finished build grows: the blows a kill takes on arrival. */
  arrivalBlows: number;
  /** Map 1's finished damage. With map1DamageReward it sets map 1's kills. */
  map1EnemyHp: number;
  /** Map 1's damage camp health: a few blows of a new run's damage. */
  map1SlimeHp: number;
  /** Map 1's finished health, regen, armor and Attack Speed. */
  map1MaxHp: number;
  map1Regen: number;
  armorMap1: number;
  speedMap1: number;
  /** Map 1's damage camp hit. It sets how much of the arrival health a fight costs on every map. */
  map1DamageCampHit: number;
  /** Seconds a boss takes at the finished map's damage and attack speed. */
  bossFightSeconds: number;
  /** A boss's heaviest hit, after armor, as a share of the finished map's health. */
  bossHitShare: number;
  /** Elites: health and reward as multiples of their camp's regulars, and their hit. */
  eliteHealth: number;
  eliteHit: number;
  /** Gear and research: how much harder than its farmed damage a build hits, per campaign map. */
  bonusGrowth: number;
  /** The same for health. */
  healthBonusGrowth: number;
  /** Research's extra reward a kill, per campaign map: rewards shrink by it so kills stay what the curve asks. */
  rewardBonusGrowth: number;
  /** The share of the finished build's damage a boss heals a second: a build below it cannot beat the boss. 0 turns the gate off. */
  bossGate: number;
};

export const DEFAULT_BALANCE_CURVE: Readonly<BalanceCurve> = Object.freeze({
  map1DamageReward: .5, rewardGrowth: 3.4, groupSize: 7, arrivalBlows: 4,
  map1EnemyHp: 24, map1SlimeHp: 8, map1MaxHp: 800, map1Regen: 1.6, armorMap1: 50, speedMap1: 50,
  map1DamageCampHit: 10, bossFightSeconds: 45, bossHitShare: .25, eliteHealth: 5, eliteHit: 3,
  bonusGrowth: 1.07, healthBonusGrowth: 1.06, rewardBonusGrowth: 1.02, bossGate: .75,
});

/** The knobs a developer may set, and their ranges. */
export const BALANCE_CURVE_LIMITS: Readonly<Record<keyof BalanceCurve, readonly [number, number]>> = Object.freeze({
  map1DamageReward: [.001, 1e6], rewardGrowth: [1, 20], groupSize: [1, 50], arrivalBlows: [1.1, 20],
  map1EnemyHp: [4, 1e6], map1SlimeHp: [.1, 1e6], map1MaxHp: [101, 1e6], map1Regen: [.21, 1e6], armorMap1: [1, 1e6], speedMap1: [1, 1e6],
  map1DamageCampHit: [.001, 1e6], bossFightSeconds: [5, 600], bossHitShare: [.01, 1], eliteHealth: [1, 100], eliteHit: [.1, 100],
  bonusGrowth: [1, 2], healthBonusGrowth: [1, 2], rewardBonusGrowth: [1, 2], bossGate: [0, .95],
});


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
  const growth = Math.max(1, curve.arrivalBlows / (curve.rewardGrowth * curve.rewardBonusGrowth));
  return map1 * growth ** (Math.max(1, y) - 1);
}
export function curveClears(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  return curveKills(y, curve) / curve.groupSize;
}

/** How many times map 1's build map y's is: arrivalBlows a map, Endless included. */
function mapScale(y: number, curve: BalanceCurve) {
  return curve.arrivalBlows ** Math.max(0, y - 1);
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

/**
 * What gear and research multiply a build's farmed stats by on map y: 1 on
 * map 1 and a new run, growing each map, Endless included.
 */
export function curveBonus(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const maps = Math.max(0, y - 1);
  return { damage: curve.bonusGrowth ** maps, health: curve.healthBonusGrowth ** maps, reward: curve.rewardBonusGrowth ** maps };
}

export type CurveRewardStat = 'damage' | 'health' | 'regen' | 'armor' | 'speed';
/** One regular kill's reward on map y: the step from the arrival build to the finished one, over its kills. */
export function curveRewardPerKill(y: number, stat: CurveRewardStat, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const field = ({ damage: 'damage', health: 'maxHp', regen: 'regen', armor: 'armor', speed: 'speed' } as const)[stat];
  const step = curveTargets(y, curve)[field] - curveTargets(y - 1, curve)[field];
  return cap(Math.max(0, step) / curveKills(y, curve) / curveBonus(y - 1, curve).reward);
}

/** Seconds an arrival fight against a regular lasts on map y: the arrival blows at the arrival attack speed. */
function arrivalFightSeconds(y: number, curve: BalanceCurve) {
  const arrival = curveTargets(y - 1, curve);
  return regularHealth(y, curve) / (arrival.damage * curveBonus(y - 1, curve).damage) / arrival.attackSpeed;
}
/** A regular's health before its role: map 1's slime, then each map's finished damage with the arrival's gear and research. */
function regularHealth(y: number, curve: BalanceCurve) {
  return y <= 1 ? curve.map1SlimeHp : curveTargets(y, curve).damage * curveBonus(y - 1, curve).damage;
}
/** Share of the arrival health one arrival fight against a regular costs, set by map 1's damage camp hit. */
export function curveArrivalFightShare(curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  return curve.map1DamageCampHit / CURVE_ROLES.damage.hit * arrivalFightSeconds(1, curve) / CURVE_START.maxHp;
}
/**
 * The hit of a regular on map y, sized against the arrival build: an arrival
 * fight costs curveArrivalFightShare of the arrival health through the
 * arrival armor, however long the arrival attack speed makes it.
 */
export function curveEnemyHit(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const arrival = curveTargets(y - 1, curve);
  const health = arrival.maxHp * curveBonus(y - 1, curve).health;
  return cap(curveArrivalFightShare(curve) * health / arrivalFightSeconds(y, curve) / (1 - curveArmorReduction(arrival.armor)));
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
    hp: cap(regularHealth(y, curve) * role.health * tough * (1 - curveArmorReduction(armor))),
    damage: cap(curveEnemyHit(y, curve) * role.hit * (elite ? curve.eliteHit : 1)),
    attackSpeed: role.attackSpeed,
    regen: cap(arrival.damage * curveBonus(y - 1, curve).damage * arrival.attackSpeed * role.regen),
    armor,
    reward: { type: stat, amount: cap(curveRewardPerKill(y, stat, curve) * tough) },
  };
}

/**
 * Map y's boss, tuned to the finished build with its gear and research: it
 * lasts `bossFightSeconds` at that build's damage and attack speed, and its
 * heaviest hit takes `bossHitShare` of that build's health through its armor.
 * It heals `bossGate` of that build's damage a second (`regenFraction` of its
 * health), so a build below that share cannot win, and its health is what is
 * left over for the fight to still take `bossFightSeconds` at the finished
 * build. It pays nothing: beating it opens the next map.
 */
export function curveBoss(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const targets = curveTargets(y, curve), bonus = curveBonus(y, curve);
  const gate = Math.min(.95, Math.max(0, curve.bossGate));
  return {
    hp: cap(targets.damage * bonus.damage * targets.attackSpeed * curve.bossFightSeconds * (1 - gate)),
    heaviestHit: cap(curve.bossHitShare * targets.maxHp * bonus.health / (1 - curveArmorReduction(targets.armor))),
    /** Health healed a second as a share of its maximum; null keeps the default boss regen. */
    regenFraction: gate > 0 ? gate / (curve.bossFightSeconds * (1 - gate)) : null,
  };
}
