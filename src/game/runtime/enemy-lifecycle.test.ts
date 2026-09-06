import { describe, expect, it } from "vitest";
import { createEnemyLifecycle } from "./enemy-lifecycle";
import type { SpawnSite } from "../world";
import type { EnemyState } from "./types";

describe("enemy lifecycle runtime", () => {
  it("spawns due enemies and resets their respawn marker", () => {
    const enemies: EnemyState[] = [];
    const spawnSites: SpawnSite[] = [{
      id: 1,
      x: 100,
      y: 200,
      campName: "Test camp",
      type: "Bramble" as const,
      leashRange: 300,
      alive: false,
      respawnAt: 10,
    }];
    const bursts: string[] = [];
    const lifecycle = createEnemyLifecycle(enemies, spawnSites, (_x, _y, color) => bursts.push(color));

    lifecycle.updateRespawns(10);

    expect(enemies).toHaveLength(1);
    expect(enemies[0]).toMatchObject({ type: "Bramble", x: 100, y: 200, dead: false });
    expect(spawnSites[0]).toMatchObject({ alive: true, respawnAt: 0 });
    expect(bursts).toEqual(["#76d978"]);
  });

  it("engages living members of the selected region together", () => {
    const enemies: EnemyState[] = [];
    const spawnSites: SpawnSite[] = [
      { id: 1, x: 10, y: 20, campName: "A", groupAggro: true, type: "Dune Archer" as const, leashRange: 300, alive: false, respawnAt: 0 },
      { id: 2, x: 30, y: 40, campName: "A", groupAggro: true, type: "Dune Regent" as const, leashRange: 300, alive: false, respawnAt: 0 },
    ];
    const lifecycle = createEnemyLifecycle(enemies, spawnSites, () => {});
    spawnSites.forEach(lifecycle.spawnFromSite);

    const otherSite = { ...spawnSites[0], id: 3, campName: "B", groupAggro: false };
    lifecycle.spawnFromSite(otherSite);
    lifecycle.spawnFromSite({ ...spawnSites[0], id: 4 });
    enemies[3].dead = true;
    lifecycle.engageEnemy(enemies[0], "player", 42);

    expect(enemies.slice(0, 2).every((enemy) => enemy.engaged && !enemy.leashing && !enemy.wandering)).toBe(true);
    expect(enemies[1]).toMatchObject({ aggroTargetId: "player", aggroStartedAtTick: 42 });
    expect(enemies[2].engaged).toBe(false);
    expect(enemies[3].engaged).toBe(false);
  });
});
