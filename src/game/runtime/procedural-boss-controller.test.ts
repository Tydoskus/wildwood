import { describe, expect, it, vi } from "vitest";
import { createProceduralBossController } from "./procedural-boss-controller";
import { createGameBootstrap } from "./game-bootstrap";
import { createEnemyLifecycle } from "./enemy-lifecycle";

function harness() {
  const state = createGameBootstrap();
  let map = "endless_1",
    now = 10000;
  let available = true, completed = 0;
  const revealPortal = vi.fn(() => true);
  const row = {
    key: "endless_1:root",
    mapId: map,
    encounter: 1n,
    hp: 1000,
    maxHp: 1000,
    respawnAtMicros: 0n,
  };
  const damagePlayer = vi.fn(() => true),
    burst = vi.fn(),
    shot = vi.fn();
  const lifecycle = createEnemyLifecycle(
    state.enemies,
    state.spawnSites,
    burst,
  );
  const controller = createProceduralBossController({
    mapId: () => map,
    state: () => ({ boss: available ? { ...row, mapId: map } : null, ready: available, completed }),
    revealPortal,
    enemies: state.enemies,
    player: state.player,
    spawn: lifecycle.spawnFromSite,
    damagePlayer,
    burst,
    shot,
  });
  return {
    ...state,
    row,
    controller,
    damagePlayer,
    burst,
    shot,
    revealPortal,
    setCompleted: (value: number) => { completed = value; },
    setAvailable: (value: boolean) => {
      available = value;
    },
    setMap: (next: string) => {
      map = next;
    },
    advance: (ms: number) => {
      now += ms;
      controller.update(ms / 1000);
    },
    adjustServerClock: (ms: number) => {
      now += ms;
      controller.update(0);
    },
  };
}
describe("generic boss runtime", () => {
  it("spawns only one boss and removes it when its row reaches zero", () => {
    const h = harness();
    h.controller.update(0.016);
    h.controller.update(0.016);
    expect(h.enemies.filter((e) => e.generatedBoss)).toHaveLength(1);
    h.row.hp = 0;
    h.controller.update(0.016);
    expect(h.controller.boss()).toBeNull();
    expect(h.burst).toHaveBeenCalledTimes(1);
  });
  it("discards the boss on travel and reconstructs it after respawn", () => {
    const h = harness();
    h.controller.update(0.016);
    h.setMap("ion_citadel");
    h.advance(100);
    expect(h.controller.boss()).toBeNull();
    h.enemies.length = 0;
    h.setMap("endless_1");
    h.controller.update(0.016);
    expect(h.controller.boss()).not.toBeNull();
    h.enemies.length = 0;
    h.controller.update(0.016);
    expect(h.enemies.filter((e) => e.generatedBoss)).toHaveLength(1);
  });
  it("discards stale targets on disconnect or instance change", () => {
    const h = harness();
    h.controller.update(0.016);
    const old = h.controller.boss()!;
    h.setAvailable(false);
    h.advance(260);
    expect(old.dead).toBe(true);
    expect(h.controller.boss()).toBeNull();
    h.setAvailable(true);
    h.row.key = "endless_1:other-instance";
    h.advance(260);
    expect(h.controller.boss()).not.toBe(old);
    h.setMap("endless_2");
    expect(h.controller.boss()).toBeNull();
  });
  it("keeps local windup through server clock corrections and animates each attack", () => {
    const h = harness();
    h.controller.update(0.016);
    const boss = h.controller.boss()!;
    h.player.x = boss.x + 200;
    h.player.y = boss.y;
    h.player.hp = 100;
    for (let i = 0; i < 13; i++) h.advance(100);
    expect(h.damagePlayer).not.toHaveBeenCalled();
    h.advance(100);
    expect(h.damagePlayer).toHaveBeenCalledTimes(1);
    expect(boss.attackAnimationElapsed).toBe(0);
    h.adjustServerClock(15_000);
    expect(h.damagePlayer).toHaveBeenCalledTimes(1);
    h.advance(100);
    expect(boss.attackAnimationElapsed).toBeCloseTo(.1);
    h.advance(100);
    expect(h.shot).toHaveBeenCalledTimes(1);
    expect(boss.attackAnimationElapsed).toBe(0);
    h.adjustServerClock(-20_000);
    for (let i = 0; i < 44; i++) h.advance(100);
    expect(h.damagePlayer).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 15; i++) h.advance(100);
    expect(h.damagePlayer).toHaveBeenCalledTimes(2);
  });
});

it("reveals a newly earned portal once, waits through death, and ignores initial saved unlocks", () => {
  const h = harness();
  h.controller.update(.016);
  h.player.hp = 0;
  h.row.hp = 0;
  h.setCompleted(1);
  h.controller.update(.016);
  expect(h.revealPortal).not.toHaveBeenCalled();
  h.player.hp = 100;
  h.controller.update(.016);
  h.controller.update(.016);
  expect(h.revealPortal).toHaveBeenCalledOnce();
  const loaded = harness();
  loaded.setCompleted(1);
  loaded.controller.update(.016);
  expect(loaded.revealPortal).not.toHaveBeenCalled();
});
