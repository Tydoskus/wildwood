/** Three root arms leave two broad escape wedges; pods bloom around a safe center. */
export const VERDANT_ROOTS = { windup: 1.5, duration: .65, range: 980, halfWidth: 32, angles: [-.62, 0, .62] } as const;
export const VERDANT_SPORES = { windup: 1.6, duration: .45, range: 88, ringRadius: 260, count: 6, stagger: .12 } as const;

export function verdantRootHits(dx: number, dy: number, angle: number, playerRadius = 17) {
  return VERDANT_ROOTS.angles.some(offset => {
    const a = angle + offset;
    const along = dx * Math.cos(a) + dy * Math.sin(a);
    const across = -dx * Math.sin(a) + dy * Math.cos(a);
    return along >= 150 - playerRadius && along <= VERDANT_ROOTS.range + playerRadius
      && Math.abs(across) <= VERDANT_ROOTS.halfWidth + playerRadius;
  });
}
export function verdantSporeHits(distance: number, previousElapsed: number, elapsed: number, playerRadius = 17) {
  return previousElapsed < VERDANT_SPORES.windup && elapsed >= VERDANT_SPORES.windup
    && distance <= VERDANT_SPORES.range + playerRadius;
}
export function verdantSporeSites(x: number, y: number, patternIndex: number) {
  return Array.from({ length: VERDANT_SPORES.count }, (_, index) => {
    const angle = index * Math.PI * 2 / VERDANT_SPORES.count + (patternIndex % 2) * Math.PI / 6;
    return { x: x + Math.cos(angle) * VERDANT_SPORES.ringRadius, y: y + Math.sin(angle) * VERDANT_SPORES.ringRadius,
      delay: index * VERDANT_SPORES.stagger };
  });
}
