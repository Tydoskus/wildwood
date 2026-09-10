import { describe, expect, it } from 'vitest';
import { ION_BURSTS, ionBurstHits, ionBurstSites, ionSweepHits } from './ion-attacks';

describe('Aegis Prime escape geometry', () => {
  it('covers the frontal shield sector while leaving the rear and outside safe', () => {
    expect(ionSweepHits(400, 0, 0)).toBe(true);
    expect(ionSweepHits(400 * Math.cos(.8), 400 * Math.sin(.8), 0)).toBe(true);
    expect(ionSweepHits(-400, 0, 0)).toBe(false);
    expect(ionSweepHits(0, 400, 0)).toBe(false);
    expect(ionSweepHits(750, 0, 0)).toBe(false);
    expect(ionSweepHits(0, 0, 0)).toBe(false);
    expect(ionSweepHits(0, 400, Math.PI / 2)).toBe(true);
  });
  it('targets three staggered points and rotates every other volley', () => {
    const points = ionBurstSites(1000, 500, 0, { x: 500, y: 500 });
    expect(points.map(p => p.x)).toEqual([790, 1000, 1210]);
    expect(points.every(p => p.y === 500)).toBe(true);
    expect(points.map(p => p.delay)).toEqual([0, ION_BURSTS.stagger, ION_BURSTS.stagger * 2]);
    const rotated = ionBurstSites(1000, 500, 1, { x: 500, y: 500 });
    expect(rotated[0].y).toBeCloseTo(290);
    expect(rotated[2].y).toBeCloseTo(710);
    expect(ionBurstHits(40, 1.2, 1.4)).toBe(true);
    expect(ionBurstHits(140, 1.2, 1.4)).toBe(false);
    expect(ionBurstHits(40, 1.4, 1.5)).toBe(false);
  });
});
