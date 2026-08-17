import { describe, expect, it } from "vitest";
import { createProjectileStore, MAX_ENEMY_SHOTS, MAX_PLAYER_PROJECTILES } from "./projectile-store";

describe("projectile store", () => {
  it("recycles expired player projectiles", () => {
    const store = createProjectileStore();
    const first = store.acquirePlayerProjectile();
    first.life = 0;
    store.compactPlayerProjectiles();
    expect(store.projectiles).toHaveLength(0);
    expect(store.acquirePlayerProjectile()).toBe(first);
  });

  it("caps both projectile lanes", () => {
    const store = createProjectileStore();
    for (let index = 0; index < MAX_PLAYER_PROJECTILES + 20; index += 1) store.acquirePlayerProjectile().life = 1;
    for (let index = 0; index < MAX_ENEMY_SHOTS + 20; index += 1) store.acquireEnemyShot().life = 1;
    expect(store.projectiles).toHaveLength(MAX_PLAYER_PROJECTILES);
    expect(store.enemyShots).toHaveLength(MAX_ENEMY_SHOTS);
  });

  it("fills pooled enemy shots without source-object allocation", () => {
    const store = createProjectileStore();
    store.spawnEnemyShot(10, 20, 30, 40, 6, 50, 4);

    expect(store.enemyShots).toEqual([{
      x: 10,
      y: 20,
      vx: 30,
      vy: 40,
      r: 6,
      damage: 50,
      life: 4,
    }]);
  });
});
