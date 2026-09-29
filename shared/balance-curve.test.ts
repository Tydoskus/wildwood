import { describe, expect, it } from "vitest";
import { CURVE_ROLES, CURVE_START, DEFAULT_BALANCE_CURVE, curveArmorReduction, curveBoss, curveClears, curveEnemy, curveKills, curveRewardPerKill, curveTargets } from "./balance-curve";
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from "./map-balance";
import { CAMPAIGN_MAPS } from "./campaign-registry";

const curve = DEFAULT_BALANCE_CURVE;

describe("balance curve", () => {
  it("prices map 1 so X clears of each camp reach its target: the 24 HP slime falls to one blow after 20 groups of 7", () => {
    expect(curveKills(1)).toBe(140);
    expect(curveRewardPerKill(1, "damage")).toBeCloseTo((24 - CURVE_START.damage) / 140);
    const earned = CURVE_START.damage + curveRewardPerKill(1, "damage") * curveKills(1);
    expect(earned).toBeCloseTo(curveEnemy(1, "damage", false).hp);
  });

  it("asks X × (1 + Y × (map − 1)) clears on every map, so map 15 is 15X at Y = 1 and flat at Y = 0", () => {
    expect(curveClears(15)).toBe(15 * curve.clearsX);
    expect(curveClears(15, { ...curve, clearsY: 0 })).toBe(curve.clearsX);
    expect(curveClears(15, { ...curve, clearsY: 2 })).toBe(29 * curve.clearsX);
  });

  it("pays more per kill on every map than the one before, so a newly opened map is worth farming", () => {
    for (let y = 1; y < 30; y++) {
      for (const stat of ["damage", "health", "regen", "armor"] as const) {
        expect(curveRewardPerKill(y + 1, stat)).toBeGreaterThan(curveRewardPerKill(y, stat));
      }
    }
  });

  it("arrives on every map past the forest seven blows short, and farms it to one-shots", () => {
    const blows = (y: number) => Math.ceil(curveEnemy(y, "damage", false).hp / curveTargets(y - 1).damage - 1e-9);
    for (let y = 2; y <= 35; y++) expect(blows(y)).toBe(curve.arrivalBlows);
    for (let y = 1; y <= 30; y++) expect(curveEnemy(y, "damage", false).hp).toBeCloseTo(curveTargets(y).damage);
    // The finished health takes survivalHits of the map's hits through its armor.
    const end = curveTargets(8);
    expect(end.enemyHit * (1 - curveArmorReduction(end.armor)) * curve.survivalHits).toBeCloseTo(end.maxHp);
    // Endless can grow more gently, to stay clear of the stat cap for longer.
    const gentle = { ...curve, endlessArrivalBlows: 2 };
    expect(curveTargets(20, gentle).damage).toBeCloseTo(curveTargets(15, gentle).damage * 2 ** 5);
  });

  it("grows Speed like armor, which climbs toward 3 attacks a second and never reaches it", () => {
    for (let y = 1; y <= 60; y++) {
      expect(curveTargets(y).speed).toBeCloseTo(curveTargets(y).armor / curve.armorMap1 * curve.speedMap1);
      expect(curveTargets(y).attackSpeed).toBeGreaterThanOrEqual(curveTargets(y - 1).attackSpeed);   // level once Speed hits the stat cap
      expect(curveTargets(y).attackSpeed).toBeLessThan(3);
    }
    expect(curveTargets(15).attackSpeed).toBeGreaterThan(2.8);
    expect(curveRewardPerKill(1, "speed")).toBeCloseTo(curve.speedMap1 / 140);
  });

  it("blocks 10% more of what is left every 10× armor", () => {
    expect(curveArmorReduction(10)).toBeCloseTo(.1);
    expect(curveArmorReduction(100)).toBeCloseTo(.19);
    expect(curveArmorReduction(1_000)).toBeCloseTo(.271);
    expect(curveArmorReduction(1e6)).toBeCloseTo(1 - .9 ** 6);
    expect(curveArmorReduction(0)).toBe(0);
  });

  it("gives each camp its own stat: damage hits, health lasts, speed swings, regen heals, armor blocks", () => {
    const y = 3, targets = curveTargets(y), role = (stat: Parameters<typeof curveEnemy>[1]) => curveEnemy(y, stat, false);
    expect(role("damage").damage).toBeGreaterThan(Math.max(...(["health", "speed", "regen", "armor"] as const).map(stat => role(stat).damage)));
    expect(role("health").hp).toBeGreaterThan(Math.max(...(["damage", "speed", "regen", "armor"] as const).map(stat => role(stat).hp)));
    expect(role("speed").attackSpeed).toBeGreaterThan(1);
    expect(role("regen").regen).toBeGreaterThan(0);
    expect(role("armor").armor).toBeCloseTo(targets.armor);
    for (const stat of ["damage", "health", "speed", "armor"] as const) expect(role(stat).regen).toBe(0);
    for (const stat of ["damage", "health", "speed", "regen"] as const) expect(role(stat).armor).toBe(0);
  });

  it("carries Endless on as the same formula, and stays inside the stat cap however deep", () => {
    expect(curveTargets(CAMPAIGN_MAPS.length + 1).damage).toBeCloseTo(curveTargets(15).damage * curve.endlessArrivalBlows);
    for (const y of [100, 1_016, 5_000]) {
      const enemy = curveEnemy(y, "health", true), boss = curveBoss(y);
      for (const n of [enemy.hp, enemy.damage, enemy.reward.amount, boss.hp, boss.heaviestHit]) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeLessThanOrEqual(1e36);
      }
    }
  });

  it("tunes a boss to the finished build: 45 s of its blows, and a heaviest hit of a quarter of its health through armor", () => {
    const end = curveTargets(3), boss = curveBoss(3);
    expect(boss.hp).toBeCloseTo(end.damage * end.attackSpeed * 45);
    expect(boss.heaviestHit * (1 - curveArmorReduction(end.armor))).toBeCloseTo(end.maxHp * .25);
  });
});

describe("resolving maps from the curve", () => {
  const settings = () => validateBalanceSettings({ ...defaultBalanceSettings(), curveVersion: 1 });

  it("leaves every existing revision alone until the curve is switched on", () => {
    expect(validateBalanceSettings(defaultBalanceSettings()).curveVersion).toBeUndefined();
    expect(validateBalanceSettings(defaultBalanceSettings()).curve).toBeUndefined();
    expect(settings().curve).toEqual(DEFAULT_BALANCE_CURVE);
    expect(() => validateBalanceSettings({ ...defaultBalanceSettings(), curve: { ...curve, arrivalBlows: 50 } })).toThrow("arrivalBlows");
  });

  it("builds the forest and desert from the curve, and pays nothing for a boss", () => {
    const forest = resolveMapBalance("tutorial_forest", settings(), 1);
    expect(forest.enemies.Spitter.hp).toBeCloseTo(24);
    expect(forest.enemies.Spitter.damage).toBeCloseTo(20 * CURVE_ROLES.damage.hit);
    expect(forest.enemies.Spitter.reward.amount).toBeCloseTo(curveRewardPerKill(1, "damage"));
    expect(forest.boss!.rewards).toEqual({ damage: 0, health: 0, armor: 0, regen: 0 });
    expect(Object.entries(forest.rules).filter(([key]) => key.includes("_REWARD_")).every(([, n]) => n === 0)).toBe(true);
    const desert = resolveMapBalance("beginner_desert", settings(), 1);
    const desertDamage = Object.values(desert.enemies).find(row => row.reward.type === "damage" && !row.elite)!;
    expect(desertDamage.hp).toBeCloseTo(curveTargets(2).damage);
    expect(desertDamage.reward.amount).toBeGreaterThan(forest.enemies.Spitter.reward.amount);
    expect(Math.max(...Object.values(desert.boss!.attacks))).toBeCloseTo(curveBoss(2).heaviestHit);
  });

  it("resolves Endless as map 15 + N, its boss paying nothing, up to the deepest map a save checks", () => {
    const first = resolveMapBalance("endless_1", settings(), 1);
    expect(Object.values(first.lanes).some(row => Math.abs(row.hp - curveEnemy(16, "damage", false).hp) < 1e-6)).toBe(true);
    expect(first.boss!.rewards).toEqual({ damage: 0, health: 0, armor: 0, regen: 0 });
    expect(() => resolveMapBalance("endless_1001", settings(), 1)).not.toThrow();
  });
});
