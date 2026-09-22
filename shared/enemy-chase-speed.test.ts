import { describe, expect, it } from "vitest";
import { campaignMeleeChaseSpeed, ENEMY_TYPES, type EnemyKind } from "./enemy-definitions";
import { ENEMY_TOP_CHASE_SPEED, MAX_PLAYER_MOVEMENT_SPEED, PLAYER_SPEED, enemyChaseSpeed } from "./rules";
import * as camps from "./enemy-camps";
import designs from "../src/game/map-designs.json";

it("keeps early enemies approachable and ramps later-map speed to a fixed cap", () => {
  expect(ENEMY_TYPES.Bramble.speed).toBe(205);
  expect(ENEMY_TYPES["Dune Raider"].speed).toBe(205);
  expect(ENEMY_TYPES["Frost Raider"].speed).toBe(230);
  expect(campaignMeleeChaseSpeed(11)).toBe(ENEMY_TOP_CHASE_SPEED);
  expect(campaignMeleeChaseSpeed(100)).toBe(ENEMY_TOP_CHASE_SPEED);
});

it("tops every chase out one step above a fully researched runner", () => {
  // Running is no longer a free escape: the fastest chasers gain on even a
  // finished build, and speed boots are what buy the last step back.
  expect(ENEMY_TOP_CHASE_SPEED).toBe(MAX_PLAYER_MOVEMENT_SPEED + 10);
  const overtaking = (Object.keys(ENEMY_TYPES) as EnemyKind[])
    .filter(kind => ENEMY_TYPES[kind].speed > ENEMY_TOP_CHASE_SPEED);
  expect(overtaking).toEqual([]);
});

describe("chase speed tracks the player in front of the enemy", () => {
  const researched = (rank: number) => PLAYER_SPEED * (1 + rank * .02);

  it("keeps the fastest enemies exactly the margin ahead, at every rank", () => {
    for (const rank of [0, 1, 5, 10, 15, 20]) {
      const player = researched(rank);
      expect(enemyChaseSpeed(ENEMY_TOP_CHASE_SPEED, player)).toBeCloseTo(player + 10, 6);
    }
  });

  it("puts the fastest chaser at the ceiling once research is finished", () => {
    expect(enemyChaseSpeed(ENEMY_TOP_CHASE_SPEED, MAX_PLAYER_MOVEMENT_SPEED)).toBeCloseTo(ENEMY_TOP_CHASE_SPEED, 6);
  });

  it("gives a slow-authored enemy the same pace as a fast one", () => {
    // The authored number used to scale the chase, so only an enemy written at
    // the very ceiling actually kept up and everything else chased slower than
    // the player it was chasing. A chaser is a chaser: it gains by the margin.
    const player = researched(20);
    expect(enemyChaseSpeed(205, player)).toBeCloseTo(player + 10, 6);
    expect(enemyChaseSpeed(205, player)).toBeCloseTo(enemyChaseSpeed(ENEMY_TOP_CHASE_SPEED, player), 6);
  });

  it("ignores speed boots, which are what buy the last step back", () => {
    // The reference is the researched speed, so the +25 is a real escape from
    // a chase that would otherwise be gaining by ten.
    const player = researched(20);
    expect(player + 25 - enemyChaseSpeed(ENEMY_TOP_CHASE_SPEED, player)).toBeCloseTo(15, 6);
  });

  it("falls back to the authored speed without a reference", () => {
    expect(enemyChaseSpeed(242, Number.NaN)).toBe(242);
    expect(enemyChaseSpeed(205, 0)).toBe(205);
    expect(enemyChaseSpeed(0, 200)).toBe(0);
  });
});

it.each([
  ["duskfall_orchard", camps.DUSKFALL_ORCHARD_CAMPS],
  ["neon_bastion", camps.NEON_BASTION_CAMPS],
  ["verdant_catacombs", camps.VERDANT_CATACOMBS_CAMPS],
  ["ion_citadel", camps.ION_CITADEL_CAMPS],
] as const)("puts most of %s's melee spawns at the chase ceiling", (id, fallback) => {
  const saved = (designs.maps as Record<string, { status: string; spawnCamps: camps.SpawnCamp[] }>)[id];
  const rows = saved?.status === "live" && saved.spawnCamps.length ? saved.spawnCamps : fallback;
  const enemies = rows.flatMap(camp => Array.from({ length: camp.count }, (_, index) => ENEMY_TYPES[camp.types[index % camp.types.length] as EnemyKind]));
  const melee = enemies.filter(enemy => !enemy.ranged);
  // A late map chases at the ceiling, which gains on even a maxed runner.
  expect(melee.filter(enemy => enemy.speed === ENEMY_TOP_CHASE_SPEED).length).toBeGreaterThanOrEqual(melee.length / 2);
  expect(enemies.every(enemy => enemy.speed <= ENEMY_TOP_CHASE_SPEED)).toBe(true);
});
