import { MAX_PLAYER_STAT } from './rules';

/**
 * The per-map balance curve: map 1 by hand, then two numbers.
 *
 * Map 1's camps and boss are plain numbers: each camp's health, hit and
 * reward, and the boss's health and heaviest hit. Every map after multiplies
 * them: enemies (health, hit, healing, armor) by `enemyGrowth` a map, rewards
 * by `rewardGrowth`. Map y is campaign 1..15, then Endless N as y = 15 + N,
 * on the same curve.
 *
 * Enemies grow a little faster than a build can from rewards alone, which
 * covers the gear and research a player picks up, so each map asks for more
 * kills than the last.
 *
 * The baseline never changes: map 1's damage camp (Spitters) has 8 health
 * and pays 1.5 damage a kill. Everything else is tuned against it.
 *
 * A boss heals `bossRegen` of its health a second, so a build that cannot
 * out-damage that never wins, however long it fights. It pays nothing:
 * beating it opens the next map.
 */
export type BalanceCurve = {
  /** How much tougher enemies and bosses are than on the map before: health, hit, healing and armor. */
  enemyGrowth: number;
  /** How much more a kill pays than on the map before. */
  rewardGrowth: number;
  /** Kills in one group, for counting clears. */
  groupSize: number;
  /** Map 1's damage camp: hits hardest. */
  damageHp: number; damageHit: number; damageReward: number;
  /** Map 1's health camp: takes the most blows. */
  healthHp: number; healthHit: number; healthReward: number;
  /** Map 1's speed camp: swings fastest (CAMP_SWINGS), with lighter hits. */
  speedHp: number; speedHit: number; speedReward: number;
  /** Map 1's regen camp: heals `regenHeal` a second while it lives. */
  regenHp: number; regenHit: number; regenReward: number; regenHeal: number;
  /** Map 1's armor camp: blocks the player's hits on curveArmorReduction. */
  armorHp: number; armorHit: number; armorReward: number; armorArmor: number;
  /** Map 1's boss: its health and heaviest hit. */
  bossHp: number; bossHit: number;
  /** The share of its health a boss heals a second. A build dealing less than that never wins. */
  bossRegen: number;
  /** The tutorial dragon's health and heaviest hit. It stands apart from the bosses' chain and keeps its gentle regen. */
  dragonHp: number; dragonHit: number;
  /** Elites: health and reward as multiples of their camp's regulars, and their hit. */
  eliteHealth: number;
  eliteHit: number;
};

export const DEFAULT_BALANCE_CURVE: Readonly<BalanceCurve> = Object.freeze({
  enemyGrowth: 4.3, rewardGrowth: 3.4, groupSize: 7,
  damageHp: 8, damageHit: 10, damageReward: 1.5,
  healthHp: 24, healthHit: 4, healthReward: 15,
  speedHp: 90, speedHit: 2.5, speedReward: 1.2,
  regenHp: 12, regenHit: 4, regenReward: .2, regenHeal: 1,
  armorHp: 13, armorHit: 5, armorReward: 1.2, armorArmor: 50,
  bossHp: 190, bossHit: 120, bossRegen: .067, dragonHp: 50_000, dragonHit: 1_500,
  eliteHealth: 5, eliteHit: 3,
});

/** The knobs a developer may set, and their ranges. */
export const BALANCE_CURVE_LIMITS: Readonly<Record<keyof BalanceCurve, readonly [number, number]>> = Object.freeze({
  enemyGrowth: [1, 20], rewardGrowth: [1, 20], groupSize: [1, 50],
  damageHp: [.1, 1e6], damageHit: [.001, 1e6], damageReward: [.001, 1e6],
  healthHp: [.1, 1e6], healthHit: [.001, 1e6], healthReward: [.001, 1e6],
  speedHp: [.1, 1e6], speedHit: [.001, 1e6], speedReward: [.001, 1e6],
  regenHp: [.1, 1e6], regenHit: [.001, 1e6], regenReward: [.001, 1e6], regenHeal: [0, 1e6],
  armorHp: [.1, 1e6], armorHit: [.001, 1e6], armorReward: [.001, 1e6], armorArmor: [0, 1e6],
  bossHp: [1, 1e9], bossHit: [.001, 1e9], bossRegen: [0, .5], dragonHp: [1, 1e9], dragonHit: [.001, 1e9],
  eliteHealth: [1, 100], eliteHit: [.1, 100],
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

const cap = (value: number) => Number.isFinite(value) ? Math.min(MAX_PLAYER_STAT, value) : MAX_PLAYER_STAT;

/** How many times map 1's enemies map y's are. */
export function curveEnemyScale(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  return curve.enemyGrowth ** (Math.max(1, y) - 1);
}
/** How many times map 1's rewards map y's are. */
export function curveRewardScale(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  return curve.rewardGrowth ** (Math.max(1, y) - 1);
}

export type CurveRewardStat = 'damage' | 'health' | 'regen' | 'armor' | 'speed';
/** How often each camp swings a second. */
export const CAMP_SWINGS: Readonly<Record<CurveRewardStat, number>> = Object.freeze({ damage: 1, health: 1, speed: 2.5, regen: 1, armor: 1 });

/** `regen` is health a second; `armor` blocks on curveArmorReduction. */
export type CurveEnemy = { hp: number; damage: number; attackSpeed: number; regen: number; armor: number; reward: { type: CurveRewardStat; amount: number } };
export function curveEnemy(y: number, stat: CurveRewardStat, elite: boolean, curve: BalanceCurve = DEFAULT_BALANCE_CURVE): CurveEnemy {
  const enemies = curveEnemyScale(y, curve), rewards = curveRewardScale(y, curve);
  const tough = elite ? curve.eliteHealth : 1;
  const map1 = {
    damage: { hp: curve.damageHp, hit: curve.damageHit, reward: curve.damageReward, heal: 0, armor: 0 },
    health: { hp: curve.healthHp, hit: curve.healthHit, reward: curve.healthReward, heal: 0, armor: 0 },
    speed: { hp: curve.speedHp, hit: curve.speedHit, reward: curve.speedReward, heal: 0, armor: 0 },
    regen: { hp: curve.regenHp, hit: curve.regenHit, reward: curve.regenReward, heal: curve.regenHeal, armor: 0 },
    armor: { hp: curve.armorHp, hit: curve.armorHit, reward: curve.armorReward, heal: 0, armor: curve.armorArmor },
  }[stat];
  return {
    hp: cap(map1.hp * enemies * tough),
    damage: cap(map1.hit * enemies * (elite ? curve.eliteHit : 1)),
    attackSpeed: CAMP_SWINGS[stat],
    regen: cap(map1.heal * enemies),
    armor: cap(map1.armor * enemies),
    reward: { type: stat, amount: cap(map1.reward * rewards * tough) },
  };
}

/**
 * Map y's boss: map 1's health and heaviest hit, grown like every enemy. It
 * heals `bossRegen` of its health a second (`regenFraction`); null keeps the
 * default boss regen.
 */
export function curveBoss(y: number, curve: BalanceCurve = DEFAULT_BALANCE_CURVE) {
  const enemies = curveEnemyScale(y, curve);
  return {
    hp: cap(curve.bossHp * enemies),
    heaviestHit: cap(curve.bossHit * enemies),
    regenFraction: curve.bossRegen > 0 ? curve.bossRegen : null,
  };
}
