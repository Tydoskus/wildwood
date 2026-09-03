import { describe, expect, it } from "vitest";
import { ENEMY_SPRITE_LAYOUTS } from "../enemy-sprite-layouts.mjs";
import { createEnemyAnimationSampler, enemyAnimationFrame } from "./enemy-animation";

const animation = ENEMY_SPRITE_LAYOUTS["Fen Prowler"].animation!;
const actor = () => ({
  x: 0, y: 0, vx: 0, vy: 0, phase: 0, dead: false,
  remoteCombatDeathProgress: 0, attackAnimationElapsed: undefined as number | undefined,
});

describe("enemy atlas animation", () => {
  it("loops idle/walk and holds one-shot attacks on their final frame", () => {
    for (const key of ["idle", "walk"] as const) {
      const motion = animation.animations[key];
      expect(enemyAnimationFrame(motion, 0)).toBe(motion.frames[0]);
      expect(enemyAnimationFrame(motion, motion.frameDurationMs + .001)).toBe(motion.frames[1]);
      expect(enemyAnimationFrame(motion, motion.durationMs + .001)).toBe(motion.frames[0]);
      expect(enemyAnimationFrame(motion, -100)).toBe(motion.frames[0]);
      expect(enemyAnimationFrame(motion, NaN)).toBe(motion.frames[0]);
    }
    const attack = animation.animations.attack;
    expect(enemyAnimationFrame(attack, attack.durationMs * 5)).toBe(attack.frames.at(-1));
  });

  it("switches to walking from actual movement, including ambient motion without velocity", () => {
    const sample = createEnemyAnimationSampler();
    const enemy = actor();
    expect(sample(enemy, animation, 0, 1)).toBe(animation.animations.idle.frames[0]);
    enemy.x += 1;
    expect(sample(enemy, animation, .05, 1)).toBe(animation.animations.walk.frames[0]);
    enemy.x += 1;
    expect(sample(enemy, animation, .15, 1)).toBe(animation.animations.walk.frames[1]);
    expect(sample(enemy, animation, .4, 1)).toBe(animation.animations.idle.frames[0]);
  });

  it("plays actual attacks without changing combat state, and returns before the next strike", () => {
    const sample = createEnemyAnimationSampler();
    const enemy = actor();
    sample(enemy, animation, 0, 2);
    enemy.attackAnimationElapsed = 0;
    const before = { ...enemy };
    expect(sample(enemy, animation, .1, 2)).toBe(animation.animations.attack.frames[0]);
    expect(enemy).toEqual(before);
    enemy.attackAnimationElapsed = .2;
    expect(sample(enemy, animation, .3, 2)).toBe(animation.animations.attack.frames[5]);
    enemy.attackAnimationElapsed = .41;
    expect(sample(enemy, animation, .51, 2)).toBe(animation.animations.idle.frames[0]);
    enemy.attackAnimationElapsed = 0;
    expect(sample(enemy, animation, .6, 2)).toBe(animation.animations.attack.frames[0]);
  });

  it("freezes the current frame underneath the existing death effect and resets on respawn", () => {
    const sample = createEnemyAnimationSampler();
    const enemy = actor();
    sample(enemy, animation, 0, 1);
    const last = sample(enemy, animation, .2, 1);
    enemy.remoteCombatDeathProgress = .3;
    expect(sample(enemy, animation, .6, 1)).toBe(last);
    enemy.dead = true;
    expect(sample(enemy, animation, 2, 1)).toBe(last);
    expect(sample(actor(), animation, 2, 1)).toBe(animation.animations.idle.frames[0]);
  });
});
