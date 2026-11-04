import { describe, expect, it, vi } from "vitest";
import { simPlayer } from "./harness/sim";
import { distance, farmedSeconds, fromCamp, killSimPlayer, onlyStat, savedBuild } from "./harness/farm";
import { AUTO_FARM_WEIGHTS_KEY } from "../../src/game/runtime/auto-farm/auto-farm-plan";
import { bossAggroRange } from "../../src/game/runtime/auto-farm/boss-zone";

// Auto Farm's stat shares and where it stands, played headless (tests/scenarios/harness/sim.ts).
// Minutes of play take a few seconds each.
vi.setConfig({ testTimeout: 60_000 });

describe("Auto Farm's stat shares (FARM-02)", () => {
  it("farms every stat by default; set shares split the time, damage counting twice, 0% never", async () => {
    const even = simPlayer();
    await even.play(300, { autofarm: true });
    const time = farmedSeconds(even);
    const stats = even.parts.autoFarm().choices().map(choice => choice.key);
    // Damage, health, armor and regen: attack speed and crit come from weapons.
    expect(stats.length).toBe(4);
    for (const stat of stats) expect(time[stat] ?? 0).toBeGreaterThan(0);
    even.dispose();

    // 80 / 10 / 10 of health, damage and regen: damage weighs 20, so 80 : 20 : 10 of the time.
    const set = simPlayer({ seed: 3 });
    set.parts.autoFarm().start({ "stat:health": 80, "stat:damage": 10, "stat:regen": 10, "stat:armor": 0 });
    await set.play(300, { autofarm: true });
    const split = farmedSeconds(set);
    const total = Object.values(split).reduce((sum, seconds) => sum + seconds, 0);
    expect(split["stat:health"] / total).toBeGreaterThan(.6);
    expect(split["stat:damage"] / total).toBeGreaterThan(.1);
    expect(split["stat:damage"]).toBeGreaterThan(split["stat:regen"]);
    expect(Object.keys(split).sort()).toEqual(["stat:damage", "stat:health", "stat:regen"]);
  });

  it("reads sliders saved by an old version: a stat left at 0% stays off, the rest are farmed by their weight", async () => {
    // Strong enough for the Forest's camps: this is about the sliders, not difficulty.
    const sim = simPlayer({ seed: 2, base: savedBuild(10, 200) });
    // Older 0-200% sliders: damage at 200, health at 50, armor at 0 (regen was never moved, so 100).
    sim.parts.storage.setItem(AUTO_FARM_WEIGHTS_KEY, JSON.stringify({ auto: false, weights: { "stat:damage": 200, "stat:health": 50, "stat:armor": 0 } }));
    const farm = sim.parts.autoFarm();
    farm.start(farm.savedShares());
    await sim.play(200, { autofarm: true });
    const time = farmedSeconds(sim);
    expect(Object.keys(time).sort()).toEqual(["stat:damage", "stat:health", "stat:regen"]);
    expect(time["stat:damage"]).toBeGreaterThan(time["stat:regen"]);
    expect(time["stat:regen"]).toBeGreaterThan(time["stat:health"]);
  });
});

describe("Where Auto Farm stands (FARM-04, FARM-08)", () => {
  /** The gap between the player and the nearest enemy, sampled each second the player is attacking. */
  async function attackGaps(weapon: string, profile: Parameters<typeof simPlayer>[0] = {}, shares?: Record<string, number>) {
    const sim = simPlayer({ weapon, base: savedBuild(20, 1_000), ...profile });
    if (shares) sim.parts.autoFarm().start(shares);
    const gaps: number[] = [];
    for (let second = 0; second < 120; second++) {
      await sim.play(1, { autofarm: true });
      const { player } = sim.parts;
      if (player.combatFacing == null) continue;
      gaps.push(Math.min(...sim.enemiesNear().map(enemy => distance(enemy, player) - enemy.r - player.r)));
    }
    if (!profile.reflectOnly) expect(sim.report().kills).toBeGreaterThan(5);
    return gaps;
  }

  it("a sword closes to its own reach to fight, where a bow fights from range", async () => {
    const sword = await attackGaps("wooden_sword"), bow = await attackGaps("starter_bow");
    expect(Math.max(...sword)).toBeLessThan(100);
    expect(bow.filter(gap => gap > 100).length).toBeGreaterThan(0);
  });

  it("in Reflect Only a bow walks up to enemies that shoot from range, since only hits thrown back hurt them", async () => {
    // Damage is paid by camps that keep their distance and shoot.
    const shooting = await attackGaps("starter_bow", {}, onlyStat("stat:damage"));
    const reflecting = await attackGaps("starter_bow", { reflectOnly: true, perks: { riposte: 5 } }, onlyStat("stat:damage"));
    const far = (gaps: number[]) => gaps.filter(gap => gap > 60).length / gaps.length;
    // Shooting, a fair share of its attacks land from range; reflecting, it stands against them.
    expect(far(shooting)).toBeGreaterThan(.2);
    expect(far(reflecting)).toBeLessThan(far(shooting) / 2);
  });

  it("after the boss kills it, it farms on and tries the boss again only once it is a quarter stronger", async () => {
    const sim = simPlayer({ advance: true, readiness: true, base: savedBuild(500, 50_000) });
    // It sets off for the Dragon at once; the Dragon kills it on the way in.
    await sim.play(1, { autofarm: true });
    expect(sim.parts.autoFarm().state().phase).toBe("boss");
    const fellAt = sim.power();
    killSimPlayer(sim);
    await sim.play(60, { autofarm: true });
    expect(sim.report().bossAttempts).toHaveLength(1);
    expect(sim.mapId()).toBe("tutorial_forest");
    expect(sim.power()).toBeLessThan(fellAt * 1.25);
    // Far stronger (gear, research): it goes back and wins.
    Object.assign(sim.parts.player, { damage: sim.parts.player.damage * 2, baseMaxHp: sim.parts.player.baseMaxHp * 2 });
    expect(sim.power()).toBeGreaterThan(fellAt * 1.25);
    const report = await sim.play(60, { autofarm: true });
    expect(report.bossAttempts.slice(0, 2).map(attempt => [attempt.map, attempt.outcome])).toEqual([["tutorial_forest", "died"], ["tutorial_forest", "won"]]);
  });

  it("walks round a live boss's range to reach its camp, never into it", async () => {
    const sim = simPlayer();
    const dragon = sim.parts.bosses.dragon!;
    // East of the Dragon, with the only stat on Farm (armor) at a camp to its west.
    Object.assign(sim.parts.player, { x: dragon.x + 960, y: dragon.y + 60 });
    sim.parts.autoFarm().start({ "stat:armor": 100, "stat:health": 0, "stat:damage": 0, "stat:regen": 0 });
    // The camp at its closest: once there it clears the nearest, and the next living one is further off.
    let closest = Infinity, reached = Infinity;
    for (let step = 0; step < 200; step++) {
      await sim.play(.1, { autofarm: false });
      closest = Math.min(closest, distance(dragon, sim.parts.player));
      reached = Math.min(reached, fromCamp(sim, "stat:armor"));
    }
    expect(reached).toBeLessThan(300);
    expect(closest).toBeGreaterThan(bossAggroRange("tutorial_forest")!);
    expect(sim.report().combat.hits.boss ?? 0).toBe(0);
  });
});
