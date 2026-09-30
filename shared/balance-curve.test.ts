import { describe, expect, it } from "vitest";
import { CURVE_ROLES, CURVE_START, DEFAULT_BALANCE_CURVE, curveArmorReduction, curveBonus, curveBoss, curveClears, curveEnemy, curveEnemyHit, curveKills, curveRewardPerKill, curveTargets } from "./balance-curve";
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from "./map-balance";
import { CAMPAIGN_MAPS } from "./campaign-registry";

const curve = DEFAULT_BALANCE_CURVE;
/** Map y's finished build (0: a new run) with the gear and research the curve expects on it. */
const geared = (y: number, c = curve) => {
  const t = curveTargets(y, c), b = curveBonus(y, c);
  return { ...t, damage: t.damage * b.damage, maxHp: t.maxHp * b.health };
};

describe("balance curve", () => {
  it("starts a new run on a 0.5 damage slime it kills in three hits and survives ten of, over 42 kills to 24 damage", () => {
    const slime = curveEnemy(1, "damage", false);
    expect(slime).toMatchObject({ hp: 8, reward: { amount: .5 } });
    expect(Math.ceil(slime.hp / CURVE_START.damage)).toBe(3);
    expect(Math.ceil(CURVE_START.maxHp / slime.damage)).toBe(10);
    expect(curveKills(1)).toBeCloseTo(42);
    expect(CURVE_START.damage + curveRewardPerKill(1, "damage") * curveKills(1)).toBeCloseTo(24);
  });

  it("asks 1 + Y × (map − 1) times map 1's kills on every map, so map 15 is 15× at Y = 1 and flat at Y = 0", () => {
    expect(curveKills(15)).toBeCloseTo(15 * curveKills(1));
    expect(curveKills(15, { ...curve, clearsY: 0 })).toBeCloseTo(curveKills(1));
    expect(curveClears(1)).toBeCloseTo(6);
  });

  it("pays more per kill on every map than the one before, so a newly opened map is worth farming", () => {
    for (let y = 1; y < 30; y++) {
      for (const stat of ["damage", "health", "regen", "armor", "speed"] as const) {
        expect(curveRewardPerKill(y + 1, stat)).toBeGreaterThan(curveRewardPerKill(y, stat));
      }
    }
  });

  it("arrives on every map past the forest seven blows short, and farms it to one-shots", () => {
    const blows = (y: number) => curveEnemy(y, "damage", false).hp / geared(y - 1).damage;
    for (let y = 2; y <= 35; y++) expect(blows(y)).toBeCloseTo(curve.arrivalBlows);
    // The finished farmed damage, with the gear and research that arrived, one-shots it.
    for (let y = 2; y <= 30; y++) expect(curveEnemy(y, "damage", false).hp).toBeCloseTo(curveTargets(y).damage * curveBonus(y - 1).damage);
    const gentle = { ...curve, endlessArrivalBlows: 2 };
    expect(curveTargets(20, gentle).damage).toBeCloseTo(curveTargets(15, gentle).damage * 2 ** 5);
  });

  it("sizes every camp to the build that arrives, attack speed included, so a new run can win on map 1", () => {
    for (const y of [1, 2, 3, 8, 15, 30]) {
      const arrival = geared(y - 1);
      for (const stat of ["damage", "health", "speed", "regen", "armor"] as const) {
        const enemy = curveEnemy(y, stat, false);
        const dps = arrival.damage * arrival.attackSpeed * (1 - curveArmorReduction(enemy.armor)) - enemy.regen;
        expect(dps).toBeGreaterThan(0);
        const taken = enemy.damage * enemy.attackSpeed * (1 - curveArmorReduction(arrival.armor)) * enemy.hp / dps;
        expect(taken / arrival.maxHp).toBeLessThan(.8);
      }
    }
    // Map 1's damage camp hit sets every map's arrival fight to the same share of health.
    expect(curveEnemy(1, "damage", false).damage).toBeCloseTo(curve.map1DamageCampHit);
    const share = (y: number) => curveEnemyHit(y) * (1 - curveArmorReduction(geared(y - 1).armor))
      * curveEnemy(y, "damage", false).hp / geared(y - 1).damage / geared(y - 1).attackSpeed / geared(y - 1).maxHp;
    for (const y of [2, 8, 15, 30]) expect(share(y)).toBeCloseTo(share(1));
  });

  it("punishes skipping health, regen and armor from map 2: all damage dies where a farmed build lives", () => {
    const fightCost = (player: { damage: number; maxHp: number; armor: number; attackSpeed: number }, stat: Parameters<typeof curveEnemy>[1]) => {
      const enemy = curveEnemy(2, stat, false);
      const seconds = Math.ceil(enemy.hp / (player.damage * (1 - curveArmorReduction(enemy.armor)))) / player.attackSpeed;
      return Math.ceil(seconds * enemy.attackSpeed) * enemy.damage * (1 - curveArmorReduction(player.armor)) / player.maxHp;
    };
    // The same 210 map-1 kills, all spent on the damage camp.
    const skipper = { damage: CURVE_START.damage + 210 * curveRewardPerKill(1, "damage"), maxHp: CURVE_START.maxHp, armor: 0, attackSpeed: CURVE_START.attackSpeed };
    for (const stat of ["damage", "health", "speed", "regen", "armor"] as const) {
      expect(fightCost(curveTargets(1), stat)).toBeLessThan(.6);
      expect(fightCost(skipper, stat)).toBeGreaterThan(1);
    }
  });

  it("grows Attack Speed like armor, climbing toward 3 attacks a second and never reaching it", () => {
    for (let y = 1; y <= 60; y++) {
      expect(curveTargets(y).speed).toBeCloseTo(curveTargets(y).armor / curve.armorMap1 * curve.speedMap1);
      expect(curveTargets(y).attackSpeed).toBeGreaterThanOrEqual(curveTargets(y - 1).attackSpeed);   // level once Speed hits the stat cap
      expect(curveTargets(y).attackSpeed).toBeLessThan(3);
    }
    expect(curveTargets(15).attackSpeed).toBeGreaterThan(2.8);
    expect(curveRewardPerKill(1, "speed")).toBeCloseTo(curve.speedMap1 / 42);
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

  it("tunes a boss to the finished build with its gear: 45 s of its blows, and a heaviest hit of a quarter of its health through armor", () => {
    for (const y of [3, 9, 15]) {
      const end = geared(y), boss = curveBoss(y);
      const dps = end.damage * end.attackSpeed, healed = boss.hp * boss.regenFraction!;
      expect(boss.hp / (dps - healed)).toBeCloseTo(45);
      expect(boss.heaviestHit * (1 - curveArmorReduction(end.armor))).toBeCloseTo(end.maxHp * .25);
    }
  });

  it("gates a boss: a build below three quarters of the finished damage never wins, however long it fights", () => {
    const end = geared(6), boss = curveBoss(6), healed = boss.hp * boss.regenFraction!;
    expect(end.damage * end.attackSpeed * .74).toBeLessThan(healed);
    expect(end.damage * end.attackSpeed * .9).toBeGreaterThan(healed);
    // A half-farmed build: half the finished damage, the same speed and gear.
    expect(end.damage * .5 * end.attackSpeed).toBeLessThan(healed);
    // Off, the boss is the plain 45 s of blows with no gate regen.
    const open = curveBoss(6, { ...curve, bossGate: 0 });
    expect(open.regenFraction).toBeNull();
    expect(open.hp).toBeCloseTo(end.damage * end.attackSpeed * 45);
  });

  it("expects gear and research to grow each campaign map, and holds them through Endless", () => {
    expect(curveBonus(0)).toEqual({ damage: 1, health: 1, reward: 1 });
    expect(curveBonus(1)).toEqual({ damage: 1, health: 1, reward: 1 });
    // The Balance Lab measured about 2.6× damage, 2.2× health and 1.3× reward by map 15.
    expect(curveBonus(15).damage).toBeCloseTo(1.07 ** 14);
    expect(curveBonus(15).health).toBeCloseTo(1.06 ** 14);
    expect(curveBonus(15).reward).toBeCloseTo(1.02 ** 14);
    expect(curveBonus(25)).toEqual(curveBonus(15));
    // Research's reward share comes back off each kill, so the kills stay what the curve asks.
    const withResearch = (y: number) => curveRewardPerKill(y, "damage") * curveBonus(y - 1).reward * curveKills(y);
    for (const y of [2, 9, 15]) expect(withResearch(y)).toBeCloseTo(curveTargets(y).damage - curveTargets(y - 1).damage);
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
    expect(forest.enemies.Spitter.hp).toBeCloseTo(8);
    expect(forest.enemies.Spitter.damage).toBeCloseTo(curveEnemyHit(1) * CURVE_ROLES.damage.hit);
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
