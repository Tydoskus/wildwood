export const NEON_LASER = { windup: 1.4, duration: .5, range: 930, halfWidth: 24, lanes: [-190, 0, 190] } as const;
export const NEON_EMP = { windup: 1.2, duration: 1.35, startRadius: 180, range: 900, halfWidth: 18, stagger: .55 } as const;

export function neonLaserHits(dx: number, dy: number, angle: number, playerRadius = 17) {
  const along = dx * Math.cos(angle) + dy * Math.sin(angle);
  const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return along >= 150 - playerRadius && along <= NEON_LASER.range + playerRadius
    && NEON_LASER.lanes.some(lane => Math.abs(across - lane) <= NEON_LASER.halfWidth + playerRadius);
}
export function neonEmpRadius(elapsed: number) {
  const progress = Math.max(0, Math.min(1, (elapsed - NEON_EMP.windup) / NEON_EMP.duration));
  return NEON_EMP.startRadius + (NEON_EMP.range - NEON_EMP.startRadius) * progress;
}
export function neonEmpHits(distance: number, previousElapsed: number, elapsed: number, playerRadius = 17) {
  if (elapsed < NEON_EMP.windup || previousElapsed > NEON_EMP.windup + NEON_EMP.duration) return false;
  const margin = NEON_EMP.halfWidth + playerRadius;
  return distance >= neonEmpRadius(previousElapsed) - margin && distance <= neonEmpRadius(elapsed) + margin;
}
