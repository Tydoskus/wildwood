import { describe, expect, it } from "vitest";
import { createEnemySimulation } from "./enemy-simulation";
import type { EnemyState, PlayerState } from "./types";

function playerAt(x: number, y: number): PlayerState {
  return {
    x, y, r: 18, speed: 0, hp: 100, maxHp: 100, damage: 1, attackRate: 1,
    projectileSpeed: 1, projectileCount: 1, attackRange: 155, knockback: 0,
    armor: 0, regen: 0, attackClock: 0, throwClock: 0, hurtClock: 0, facing: 0, moving: false,
  };
}

function idleEnemyAt(x: number, y: number): EnemyState {
  return {
    type: "Bramble", siteId: 1, campName: "TEST", x, y, homeX: x, homeY: y,
    vx: 0, vy: 0, r: 14, hp: 42, maxHp: 42, speed: 210, damage: 14,
    reward: { type: "health", amount: 28 }, aggroRadius: 0, leashRange: 420,
    engaged: false, leashing: false, facingX: 1, wandering: false,
    wanderTargetX: x, wanderTargetY: y, wanderWait: 99, attackClock: 0,
    moveSpeedRecovery: 3, hurt: 0, dead: false, phase: 0, idleUpdateElapsed: 0,
  };
}

describe("enemy simulation LOD", () => {
  it("ticks far idle enemies at the reduced cadence while nearby enemies stay full rate", () => {
    const near = idleEnemyAt(100, 100);
    const far = idleEnemyAt(3_000, 3_000);
    const player = playerAt(100, 100);
    const simulation = createEnemySimulation(
      [near, far], () => {}, player, () => ({ width: 320, height: 600, zoom: 1 }), () => {}, () => false,
    );

    simulation.update(1 / 60);

    expect(near.phase).toBeCloseTo(.05);
    expect(far.phase).toBe(0);
    expect(far.idleUpdateElapsed).toBeCloseTo(1 / 60);
  });

  it("separates overlapping enemies across a grid-cell boundary", () => {
    const left = idleEnemyAt(127, 200);
    const right = idleEnemyAt(130, 200);
    right.siteId = 2;
    const simulation = createEnemySimulation(
      [left, right], () => {}, playerAt(300, 300), () => ({ width: 600, height: 600, zoom: 1 }), () => {}, () => false,
    );

    simulation.update(1 / 60);

    expect(Math.hypot(right.x - left.x, right.y - left.y)).toBeCloseTo((left.r + right.r) * .72);
  });
});
