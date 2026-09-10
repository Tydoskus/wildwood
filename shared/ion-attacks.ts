/** A frontal shield arc leaves the rear open; staggered bursts punish standing still. */
export const ION_SWEEP = { windup: 1.45, duration: .55, range: 690, innerRange: 175, halfAngle: 1.02 } as const;
export const ION_BURSTS = { windup: 1.35, duration: .4, range: 95, count: 3, spacing: 210, stagger: .24 } as const;

export function ionSweepHits(dx: number, dy: number, angle: number, playerRadius = 17) {
  const distance = Math.hypot(dx, dy);
  if (distance < ION_SWEEP.innerRange - playerRadius || distance > ION_SWEEP.range + playerRadius) return false;
  const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
  return Math.abs(delta) <= ION_SWEEP.halfAngle + Math.asin(Math.min(1, playerRadius / Math.max(1, distance)));
}
export function ionBurstHits(distance: number, previousElapsed: number, elapsed: number, playerRadius = 17) {
  return previousElapsed < ION_BURSTS.windup && elapsed >= ION_BURSTS.windup
    && distance <= ION_BURSTS.range + playerRadius;
}
export function ionBurstSites(x: number, y: number, patternIndex: number, origin = { x: 4050, y: 4050 }) {
  // Alternating volleys line up along or across the direction to the target.
  const angle = Math.atan2(y - origin.y, x - origin.x) + (patternIndex % 2) * Math.PI / 2;
  return Array.from({ length: ION_BURSTS.count }, (_, i) => ({
    x: x + Math.cos(angle) * (i - 1) * ION_BURSTS.spacing,
    y: y + Math.sin(angle) * (i - 1) * ION_BURSTS.spacing,
    delay: i * ION_BURSTS.stagger,
  }));
}
