import { expect, it } from "vitest";
import { campaignMeleeChaseSpeed, ENEMY_TYPES, type EnemyKind } from "./enemy-definitions";
import { ENEMY_TOP_CHASE_SPEED, MAX_PLAYER_MOVEMENT_SPEED } from "./rules";
import * as camps from "./enemy-camps";
import designs from "../src/game/map-designs.json";

it("keeps early enemies approachable and ramps later-map speed to a fixed cap", () => {
  expect(ENEMY_TYPES.Bramble.speed).toBe(205);
  expect(ENEMY_TYPES["Dune Raider"].speed).toBe(205);
  expect(ENEMY_TYPES["Frost Raider"].speed).toBe(230);
  expect(campaignMeleeChaseSpeed(11)).toBe(ENEMY_TOP_CHASE_SPEED);
  expect(campaignMeleeChaseSpeed(100)).toBe(ENEMY_TOP_CHASE_SPEED);
});

it("tops every chase out one step under a fully researched runner", () => {
  expect(ENEMY_TOP_CHASE_SPEED).toBe(MAX_PLAYER_MOVEMENT_SPEED - 10);
  const overtaking = (Object.keys(ENEMY_TYPES) as EnemyKind[])
    .filter(kind => ENEMY_TYPES[kind].speed > ENEMY_TOP_CHASE_SPEED);
  expect(overtaking).toEqual([]);
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
  // A late map chases at the ceiling, so a maxed runner keeps its last step
  // and everyone still building loses ground.
  expect(melee.filter(enemy => enemy.speed === ENEMY_TOP_CHASE_SPEED).length).toBeGreaterThanOrEqual(melee.length / 2);
  expect(enemies.every(enemy => enemy.speed < MAX_PLAYER_MOVEMENT_SPEED)).toBe(true);
});
