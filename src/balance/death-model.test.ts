import { describe, expect, it } from "vitest";
import type { EnemyDefinition } from "../game/enemies";
import {
  DEATH_SCREEN_SECONDS,
  DIED_TO_CAMP_SECONDS,
  bossAbilitySeconds,
  bossAttacker,
  enemyAggroRadius,
  fightParticipants,
  participantAttackers,
  resolveFight,
  standingPoint,
  type CampSite,
} from "./death-model";

const melee: EnemyDefinition = { hp: 10, speed: 200, damage: 10, attackSpeed: 1, r: 20, color: "", outline: "", reward: { type: "damage", amount: 1 } };
const ranged: EnemyDefinition = { ...melee, ranged: true };
type Site = CampSite & { enemy: EnemyDefinition };
const site = (x: number, y: number, campName = "A", enemy = melee, groupAggro = false): Site =>
  ({ x, y, campName, groupAggro, leashRange: 420, enemy });
const enemyOf = (entry: Site) => entry.enemy;

describe("death model", () => {
  it("uses the game's death screen and Auto's died-to wait", () => {
    expect(DEATH_SCREEN_SECONDS).toBeCloseTo(3.85);
    expect(DIED_TO_CAMP_SECONDS).toBe(600);
  });

  it("wakes enemies by the game's aggro radii", () => {
    expect(enemyAggroRadius(melee)).toBe(225);
    expect(enemyAggroRadius({ ...melee, elite: true })).toBe(300);
    expect(enemyAggroRadius(ranged)).toBe(185);
    expect(enemyAggroRadius({ ...ranged, elite: true, aggro: 520 })).toBe(520);
  });

  it("stops at the approach distance, short of the target", () => {
    expect(standingPoint({ x: 0, y: 0 }, { x: 1_000, y: 0 })).toEqual({ x: 856, y: 0 });
    expect(standingPoint({ x: 990, y: 0 }, { x: 1_000, y: 0 })).toEqual({ x: 990, y: 0 });
  });

  it("brings camp mates in aggro range, a whole group camp, and leashed chasers", () => {
    const target = site(0, 0);
    const near = site(100, 0);
    const far = site(800, 0);
    const standing = { x: 0, y: 144 };
    expect(fightParticipants(target, [target, near, far], standing, new Set(), enemyOf)).toEqual(new Set([target, near]));
    const groupTarget = site(0, 0, "G", melee, true);
    const groupFar = site(900, 0, "G", melee, true);
    expect(fightParticipants(groupTarget, [groupTarget, groupFar, far], standing, new Set(), enemyOf)).toEqual(new Set([groupTarget, groupFar]));
    // Still chasing from the last fight, inside its leash: it stays in.
    const chaser = site(350, 0, "B");
    expect(fightParticipants(target, [target, chaser], standing, new Set([chaser]), enemyOf).has(chaser)).toBe(true);
    expect(fightParticipants(target, [target, chaser], { x: -500, y: 0 }, new Set([chaser]), enemyOf).has(chaser)).toBe(false);
  });

  it("times melee hits after the chase and ranged hits after the first shot", () => {
    const standing = { x: 0, y: 0 };
    const [close] = participantAttackers([site(37, 0)], standing, new Set(), enemyOf, 0, 1, 200);
    expect(close.start).toBe(0);
    const [chasing] = participantAttackers([site(500, 0)], standing, new Set(), enemyOf, 0, 1, 200);
    // 463 px to close at 225 px/s after a 1.5 s ramp from standstill.
    expect(chasing.start).toBeCloseTo(1.5 + (463 - 225 * .75) / 225);
    const [archer] = participantAttackers([site(150, 0, "A", ranged)], standing, new Set(), enemyOf, 0, 1, 200);
    expect(archer.start).toBeGreaterThan(.7);
    expect(archer.start).toBeLessThan(1.1);
    expect(close.hit).toBe(10);
    expect(close.interval).toBe(1);
  });

  it("settles a fight hit by hit against health and regeneration", () => {
    // Two hits of 40 cannot empty 100: the fight ends with what is left plus regen, capped.
    expect(resolveFight(100, 100, 1, 1.5, [{ start: 0, interval: 1, hit: 40 }])).toEqual({ diedAt: null, health: 21.5 });
    // The third hit lands at t=2 on 100 - 80 + 2 = 22 health.
    expect(resolveFight(100, 100, 1, 3, [{ start: 0, interval: 1, hit: 40 }])).toEqual({ diedAt: 2, health: 0 });
    // Regeneration that outpaces the hits keeps the player up.
    expect(resolveFight(100, 100, 50, 10, [{ start: 0, interval: 1, hit: 40 }]).diedAt).toBeNull();
    // A fight that never ends still ends the player when the hits outpace regen.
    const endless = resolveFight(1e6, 1e6, 0, 1e9, [{ start: 0, interval: .5, hit: 10 }]);
    expect(endless.diedAt).toBeCloseTo(1e6 / 20, -1);
  });

  it("prices a boss as one ability hit per ability turn", () => {
    expect(bossAbilitySeconds("dragon")).toBeCloseTo((4.75 + 4.8) / 2);
    const attacker = bossAttacker("dragon", 480, 0);
    // The Dragon's mean ability (cone 480, rain 96) at its strongest hit of 480.
    expect(attacker.hit).toBe(288);
    expect(attacker.interval).toBeCloseTo(bossAbilitySeconds("dragon"));
  });
});
