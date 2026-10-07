import { expect, it, vi } from "vitest";
vi.mock("../../app/developer", () => ({ isDeveloperIdentity: () => false }));
import { SOUL_CAMPS, SOUL_MAP_ID, SOUL_POPULATION, soulTierKillsNeeded } from "../../../shared/soul-dimension";
import { TOWN_SOUL_PORTAL } from "../../../shared/town";
import { soulStatOfCampName } from "../soul-world";
import type { MapId, SpawnSite } from "../world";
import { createSoulDimensionRuntime } from "./soul-dimension-runtime";
import type { EnemyState, PlayerState } from "./types";

function dimension(options: { kills?: number; prestige?: number; map?: MapId } = {}) {
  const player = { x: 0, y: 0, r: 16, hp: 100, maxHp: 100, moving: false, facing: 0 } as unknown as PlayerState;
  const kills = options.kills ?? 0, spawnSites: SpawnSite[] = [], enemies: EnemyState[] = [];
  const town: { secondaryPortal?: unknown } = {};
  let map: MapId = options.map ?? SOUL_MAP_ID;
  const spawned: SpawnSite[] = [];
  const runtime = createSoulDimensionRuntime({
    source: () => ({ soulDimensionOpen: () => true, prestige: () => ({ level: options.prestige ?? 1 }),
      rewardKills: () => ({ damage: kills, health: kills, armor: kills, regen: kills, speed: kills }) }),
    player, enemies, spawnSites, currentMapId: () => map, spawnFromSite: site => spawned.push(site), townMap: town as never,
    strength: () => ({ dps: 10, maxHp: 100, armor: 0, regen: 0 }),
  });
  return { runtime, spawnSites, spawned, town, goTo: (next: MapId) => { map = next; } };
}

it("leaves the forest empty before the first tier", () => {
  const d = dimension();
  d.runtime.update(1 / 60);
  expect(d.spawnSites).toHaveLength(0);
});

it("fills every forest camp with one soul stat's enemies, as many as the forest holds", () => {
  const d = dimension({ kills: soulTierKillsNeeded(1) });
  d.runtime.update(1 / 60);
  expect(d.spawnSites).toHaveLength(SOUL_POPULATION);
  expect(d.spawned).toHaveLength(SOUL_POPULATION);
  expect(new Set(d.spawnSites.map(site => soulStatOfCampName(site.campName)))).toEqual(new Set(["damage"]));
  expect(new Set(d.spawnSites.map(site => site.type))).toEqual(new Set(["Spitter"]));
});

it("mixes the stats a higher tier has woken across the camps", () => {
  const d = dimension({ kills: soulTierKillsNeeded(3) });
  d.runtime.update(1 / 60);
  const stats = new Set(d.spawnSites.map(site => soulStatOfCampName(site.campName)));
  expect(stats).toEqual(new Set(["damage", "health", "armor"]));
  expect(SOUL_CAMPS.length).toBeGreaterThan(3);
});

it("stands the Town's portal in only for a player who may go through it", () => {
  const open = dimension({ map: "town" });
  open.runtime.update(1 / 60);
  expect(open.town.secondaryPortal).toMatchObject({ x: TOWN_SOUL_PORTAL.x, y: TOWN_SOUL_PORTAL.y, destination: SOUL_MAP_ID });
  const locked = dimension({ map: "town", prestige: 0 });
  locked.runtime.update(1 / 60);
  expect(locked.town.secondaryPortal).toBeUndefined();
});

it("adds the soul stats once, however many saves and loads go round, and none during a challenge", async () => {
  const { mergeProgress } = await import("../../coop/services/progress");
  let aggro = false;
  const soul = { damage: 100, maxHp: 1_000, armor: 50, regen: 5, attackSpeed: .5, critDamage: .1 };
  const runtime = createSoulDimensionRuntime({
    source: () => ({ soulStats: () => soul, aggroChallenge: () => ({ active: aggro }) }),
    player: { x: 0, y: 0 } as never, enemies: [], spawnSites: [], currentMapId: () => "tutorial_forest", spawnFromSite: () => {}, townMap: {},
    strength: () => ({ dps: 10, maxHp: 100, armor: 0, regen: 0 }),
  });
  const saved = { damage: 50, maxHp: 500, armor: 10, regen: 1, attackRate: 1, projectileSpeed: 0, projectileCount: 1, speed: 0, bootsCollected: false,
    inventoryJson: "[]", equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: "", equippedLeftHand: "" } as never as Parameters<typeof mergeProgress>[0];
  let pending: Parameters<typeof mergeProgress>[1] | null = null;
  let playing = runtime.withSoul(saved)!;
  // Each kill saves what the player plays with; each server row reload merges that save back in.
  for (let kill = 0; kill < 5; kill++) {
    pending = runtime.withoutSoul({ ...playing, maxHp: playing.maxHp + 1 }, saved.attackRate) as never;
    playing = runtime.withSoul(mergeProgress(saved, pending!))!;
  }
  expect(playing.damage).toBe(150);
  expect(playing.armor).toBe(60);
  expect(playing.regen).toBe(6);
  expect(playing.maxHp).toBe(1_505);
  expect(playing.attackRate).toBeCloseTo(1 / 1.5);
  // A challenge plays from its own start: no soul stats at all.
  aggro = true;
  expect(runtime.withSoul(saved)).toMatchObject({ damage: 50, maxHp: 500, armor: 10, regen: 1, attackRate: 1 });
  expect(runtime.critDamage()).toBe(0);
});
