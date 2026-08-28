import { WORLD } from "../constants";
import { clamp } from "../math";
import type { EnemyState } from "./types";

export const ENEMY_CROWD_SPACING_RATIO = .72;
const CROWD_SEPARATION_PASSES = 2;
const EXACT_OVERLAP_DIRECTIONS = [
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
] as const;

type CanSeparate = (left: EnemyState, right: EnemyState) => boolean;

function exactOverlapDirection(left: EnemyState, right: EnemyState) {
  if (Number.isFinite(left.combatTargetX) && Number.isFinite(left.combatTargetY)) {
    const radialX = left.x - Number(left.combatTargetX);
    const radialY = left.y - Number(left.combatTargetY);
    const radialDistance = Math.hypot(radialX, radialY);
    if (radialDistance > .001) {
      const sign = left.siteId <= right.siteId ? 1 : -1;
      return { x: -radialY / radialDistance * sign, y: radialX / radialDistance * sign };
    }
  }
  const low = Math.min(left.siteId, right.siteId);
  const high = Math.max(left.siteId, right.siteId);
  const index = (Math.imul(low + 1, 31) + high) & 3;
  const [baseX, baseY] = EXACT_OVERLAP_DIRECTIONS[index];
  const sign = left.siteId <= right.siteId ? 1 : -1;
  return { x: baseX * sign, y: baseY * sign };
}

/** Deterministically restores the soft spacing used by active enemy crowds. */
export function separateEnemyCrowd(
  enemies: readonly EnemyState[],
  canSeparate: CanSeparate = () => true,
) {
  for (let pass = 0; pass < CROWD_SEPARATION_PASSES; pass += 1) {
    for (let leftIndex = 0; leftIndex < enemies.length; leftIndex += 1) {
      const left = enemies[leftIndex];
      if (left.dead) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < enemies.length; rightIndex += 1) {
        const right = enemies[rightIndex];
        if (right.dead || !canSeparate(left, right)) continue;
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const minimumDistance = (left.r + right.r) * ENEMY_CROWD_SPACING_RATIO;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= minimumDistance * minimumDistance) continue;

        const distance = Math.sqrt(distanceSquared);
        const direction = distance > .001
          ? { x: dx / distance, y: dy / distance }
          : exactOverlapDirection(left, right);
        const push = (minimumDistance - distance) * .5;
        left.x = clamp(left.x - direction.x * push, left.r, WORLD.w - left.r);
        left.y = clamp(left.y - direction.y * push, left.r, WORLD.h - left.r);
        right.x = clamp(right.x + direction.x * push, right.r, WORLD.w - right.r);
        right.y = clamp(right.y + direction.y * push, right.r, WORLD.h - right.r);
      }
    }
  }
}
