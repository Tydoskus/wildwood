import { expect, it, vi } from "vitest";
import { createPersonalBosses } from "./personal-bosses";
function fixture() {
  let now = 1000, mapId = "tutorial_forest", identity = "alice", alive = true;
  const defeated = vi.fn();
  const bosses = createPersonalBosses({ now: () => now, mapId: () => mapId, identity: () => identity, alive: () => alive, defeated });
  return { bosses, defeated, time: (value: number) => { now = value; }, map: (value: string) => { mapId = value; }, identity: (value: string) => { identity = value; }, alive: (value: boolean) => { alive = value; } };
}
it("keeps boss damage personal and reports one clear despite extra projectiles", () => {
  const a = fixture(), b = fixture(); b.identity("bob");
  const hp = a.bosses.state("tutorial_forest")!.hp;
  a.bosses.hit("tutorial_forest", hp);
  a.bosses.hit("tutorial_forest", hp);
  expect(a.defeated).toHaveBeenCalledExactlyOnceWith("tutorial_forest");
  expect(b.bosses.state("tutorial_forest")!.hp).toBe(hp);
  expect(a.bosses.result("tutorial_forest")!.contributors.map(row => row.identity)).toEqual(["alice"]);
});
it("preserves damage on death, resets on travel, and isolates account changes", () => {
  const f = fixture(), hp = f.bosses.state("tutorial_forest")!.hp;
  f.bosses.hit("tutorial_forest", hp / 2);
  f.alive(false); expect(f.bosses.state("tutorial_forest")!.hp).toBe(hp / 2);
  f.bosses.hit("tutorial_forest", hp);
  expect(f.bosses.state("tutorial_forest")!.hp).toBe(hp / 2);
  f.alive(true);
  f.map("home_exterior"); expect(f.bosses.state("home_exterior")).toBeNull();
  f.map("tutorial_forest"); expect(f.bosses.state("tutorial_forest")!.hp).toBe(hp);
  f.bosses.hit("tutorial_forest", hp); f.identity("bob");
  expect(f.bosses.state("tutorial_forest")!.alive).toBe(true);
  expect(f.bosses.result("tutorial_forest")).toBeNull();
});
it.each(["tutorial_forest", "beginner_desert", "ion_citadel", "endless_40"])("respawns %s only after its own cooldown", mapId => {
  const f = fixture(); f.map(mapId);
  const before = f.bosses.state(mapId)!;
  f.bosses.hit(mapId, before.hp);
  const dead = f.bosses.state(mapId)!;
  expect(dead.alive).toBe(false);
  f.time(dead.respawnAtMs - 1); expect(f.bosses.state(mapId)!.alive).toBe(false);
  f.time(dead.respawnAtMs); expect(f.bosses.state(mapId)).toMatchObject({ alive: true, hp: before.hp });
  expect(f.bosses.state(mapId)!.encounter).not.toBe(before.encounter);
});

it("shortens only the owner's future boss respawns after utility research", () => {
  let now = 1_000, rank = 5;
  const bosses = createPersonalBosses({ now: () => now, mapId: () => "tutorial_forest", identity: () => "alice",
    alive: () => true, bossRespawnRank: () => rank, defeated: () => {} });
  const hp = bosses.state("tutorial_forest")!.hp;
  bosses.hit("tutorial_forest", hp);
  expect(bosses.state("tutorial_forest")!.respawnAtMs).toBe(41_000);
  rank = 0;
  now = 41_000;
  expect(bosses.state("tutorial_forest")!.alive).toBe(true);
});

it.each([
  ["tutorial_forest", .0002],
  ["beginner_desert", .001],
  ["ion_citadel", .001],
  ["endless_40", .001],
] as const)("regenerates %s at its own fraction of max HP per second without reviving defeated bosses", (map, fraction) => {
  const f = fixture(); f.map(map);
  const maxHp = f.bosses.state(map)!.hp;
  f.bosses.hit(map, maxHp / 2);
  for (let i = 0; i < 10; i++) f.bosses.update(.1);
  expect(f.bosses.state(map)!.hp / maxHp).toBeCloseTo(.5 + fraction, 8);
  f.bosses.update(1 / fraction);
  expect(f.bosses.state(map)!.hp).toBe(maxHp);
  f.bosses.hit(map, maxHp); f.bosses.update(1);
  expect(f.bosses.state(map)).toMatchObject({ alive: false, hp: 0 });
  expect(f.defeated).toHaveBeenCalledOnce();
});
