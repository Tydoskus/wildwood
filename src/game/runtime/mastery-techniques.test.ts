import { describe, expect, it, vi } from "vitest";
import { createPlayerCombatController } from "./player-combat-controller";
import { createGameBootstrap } from "./game-bootstrap";
import { createEnemyLifecycle } from "./enemies/enemy-lifecycle";
import { createSwordSkillRuntime } from "./sword-skill-runtime";
import { createStaffSkillRuntime } from "./staff-skill-runtime";
import { createMasteryTechniqueRuntime } from "./mastery-technique-runtime";
import type { EnemyShot, EnemyState } from "./types";
import { TUTORIAL_FOREST_MAP_ID } from "../world";
import { ARROW_STORM_ARROWS } from "../../../shared/bow-skills";
import { WHIRLWIND_DAMAGE_SHARE, WHIRLWIND_TICK_SECONDS } from "../../../shared/sword-skills";
import { CHAIN_DAMAGE_SHARE, METEOR_DELAY_SECONDS } from "../../../shared/staff-skills";
import { MARK_DAMAGE_BONUS, METEOR_SHOWER_GAP_SECONDS } from "../../../shared/mastery-techniques";
import { masteryPointsForLevel, masteryPointsInPlay, type MasteryPoints, type WeaponSchool } from "../../../shared/weapon-mastery";

const trained = (school: WeaponSchool, level: number): MasteryPoints => ({ [school]: BigInt(masteryPointsForLevel(level)) });
const ALL_50: MasteryPoints = { archery: BigInt(masteryPointsForLevel(50)), swordplay: BigInt(masteryPointsForLevel(50)), sorcery: BigInt(masteryPointsForLevel(50)) };

/** A combat controller with the player at (500, 500) and enemies of 100,000 health placed by `add`; `step` runs a frame. */
function harness(weapon: string, points: MasteryPoints | undefined, overrides: Partial<Parameters<typeof createPlayerCombatController>[0]> = {}) {
  const state = createGameBootstrap();
  const noop = () => {};
  let now = 0;
  const damageNumber = vi.fn();
  const controller = createPlayerCombatController({
    player: state.player, enemies: state.enemies, spawnSites: state.spawnSites, projectileStore: state.projectileStore, bosses: state.bosses,
    nowSeconds: () => now, currentMapId: () => TUTORIAL_FOREST_MAP_ID, engageEnemy: noop,
    researchDamageMultiplier: () => 1, researchCriticalChance: () => 0, researchCriticalDamageMultiplier: () => 2, researchRewardMultiplier: () => 1,
    equippedWeapon: () => weapon, equippedHead: () => "", equippedChest: () => "", healthMultiplierBonus: () => 0,
    minAttackInterval: .05, effectiveArmor: () => 0, isDueling: () => false, scheduleEnemyRespawn: noop, recordRegularEnemyDefeat: noop,
    incrementKills: noop, spawnBurst: noop, spawnParticle: noop, spawnDamageNumber: damageNumber, logPickup: noop, saveProgress: noop,
    recordDeath: noop, endGame: noop, weaponMastery: () => points, random: () => .99,
    ...overrides,
  });
  state.enemies.length = 0;
  state.bosses.dragon.dead = true;
  Object.assign(state.player, { x: 500, y: 500, hp: 1_000, maxHp: 1_000, damage: 10, attackRate: .5, attackRange: 300, projectileCount: 1,
    hurtClock: 0, knockback: 0 });
  const add = (x: number, y = 500, hp = 100_000) => {
    createEnemyLifecycle(state.enemies, state.spawnSites, () => {}).spawnFromSite({ id: state.enemies.length, type: "Spitter", x, y,
      campName: "Test", leashRange: 500, alive: false, respawnAt: 0 });
    const enemy = state.enemies[state.enemies.length - 1]; enemy.hp = enemy.maxHp = hp;
    return enemy;
  };
  const step = (to: number, frame = 1 / 120) => {
    while (now < to - 1e-9) { now += frame; controller.attackNearest(); controller.updateProjectiles(frame); }
  };
  /** The hits each enemy took, in order: [damage, critical]. */
  const hitsOn = (enemy: EnemyState) => damageNumber.mock.calls.filter(call => call[0] === enemy.x && call[1] === enemy.y && !call[4])
    .map(call => [call[2] as number, call[3] as boolean] as const);
  return { ...state, controller, add, step, hitsOn, damageNumber, now: () => now, setNow: (time: number) => { now = time; } };
}

describe("Steady Aim and Focus", () => {
  const criticals = (weapon: string, points: MasteryPoints | undefined) => {
    const s = harness(weapon, points), enemy = s.add(600);
    s.step(9);
    return s.hitsOn(enemy).slice(0, 12).map(([, critical]) => critical);
  };
  const everySixth = Array.from({ length: 12 }, (_, index) => index % 6 === 5);

  it("makes every sixth arrow a critical hit from Archery 10, with no crit chance at all", () => {
    expect(criticals("starter_bow", trained("archery", 10))).toEqual(everySixth);
    expect(criticals("starter_bow", trained("archery", 9))).toEqual(everySixth.map(() => false));
  });

  it("makes every sixth bolt a critical hit from Sorcery 10", () => {
    expect(criticals("ion_staff", trained("sorcery", 10))).toEqual(everySixth);
    expect(criticals("ion_staff", trained("archery", 50))).toEqual(everySixth.map(() => false));
  });

  it("is off during Reflect Only and Aggro runs", () => {
    expect(criticals("starter_bow", masteryPointsInPlay(ALL_50, true))).toEqual(everySixth.map(() => false));
  });
});

describe("Volley", () => {
  it("raises a Split Shot arrow by 15% from Archery 20", () => {
    const splitHit = (points: MasteryPoints) => {
      const s = harness("starter_bow", points, { prestigeSplitShot: () => 1 });
      s.add(600); const second = s.add(560, 600);
      s.step(1);
      return s.hitsOn(second)[0][0];
    };
    expect(splitHit(trained("archery", 20)) / splitHit(trained("archery", 19))).toBeCloseTo(1.15);
  });
});

describe("Hunter's Mark and Hex", () => {
  it("raises arrows on a target for 4s after a critical hit marks it, from Archery 30", () => {
    const s = harness("starter_bow", trained("archery", 30)), enemy = s.add(600);
    s.step(6);
    const hits = s.hitsOn(enemy).map(([damage]) => damage);
    // The sixth crits (twice the damage) and marks; the ones after it land 8% harder.
    expect(hits[5]).toBeCloseTo(hits[0] * 2);
    expect(hits[6]).toBeCloseTo(hits[0] * (1 + MARK_DAMAGE_BONUS));
    const plain = harness("starter_bow", trained("archery", 29)), other = plain.add(600);
    plain.step(6);
    expect(plain.hitsOn(other)[6][0]).toBeCloseTo(hits[0]);
  });

  it("lets a mark run out, and only a bolt-wielding Sorcery 30 marks with bolts", () => {
    let now = 0;
    const state = createGameBootstrap(), enemy = { x: 0, y: 0, r: 10 } as EnemyState;
    const runtime = (school: WeaponSchool, level: number) => createMasteryTechniqueRuntime({ mastery: () => ({ school, level }),
      player: state.player, enemies: [], nowSeconds: () => now });
    const hex = runtime("sorcery", 30);
    expect(hex.hitFactor(enemy, true)).toBe(1);
    now = 3.9; expect(hex.hitFactor(enemy, false)).toBeCloseTo(1 + MARK_DAMAGE_BONUS);
    now = 4.1; expect(hex.hitFactor(enemy, false)).toBe(1);
    const sword = runtime("swordplay", 50);
    sword.hitFactor(enemy, true);
    expect(sword.hitFactor(enemy, false)).toBe(1);
  });
});

describe("Tailwind", () => {
  it("gives 6% move speed for 3s after a kill from Archery 40", () => {
    let killedAt = -1;
    const s = harness("starter_bow", trained("archery", 40), { incrementKills: () => { killedAt = s.now(); } });
    const enemy = s.add(600, 500, 1);
    expect(s.controller.tailwind()).toBe(0);
    s.step(1);
    expect(enemy.dead).toBe(true);
    expect(s.controller.tailwind()).toBeCloseTo(.06);
    s.setNow(killedAt + 2.9); expect(s.controller.tailwind()).toBeCloseTo(.06);
    s.setNow(killedAt + 3.1); expect(s.controller.tailwind()).toBe(0);
  });

  it("needs the level, the bow and no challenge run", () => {
    for (const [weapon, points] of [["starter_bow", trained("archery", 39)], ["wooden_sword", ALL_50],
      ["starter_bow", masteryPointsInPlay(ALL_50, true)]] as const) {
      const s = harness(weapon, points);
      s.add(560, 500, 1);
      s.step(1);
      expect(s.enemies[0].dead).toBe(true);
      expect(s.controller.tailwind()).toBe(0);
    }
  });
});

describe("Rain of Arrows", () => {
  it("rains a second Arrow Storm wave from Archery 50", () => {
    const arrows = (points: MasteryPoints) => {
      const spawnArcingArrow = vi.fn();
      const s = harness("starter_bow", points, { weaponSkills: () => ({ arrowStorm: 100 }), random: () => 0,
        skillEffects: { spawnArcingArrow, spawnSkillStreak: vi.fn(), spawnSkillRing: vi.fn() } });
      s.add(600);
      s.step(.4);
      return spawnArcingArrow.mock.calls.length;
    };
    expect(arrows(trained("archery", 49))).toBe(ARROW_STORM_ARROWS);
    expect(arrows(trained("archery", 50))).toBe(ARROW_STORM_ARROWS * 2);
  });
});

describe("Cleave, Bloodlust and Momentum", () => {
  it("hits one more enemy in reach for 30% from Swordplay 10", () => {
    const swing = (points: MasteryPoints) => {
      const s = harness("wooden_sword", points), primary = s.add(560), nearby = s.add(520, 560);
      s.add(900);
      s.step(.3);
      return { primary: s.hitsOn(primary), nearby: s.hitsOn(nearby) };
    };
    expect(swing(trained("swordplay", 9)).nearby).toEqual([]);
    const cleaved = swing(trained("swordplay", 10));
    expect(cleaved.primary).toHaveLength(1);
    expect(cleaved.nearby[0][0]).toBeCloseTo(cleaved.primary[0][0] * .3);
  });

  it("heals 0.5% of max health for each swing that lands from Swordplay 30, none for a miss", () => {
    const s = harness("wooden_sword", trained("swordplay", 30));
    s.player.hp = 500;
    const enemy = s.add(560);
    s.step(.3);
    expect(s.player.hp).toBeCloseTo(505);
    enemy.x = 2_000; s.player.hp = 500;
    s.step(1);
    expect(s.player.hp).toBe(500);
  });

  it("swings 2% faster a hit in a row up to 10% from Swordplay 40, and a miss starts over", () => {
    const gaps = (points: MasteryPoints) => {
      const s = harness("wooden_sword", points), enemy = s.add(560);
      const times: number[] = [];
      s.damageNumber.mockImplementation((x: number, _y: number, _amount: number, _critical: boolean, taken: boolean) => {
        if (x === enemy.x && !taken) times.push(s.now());
      });
      s.step(5, 1 / 960);
      return times.slice(1).map((time, index) => time - times[index]);
    };
    const plain = gaps(trained("swordplay", 39)), fast = gaps(trained("swordplay", 40));
    expect(plain.at(-1)).toBeCloseTo(.5, 2);
    // A swing's interval is set when it starts, before it lands: the first hit speeds the third swing.
    expect(fast[0]).toBeCloseTo(.5, 2);
    expect(fast[1]).toBeCloseTo(.5 / 1.02, 2);
    expect(fast.at(-1)).toBeCloseTo(.5 / 1.1, 2);
    let now = 0;
    const state = createGameBootstrap();
    const runtime = createMasteryTechniqueRuntime({ mastery: () => ({ school: "swordplay", level: 40 }), player: state.player, enemies: [],
      nowSeconds: () => now });
    for (let hit = 0; hit < 9; hit++) runtime.swingLanded();
    expect(runtime.attackSpeed()).toBeCloseTo(1.1);
    runtime.swingMissed();
    expect(runtime.attackSpeed()).toBe(1);
  });
});

describe("Mana Shield", () => {
  it("takes 5% less while above half health with a staff from Sorcery 40", () => {
    const lost = (points: MasteryPoints | undefined, hp: number, weapon = "ion_staff") => {
      const s = harness(weapon, points);
      s.player.hp = hp;
      s.controller.damagePlayer(100, null);
      return hp - s.player.hp;
    };
    expect(lost(trained("sorcery", 40), 1_000)).toBeCloseTo(95);
    expect(lost(trained("sorcery", 40), 400)).toBeCloseTo(100);
    expect(lost(trained("sorcery", 39), 1_000)).toBeCloseTo(100);
    expect(lost(masteryPointsInPlay(ALL_50, true), 1_000)).toBeCloseTo(100);
  });
});

describe("Blade Storm and Parry", () => {
  function sword(extraTicks: number, deflectReturn: number) {
    const state = createGameBootstrap();
    Object.assign(state.player, { x: 0, y: 0, hp: 100, maxHp: 100, hurtClock: 0 });
    const hit = vi.fn(), spin = vi.fn();
    let now = 0;
    const runtime = createSwordSkillRuntime({ player: state.player, enemies: state.enemies, hit, effects: { spawnSwordSpin: spin },
      currentMapId: () => "map", equippedWeapon: () => "ion_sword", activeBoss: () => null, roll: () => ({ whirlwind: 100, deflect: 100 }),
      nowSeconds: () => now, random: () => 0, isDueling: () => false,
      extraWhirlwindTicks: () => extraTicks, deflectReturn: () => deflectReturn });
    const enemy = { x: 40, y: 0, r: 10, hp: 1e6, dead: false } as EnemyState;
    state.enemies.push(enemy);
    return { runtime, hit, spin, enemy, at: (time: number) => { now = time; runtime.update(); } };
  }

  it("spins Whirlwind one extra tick", () => {
    const f = sword(1, 1);
    f.runtime.swing(f.enemy, 100, false, 0);
    f.at(2);
    expect(f.hit).toHaveBeenCalledTimes(4);
    expect(f.hit.mock.calls.every(call => call[1] === 100 * WHIRLWIND_DAMAGE_SHARE)).toBe(true);
    expect(f.spin.mock.calls[0][3]).toBeCloseTo(4 * WHIRLWIND_TICK_SECONDS);
  });

  it("returns 20% more with Deflect, capped at max health before the bonus", () => {
    const f = sword(0, 1.2);
    const shot = { source: f.enemy, damage: 500, life: 1 } as unknown as EnemyShot;
    expect(f.runtime.deflect(shot)).toBe(true);
    f.at(1);
    expect(f.hit).toHaveBeenCalledWith(f.enemy, 120, false, expect.any(Number), "sword-deflect", true);
  });

  it("are wired from Swordplay 20 and 50 through the combat controller", () => {
    const spawnSwordSpin = vi.fn();
    const s = harness("wooden_sword", trained("swordplay", 50), { weaponSkills: () => ({ whirlwind: 100 }), random: () => 0,
      skillEffects: { spawnSwordSpin, spawnArcingArrow: vi.fn(), spawnSkillStreak: vi.fn(), spawnSkillRing: vi.fn() } });
    s.add(560);
    s.step(.3);
    expect(spawnSwordSpin.mock.calls[0][3]).toBeCloseTo(4 * WHIRLWIND_TICK_SECONDS);
  });
});

describe("Overcharge and Meteor Shower", () => {
  function staff(chainScale: number, extraFalls: number) {
    const state = createGameBootstrap();
    Object.assign(state.player, { x: 0, y: 0, hp: 100, maxHp: 100 });
    const hit = vi.fn(), meteor = vi.fn();
    let now = 0;
    const runtime = createStaffSkillRuntime({ player: state.player, enemies: state.enemies, hit, effects: { spawnMeteor: meteor },
      currentMapId: () => "map", equippedWeapon: () => "ion_staff", activeBoss: () => null, roll: () => ({ meteor: 100 }),
      nowSeconds: () => now, random: () => 0, isDueling: () => false, boltColor: () => "#fff",
      chainScale: () => chainScale, extraMeteorFalls: () => extraFalls });
    const enemy = (x: number) => { const target = { x, y: 0, r: 10, hp: 1e6, dead: false } as EnemyState; state.enemies.push(target); return target; };
    return { runtime, hit, meteor, enemy, at: (time: number) => { now = time; runtime.update(); } };
  }

  it("raises Chain Lightning's jumps by 15%", () => {
    const f = staff(1.15, 0), primary = f.enemy(300), next = f.enemy(420);
    f.runtime.burst(primary, 300, 0, 100, false, 0, { chain: true, frostNova: false });
    expect(f.hit.mock.calls.find(call => call[0] === next)?.[1]).toBeCloseTo(100 * CHAIN_DAMAGE_SHARE * 1.15);
  });

  it("drops Meteor a second time on the same spot", () => {
    const f = staff(1, 1), target = f.enemy(300);
    f.runtime.cast(target, 100, false);
    expect(f.meteor.mock.calls.map(call => call[3])).toEqual([METEOR_DELAY_SECONDS, METEOR_DELAY_SECONDS + METEOR_SHOWER_GAP_SECONDS]);
    f.at(METEOR_DELAY_SECONDS); expect(f.hit).toHaveBeenCalledTimes(1);
    f.at(METEOR_DELAY_SECONDS + METEOR_SHOWER_GAP_SECONDS); expect(f.hit).toHaveBeenCalledTimes(2);
  });

  it("are wired from Sorcery 20 and 50 through the combat controller", () => {
    const spawnMeteor = vi.fn();
    const meteors = (points: MasteryPoints) => {
      spawnMeteor.mockClear();
      const s = harness("ion_staff", points, { weaponSkills: () => ({ meteor: 100 }), random: () => 0,
        skillEffects: { spawnMeteor, spawnArcingArrow: vi.fn(), spawnSkillStreak: vi.fn(), spawnSkillRing: vi.fn() } });
      s.add(600);
      s.step(.3);
      return spawnMeteor.mock.calls.length;
    };
    expect(meteors(trained("sorcery", 49))).toBe(1);
    expect(meteors(trained("sorcery", 50))).toBe(2);
  });
});
