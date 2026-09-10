import { describe, expect, it } from 'vitest';
import { VERDANT_SPORES, verdantRootHits, verdantSporeHits, verdantSporeSites } from './verdant-attacks';

describe('Gravebloom escape geometry', () => {
  it('hits each root arm while leaving open wedges and range limits', () => {
    for (const angle of [-.62, 0, .62]) expect(verdantRootHits(700 * Math.cos(angle), 700 * Math.sin(angle), 0)).toBe(true);
    expect(verdantRootHits(700 * Math.cos(.31), 700 * Math.sin(.31), 0)).toBe(false);
    expect(verdantRootHits(-300, 0, 0)).toBe(false);
    expect(verdantRootHits(1100, 0, 0)).toBe(false);
    expect(verdantRootHits(0, 700, Math.PI / 2)).toBe(true);
  });
  it('leaves the spore ring center safe and alternates its staggered pods', () => {
    const sites = verdantSporeSites(1000, 2000, 0);
    expect(sites).toHaveLength(6);
    for (const [index, site] of sites.entries()) {
      expect(Math.hypot(site.x - 1000, site.y - 2000)).toBeCloseTo(260);
      expect(site.delay).toBeCloseTo(index * VERDANT_SPORES.stagger);
      expect(verdantSporeHits(260, 1.5, 1.7)).toBe(false);
    }
    expect(verdantSporeSites(1000, 2000, 1)[0]).not.toEqual(sites[0]);
    expect(verdantSporeHits(50, 1.5, 1.7)).toBe(true);
    expect(verdantSporeHits(50, 1.7, 1.8)).toBe(false);
    expect(verdantSporeHits(50, 0, 1.5)).toBe(false);
  });
});
