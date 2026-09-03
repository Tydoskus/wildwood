import type { EnemySpriteAnimationLayout, EnemySpriteMotion } from "../enemy-sprite-layouts.mjs";
import type { EnemyState } from "./types";

export function enemyAnimationFrame(motion: EnemySpriteMotion, elapsedMs: number) {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const index = Math.floor(elapsed / motion.frameDurationMs);
  return motion.frames[motion.loop ? index % motion.frames.length : Math.min(index, motion.frames.length - 1)];
}

type AnimatedEnemy = Pick<EnemyState, "x" | "y" | "vx" | "vy" | "phase" | "dead" | "attackAnimationElapsed" | "remoteCombatDeathProgress">;
type MotionKey = keyof EnemySpriteAnimationLayout["animations"];
type Playback = {
  x: number; y: number; time: number; movingUntil: number;
  motion: MotionKey; motionStarted: number;
  frame: EnemySpriteMotion["frames"][number];
};

/** Presentation only: never delays an attack or decides whether it hits. */
export function createEnemyAnimationSampler() {
  const playback = new WeakMap<AnimatedEnemy, Playback>();
  return (enemy: AnimatedEnemy, animation: EnemySpriteAnimationLayout, time: number, attackSpeed: number) => {
    let state = playback.get(enemy);
    if (!state) {
      state = {
        x: enemy.x, y: enemy.y, time, movingUntil: -Infinity,
        motion: "idle", motionStarted: time - Math.abs(enemy.phase % 1),
        frame: animation.animations.idle.frames[0],
      };
      playback.set(enemy, state);
    }
    // Freeze the current pose beneath the existing squash/fade death effect.
    if (enemy.dead || (enemy.remoteCombatDeathProgress ?? 0) > 0) return state.frame;
    const dt = time - state.time;
    const moved = dt > 0 && dt < .25 && Math.hypot(enemy.x - state.x, enemy.y - state.y) > .01;
    if (moved || Math.hypot(enemy.vx, enemy.vy) > 4) state.movingUntil = time + .08;
    const attack = animation.animations.attack;
    const attackDuration = Math.min(attack.durationMs / 1_000, .8 / Math.max(.01, attackSpeed));
    const attackElapsed = enemy.attackAnimationElapsed;
    const attacking = attackElapsed !== undefined && attackElapsed >= 0 && attackElapsed < attackDuration;
    const motion: MotionKey = attacking ? "attack" : state.movingUntil > time ? "walk" : "idle";
    if (motion !== state.motion) {
      state.motion = motion;
      state.motionStarted = time;
    }
    state.frame = enemyAnimationFrame(animation.animations[motion], attacking
      ? attackElapsed / attackDuration * attack.durationMs
      : (time - state.motionStarted) * 1_000);
    state.x = enemy.x; state.y = enemy.y; state.time = time;
    return state.frame;
  };
}
