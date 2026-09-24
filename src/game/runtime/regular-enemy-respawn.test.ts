import { describe, expect, it } from "vitest";
import type { SpawnSite } from "../world";
import * as respawn from "./regular-enemy-respawn";
import { createRegularEnemyRespawn, REGULAR_ENEMY_RESPAWN_SECONDS } from "./regular-enemy-respawn";

function site(overrides: Partial<SpawnSite> = {}): SpawnSite {
  return {
    id: 0,
    x: 10,
    y: 20,
    campName: "Test camp",
    type: "Bramble",
    leashRange: 300,
    alive: true,
    respawnAt: 0,
    ...overrides,
  };
}

describe("regular enemy respawn", () => {
  it("schedules 10-second respawns by default", () => {
    expect(REGULAR_ENEMY_RESPAWN_SECONDS).toBe(10);
    const target = site();
    const clock = createRegularEnemyRespawn(() => 7);

    clock.schedule(target);

    expect(target).toMatchObject({ alive: false, respawnAt: 7 + 10 });
    expect(clock.respawnSeconds()).toBe(10);
  });

  it("supports a caller-scoped local test multiplier without changing defaults", () => {
    const localSite = site();
    const clock = createRegularEnemyRespawn(() => 10, 3);

    clock.schedule(localSite);
    expect(localSite.respawnAt).toBeCloseTo(10 + 10 / 3);
    expect(clock.respawnSeconds()).toBeCloseTo(10 / 3);
  });

  it("no longer has a rewarded boost to halve it", () => {
    // The ad pays Gems now: no bank, no switch, no halved clock.
    expect(Object.keys(respawn).sort()).toEqual(["REGULAR_ENEMY_RESPAWN_SECONDS", "createRegularEnemyRespawn"]);
    expect(Object.keys(createRegularEnemyRespawn(() => 0)).sort()).toEqual(["respawnSeconds", "schedule"]);
  });
});

it("uses the current map configuration", () => {
  let seconds = 20;
  const target = site();
  const clock = createRegularEnemyRespawn(() => 10, 1, () => seconds);
  clock.schedule(target); expect(target.respawnAt).toBe(30);
  seconds = 30; expect(clock.respawnSeconds()).toBe(30);
});

it("applies the owner's enemy respawn research", () => {
  const clock = createRegularEnemyRespawn(() => 0, 1, () => 20, () => 5);
  expect(clock.respawnSeconds()).toBe(17.5);
});
