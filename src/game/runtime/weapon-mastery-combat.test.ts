import { describe, expect, it, vi } from "vitest";
import { createPlayerCombatController } from "./player-combat-controller";
import { createProgressController } from "./progress-controller";
import { createStaffSkillRuntime } from "./staff-skill-runtime";
import { createGameBootstrap } from "./game-bootstrap";
import { createEnemyLifecycle } from "./enemies/enemy-lifecycle";
import type { EnemyState } from "./types";
import { TUTORIAL_FOREST_MAP_ID } from "../world";
import { STAFF_SPLASH_RADIUS } from "../../../shared/staff-skills";
import { masteryPointsForLevel, masteryPointsInPlay, type MasteryPoints } from "../../../shared/weapon-mastery";

const LEVEL_50 = BigInt(masteryPointsForLevel(50));
const ALL_50: MasteryPoints = { archery: LEVEL_50, swordplay: LEVEL_50, sorcery: LEVEL_50 };

function combat(overrides: Partial<Parameters<typeof createPlayerCombatController>[0]> = {}) {
  const state = createGameBootstrap();
  const noop = () => {};
  const controller = createPlayerCombatController({
    player: state.player, enemies: state.enemies, spawnSites: state.spawnSites, projectileStore: state.projectileStore, bosses: state.bosses,
    nowSeconds: () => 1, currentMapId: () => TUTORIAL_FOREST_MAP_ID, engageEnemy: noop,
    researchDamageMultiplier: () => 1, researchCriticalChance: () => 0, researchCriticalDamageMultiplier: () => 1, researchRewardMultiplier: () => 1,
    equippedWeapon: () => "starter_stone", equippedHead: () => "", equippedChest: () => "", healthMultiplierBonus: () => 0,
    minAttackInterval: .05, effectiveArmor: () => 0, isDueling: () => false, scheduleEnemyRespawn: noop, recordRegularEnemyDefeat: noop,
    incrementKills: noop, spawnBurst: noop, spawnParticle: noop, spawnDamageNumber: noop, logPickup: noop, saveProgress: noop,
    recordDeath: noop, endGame: noop,
    ...overrides,
  });
  state.bosses.dragon.dead = true;
  return { ...state, controller };
}

describe("Skill Proficiency", () => {
  /** The first arrow's skill procs, with a fixed draw of .8 against each chance. */
  function firstArrow(points: MasteryPoints | undefined) {
    let now = 0;
    const state = combat({ nowSeconds: () => now, equippedWeapon: () => "starter_bow", random: () => .8,
      weaponSkills: () => ({ arrowStorm: 0, ricochet: 0, piercingShot: 60 }), weaponMastery: () => points });
    Object.assign(state.player, { x: 500, y: 500, attackRange: 400, projectileCount: 1 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 560, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    for (let i = 0; i < 60; i++) {
      now += 1 / 60;
      state.controller.attackNearest();
      const [arrow] = state.projectileStore.projectiles;
      if (arrow) return arrow.skills;
    }
    return undefined;
  }

  it("raises a bow skill's chance by its own share: 60% fires at 90% at level 50", () => {
    expect(firstArrow(undefined)?.piercingShot).toBe(false);
    expect(firstArrow(ALL_50)?.piercingShot).toBe(true);
  });

  it("is off during Reflect Only and Aggro runs", () => {
    expect(firstArrow(masteryPointsInPlay(ALL_50, true))?.piercingShot).toBe(false);
  });

  it("counts in the full damage a second, only for the school of the right hand", () => {
    const plain = combat({ equippedWeapon: () => "starter_bow", weaponSkills: () => ({ arrowStorm: 4 }) });
    const trained = combat({ equippedWeapon: () => "starter_bow", weaponSkills: () => ({ arrowStorm: 4 }), weaponMastery: () => ALL_50 });
    const swordHand = combat({ equippedWeapon: () => "starter_bow", equippedRightHand: () => "wooden_sword",
      weaponSkills: () => ({ arrowStorm: 4 }), weaponMastery: () => ALL_50 });
    expect(trained.controller.expectedFullDps()).toBeGreaterThan(plain.controller.expectedFullDps());
    expect(swordHand.controller.expectedFullDps()).toBeCloseTo(plain.controller.expectedFullDps());
  });
});

describe("Swordplay's Guard", () => {
  function hitFor(weapon: string, points: MasteryPoints | undefined) {
    const state = combat({ equippedWeapon: () => weapon, weaponMastery: () => points, prestigeReflect: () => 1, random: () => 0 });
    Object.assign(state.player, { x: 500, y: 500, hp: 1_000, maxHp: 1_000, hurtClock: 0 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 560, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[0]; enemy.hp = enemy.maxHp = 1_000;
    state.controller.damagePlayer(100, enemy);
    return { lost: 1_000 - state.player.hp, reflected: 1_000 - enemy.hp };
  }

  it("takes 10% less at level 50 with a sword in hand, and Reflect still answers the whole hit", () => {
    const plain = hitFor("wooden_sword", undefined), guarded = hitFor("wooden_sword", ALL_50);
    expect(plain.lost).toBeCloseTo(100);
    expect(guarded.lost).toBeCloseTo(90);
    expect(guarded.reflected).toBeCloseTo(plain.reflected);
  });

  it("guards nothing with a bow in hand, or during a challenge run", () => {
    expect(hitFor("starter_bow", ALL_50).lost).toBeCloseTo(100);
    expect(hitFor("wooden_sword", masteryPointsInPlay(ALL_50, true)).lost).toBeCloseTo(100);
  });
});

describe("Sorcery's Blast", () => {
  it("widens a bolt's burst by the radius the controller gives it", () => {
    const state = createGameBootstrap();
    Object.assign(state.player, { x: 0, y: 0, hp: 100, maxHp: 100 });
    const hit = vi.fn(), burst = vi.fn();
    let radius = STAFF_SPLASH_RADIUS;
    const runtime = createStaffSkillRuntime({ player: state.player, enemies: state.enemies, hit, effects: { spawnStaffBurst: burst },
      currentMapId: () => "map", equippedWeapon: () => "ion_staff", activeBoss: () => null, roll: () => ({}), nowSeconds: () => 0,
      random: () => 1, isDueling: () => false, boltColor: () => "#fff", blastRadius: () => radius });
    const enemy = (x: number) => { const target = { x, y: 0, r: 10, hp: 1e6, dead: false } as EnemyState; state.enemies.push(target); return target; };
    // Its edge is 80 from the impact: past the plain 70, inside 87.5 at level 50.
    const primary = enemy(300), outer = enemy(390);
    runtime.burst(primary, 300, 0, 10, false, 0, null);
    expect(hit.mock.calls.map(call => call[0])).toEqual([primary]);
    radius = STAFF_SPLASH_RADIUS * 1.25; hit.mockClear();
    runtime.burst(primary, 300, 0, 10, false, 0, null);
    expect(hit.mock.calls.map(call => call[0])).toEqual([primary, outer]);
    expect(burst).toHaveBeenLastCalledWith(300, 0, STAFF_SPLASH_RADIUS * 1.25, "#fff");
  });

  it("is 25% wider at level 50 with a staff in hand, as the controller hands it to the burst", () => {
    let now = 0;
    const burst = vi.fn();
    const state = combat({ nowSeconds: () => now, equippedWeapon: () => "ion_staff", random: () => .99, weaponMastery: () => ALL_50,
      skillEffects: { spawnStaffBurst: burst, spawnArcingArrow: vi.fn(), spawnSkillStreak: vi.fn(), spawnSkillRing: vi.fn() } });
    Object.assign(state.player, { x: 500, y: 500, damage: 10, attackRate: 1, attackRange: 400, projectileCount: 1 });
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: 0, type: "Spitter", x: 700, y: 500,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    state.enemies[0].hp = state.enemies[0].maxHp = 1e6;
    for (let frame = 0; frame < 180 && !burst.mock.calls.length; frame++) {
      now += 1 / 60; state.controller.attackNearest(); state.controller.updateProjectiles(1 / 60);
    }
    expect(burst.mock.calls[0][2]).toBeCloseTo(STAFF_SPLASH_RADIUS * 1.25);
  });
});

describe("Archery's range", () => {
  function rangeWith(rightHand: string, points: MasteryPoints | undefined) {
    const state = createGameBootstrap();
    if (!state.inventory.itemIds.includes(rightHand)) state.inventory.itemIds.push(rightHand);
    state.inventory.equippedRightHand = rightHand;
    const saved = { attackRange: 200, maxHp: 100, damage: 4, attackRate: 1.56, projectileCount: 1, armor: 0, regen: 0, speed: 190,
      inventoryJson: JSON.stringify(state.inventory.itemIds), equippedRightHand: rightHand, equippedLeftHand: "", introComplete: true } as never;
    const controller = createProgressController({
      player: state.player, inventory: state.inventory, bootsPickup: state.bootsPickup, legacyStorageKey: "unused-legacy-save",
      getSavedProgress: () => saved, saveRemoteProgress: vi.fn(), localIdentity: () => "guest-identity", lifetimeEnemyKills: () => 0,
      isDeveloper: () => false, getTotalKills: () => 0, setTotalKills: vi.fn(), researchVitalityRank: () => 0,
      healthMultiplierBonus: () => 0, setAppliedVitalityRank: vi.fn(), renderInventory: vi.fn(), onLoaded: vi.fn(),
      cardRange: () => 5, weaponMastery: () => points,
    });
    controller.load();
    controller.load();
    return state.player.attackRange;
  }

  it("adds 0.4 a level, and 10 more at level 50, on top of the saved range and cards while a bow or the stone is in the right hand", () => {
    expect(rangeWith("starter_stone", undefined)).toBeCloseTo(205);
    expect(rangeWith("starter_stone", ALL_50)).toBeCloseTo(235);
    expect(rangeWith("wooden_sword", ALL_50)).toBeCloseTo(205);
    expect(rangeWith("starter_stone", masteryPointsInPlay(ALL_50, true))).toBeCloseTo(205);
  });
});
