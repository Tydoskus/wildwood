import { describe, expect, it } from 'vitest';
import { KITE_GAP, evadePoint, shotDanger, type EvadeOptions } from './auto-farm-dodge';
import type { EnemyShot, Position } from './types';

const inside = (point: Position, circle: { x: number; y: number; r: number }) => Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.r;
/** A ground hazard landing `at` seconds from now: what a boss's rain or burst is to danger(). */
const landing = (circle: { x: number; y: number; r: number }, at: number) => (point: Position) => inside(point, circle) ? at : Infinity;
const base = (extra: Partial<EvadeOptions> = {}): EvadeOptions => ({
  from: { x: 1_000, y: 1_000 }, speed: 200, r: 17,
  standable: point => point.x >= 17 && point.y >= 17 && point.x <= 4_000 && point.y <= 4_000,
  danger: () => Infinity, chasers: [], inReach: () => true, ...extra,
});

describe('autofarm dodging', () => {
  it('carries on when nothing threatens it', () => {
    expect(evadePoint(base())).toBeNull();
  });

  it('steps out of a hazard to the nearest safe spot, in time', () => {
    const hazard = { x: 1_000, y: 1_000, r: 80 };
    const step = evadePoint(base({ danger: landing(hazard, .4) }))!;
    expect(inside(step, hazard)).toBe(false);
    // The nearest way out: just past the edge, which is reached well before it lands.
    expect(Math.hypot(step.x - 1_000, step.y - 1_000)).toBeLessThan(140);
  });

  it('carries on until nearly time to go: a shot from across the map is sidestepped as it arrives', () => {
    const hazard = { x: 1_000, y: 1_000, r: 80 };
    // The way out takes about half a second; with two to spare it waits.
    expect(evadePoint(base({ danger: landing(hazard, 2) }))).toBeNull();
    expect(evadePoint(base({ danger: landing(hazard, .6) }))).not.toBeNull();
  });

  it('keeps its target in reach when a spot in reach is safe, even a little further away', () => {
    const hazard = { x: 1_000, y: 1_000, r: 80 };
    const boss = { x: 1_300, y: 1_000 };
    const inReach = (point: Position) => Math.hypot(point.x - boss.x, point.y - boss.y) <= 260;
    const step = evadePoint(base({ danger: landing(hazard, .4), inReach }))!;
    expect(inside(step, hazard)).toBe(false);
    expect(inReach(step)).toBe(true);
  });

  it('never steps where it cannot stand: off the map, into the boss or a portal', () => {
    const hazard = { x: 30, y: 1_000, r: 120 };
    const portal = { x: 160, y: 1_000, r: 60 };
    const standable = (point: Position) => point.x >= 17 && point.y >= 17 && !inside(point, portal);
    const step = evadePoint(base({ from: { x: 40, y: 1_000 }, danger: landing(hazard, .4), standable }))!;
    expect(standable(step)).toBe(true);
    expect(inside(step, hazard)).toBe(false);
  });

  it('does not cross a hazard that lands as it passes, when a clean way out exists', () => {
    // Standing in one hazard; a second lands just beside it, right when a walk through it would be there.
    const here = { x: 1_000, y: 1_000, r: 70 }, beside = { x: 1_150, y: 1_000, r: 90 };
    const danger = (point: Position) => Math.min(landing(here, .4)(point), landing(beside, .3)(point));
    const step = evadePoint(base({ danger }))!;
    expect(danger(step)).toBe(Infinity);
    // The walk there never passes through the second hazard.
    for (let share = 0; share <= 1; share += .05) {
      const point = { x: 1_000 + (step.x - 1_000) * share, y: 1_000 + (step.y - 1_000) * share };
      expect(inside(point, beside)).toBe(false);
    }
  });

  it('crosses the least of it when there is no clean way out, and stays when there is no safe spot at all', () => {
    // Every way out crosses a ring landing almost at once: it still goes, through the least of it.
    const here = { x: 1_000, y: 1_000, r: 60 };
    const ring = (point: Position) => { const d = Math.hypot(point.x - 1_000, point.y - 1_000); return d <= 60 ? 1 : d <= 200 ? .05 : Infinity; };
    const step = evadePoint(base({ danger: point => Math.min(landing(here, 1)(point), ring(point)) }));
    expect(step).not.toBeNull();
    expect(ring(step!)).toBe(Infinity);
    // A web that reaches everywhere it could go: it keeps shooting where it is.
    expect(evadePoint(base({ danger: () => .3 }))).toBeNull();
  });

  it('steps off the line of an enemy shot', () => {
    const shot: EnemyShot = { x: 850, y: 1_000, r: 6, vx: 495, vy: 0, damage: 1, life: 4 };
    const danger = (point: Position) => shotDanger([shot], point, 17 + 12);
    expect(danger({ x: 1_000, y: 1_000 })).toBeCloseTo((150 - 35) / 495, 2);
    const step = evadePoint(base({ danger }))!;
    expect(danger(step)).toBe(Infinity);
    expect(Math.abs(step.y - 1_000)).toBeGreaterThan(35);
  });
});

describe('enemy shots', () => {
  const shot = (extra: Partial<EnemyShot>): EnemyShot => ({ x: 0, y: 0, r: 6, vx: 100, vy: 0, damage: 1, life: 4, ...extra });
  it('says when a straight shot reaches a spot, and never for one flying away, past its life, or wide', () => {
    expect(shotDanger([shot({})], { x: 206, y: 0 }, 6)).toBeCloseTo(1.94);
    expect(shotDanger([shot({ vx: -100 })], { x: 206, y: 0 }, 6)).toBe(Infinity);
    expect(shotDanger([shot({ life: 1 })], { x: 206, y: 0 }, 6)).toBe(Infinity);
    expect(shotDanger([shot({})], { x: 206, y: 40 }, 6)).toBe(Infinity);
    // One already touching lands now, a stopped one included (it waits out the hurt window).
    expect(shotDanger([shot({ vx: 0 })], { x: 5, y: 0 }, 6)).toBe(0);
    expect(shotDanger([shot({ life: 0 })], { x: 5, y: 0 }, 6)).toBe(Infinity);
  });
});

describe('autofarm kiting', () => {
  const chaser = { x: 1_040, y: 1_000, r: 20 };
  it('backs away from a melee enemy closing in, still in reach of its target', () => {
    const target = { x: 1_040, y: 1_000 };
    const inReach = (point: Position) => Math.hypot(point.x - target.x, point.y - target.y) <= 200 + 20;
    const step = evadePoint(base({ chasers: [chaser], inReach }))!;
    expect(step.x).toBeLessThan(1_000);
    expect(Math.hypot(step.x - chaser.x, step.y - chaser.y) - chaser.r - 17).toBeGreaterThan(KITE_GAP);
    expect(inReach(step)).toBe(true);
  });

  it('leaves one outside the gap alone', () => {
    expect(evadePoint(base({ chasers: [{ ...chaser, x: 1_000 + 17 + 20 + KITE_GAP + 5 }] }))).toBeNull();
  });

  it('slides along the edge of the map when backed against it', () => {
    const step = evadePoint(base({ from: { x: 20, y: 1_000 }, chasers: [{ ...chaser, x: 60 }] }))!;
    expect(step.x).toBeGreaterThanOrEqual(17);
    expect(Math.abs(step.y - 1_000)).toBeGreaterThan(40);
  });

  it('never kites into an attack about to land', () => {
    // Straight back is where a hazard is about to land: it backs away to one side of it instead.
    const hazard = { x: 800, y: 1_000, r: 150 };
    const step = evadePoint(base({ chasers: [chaser], danger: landing(hazard, 2) }))!;
    expect(inside(step, hazard)).toBe(false);
    expect(Math.hypot(step.x - chaser.x, step.y - chaser.y) - chaser.r - 17).toBeGreaterThan(KITE_GAP);
  });
});
