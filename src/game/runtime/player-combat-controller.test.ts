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
import { rewardLabel } from "../enemies";
import { researchStatRewardMultiplier } from "../../../shared/research";
import { prestigeStatMultiplier } from "../../../shared/prestige";

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
    prismshellBoss: state.prismshellBoss, ironhornBoss: state.ironhornBoss, dreadreaperBoss: state.dreadreaperBoss, voltwardenBoss: state.voltwardenBoss, gravebloomBoss: state.gravebloomBoss, aegisPrimeBoss: state.aegisPrimeBoss,
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
    isCrystalHollowsMap: () => false, isClockworkRuinsMap: () => false, isDuskfallOrchardMap: () => false, isNeonBastionMap: () => false, isVerdantCatacombsMap: () => false, isIonCitadelMap: () => false,
    engageEnemy: noop,
    researchDamageMultiplier: () => 1,
    researchCriticalChance: () => 0,
    researchCriticalDamageMultiplier: () => 1,
    researchRewardMultiplier: () => 1,
    equippedWeapon: () => "starter_stone",
    equippedHead: () => "",
    equippedChest: () => "",
    healthMultiplierBonus: () => 0,
    minAttackInterval: .05,
    effectiveArmor: () => 0,
    isDueling: () => false,
    scheduleEnemyRespawn: noop,
    recordRegularEnemyDefeat: noop,
    incrementKills: noop,
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
  it("reports both earned and base stat rewards after research and prestige", () => {
    const logPickup = vi.fn();
    const multiplier = researchStatRewardMultiplier({ foraging: 5, prosperity: 4 }) * prestigeStatMultiplier(2);
    let now = 0;
    const state = createCombatHarness({ nowSeconds: () => now, researchRewardMultiplier: () => multiplier,
      displayRewardAmount: (type, amount) => amount * multiplier * (type === "damage" ? 1.75 : 1), logPickup });
    state.boss.dead = true;
    Object.assign(state.player, { x: 500, y: 500, damage: 100, attackRange: 200 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 550, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[0];
    enemy.hp = enemy.maxHp = 1;
    const reward = { ...enemy.reward };
    const before = state.player.damage;
    for (let i = 0; i < 180 && !enemy.dead; i++) { now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60); }
    expect(enemy.dead).toBe(true);
    expect(logPickup).toHaveBeenCalledWith(rewardLabel({ ...reward, amount: reward.amount * multiplier * 1.75 }), expect.any(String), rewardLabel(reward));
    if (reward.type === "damage") expect(state.player.damage - before).toBeCloseTo(reward.amount * multiplier);
  });

  it("routes a tutorial kill to its acknowledgement without ordinary loot, stats, or respawns", () => {
    const saveProgress = vi.fn(), loot = vi.fn(), schedule = vi.fn(), killed = vi.fn(() => true);
    let now = 0;
    const state = createCombatHarness({ isTutorialMap: () => false, nowSeconds: () => now,
      onEnemyDefeated: killed, saveProgress, recordRegularEnemyDefeat: loot, scheduleEnemyRespawn: schedule });
    Object.assign(state.player, { x: 500, y: 500, damage: 4, attackRange: 200 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 550, y: 500,
      campName: "First Steps", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[0]; enemy.hp = enemy.maxHp = 10;
    for (let i = 0; i < 300; i++) { now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60); }
    expect(killed).toHaveBeenCalledOnce();
    expect(state.player.damage).toBe(4);
    expect(saveProgress).not.toHaveBeenCalled(); expect(loot).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled();
  });

  it("marks actual attack starts and accepted damage as combat for travel boots", () => {
    const combat = vi.fn();
    const state = createCombatHarness({ onCombat: combat });
    Object.assign(state.player, { x: 500, y: 500, attackRange: 200 }); state.boss.dead = true;
    state.controller.attackNearest(); expect(combat).not.toHaveBeenCalled();
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 550, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    state.controller.attackNearest(); expect(combat).toHaveBeenCalledOnce();
    state.controller.damagePlayer(5); expect(combat).toHaveBeenCalledTimes(2);
    state.controller.damagePlayer(5); expect(combat).toHaveBeenCalledTimes(2);
  });

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

  it("autofarm aims within the chosen camp when every camp shares a species", () => {
    const state = createCombatHarness();
    state.enemies.length = 0;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 250 });
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    for (const [id, campName, x, y] of [[0, "Armor Camp", 550, 500], [1, "Health Camp", 500, 650]] as const)
      lifecycle.spawnFromSite({ id, campName, type: "Bramble", x, y, leashRange: 600, alive: false, respawnAt: 0 });
    state.controller.attackNearest("Bramble", "Health Camp");
    expect(state.player.combatFacing).toBeCloseTo(Math.PI / 2);
    state.enemies[1].dead = true;
    state.controller.attackNearest("Bramble", "Health Camp");
    expect(state.player.combatFacing).toBeNull();
  });

  it("autofarm ignores an engaged generated boss even when it shares the farm species", () => {
    const state = createCombatHarness();
    state.enemies.length = 0;
    state.boss.dead = true;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 250 });
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    for (const [id, campName, x, y] of [[0, "Warden", 550, 500], [1, "Health Camp", 500, 650]] as const)
      lifecycle.spawnFromSite({ id, campName, type: "Bramble", x, y, leashRange: 600, alive: false, respawnAt: 0 });
    Object.assign(state.enemies[0], { generatedBoss: true, engaged: true, aggroTargetId: null });
    state.controller.attackNearest("Bramble", "Health Camp");
    expect(state.player.combatFacing).toBeCloseTo(Math.PI / 2);
    state.enemies[1].dead = true;
    state.controller.attackNearest("Bramble", "Health Camp");
    expect(state.player.combatFacing).toBeNull();
    state.controller.attackNearest();
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

  it("records a Snowlands loot roll when a regular enemy dies", () => {
    const recordRegularEnemyDefeat = vi.fn();
    const state = createCombatHarness({
      isTutorialMap: () => false,
      isSnowMap: () => true,
      recordRegularEnemyDefeat,
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

    expect(recordRegularEnemyDefeat).toHaveBeenCalledOnce();
  });
  it.each(["water_reach", "samurai_garden", "cloudspire", "moonfen"])("records a %s loot roll when a regular enemy dies", mapId => {
    const recordRegularEnemyDefeat = vi.fn();
    const state = createCombatHarness({
      isTutorialMap: () => false,
      currentMapId: () => mapId,
      recordRegularEnemyDefeat,
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

    expect(recordRegularEnemyDefeat).toHaveBeenCalledOnce();
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

describe("stable player combat aim", () => {
  function aimHarness() {
    let now = 0;
    const state = createCombatHarness({ nowSeconds: () => now, localIdentity: () => "me" });
    state.enemies.length = 0;
    state.boss.dead = true;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 200 });
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    for (const [id, x] of [[0, 450], [1, 551]] as const) lifecycle.spawnFromSite({
      id, x, y: 500, type: "Spitter", campName: "Test", leashRange: 500, alive: false, respawnAt: 0,
    });
    return { ...state, aim(type: "Spitter" | null = null) { now += 1 / 60; state.controller.attackNearest(type); } };
  }
  it("keeps body and weapon facing steady through opposite-side distance jitter and candidate reorderings", () => {
    const f = aimHarness(), [left, right] = f.enemies;
    f.aim();
    for (let frame = 0; frame < 120; frame++) {
      left.x = 450 + (frame % 2 ? -1 : 1);
      right.x = 550 + (frame % 2 ? -1 : 1);
      f.enemies.reverse();
      f.aim();
      expect(f.player.facing).toBe(Math.PI);
      expect(f.player.combatFacing).toBe(Math.PI);
    }
    right.x = 525;
    for (let frame = 0; frame < 6; frame++) f.aim();
    expect(f.player.combatFacing).toBe(0);
  });
  it.each(["dead", "out of range", "removed"])("immediately reacquires when the retained enemy is %s", reason => {
    const f = aimHarness(), left = f.enemies[0];
    f.aim();
    if (reason === "dead") left.dead = true;
    else if (reason === "out of range") left.x = 100;
    else f.enemies.splice(0, 1);
    f.aim();
    expect(f.player.combatFacing).toBe(0);
  });
  it("lets an active threat override near-tie retention during autofarm", () => {
    const f = aimHarness(), right = f.enemies[1];
    f.aim("Spitter");
    right.engaged = true; right.aggroTargetId = "me";
    for (let frame = 0; frame < 6; frame++) f.aim("Spitter");
    expect(f.player.combatFacing).toBe(0);
  });
  it("limits candidate searches while continuing to track the retained target each frame", () => {
    const f = aimHarness(), [left, right] = f.enemies;
    let rightPositionReads = 0;
    Object.defineProperty(right, "x", { configurable: true, get() { rightPositionReads++; return 551; } });
    f.aim();
    rightPositionReads = 0;
    for (let frame = 0; frame < 60; frame++) {
      left.y = 500 + frame / 10;
      f.aim();
      expect(f.player.combatFacing).toBeCloseTo(Math.atan2(left.y - 500, -50));
    }
    // One direct position read per search; a full-frame search would read it 60 times.
    expect(rightPositionReads).toBeGreaterThanOrEqual(10);
    expect(rightPositionReads).toBeLessThanOrEqual(13);
  });
  it("does not mirror the body or held weapon for tiny vertical-aim crossings", () => {
    const f = aimHarness(), [enemy, other] = f.enemies;
    other.dead = true;
    enemy.y = 450;
    for (let frame = 0; frame < 90; frame++) {
      enemy.x = 500 + (frame % 2 ? -1 : 1);
      f.aim();
      expect(Math.cos(f.player.facing)).toBeGreaterThan(0);
      expect(f.player.combatFacing).toBeCloseTo(Math.atan2(-50, enemy.x - 500));
    }
    enemy.x = 495;
    f.aim();
    expect(Math.cos(f.player.facing)).toBeLessThan(0);
  });
});

describe("local sword combat", () => {
  function swordHarness(overrides: Partial<Parameters<typeof createPlayerCombatController>[0]> = {}) {
    let now = 0, weapon = "wooden_sword";
    const state = createCombatHarness({ nowSeconds: () => now, equippedWeapon: () => weapon, ...overrides });
    state.enemies.length = 0; state.boss.dead = true;
    Object.assign(state.player, { x: 500, y: 500, damage: 10, projectileCount: 3, attackRate: 1, attackRange: 200 });
    const add = (x: number, radius = 15) => {
      createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: state.enemies.length, type: "Spitter", x, y: 500,
        campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
      const enemy = state.enemies[state.enemies.length - 1]; enemy.hp = enemy.maxHp = 100; enemy.r = radius;
      return enemy;
    };
    return { ...state, add, setWeapon: (id: string) => { weapon = id; }, step: (time: number) => {
      const dt = time - now; now = time; state.controller.attackNearest(); state.controller.updateProjectiles(dt);
    } };
  }
  it("strikes once at release, even with multishot, and spawns no projectile", () => {
    const s = swordHarness(), enemy = s.add(565);
    s.step(0); expect(enemy.hp).toBe(100);
    s.step(.119); expect(enemy.hp).toBe(100);
    s.step(.121); expect(enemy.hp).toBeCloseTo(90);
    s.step(.4); expect(enemy.hp).toBeCloseTo(90);
    expect(s.projectileStore.projectiles).toHaveLength(0);
    expect(s.player.attackRange).toBe(200);
  });
  it("does not acquire targets at bow range and misses when an enemy moves away during windup", () => {
    const s = swordHarness(), enemy = s.add(650);
    s.step(0); s.step(.2); expect(enemy.hp).toBe(100);
    enemy.x = 565; s.step(.3); enemy.x = 650; s.step(.5);
    expect(enemy.hp).toBe(100);
  });
  it("hits a large target's near edge and only the nearest target on the ray", () => {
    const s = swordHarness(), first = s.add(585, 20), second = s.add(595, 30);
    s.step(0); s.step(.13);
    expect(first.hp).toBeCloseTo(90); expect(second.hp).toBe(100);
  });
  it("cancels a queued strike when switching weapons without resetting attack cooldown", () => {
    const s = swordHarness(), enemy = s.add(565);
    s.step(0); s.setWeapon("starter_bow"); s.step(.13);
    expect(enemy.hp).toBe(100); expect(s.projectileStore.projectiles).toHaveLength(0);
    expect(s.player.attackClock).toBeGreaterThan(.8);
  });
  it("awards one regular enemy defeat and works at capped attack speed", () => {
    const recordRegularEnemyDefeat = vi.fn();
    const s = swordHarness({ recordRegularEnemyDefeat });
    const enemy = s.add(565); enemy.hp = 20; s.player.attackRate = .05;
    for (let frame = 0; frame < 50; frame++) s.step(frame / 120);
    expect(enemy.dead).toBe(true);
    expect(recordRegularEnemyDefeat).toHaveBeenCalledOnce();
    expect(s.projectileStore.projectiles).toHaveLength(0);
  });
});

const personalBossCases = [
  ['isTutorialMap', 'boss'], ['isDesertMap', 'spiderBoss'], ['isSnowMap', 'frostclawBoss'],
  ['isLavaMap', 'magmaliskBoss'], ['isInfernalMap', 'gloomrootBoss'], ['isWaterMap', 'tidewyrmBoss'],
  ['isSamuraiMap', 'koiShogunBoss'], ['isCloudspireMap', 'tempestKirinBoss'], ['isMoonfenMap', 'miremawBoss'],
  ['isCrystalHollowsMap', 'prismshellBoss'], ['isClockworkRuinsMap', 'ironhornBoss'],
  ['isDuskfallOrchardMap', 'dreadreaperBoss'], ['isNeonBastionMap', 'voltwardenBoss'],
  ['isVerdantCatacombsMap', 'gravebloomBoss'], ['isIonCitadelMap', 'aegisPrimeBoss'],
] as const;

it("only hits Miremaw where its tuned oval reaches", () => {
  const hit = vi.fn();
  const state = createCombatHarness({
    isTutorialMap: () => false,
    isMoonfenMap: () => true,
    hitPersonalBoss: hit,
  });
  state.enemies.length = 0;
  Object.assign(state.miremawBoss, { x: 500, y: 500, dead: false });
  const fireAcross = (y: number) => {
    const projectile = state.projectileStore.acquirePlayerProjectile();
    Object.assign(projectile, {
      x: 300, y, vx: 1_000, vy: 0, r: 6, damage: 1,
      critical: false, hitLife: 1, life: 1, trail: 1,
    });
    state.controller.updateProjectiles(.3);
    state.projectileStore.clear();
  };

  // The old circle reached to y=381. The tuned oval starts at y=468.
  fireAcross(420);
  expect(hit).not.toHaveBeenCalled();

  fireAcross(563);
  expect(hit).toHaveBeenCalledOnce();
  expect(hit.mock.calls[0]?.[2]).toBe(563);
});

it("aims at Miremaw's body instead of the anchor above it", () => {
  const state = createCombatHarness({ isTutorialMap: () => false, isMoonfenMap: () => true });
  state.enemies.length = 0;
  Object.assign(state.miremawBoss, { x: 500, y: 500, dead: false });
  Object.assign(state.player, { x: 300, y: 500, attackRange: 300 });

  state.controller.attackNearest();

  expect(state.player.combatFacing).toBeCloseTo(Math.atan2(63, 200));
});

it.each(personalBossCases)('applies ranged and sword criticals to %s', (flag, key) => {
  for (const weapon of ['starter_stone', 'wooden_sword']) {
    let now = 1;
    const hit = vi.fn();
    const state = createCombatHarness({ isTutorialMap: () => false, [flag]: () => true,
      nowSeconds: () => now, equippedWeapon: () => weapon, hitPersonalBoss: hit,
      researchCriticalChance: () => 1, researchCriticalDamageMultiplier: () => 2 });
    state.enemies.length = 0;
    const boss = state[key];
    Object.assign(boss, { dead: false, x: 550, y: 500 });
    Object.assign(state.player, { x: 500 - boss.r, y: 500, damage: 10, projectileCount: 1, attackRange: 200, hp: 100 });
    for (let i = 0; i < 90; i++) {
      now += 1 / 60;
      state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60);
    }
    expect(hit, weapon).toHaveBeenCalled();
    expect(hit.mock.calls.every(call => call[0] === 20 && call[3] === true), weapon).toBe(true);
  }
});

it('passes Endless critical damage and the critical flag to its hit display', () => {
  let now = 1; const hit = vi.fn(() => true);
  const state = createCombatHarness({ isTutorialMap: () => false, nowSeconds: () => now,
    researchCriticalChance: () => 1, researchCriticalDamageMultiplier: () => 2, hitGeneratedBoss: hit });
  state.enemies.length = 0;
  Object.assign(state.player, { x: 500, y: 500, damage: 10, attackRange: 200, hp: 100 });
  createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: 'Spitter',
    x: 550, y: 500, campName: 'Boss', leashRange: 500, alive: false, respawnAt: 0 });
  state.enemies[0].generatedBoss = true;
  for (let i = 0; i < 90; i++) { now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60); }
  expect(hit).toHaveBeenCalledWith(state.enemies[0], 20, true);
});
