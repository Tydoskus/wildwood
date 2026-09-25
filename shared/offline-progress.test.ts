import { describe, expect, it } from "vitest";
import {
  OFFLINE_APPROACH_SECONDS,
  OFFLINE_MAP_SEARCH_LIMIT,
  OFFLINE_WINDOW_SECONDS,
  offlineEnemyRoster,
  offlineFarmableMaps,
  resolveOfflineFarming,
  simulateOfflineFarming,
} from "./offline-progress";
import { referenceBuildForMap } from "./progression";
import { MAP_IDS } from "./rules";

function referenceStats(tier: number) {
  const build = referenceBuildForMap(tier);
  return {
    damage: build.damage,
    maxHp: build.maxHp,
    armor: build.armor,
    regen: build.regen,
    attackRate: build.attackInterval,
  };
}

describe("offline enemy roster", () => {
  it("counts every authored camp spawn on a campaign map", () => {
    const roster = offlineEnemyRoster("beginner_desert");
    expect(roster.length).toBeGreaterThan(1);
    expect(roster.reduce((sum, entry) => sum + entry.population, 0)).toBe(30);
    for (const entry of roster) {
      expect(entry.hp).toBeGreaterThan(0);
      expect(entry.damage).toBeGreaterThan(0);
      expect(entry.attacksPerSecond).toBeGreaterThan(0);
    }
  });

  it("collapses a generated map to its reward lanes", () => {
    const roster = offlineEnemyRoster("endless_5");
    expect(roster.length).toBeGreaterThan(1);
    expect(new Set(roster.map((entry) => entry.enemy)).size).toBe(roster.length);
    expect(roster.every((entry) => entry.hp > 0 && entry.reward.amount > 0)).toBe(true);
  });

  it("never offers a boss as offline prey", () => {
    expect(offlineEnemyRoster("tutorial_forest").some((entry) => entry.enemy === "boss")).toBe(false);
  });
});

describe("offline survivability", () => {
  // At 10% enemy-health damage, later maps require more survivability than
  // the old reference builds; offline farming must reject those maps.
  it.each(MAP_IDS.slice(1).map((mapId, tier) => [mapId, tier] as const))(
    "checks reference-build survival for %s under health-based enemy damage",
    (mapId, tier) => {
      const outcome = simulateOfflineFarming(mapId, referenceStats(tier), OFFLINE_WINDOW_SECONDS);
      expect(outcome.survivable).toBe(tier < 2);
      if (tier < 2) expect(outcome.kills).toBeGreaterThan(0);
      else expect(outcome.kills).toBe(0);
    },
  );

  it.each(MAP_IDS.slice(2).map((mapId, tier) => [mapId, tier] as const))(
    "turns the build one tier short of %s away",
    (mapId, tier) => {
      expect(simulateOfflineFarming(mapId, referenceStats(tier), OFFLINE_WINDOW_SECONDS).survivable).toBe(false);
    },
  );

  it("reports how long the map would have taken to kill them", () => {
    const outcome = simulateOfflineFarming("ion_citadel", referenceStats(0), OFFLINE_WINDOW_SECONDS);
    expect(outcome.survivable).toBe(false);
    expect(outcome.kills).toBe(0);
    expect(outcome.rewards).toEqual([]);
    expect(outcome.secondsToDie).toBeGreaterThan(0);
    expect(outcome.secondsToDie).toBeLessThan(OFFLINE_WINDOW_SECONDS);
  });

  it("treats regeneration that outpaces the camp as indefinite", () => {
    const stats = { ...referenceStats(0), regen: Number.MAX_SAFE_INTEGER };
    expect(simulateOfflineFarming("beginner_desert", stats, OFFLINE_WINDOW_SECONDS).secondsToDie).toBe(Infinity);
  });
});

describe("offline throughput", () => {
  it("earns nothing without damage, and nothing for a zero-length window", () => {
    const stats = referenceStats(3);
    expect(simulateOfflineFarming("infernal_depths", { ...stats, damage: 0 }, OFFLINE_WINDOW_SECONDS).kills).toBe(0);
    expect(simulateOfflineFarming("infernal_depths", stats, 0).kills).toBe(0);
  });

  it("splits kills across lanes in proportion to how many of each the map holds", () => {
    const outcome = simulateOfflineFarming("beginner_desert", referenceStats(0), OFFLINE_WINDOW_SECONDS);
    const roster = offlineEnemyRoster("beginner_desert");
    const population = roster.reduce((sum, entry) => sum + entry.population, 0);
    expect(outcome.rewards.reduce((sum, reward) => sum + reward.count, 0)).toBe(outcome.kills);
    const busiest = roster.reduce((best, entry) => entry.population > best.population ? entry : best);
    const share = outcome.rewards
      .filter((reward) => reward.type === busiest.reward.type)
      .reduce((sum, reward) => sum + reward.count, 0);
    expect(share).toBeGreaterThanOrEqual(outcome.kills * busiest.population / population - roster.length);
  });

  it("is capped by the walk between camps once damage stops mattering", () => {
    const stats = { ...referenceStats(0), damage: 1e30 };
    const outcome = simulateOfflineFarming("beginner_desert", stats, OFFLINE_WINDOW_SECONDS);
    expect(outcome.killsPerSecond).toBeCloseTo(1 / OFFLINE_APPROACH_SECONDS, 6);
  });

  it("is capped again by how fast the map can put its enemies back", () => {
    // A map slow enough to refill that respawn, not the player, is the bound.
    const stats = { ...referenceStats(0), damage: 1e30 };
    const population = offlineEnemyRoster("beginner_desert").reduce((sum, entry) => sum + entry.population, 0);
    const outcome = simulateOfflineFarming("beginner_desert", stats, OFFLINE_WINDOW_SECONDS, { respawnSeconds: 600 });
    expect(outcome.killsPerSecond).toBeCloseTo(population / 600, 6);
    expect(outcome.kills).toBe(Math.floor(population / 600 * OFFLINE_WINDOW_SECONDS));
  });

  it("scales with the window, not with how long the player was actually away", () => {
    const stats = { ...referenceStats(4), regen: 1e20 };
    const half = simulateOfflineFarming("water_reach", stats, OFFLINE_WINDOW_SECONDS / 2);
    const full = simulateOfflineFarming("water_reach", stats, OFFLINE_WINDOW_SECONDS);
    expect(full.kills).toBeGreaterThan(half.kills);
    expect(full.kills).toBeLessThanOrEqual(half.kills * 2 + 1);
  });
});

describe("choosing the offline map", () => {
  it("lists only earned ground, hardest first", () => {
    const maps = offlineFarmableMaps({ desertUnlocked: true, snowlandsUnlocked: true }, { completed: 0, unlocked: false });
    expect(maps).toEqual(["intermediate_snowlands", "beginner_desert", "tutorial_forest"]);
  });

  it("puts generated maps above the campaign once they are open", () => {
    const access = Object.fromEntries(MAP_IDS.slice(1).map((_, index) => [
      ["desertUnlocked", "snowlandsUnlocked", "lavaUnlocked", "infernalUnlocked", "waterUnlocked", "samuraiUnlocked",
        "cloudspireUnlocked", "moonfenUnlocked", "crystalHollowsUnlocked", "clockworkRuinsUnlocked",
        "duskfallOrchardUnlocked", "neonBastionUnlocked", "verdantCatacombsUnlocked", "ionCitadelUnlocked"][index],
      true,
    ]));
    const maps = offlineFarmableMaps(access, { completed: 2, unlocked: true });
    expect(maps[0]).toBe("endless_3");
    expect(maps.at(-1)).toBe("tutorial_forest");
  });

  it("never walks more than the search limit, however deep Endless goes", () => {
    const access = Object.fromEntries(MAP_IDS.slice(1).map((_, index) => [
      ["desertUnlocked", "snowlandsUnlocked", "lavaUnlocked", "infernalUnlocked", "waterUnlocked", "samuraiUnlocked",
        "cloudspireUnlocked", "moonfenUnlocked", "crystalHollowsUnlocked", "clockworkRuinsUnlocked",
        "duskfallOrchardUnlocked", "neonBastionUnlocked", "verdantCatacombsUnlocked", "ionCitadelUnlocked"][index],
      true,
    ]));
    const maps = offlineFarmableMaps(access, { completed: 400, unlocked: true });
    expect(maps.length).toBeLessThanOrEqual(OFFLINE_MAP_SEARCH_LIMIT + 1);
    expect(maps[0]).toBe("endless_401");
    // The campaign floor is always reachable, so nobody is left with nothing.
    expect(maps.at(-1)).toBe(MAP_IDS[0]);
  });

  it("falls back down the ladder until it finds ground the player can hold", () => {
    const ladder = [...MAP_IDS].reverse();
    const outcome = resolveOfflineFarming(ladder, referenceStats(4), OFFLINE_WINDOW_SECONDS);
    expect(outcome?.mapId).toBe("infernal_depths");
    expect(outcome?.survivable).toBe(true);
  });

  it("reports the hardest map it tried when the player survives nowhere", () => {
    const weakling = { damage: 1, maxHp: 1, armor: 0, regen: 0, attackRate: 1 };
    const outcome = resolveOfflineFarming(["ion_citadel", "moonfen"], weakling, OFFLINE_WINDOW_SECONDS);
    expect(outcome?.mapId).toBe("ion_citadel");
    expect(outcome?.survivable).toBe(false);
    expect(outcome?.kills).toBe(0);
  });
});
