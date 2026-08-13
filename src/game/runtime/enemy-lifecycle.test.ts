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

  it("engages every Dune Archer together", () => {
    const enemies: EnemyState[] = [];
    const spawnSites: SpawnSite[] = [
      { id: 1, x: 10, y: 20, campName: "A", type: "Dune Archer" as const, leashRange: 300, alive: false, respawnAt: 0 },
      { id: 2, x: 30, y: 40, campName: "B", type: "Dune Archer" as const, leashRange: 300, alive: false, respawnAt: 0 },
    ];
    const lifecycle = createEnemyLifecycle(enemies, spawnSites, () => {});
    spawnSites.forEach(lifecycle.spawnFromSite);

    lifecycle.engageEnemy(enemies[0]);

    expect(enemies.every((enemy) => enemy.engaged && !enemy.leashing && !enemy.wandering)).toBe(true);
  });
});
