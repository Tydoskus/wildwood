import { describe, expect, it, vi } from "vitest";
import {
  attackReadyAtWithoutTarget,
  createPlayerCombatController,
  playerAttackAnimationSpeed,
  playerAttackWindupSeconds,
  projectileSimulationSeconds,
} from "./player-combat-controller";
import { createGameBootstrap } from "./game-bootstrap";

describe("player attack timing", () => {
  it("keeps the normal windup for slower attacks", () => {
    expect(playerAttackWindupSeconds(1.56)).toBeCloseTo(.12);
    expect(playerAttackAnimationSpeed(1.56)).toBe(1);
  });

  it("fits the complete throw animation inside a 10.5 attacks-per-second interval", () => {
    const interval = 1 / 10.5;
    expect(playerAttackWindupSeconds(interval)).toBeLessThan(interval);
    expect(playerAttackAnimationSpeed(interval)).toBeCloseTo(.42 / interval);
  });

  it("moves a newly released projectile for only the part of the fixed step after release", () => {
    expect(projectileSimulationSeconds(10.012, 10.016, .016)).toBeCloseTo(.004);
    expect(projectileSimulationSeconds(9.9, 10.016, .016)).toBeCloseTo(.016);
    expect(projectileSimulationSeconds(10.02, 10.016, .016)).toBe(0);
  });

  it("keeps a ready attack armed while targets change instead of adding repeated delays", () => {
    expect(attackReadyAtWithoutTarget(9.8, 10)).toBe(9.8);
    expect(attackReadyAtWithoutTarget(10.5, 10)).toBeCloseTo(10.08);
    expect(attackReadyAtWithoutTarget(9.8, 10.08)).toBe(9.8);
  });

  it("collides projectiles with the Magmalisk and submits the hit batch", () => {
    const state = createGameBootstrap();
    state.magmaliskBoss.x = 200;
    state.magmaliskBoss.y = 100;
    state.magmaliskBoss.dead = false;
    const projectile = state.projectileStore.acquirePlayerProjectile();
    Object.assign(projectile, {
      x: 0, y: 100, vx: 1_000, vy: 0, r: 6, damage: 25,
      critical: false, hitLife: 1, life: 1, trail: 1,
    });
    const damageMagmalisk = vi.fn();
    const spawnDamageNumber = vi.fn();
    const noop = () => {};
    const controller = createPlayerCombatController({
      player: state.player,
      enemies: state.enemies,
      spawnSites: state.spawnSites,
      projectileStore: state.projectileStore,
      boss: state.boss,
      spiderBoss: state.spiderBoss,
      frostclawBoss: state.frostclawBoss,
      magmaliskBoss: state.magmaliskBoss,
      gloomrootBoss: state.gloomrootBoss,
      tidewyrmBoss: state.tidewyrmBoss,
      nowSeconds: () => 1,
      isTutorialMap: () => false,
      isDesertMap: () => false,
      isSnowMap: () => false,
      isLavaMap: () => true,
      isInfernalMap: () => false,
      isWaterMap: () => false,
      engageEnemy: noop,
      researchDamageMultiplier: () => 1,
      researchCriticalChance: () => 0,
      researchCriticalDamageMultiplier: () => 1,
      researchRewardMultiplier: () => 1,
      equippedWeapon: () => "starter_stone",
      equippedHead: () => "",
      equippedChest: () => "",
      healthMultiplier: () => 1,
      minAttackInterval: .05,
      effectiveArmor: () => 0,
      isDueling: () => false,
      scheduleEnemyRespawn: noop,
      incrementKills: noop,
      recordForestEnemyDefeat: noop,
      recordDesertEnemyDefeat: noop,
      recordLavaEnemyDefeat: noop,
      damageDragon: noop,
      damageSpider: noop,
      damageFrostclaw: noop,
      damageMagmalisk,
      damageGloomroot: noop,
      damageTidewyrm: noop,
      spawnBurst: noop,
      spawnParticle: noop,
      spawnDamageNumber,
      logPickup: noop,
      saveProgress: noop,
      setHitFlash: noop,
      addScreenShake: noop,
      recordDeath: noop,
      endGame: noop,
    });

    controller.updateProjectiles(.2);

    expect(spawnDamageNumber).toHaveBeenCalledWith(200, 100, 25, false);
    expect(damageMagmalisk).toHaveBeenCalledWith(1);
  });
});
