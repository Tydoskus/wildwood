import { describe, expect, it, vi } from "vitest";
import {
  attackReadyAtWithoutTarget,
  createPlayerCombatController,
  projectileSimulationSeconds,
} from "./player-combat-controller";
import { createGameBootstrap } from "./game-bootstrap";
import {
  ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, CLOCKWORK_RUINS_MAP_ID, CLOUDSPIRE_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID,
  DUSKFALL_ORCHARD_MAP_ID, INFERNAL_DEPTHS_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ION_CITADEL_MAP_ID, MOONFEN_MAP_ID,
  NEON_BASTION_MAP_ID, SAMURAI_GARDEN_MAP_ID, TUTORIAL_FOREST_MAP_ID, VERDANT_CATACOMBS_MAP_ID, WATER_REACH_MAP_ID,
} from "../world";
import { bossPlayerAttackCycle } from "../../../shared/boss-simulation";
import { absoluteAttackTimestamps, attackAnimationClockAt } from "../attack-timeline";
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
    bosses: state.bosses,
    nowSeconds: () => 1,
    currentMapId: () => TUTORIAL_FOREST_MAP_ID,
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
    recordDeath: noop,
    endGame: noop,
    ...overrides,
  });
  return { ...state, controller };
}

describe("player attack timing", () => {
  it("engages an enemy hit from outside aggro range", () => {
    let now = 0;
    const engageEnemy = vi.fn();
    const state = createCombatHarness({ nowSeconds: () => now, engageEnemy });
    state.bosses.dragon.dead = true;
    Object.assign(state.player, { x: 500, y: 500, damage: 1, attackRange: 400 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Bramble", x: 800, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[0];
    const before = enemy.hp;
    for (let i = 0; i < 180 && enemy.hp === before; i++) {
      now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60);
    }
    expect(enemy.hp).toBeLessThan(before);
    expect(engageEnemy).toHaveBeenCalledWith(enemy);
  });
  it("reports both earned and base stat rewards after research and prestige", () => {
    const logPickup = vi.fn();
    const multiplier = researchStatRewardMultiplier({ foraging: 5, prosperity: 4 }) * prestigeStatMultiplier(2);
    let now = 0;
    const state = createCombatHarness({ nowSeconds: () => now, researchRewardMultiplier: () => multiplier,
      displayRewardAmount: (type, amount) => amount * multiplier * (type === "damage" ? 1.75 : 1), logPickup });
    state.bosses.dragon.dead = true;
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

  it("heals once after a regular kill with Second Wind", () => {
    let now = 0;
    const state = createCombatHarness({ nowSeconds: () => now, prestigeSecondWind: () => .05 });
    state.bosses.dragon.dead = true;
    Object.assign(state.player, { x: 500, y: 500, damage: 100, attackRange: 200, hp: 50, maxHp: 100 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 550, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[0]; enemy.hp = enemy.maxHp = 1;
    for (let i = 0; i < 180; i++) { now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60); }
    expect(enemy.dead).toBe(true);
    expect(state.player.hp).toBe(55);
  });

  it("routes a tutorial kill to its acknowledgement without ordinary loot, stats, or respawns", () => {
    const saveProgress = vi.fn(), loot = vi.fn(), schedule = vi.fn(), killed = vi.fn(() => true);
    let now = 0;
    const state = createCombatHarness({ currentMapId: () => "", nowSeconds: () => now,
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
    Object.assign(state.player, { x: 500, y: 500, attackRange: 200 }); state.bosses.dragon.dead = true;
    state.controller.attackNearest(); expect(combat).not.toHaveBeenCalled();
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 550, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    state.controller.attackNearest(); expect(combat).toHaveBeenCalledOnce();
    state.controller.damagePlayer(5); expect(combat).toHaveBeenCalledTimes(2);
    state.controller.damagePlayer(5); expect(combat).toHaveBeenCalledTimes(2);
  });

  it("reflects the whole landed hit back at the enemy that dealt it, an Endless boss included", () => {
    const spawn = (state: ReturnType<typeof createCombatHarness>, maxHp = 1_000) => {
      state.enemies.length = 0;
      createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 520, y: 500,
        campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
      const enemy = state.enemies[0]; enemy.hp = enemy.maxHp = 1000;
      Object.assign(state.player, { x: 500, y: 500, hp: 1000, maxHp, hurtClock: 0 });
      return enemy;
    };
    const reflecting = createCombatHarness({ prestigeReflect: () => 1 });
    const attacker = spawn(reflecting);
    expect(reflecting.controller.damagePlayer(40, attacker)).toBe(true);
    expect(reflecting.player.hp).toBe(960);
    expect(attacker.hp).toBe(960);

    // Never more than the player's max health, whatever their damage: a hit bigger than that is cut to it.
    const fragile = createCombatHarness({ prestigeReflect: () => 1 });
    const bruiser = spawn(fragile, 30);
    fragile.controller.damagePlayer(40, bruiser);
    expect(bruiser.hp).toBe(970);
    // A Reflect Only run has no cap: Reflect is all the damage it has.
    const challenge = createCombatHarness({ prestigeReflect: () => 1, reflectOnly: () => true });
    const challenger = spawn(challenge, 30);
    challenge.controller.damagePlayer(40, challenger);
    expect(challenger.hp).toBe(960);

    const plain = createCombatHarness();
    const untouched = spawn(plain);
    plain.controller.damagePlayer(40, untouched);
    expect(untouched.hp).toBe(1000);

    const hitGeneratedBoss = vi.fn(() => true);
    const bossFight = createCombatHarness({ prestigeReflect: () => 1, hitGeneratedBoss });
    const boss = spawn(bossFight); boss.generatedBoss = true;
    bossFight.controller.damagePlayer(40, boss);
    expect(hitGeneratedBoss).toHaveBeenCalledWith(boss, 40, false, true);
  });

  it("reflects the hit before armor, so armor spares the player and not the attacker", () => {
    const state = createCombatHarness({ prestigeReflect: () => 1, effectiveArmor: () => 1_000 });   // armor halves damage
    state.enemies.length = 0;
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 520, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const mob = state.enemies[0]; mob.hp = mob.maxHp = 1000;
    Object.assign(state.player, { x: 500, y: 500, hp: 1000, maxHp: 1000, hurtClock: 0 });
    state.controller.damagePlayer(40, mob);
    expect(state.player.hp).toBe(980);   // 20 got through
    expect(mob.hp).toBe(960);            // the 40 that arrived, not the 20
  });

  it("reflects a campaign boss's hit back at that boss, drawn blue", () => {
    const hitPersonalBoss = vi.fn();
    const state = createCombatHarness({ prestigeReflect: () => 1, prestigeBossSlayer: () => .5, hitPersonalBoss });
    Object.assign(state.bosses.dragon, { dead: false, x: 700, y: 500 });
    Object.assign(state.player, { x: 500, y: 500, hp: 1000, maxHp: 1000, hurtClock: 0 });
    expect(state.controller.damagePlayerFromBoss(40)).toBe(true);
    expect(hitPersonalBoss).toHaveBeenCalledOnce();
    expect(hitPersonalBoss.mock.calls[0]).toEqual([40, 700, 500 + (state.bosses.dragon.hitboxOffsetY ?? 0), false, true]);
    // A dead boss's lingering hazard has no one to answer.
    state.bosses.dragon.dead = true; state.player.hurtClock = 0;
    state.controller.damagePlayerFromBoss(40);
    expect(hitPersonalBoss).toHaveBeenCalledOnce();
  });

  it("draws Reflect from a marble bag, only on hits it could answer, and shows each one blue", () => {
    const spawnDamageNumber = vi.fn();
    let seed = 5;
    const state = createCombatHarness({ prestigeReflect: () => .3, spawnDamageNumber,
      random: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; } });
    state.enemies.length = 0;
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 520, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const mob = state.enemies[0]; mob.hp = mob.maxHp = 1e9;
    const gone = { ...mob, dead: true } as typeof mob;
    Object.assign(state.player, { x: 500, y: 500, hp: 1e9, maxHp: 1e9 });
    for (let hit = 0; hit < 40; hit++) {
      state.player.hurtClock = 0; state.controller.damagePlayer(40, mob);
      // A shot from an enemy already dead draws no marble, so it cannot eat a reflect the living were owed.
      state.player.hurtClock = 0; state.controller.damagePlayer(40, gone);
    }
    const blue = spawnDamageNumber.mock.calls.filter(call => call[5] === true);
    expect(blue).toHaveLength(12);                      // exactly 30% of 40, not a coin's luck
    expect(mob.hp).toBe(1e9 - 12 * 40);                 // each one the whole 40 that landed
    expect(blue.every(call => call[2] === 40 && call[4] === false)).toBe(true);
  });

  it("lands every shot of a ranged volley, each one rolled for Reflect, instead of dropping those inside the hurt window", () => {
    const state = createCombatHarness({ prestigeReflect: () => 1 });
    state.enemies.length = 0;
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 520, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const archer = state.enemies[0]; archer.hp = archer.maxHp = 1000;
    Object.assign(state.player, { x: 500, y: 500, hp: 1000, maxHp: 1000, hurtClock: 0 });
    for (let shot = 0; shot < 3; shot++) state.projectileStore.spawnEnemyShot(500, 500, 0, 0, 6, 40, 4, archer);
    for (let frame = 0; frame < 30; frame++) {
      state.controller.updateProjectiles(1 / 60);
      state.player.hurtClock = Math.max(0, state.player.hurtClock - 1 / 60);
    }
    expect(state.player.hp).toBe(880);
    expect(archer.hp).toBe(880);
    expect(state.projectileStore.enemyShots).toHaveLength(0);
  });

  it("prioritizes an aggroed attacker over its selected farm type, then returns to farming", () => {
    const state = createCombatHarness({ localIdentity: () => "my-account" });
    state.enemies.length = 0;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 250 });
    state.bosses.dragon.dead = true;
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

  it("autofarm never takes a generated boss for the farmed group, and shoots it once nothing farmed is in range", () => {
    const state = createCombatHarness();
    state.enemies.length = 0;
    state.bosses.dragon.dead = true;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 250 });
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    for (const [id, campName, x, y] of [[0, "Warden", 550, 500], [1, "Health Camp", 500, 650]] as const)
      lifecycle.spawnFromSite({ id, campName, type: "Bramble", x, y, leashRange: 600, alive: false, respawnAt: 0 });
    Object.assign(state.enemies[0], { generatedBoss: true, engaged: true, aggroTargetId: null });
    state.controller.attackNearest("Bramble", "Health Camp");
    expect(state.player.combatFacing).toBeCloseTo(Math.PI / 2);
    state.enemies[1].dead = true;
    // Nothing farmed in range: the boss is fair game, as a campaign boss is (players stood beside it, never firing).
    state.controller.attackNearest("Bramble", "Health Camp");
    expect(state.player.combatFacing).toBe(0);
    state.controller.attackNearest();
    expect(state.player.combatFacing).toBe(0);
  });

  it("autofarm aims at the chosen type first, and at the boss only once none of it is in range", () => {
    const state = createCombatHarness();
    state.enemies.length = 0;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 250 });
    Object.assign(state.bosses.dragon, { x: 550, y: 500, dead: false });
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    for (const [id, type, x, y] of [[0, "Needle", 525, 500], [1, "Bramble", 500, 650]] as const) {
      lifecycle.spawnFromSite({ id, type, x, y, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    }
    state.controller.attackNearest("Bramble");
    expect(state.player.combatFacing).toBeCloseTo(Math.PI / 2);
    state.controller.clearPendingThrow();
    state.enemies[1].dead = true;
    // Other enemies stay ignored, but a boss in range is shot: autofarm used to stand beside it doing nothing.
    state.controller.attackNearest("Bramble");
    expect(state.player.combatFacing).toBeCloseTo(Math.atan2(state.bosses.dragon.y + (state.bosses.dragon.hitboxOffsetY ?? 0) - state.player.y, state.bosses.dragon.x - state.player.x));
  });

  it("finds the boss by its real hitbox, so standing in range above Koi Shogun shoots it", () => {
    const state = createCombatHarness({ currentMapId: () => SAMURAI_GARDEN_MAP_ID, equippedWeapon: () => "starter_bow" });
    state.enemies.length = 0;
    const boss = Object.assign(state.bosses.koiShogun, { x: 1_000, y: 1_000, dead: false });
    // 400 above its feet: in range of its tall oval, out of range of a circle at its feet.
    Object.assign(state.player, { x: 1_000, y: 600, attackRange: 250 });
    state.controller.attackNearest();
    expect(state.player.combatFacing).toBeCloseTo(Math.atan2(boss.y + (boss.hitboxOffsetY ?? 0) - 600, 0));
  });

  it.each(["starter_stone", "starter_bow"])("plays one release sound for %s at launch, including multishot", (weapon) => {
    let now = 10;
    const sound = vi.fn();
    const state = createCombatHarness({ nowSeconds: () => now, equippedWeapon: () => weapon, playBowAttackSound: sound });
    state.enemies.length = 0;
    state.bosses.dragon.dead = false;
    state.player.x = state.bosses.dragon.x + state.bosses.dragon.r + 30;
    state.player.y = state.bosses.dragon.y;
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

  it("takes the local boss throw phase from the seeded boss attack cycle", () => {
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
      harness.bosses.dragon.encounter = encounter;
      harness.bosses.dragon.dead = false;
      harness.player.x = harness.bosses.dragon.x + harness.bosses.dragon.r + harness.player.attackRange - 20;
      harness.player.y = harness.bosses.dragon.y;
      harness.controller.attackNearest();
      return harness;
    };
    const first = create(10);
    const second = create(9_000);
    // The throw clock any observer derives from the same cycle and server time.
    const startedAtMs = bossPlayerAttackCycle({
      kind: "dragon",
      encounter,
      playerId: identity,
      attackInterval,
      serverNowMs,
    }).startedAtMs;
    const expected = attackAnimationClockAt(absoluteAttackTimestamps(startedAtMs / 1_000, attackInterval), serverNowMs / 1_000);

    expect(expected).toBeGreaterThan(0);
    expect(first.player.throwClock).toBeCloseTo(expected, 5);
    expect(second.player.throwClock).toBeCloseTo(first.player.throwClock, 5);
  });

  it("records a Snowlands loot roll when a regular enemy dies", () => {
    const recordRegularEnemyDefeat = vi.fn();
    const state = createCombatHarness({
      currentMapId: () => INTERMEDIATE_SNOWLANDS_MAP_ID,
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


describe("stable player combat aim", () => {
  function aimHarness() {
    let now = 0;
    const state = createCombatHarness({ nowSeconds: () => now, localIdentity: () => "me" });
    state.enemies.length = 0;
    state.bosses.dragon.dead = true;
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
    state.enemies.length = 0; state.bosses.dragon.dead = true;
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
  [TUTORIAL_FOREST_MAP_ID, 'dragon'], [BEGINNER_DESERT_MAP_ID, 'spider'], [INTERMEDIATE_SNOWLANDS_MAP_ID, 'frostclaw'],
  [ADVANCED_LAVA_WASTES_MAP_ID, 'magmalisk'], [INFERNAL_DEPTHS_MAP_ID, 'gloomroot'], [WATER_REACH_MAP_ID, 'tidewyrm'],
  [SAMURAI_GARDEN_MAP_ID, 'koiShogun'], [CLOUDSPIRE_MAP_ID, 'tempestKirin'], [MOONFEN_MAP_ID, 'miremaw'],
  [CRYSTAL_HOLLOWS_MAP_ID, 'prismshell'], [CLOCKWORK_RUINS_MAP_ID, 'ironhorn'],
  [DUSKFALL_ORCHARD_MAP_ID, 'dreadreaper'], [NEON_BASTION_MAP_ID, 'voltwarden'],
  [VERDANT_CATACOMBS_MAP_ID, 'gravebloom'], [ION_CITADEL_MAP_ID, 'aegisPrime'],
] as const;

it("only hits Miremaw where its tuned oval reaches", () => {
  const hit = vi.fn();
  const state = createCombatHarness({
    currentMapId: () => MOONFEN_MAP_ID,
    hitPersonalBoss: hit,
    prestigeBossSlayer: () => .5,
  });
  state.enemies.length = 0;
  Object.assign(state.bosses.miremaw, { x: 500, y: 500, dead: false });
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
  expect(hit.mock.calls[0]?.[0]).toBe(1.5);
});

it("aims at Miremaw's body instead of the anchor above it", () => {
  const state = createCombatHarness({ currentMapId: () => MOONFEN_MAP_ID });
  state.enemies.length = 0;
  Object.assign(state.bosses.miremaw, { x: 500, y: 500, dead: false });
  Object.assign(state.player, { x: 300, y: 500, attackRange: 300 });

  state.controller.attackNearest();

  expect(state.player.combatFacing).toBeCloseTo(Math.atan2(63, 200));
});

it.each(personalBossCases)('applies ranged and sword criticals to %s', (mapId, kind) => {
  for (const weapon of ['starter_stone', 'wooden_sword']) {
    let now = 1;
    const hit = vi.fn();
    const state = createCombatHarness({ currentMapId: () => mapId,
      nowSeconds: () => now, equippedWeapon: () => weapon, hitPersonalBoss: hit,
      researchCriticalChance: () => 1, researchCriticalDamageMultiplier: () => 2 });
    state.enemies.length = 0;
    const boss = state.bosses[kind];
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
  const state = createCombatHarness({ currentMapId: () => "", nowSeconds: () => now,
    researchCriticalChance: () => 1, researchCriticalDamageMultiplier: () => 2, hitGeneratedBoss: hit });
  state.enemies.length = 0;
  Object.assign(state.player, { x: 500, y: 500, damage: 10, attackRange: 200, hp: 100 });
  createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: 'Spitter',
    x: 550, y: 500, campName: 'Boss', leashRange: 500, alive: false, respawnAt: 0 });
  state.enemies[0].generatedBoss = true;
  for (let i = 0; i < 90; i++) { now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60); }
  expect(hit).toHaveBeenCalledWith(state.enemies[0], 20, true, false);   // a swing, not a reflect
});

describe("autofarm target priority", () => {
  // Three of one type in range: nearest at full health, a wounded one further
  // out, and a tougher one furthest away.
  function harness() {
    const state = createCombatHarness();
    state.bosses.dragon.dead = true;
    const template = state.enemies.find(enemy => !enemy.dead)!;
    const at = (dx: number, hp: number, maxHp: number) => ({ ...template, x: state.player.x + dx, y: state.player.y, hp, maxHp, dead: false, generatedBoss: false, remoteCombatGhost: false });
    const near = at(40, 100, 100), wounded = at(80, 10, 100), tough = at(120, 150, 300);
    state.enemies.splice(0, state.enemies.length, near, wounded, tough);
    state.player.attackRange = 200;
    return { state, near, wounded, tough };
  }
  const aimedAt = (state: ReturnType<typeof harness>["state"], enemy: { x: number; y: number }) =>
    state.player.combatFacing !== null && Math.abs(state.player.combatFacing - Math.atan2(enemy.y - state.player.y, enemy.x - state.player.x)) < 1e-6;

  it("aims at the nearest, the most wounded or the toughest as chosen", () => {
    for (const [priority, pick] of [["closest", "near"], ["lowest", "wounded"], ["strongest", "tough"]] as const) {
      const h = harness();
      h.state.controller.attackNearest(h.near.type, null, priority);
      expect(aimedAt(h.state, h[pick])).toBe(true);
    }
  });

  it("keeps a ranked target until it dies rather than alternating", () => {
    const h = harness();
    h.state.controller.attackNearest(h.near.type, null, "lowest");
    expect(aimedAt(h.state, h.wounded)).toBe(true);
    h.near.hp = 5;
    h.state.controller.attackNearest(h.near.type, null, "lowest");
    expect(aimedAt(h.state, h.wounded)).toBe(true);
  });
});

describe("bow skills", () => {
  const NO_PROCS = { arrowStorm: false, ricochet: false, piercingShot: false };
  const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };
  function field(xs: number[], overrides: Parameters<typeof createCombatHarness>[0] = {}) {
    const state = createCombatHarness(overrides);
    state.bosses.dragon.dead = true;
    state.enemies.length = 0;
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    xs.forEach((x, id) => lifecycle.spawnFromSite({ id, type: "Spitter", x, y: 500, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 }));
    for (const enemy of state.enemies) enemy.hp = enemy.maxHp = 1e9;
    return state;
  }
  const taken = (state: ReturnType<typeof field>) => state.enemies.map(enemy => enemy.maxHp - enemy.hp);
  function shoot(state: ReturnType<typeof field>, skills: typeof NO_PROCS) {
    const projectile = state.projectileStore.acquirePlayerProjectile();
    Object.assign(projectile, { x: 300, y: 500, vx: 1_000, vy: 0, r: 6, damage: 10, critical: false, hitLife: 1, life: 1, trail: 1, skills, pierced: null });
    state.controller.updateProjectiles(.6);
    return projectile;
  }

  it("carries a Piercing Shot through four more enemies at full damage, then stops", () => {
    const state = field([560, 600, 640, 680, 720, 760]);
    const arrow = shoot(state, { ...NO_PROCS, piercingShot: true });
    expect(taken(state)).toEqual([10, 10, 10, 10, 10, 0]);
    expect(arrow.life).toBe(0);
    // Without the skill the first enemy stops the arrow.
    const plain = field([560, 600, 640]);
    shoot(plain, NO_PROCS);
    expect(taken(plain)).toEqual([10, 0, 0]);
  });

  it("rains Arrow Storm's five half-damage arrows on the enemies around the one hit, as each lands", () => {
    let now = 1;
    const state = field([560, 620, 800], { random: sequence(0, .99, 0, .99, 0), nowSeconds: () => now });
    shoot(state, { ...NO_PROCS, arrowStorm: true });
    // The arrows are still in the air: only the arrow that triggered them has hit.
    expect(taken(state)).toEqual([10, 0, 0]);
    now += 1;
    state.controller.updateProjectiles(1 / 60);
    expect(taken(state)).toEqual([10 + 3 * 5, 2 * 5, 0]);
  });

  it("passes an arrow whose target died in flight to the nearest live enemy", () => {
    let now = 1;
    const state = field([560, 620], { random: () => 0, nowSeconds: () => now });
    shoot(state, { ...NO_PROCS, arrowStorm: true });
    state.enemies[0].dead = true;
    now += 1;
    state.controller.updateProjectiles(1 / 60);
    expect(state.enemies[1].maxHp - state.enemies[1].hp).toBe(5 * 5);
  });

  it("bounces a Ricochet to the next two enemies in reach at 60% damage", () => {
    const state = field([560, 650, 760, 1_000]);
    shoot(state, { ...NO_PROCS, ricochet: true });
    expect(taken(state)).toEqual([10, 6, 6, 0]);
  });

  it("puts every Arrow Storm arrow on a boss, and nothing bounces off it", () => {
    const hit = vi.fn();
    let now = 1;
    const state = createCombatHarness({ currentMapId: () => MOONFEN_MAP_ID, hitPersonalBoss: hit, nowSeconds: () => now });
    state.enemies.length = 0;
    Object.assign(state.bosses.miremaw, { x: 700, y: 500, dead: false });
    const projectile = state.projectileStore.acquirePlayerProjectile();
    Object.assign(projectile, { x: 300, y: 500, vx: 1_000, vy: 0, r: 6, damage: 10, critical: false, hitLife: 1, life: 1, trail: 1,
      skills: { arrowStorm: true, ricochet: true, piercingShot: true }, pierced: null });
    state.controller.updateProjectiles(.6);
    expect(hit.mock.calls.map(call => call[0])).toEqual([10]);
    now += 1;
    state.controller.updateProjectiles(1 / 60);
    expect(hit.mock.calls.map(call => call[0])).toEqual([10, 5, 5, 5, 5, 5]);
    expect(projectile.life).toBe(0);
  });

  it("rolls the equipped bow's skills on every arrow it fires, and none without a roll", () => {
    let now = 0;
    const fire = (bowSkills: () => { arrowStorm: number; ricochet: number; piercingShot: number } | null) => {
      const state = field([560], { nowSeconds: () => now, equippedWeapon: () => "starter_bow", bowSkills, random: () => 0 });
      Object.assign(state.player, { x: 500, y: 500, attackRange: 400, projectileCount: 1 });
      const seen: unknown[] = [];
      for (let i = 0; i < 60 && !seen.length; i++) {
        now += 1 / 60;
        state.controller.attackNearest();
        for (const projectile of state.projectileStore.projectiles) seen.push(projectile.skills);
      }
      return seen[0];
    };
    expect(fire(() => ({ arrowStorm: 0, ricochet: 0, piercingShot: 100 }))).toEqual({ arrowStorm: false, ricochet: false, piercingShot: true });
    expect(fire(() => null)).toBeNull();
  });

  it("sends a Piercing Shot twice as far as a plain arrow, then on off screen", () => {
    let now = 0;
    const flight = (piercingShot: number) => {
      const state = field([560], { nowSeconds: () => now, equippedWeapon: () => "starter_bow", random: () => 0,
        bowSkills: () => ({ arrowStorm: 0, ricochet: 0, piercingShot }) });
      Object.assign(state.player, { x: 500, y: 500, attackRange: 400, projectileCount: 1 });
      for (let i = 0; i < 60 && !state.projectileStore.projectiles.length; i++) { now += 1 / 60; state.controller.attackNearest(); }
      const [arrow] = state.projectileStore.projectiles;
      return { reach: arrow.hitLife! * state.player.projectileSpeed, flight: arrow.life * state.player.projectileSpeed };
    };
    const plain = flight(0), piercing = flight(100);
    expect(piercing.reach).toBeCloseTo(plain.reach * 2);
    expect(piercing.flight).toBeGreaterThanOrEqual(1_600);
    expect(plain.flight).toBeLessThan(1_600);
  });
});

describe("enemy health bar loss chunk", () => {
  it("remembers the health before a run of hits and keeps it while hits keep landing", () => {
    let now = 0;
    const state = createCombatHarness({ nowSeconds: () => now });
    state.bosses.dragon.dead = true;
    Object.assign(state.player, { x: 500, y: 500, damage: 100, attackRange: 200 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 550, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[state.enemies.length - 1];
    enemy.hp = enemy.maxHp = 1_000;
    for (let frame = 0; frame < 240 && enemy.hp === 1_000; frame++) { now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60); }
    expect(enemy.hp).toBeLessThan(1_000);
    expect(enemy.hpLossFlashFrom).toBe(1_000);
    expect(enemy.hpLossFlashTimer).toBeGreaterThan(0);
  });
});

describe("Arrow Storm across a map change", () => {
  it("drops arrows still in flight when their enemies are no longer on the map", () => {
    let now = 1;
    const state = createCombatHarness({ random: () => 0, nowSeconds: () => now });
    state.bosses.dragon.dead = true;
    state.enemies.length = 0;
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 560, y: 500, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[0];
    enemy.hp = enemy.maxHp = 1e9;
    const projectile = state.projectileStore.acquirePlayerProjectile();
    Object.assign(projectile, { x: 300, y: 500, vx: 1_000, vy: 0, r: 6, damage: 10, critical: false, hitLife: 1, life: 1, trail: 1,
      skills: { arrowStorm: true, ricochet: false, piercingShot: false }, pierced: null });
    state.controller.updateProjectiles(.6);
    state.enemies.length = 0;
    now += 1;
    state.controller.updateProjectiles(1 / 60);
    expect(enemy.maxHp - enemy.hp).toBe(10);
  });
});

it("lets a boss attack hit regular enemies once, and its kills pay nothing", () => {
  const schedule = vi.fn(), record = vi.fn(), kills = vi.fn(), logPickup = vi.fn(), saveProgress = vi.fn();
  const state = createCombatHarness({ scheduleEnemyRespawn: schedule, recordRegularEnemyDefeat: record, incrementKills: kills, logPickup, saveProgress });
  const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
  state.spawnSites.length = 0;
  state.spawnSites.push({ id: 0, type: "Bramble", x: 100, y: 100, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 },
    { id: 1, type: "Bramble", x: 900, y: 900, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
  for (const site of state.spawnSites) lifecycle.spawnFromSite(site);
  const [near, far] = state.enemies;
  near.hp = near.maxHp = 10;
  const before = { damage: state.player.damage, hp: far.hp };
  const attack = {};
  const inside = (x: number, y: number) => Math.hypot(x - 100, y - 100) < 50;
  state.controller.damageEnemiesFromBoss(attack, 6, inside);
  // The same attack sweeping on over later frames lands once.
  state.controller.damageEnemiesFromBoss(attack, 6, inside);
  expect(near.hp).toBe(4);
  expect(far.hp).toBe(before.hp);
  state.controller.damageEnemiesFromBoss({}, 6, inside);
  expect(near.dead).toBe(true);
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(record).not.toHaveBeenCalled();
  expect(kills).not.toHaveBeenCalled();
  expect(logPickup).not.toHaveBeenCalled();
  expect(saveProgress).not.toHaveBeenCalled();
  expect(state.player.damage).toBe(before.damage);
});

it("pushes map enemies, elites included, out of a boss's body, and leaves bosses alone", () => {
  const state = createCombatHarness();
  const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
  state.enemies.length = 0;
  for (const [id, type] of [[0, "Bramble"], [1, "Dread Warden"]] as const)
    lifecycle.spawnFromSite({ id, type, x: 510, y: 500, campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
  lifecycle.spawnFromSite({ id: 2, type: "Bramble", x: 505, y: 500, campName: "Warden", leashRange: 500, alive: false, respawnAt: 0 });
  state.enemies[2].generatedBoss = true;
  state.controller.pushEnemiesFromBoss({ x: 500, y: 500, r: 80 });
  for (const enemy of state.enemies.slice(0, 2)) expect(Math.hypot(enemy.x - 500, enemy.y - 500)).toBeCloseTo(80 + enemy.r, 5);
  expect(state.enemies[2].x).toBe(505);
});
