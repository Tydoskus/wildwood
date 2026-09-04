import { describe, expect, it, vi } from "vitest";
import {
  attackReadyAtWithoutTarget,
  createPlayerCombatController,
  playerAttackAnimationSpeed,
  playerAttackWindupSeconds,
  projectileSimulationSeconds,
} from "./player-combat-controller";
import { createGameBootstrap } from "./game-bootstrap";
import { bossPlayerAttackCycle } from "../../../shared/boss-simulation";
import { weaponAttackInterval } from "../../../shared/items";
import { remoteBossAttackFrame } from "../../coop/services/remote-boss-attack";
import { createEnemyLifecycle } from "./enemy-lifecycle";

function createCombatHarness(overrides: Partial<Parameters<typeof createPlayerCombatController>[0]> = {}) {
  const state = createGameBootstrap();
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
    koiShogunBoss: state.koiShogunBoss,
    tempestKirinBoss: state.tempestKirinBoss,
    miremawBoss: state.miremawBoss,
    prismshellBoss: state.prismshellBoss,
    nowSeconds: () => 1,
    isTutorialMap: () => true,
    isDesertMap: () => false,
    isSnowMap: () => false,
    isLavaMap: () => false,
    isInfernalMap: () => false,
    isWaterMap: () => false,
    isSamuraiMap: () => false,
    isCloudspireMap: () => false,
    isMoonfenMap: () => false,
    isCrystalHollowsMap: () => false,
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
    recordSnowEnemyDefeat: noop,
    recordLavaEnemyDefeat: noop,
    damageDragon: noop,
    damageSpider: noop,
    damageFrostclaw: noop,
    damageMagmalisk: noop,
    damageGloomroot: noop,
    damageTidewyrm: noop,
    damageKoiShogun: noop,
    damageTempestKirin: noop,
    damageMiremaw: noop,
    damagePrismshell: noop,
    spawnBurst: noop,
    spawnParticle: noop,
    spawnDamageNumber: noop,
    logPickup: noop,
    saveProgress: noop,
    setHitFlash: noop,
    addScreenShake: noop,
    recordDeath: noop,
    endGame: noop,
    ...overrides,
  });
  return { ...state, controller };
}

describe("player attack timing", () => {
  it.each(["starter_stone", "starter_bow"])("plays one release sound for %s at launch, including multishot", (weapon) => {
    let now = 10;
    const sound = vi.fn();
    const state = createCombatHarness({ nowSeconds: () => now, equippedWeapon: () => weapon, playBowAttackSound: sound });
    state.enemies.length = 0;
    state.boss.dead = false;
    state.player.x = state.boss.x + state.boss.r + 30;
    state.player.y = state.boss.y;
    state.player.projectileCount = 3;
    state.controller.attackNearest();
    expect(sound).not.toHaveBeenCalled();
    now += .13;
    state.controller.attackNearest();
    expect(sound).toHaveBeenCalledTimes(1);
    expect(state.projectileStore.projectiles).toHaveLength(3);
  });
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

  it("uses the same boss throw phase locally and on a remote observer", () => {
    const encounter = 22n;
    const identity = "shared-player";
    const preview = createGameBootstrap();
    const attackInterval = weaponAttackInterval("starter_stone", preview.player.attackRate, 1, 0);
    const cycle = bossPlayerAttackCycle({
      kind: "dragon",
      encounter,
      playerId: identity,
      attackInterval,
      serverNowMs: 1_800_000_000_000,
    });
    const serverNowMs = cycle.startedAtMs + 50;
    const create = (localNowSeconds: number) => {
      const harness = createCombatHarness({
        nowSeconds: () => localNowSeconds,
        serverNowMs: () => serverNowMs,
        localIdentity: () => identity,
      });
      harness.enemies.length = 0;
      harness.boss.encounter = encounter;
      harness.boss.dead = false;
      harness.player.x = harness.boss.x + harness.boss.r + harness.player.attackRange - 20;
      harness.player.y = harness.boss.y;
      harness.controller.attackNearest();
      return harness;
    };
    const first = create(10);
    const second = create(9_000);
    const remote = remoteBossAttackFrame({
      boss: {
        kind: "dragon",
        encounter,
        alive: true,
        x: first.boss.x,
        y: first.boss.y,
        radius: first.boss.r,
      },
      playerId: identity,
      playerX: first.player.x,
      playerY: first.player.y,
      attackInterval,
      attackRange: first.player.attackRange,
      projectileCount: first.player.projectileCount,
      serverNowMs,
    });

    expect(remote).not.toBeNull();
    expect(first.player.throwClock).toBeCloseTo(remote?.throwClock ?? -1, 5);
    expect(second.player.throwClock).toBeCloseTo(first.player.throwClock, 5);
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
      koiShogunBoss: state.koiShogunBoss,
      tempestKirinBoss: state.tempestKirinBoss,
      miremawBoss: state.miremawBoss,
      prismshellBoss: state.prismshellBoss,
      nowSeconds: () => 1,
      isTutorialMap: () => false,
      isDesertMap: () => false,
      isSnowMap: () => false,
      isLavaMap: () => true,
      isInfernalMap: () => false,
      isWaterMap: () => false,
      isSamuraiMap: () => false,
      isCloudspireMap: () => false,
      isMoonfenMap: () => false,
      isCrystalHollowsMap: () => false,
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
      recordSnowEnemyDefeat: noop,
      recordLavaEnemyDefeat: noop,
      damageDragon: noop,
      damageSpider: noop,
      damageFrostclaw: noop,
      damageMagmalisk,
      damageGloomroot: noop,
      damageTidewyrm: noop,
      damageKoiShogun: noop,
      damageTempestKirin: noop,
      damageMiremaw: noop,
      damagePrismshell: noop,
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

  it("records a Snowlands loot roll when a regular enemy dies", () => {
    const recordSnowEnemyDefeat = vi.fn();
    const state = createCombatHarness({
      isTutorialMap: () => false,
      isSnowMap: () => true,
      recordSnowEnemyDefeat,
    });
    const site = {
      id: 0,
      x: 200,
      y: 100,
      campName: "Test Snow Camp",
      type: "Frost Raider" as const,
      leashRange: 300,
      alive: false,
      respawnAt: 0,
    };
    state.spawnSites.push(site);
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite(site);
    state.enemies[0].hp = 1;
    const projectile = state.projectileStore.acquirePlayerProjectile();
    Object.assign(projectile, {
      x: 0, y: 100, vx: 1_000, vy: 0, r: 6, damage: 25,
      critical: false, hitLife: 1, life: 1, trail: 1,
    });

    state.controller.updateProjectiles(.2);

    expect(recordSnowEnemyDefeat).toHaveBeenCalledOnce();
  });
});
