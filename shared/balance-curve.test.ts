import { describe, expect, it } from "vitest";
import { CAMP_SWINGS, DEFAULT_BALANCE_CURVE, curveArmorReduction, curveBoss, curveEnemy, curveEnemyScale, curveRewardScale } from "./balance-curve";
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from "./map-balance";
import { CAMPAIGN_MAPS } from "./campaign-registry";
import { PLAYER_BASE_DAMAGE, PLAYER_BASE_HP } from "./rules";

const curve = DEFAULT_BALANCE_CURVE;
const STATS = ["damage", "health", "speed", "regen", "armor"] as const;

describe("balance curve", () => {
  it("starts a new run on a slime it kills in three hits and survives ten of", () => {
    const slime = curveEnemy(1, "damage", false);
    expect(slime).toMatchObject({ hp: 8, damage: 10, reward: { amount: curve.damageReward } });
    expect(Math.ceil(slime.hp / PLAYER_BASE_DAMAGE)).toBe(3);
    expect(Math.ceil(PLAYER_BASE_HP / slime.damage)).toBe(10);
  });

  it("holds the baseline: map 1's Spitters have 8 health and pay 1.5 damage", () => {
    expect(curve.damageHp).toBe(8);
    expect(curve.damageReward).toBe(1.5);
  });

  it("multiplies every enemy by enemyGrowth and every reward by rewardGrowth a map, Endless included", () => {
    for (let y = 1; y < 40; y++) {
      for (const stat of STATS) {
        const now = curveEnemy(y, stat, false), next = curveEnemy(y + 1, stat, false);
        expect(next.hp / now.hp).toBeCloseTo(curve.enemyGrowth);
        expect(next.damage / now.damage).toBeCloseTo(curve.enemyGrowth);
        expect(next.reward.amount / now.reward.amount).toBeCloseTo(curve.rewardGrowth);
      }
      expect(curveBoss(y + 1).hp / curveBoss(y).hp).toBeCloseTo(curve.enemyGrowth);
    }
    expect(curveEnemyScale(16)).toBeCloseTo(curveEnemyScale(15) * curve.enemyGrowth);
    expect(curveRewardScale(16)).toBeCloseTo(curveRewardScale(15) * curve.rewardGrowth);
  });

  it("grows enemies faster than rewards, so each map asks for more kills", () => {
    expect(curve.enemyGrowth).toBeGreaterThan(curve.rewardGrowth);
  });

  it("gives each camp its own stat: health lasts, speed swings, regen heals, armor blocks, and none hits softer than a Spitter", () => {
    const map = (stat: typeof STATS[number]) => curveEnemy(4, stat, false);
    for (const stat of STATS) expect(map(stat).damage).toBeGreaterThanOrEqual(map("damage").damage);
    expect(map("health").hp).toBeGreaterThan(map("damage").hp);
    expect(map("speed").attackSpeed).toBe(CAMP_SWINGS.speed);
    expect(map("regen").regen).toBeGreaterThan(0);
    expect(map("armor").armor).toBeGreaterThan(0);
    for (const stat of ["damage", "health", "speed", "armor"] as const) expect(map(stat).regen).toBe(0);
    for (const stat of ["damage", "health", "speed", "regen"] as const) expect(map(stat).armor).toBe(0);
  });

  it("gives each camp's elite its own health and hit, and a bigger reward than its camp", () => {
    expect(curveEnemy(1, "health", true)).toMatchObject({ hp: 1_200, damage: 250 });   // King Slime
    const regular = curveEnemy(5, "health", false), elite = curveEnemy(5, "health", true);
    expect(elite.hp).toBeCloseTo(curve.healthEliteHp * curveEnemyScale(5));
    expect(elite.damage).toBeCloseTo(curve.healthEliteHit * curveEnemyScale(5));
    expect(elite.reward.amount).toBeCloseTo(regular.reward.amount * curve.eliteReward);
  });

  it("blocks 10% more of what is left every 10× armor", () => {
    expect(curveArmorReduction(0)).toBe(0);
    expect(curveArmorReduction(10)).toBeCloseTo(.1);
    expect(curveArmorReduction(100)).toBeCloseTo(.19);
    expect(curveArmorReduction(1e6)).toBeLessThan(1);
  });

  it("gates a boss by its regen: a build dealing less than it heals a second never wins", () => {
    expect(curveBoss(6).regenFraction).toBeCloseTo(curve.bossRegen);
    expect(curveBoss(6, { ...curve, bossRegen: 0 }).regenFraction).toBeNull();
  });

  it("stays inside the stat cap however deep", () => {
    for (const y of [100, 1_016, 5_000]) {
      const enemy = curveEnemy(y, "health", true), boss = curveBoss(y);
      for (const n of [enemy.hp, enemy.damage, enemy.reward.amount, boss.hp, boss.heaviestHit]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });
});

describe("resolving maps from the curve", () => {
  const settings = () => validateBalanceSettings({ ...defaultBalanceSettings(), curveVersion: 1 });

  it("leaves every existing revision alone until the curve is switched on, and checks its ranges", () => {
    expect(validateBalanceSettings(defaultBalanceSettings()).curveVersion).toBeUndefined();
    expect(validateBalanceSettings(defaultBalanceSettings()).curve).toBeUndefined();
    expect(settings().curve).toEqual(DEFAULT_BALANCE_CURVE);
    expect(() => validateBalanceSettings({ ...defaultBalanceSettings(), curve: { ...curve, enemyGrowth: 50 } })).toThrow("enemyGrowth");
  });

  it("builds the forest and desert from the curve, and pays nothing for a boss", () => {
    const forest = resolveMapBalance("tutorial_forest", settings(), 1);
    expect(forest.enemies.Spitter.hp).toBeCloseTo(curve.damageHp);
    expect(forest.enemies.Spitter.damage).toBeCloseTo(curve.damageHit);
    expect(forest.enemies.Spitter.reward.amount).toBeCloseTo(curve.damageReward);
    expect(forest.boss!.rewards).toEqual({ damage: 0, health: 0, armor: 0, regen: 0 });
    expect(Object.entries(forest.rules).filter(([key]) => key.includes("_REWARD_")).every(([, n]) => n === 0)).toBe(true);
    const desert = resolveMapBalance("beginner_desert", settings(), 1);
    const desertDamage = Object.values(desert.enemies).find(row => row.reward.type === "damage" && !row.elite)!;
    expect(desertDamage.hp).toBeCloseTo(curve.damageHp * curve.enemyGrowth);
    expect(desertDamage.reward.amount).toBeCloseTo(curve.damageReward * curve.rewardGrowth);
    expect(Math.max(...Object.values(desert.boss!.attacks))).toBeCloseTo(curveBoss(2).heaviestHit);
    expect(desert.boss!.regenFraction).toBeCloseTo(curve.bossRegen);
  });

  it("gives the tutorial dragon its own health and its gentle regen, outside the bosses' chain", () => {
    const forest = resolveMapBalance("tutorial_forest", settings(), 1);
    expect(forest.boss!.hp).toBe(curve.dragonHp);
    expect(Math.max(...Object.values(forest.boss!.attacks))).toBeCloseTo(curve.dragonHit);
    expect(forest.boss!.regenFraction).toBeLessThan(.001);
    expect(resolveMapBalance("beginner_desert", settings(), 1).boss!.hp).toBeCloseTo(curve.bossHp * curve.enemyGrowth);
  });

  it("resolves Endless as map 15 + N, its boss paying nothing, up to the deepest map a save checks", () => {
    const first = resolveMapBalance("endless_1", settings(), 1);
    expect(Object.values(first.lanes).some(row => Math.abs(row.hp - curveEnemy(CAMPAIGN_MAPS.length + 1, "damage", false).hp) < 1e-6)).toBe(true);
    expect(first.boss!.rewards).toEqual({ damage: 0, health: 0, armor: 0, regen: 0 });
    expect(() => resolveMapBalance("endless_1001", settings(), 1)).not.toThrow();
  });
});
