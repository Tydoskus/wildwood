import { describe, expect, it, vi } from "vitest";
import {
  attackReadyAtWithoutTarget,
  createPlayerCombatController,
  projectileSimulationSeconds,
} from "./player-combat-controller";
import { createGameBootstrap } from "./game-bootstrap";
import { bossPlayerAttackCycle } from "../../../shared/boss-simulation";
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
    prismshellBoss: state.prismshellBoss, ironhornBoss: state.ironhornBoss, dreadreaperBoss: state.dreadreaperBoss, voltwardenBoss: state.voltwardenBoss, gravebloomBoss: state.gravebloomBoss,
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
    isCrystalHollowsMap: () => false, isClockworkRuinsMap: () => false, isDuskfallOrchardMap: () => false, isNeonBastionMap: () => false, isVerdantCatacombsMap: () => false,
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
    damagePrismshell: noop, damageIronhorn: noop, damageDreadreaper: noop, damageVoltwarden: noop, damageGravebloom: noop,
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
  it("prioritizes an aggroed attacker over its selected farm type, then returns to farming", () => {
    const state = createCombatHarness({ localIdentity: () => "my-account" });
    state.enemies.length = 0;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 250 });
    state.boss.dead = true;
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    for (const [id, type, x, y] of [[0, "Needle", 500, 650], [1, "Bramble", 550, 500]] as const) {
      lifecycle.spawnFromSite({ id, type, x, y, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    }
    const attacker = state.enemies[0];
    attacker.engaged = true; attacker.aggroTargetId = "someone-else";
    state.controller.attackNearest("Bramble");
    expect(state.player.combatFacing).toBe(0);
    state.controller.clearPendingThrow();
    attacker.aggroTargetId = "my-account";
    state.controller.attackNearest("Bramble");
    expect(state.player.combatFacing).toBeCloseTo(Math.PI / 2);
    state.controller.clearPendingThrow();
    attacker.dead = true;
    state.controller.attackNearest("Bramble");
    expect(state.player.combatFacing).toBe(0);
  });

  it("autofarm aims only at the chosen type and leaves bosses out of targeting", () => {
    const state = createCombatHarness();
    state.enemies.length = 0;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 250 });
    Object.assign(state.boss, { x: 550, y: 500, dead: false });
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    for (const [id, type, x, y] of [[0, "Needle", 525, 500], [1, "Bramble", 500, 650]] as const) {
      lifecycle.spawnFromSite({ id, type, x, y, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    }
    state.controller.attackNearest("Bramble");
    expect(state.player.combatFacing).toBeCloseTo(Math.PI / 2);
    state.controller.clearPendingThrow();
    state.enemies[1].dead = true;
    state.controller.attackNearest("Bramble");
    expect(state.player.combatFacing).toBeNull();
    expect(state.player.throwClock).toBe(0);
    state.controller.attackNearest();
    expect(state.player.combatFacing).toBe(0);
  });

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
    const attackInterval = preview.player.attackRate;
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
      prismshellBoss: state.prismshellBoss, ironhornBoss: state.ironhornBoss, dreadreaperBoss: state.dreadreaperBoss, voltwardenBoss: state.voltwardenBoss, gravebloomBoss: state.gravebloomBoss,
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
      isCrystalHollowsMap: () => false, isClockworkRuinsMap: () => false, isDuskfallOrchardMap: () => false, isNeonBastionMap: () => false, isVerdantCatacombsMap: () => false,
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
      damagePrismshell: noop, damageIronhorn: noop, damageDreadreaper: noop, damageVoltwarden: noop, damageGravebloom: noop,
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

    expect(spawnDamageNumber).not.toHaveBeenCalled();
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


it("shows confirmed boss critical damage once and discards events from another map", () => {
  const spawnDamageNumber = vi.fn();
  let hits = [
    { mapId: "tutorial_forest", x: 4000, y: 4200, damage: 1550, critical: true },
    { mapId: "beginner_desert", x: 4050, y: 4050, damage: 1000, critical: false },
  ];
  const { controller } = createCombatHarness({
    spawnDamageNumber, currentMapId: () => "tutorial_forest",
    drainBossHitResults: () => { const current = hits; hits = []; return current; },
  });
  controller.updateProjectiles(.01);
  controller.updateProjectiles(.01);
  expect(spawnDamageNumber).toHaveBeenCalledExactlyOnceWith(4000, 4200, 1550, true);
});

it("routes catacombs projectile hits exclusively to Gravebloom", () => {
  let now = 10;
  const damageGravebloom = vi.fn(), damageVoltwarden = vi.fn();
  const state = createCombatHarness({ nowSeconds: () => now, isTutorialMap: () => false,
    isVerdantCatacombsMap: () => true, damageGravebloom, damageVoltwarden });
  state.enemies.length = 0;
  Object.assign(state.player, { x: state.gravebloomBoss.x + state.gravebloomBoss.r + 25, y: state.gravebloomBoss.y });
  state.controller.attackNearest();
  now += .13;
  state.controller.attackNearest();
  for (let i = 0; i < 30; i++) { now += .02; state.controller.updateProjectiles(.02); }
  expect(damageGravebloom).toHaveBeenCalled();
  expect(damageVoltwarden).not.toHaveBeenCalled();
});
