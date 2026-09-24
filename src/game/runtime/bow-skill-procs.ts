import {
  ARROW_STORM_ARROWS, ARROW_STORM_RADIUS, PIERCING_SHOT_MAX_EXTRA_TARGETS, RICOCHET_MAX_BOUNCES, RICOCHET_RADIUS,
  type ArrowSkillProcs,
} from "../../../shared/bow-skills";

// Where the three bow skills land once an arrow hits something. Pure: the
// combat controller owns damage, visuals and the random source, so the rules
// here can be tested with a fixed sequence.

export type SkillTarget = {
  x: number; y: number; r: number; dead: boolean;
  isBoss?: boolean; generatedBoss?: boolean; remoteCombatGhost?: boolean;
};

const isBossTarget = (target: SkillTarget) => Boolean(target.isBoss || target.generatedBoss);

/**
 * Enemies a skill may reach besides what the arrow itself hit: live regular
 * enemies this player is fighting. A boss is never a second target; the only
 * skill that adds to a boss is Arrow Storm, on the boss the arrow hit.
 */
export function isSkillSecondaryTarget(target: SkillTarget) {
  return !target.dead && !isBossTarget(target) && !target.remoteCombatGhost;
}

const edgeDistance = (x: number, y: number, target: SkillTarget) => Math.hypot(target.x - x, target.y - y) - target.r;

/** Whether a Piercing Shot arrow that has already struck `struck` enemies carries on through this one. */
export function arrowPassesThrough(procs: ArrowSkillProcs | null | undefined, target: SkillTarget, struck: number) {
  return Boolean(procs?.piercingShot) && !isBossTarget(target) && struck < PIERCING_SHOT_MAX_EXTRA_TARGETS;
}

/**
 * Arrow Storm: ARROW_STORM_ARROWS more arrows fall where the arrow hit. On a
 * boss every one lands on the boss. Otherwise each lands on a random live
 * enemy within ARROW_STORM_RADIUS of the impact, the one hit included while it
 * lives, chosen after the previous arrow has landed so none falls on a corpse;
 * with nobody left, the rest land on the ground. `strike` gets null for those.
 */
export function rainArrowStorm<T extends SkillTarget>(
  center: { x: number; y: number }, primary: T, enemies: readonly T[],
  random: () => number, strike: (target: T | null, x: number, y: number) => void,
) {
  const candidates = isBossTarget(primary) ? [] : enemies.filter(enemy =>
    (enemy === primary || isSkillSecondaryTarget(enemy)) && edgeDistance(center.x, center.y, enemy) <= ARROW_STORM_RADIUS);
  for (let arrow = 0; arrow < ARROW_STORM_ARROWS; arrow++) {
    if (isBossTarget(primary)) {
      if (primary.dead) return;
      strike(primary, center.x, center.y);
      continue;
    }
    const alive = candidates.filter(enemy => !enemy.dead);
    const pick = random();
    if (!alive.length) {
      const angle = pick * Math.PI * 2;
      strike(null, center.x + Math.cos(angle) * ARROW_STORM_RADIUS * .5, center.y + Math.sin(angle) * ARROW_STORM_RADIUS * .5);
      continue;
    }
    const target = alive[Math.min(alive.length - 1, Math.floor(pick * alive.length))];
    strike(target, target.x, target.y);
  }
}

/**
 * Ricochet: the arrow bounces from what it hit to the nearest live enemy
 * within RICOCHET_RADIUS it has not hit yet, then on from there, up to
 * RICOCHET_MAX_BOUNCES times. Nothing bounces off a boss.
 */
export function ricochetChain<T extends SkillTarget>(first: SkillTarget, enemies: readonly T[]): T[] {
  if (isBossTarget(first)) return [];
  const chain: T[] = [];
  const struck = new Set<SkillTarget>([first]);
  let from: SkillTarget = first;
  for (let bounce = 0; bounce < RICOCHET_MAX_BOUNCES; bounce++) {
    let best: T | null = null, bestDistance = Infinity;
    for (const enemy of enemies) {
      if (struck.has(enemy) || !isSkillSecondaryTarget(enemy)) continue;
      const distance = edgeDistance(from.x, from.y, enemy);
      if (distance <= RICOCHET_RADIUS && distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    if (!best) break;
    chain.push(best);
    struck.add(best);
    from = best;
  }
  return chain;
}
