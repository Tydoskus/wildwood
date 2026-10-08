import { describe, expect, it } from 'vitest';
import { KITE_GAP, KITE_TUNING, chooseOrbit, evadePoint, orbitRadii, orbitStep, orbitTrail, planEvasion, shotDanger,
  type EvadeOptions, type Evasion, type KiteTuning, type Orbit, type OrbitOptions, type WakeZone } from './auto-farm-dodge';
import { createEnemySimulation } from './enemy-simulation';
import { createEnemyLifecycle } from './enemy-lifecycle';
import { WORLD } from '../constants';
import { ENEMY_CHASE_SPEED_MARGIN } from '../../../shared/rules';
import type { SpawnSite } from '../world';
import type { EnemyShot, EnemyState, PlayerState, Position } from './types';

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

describe('autofarm circle kite', () => {
  const speed = 200, chaseSpeed = speed + ENEMY_CHASE_SPEED_MARGIN;
  /** Every spot on a circle, this often. */
  const loop = (orbit: Orbit, count = 72) => Array.from({ length: count }, (_, index) => {
    const angle = index * 2 * Math.PI / count;
    return { x: orbit.x + Math.cos(angle) * orbit.r, y: orbit.y + Math.sin(angle) * orbit.r };
  });
  const orbitBase = (extra: Partial<OrbitOptions & { tuning: KiteTuning }> = {}): OrbitOptions & { tuning?: KiteTuning } => ({
    ...base({ speed }), chasers: [{ x: 1_080, y: 1_000, r: 14 }], orbit: null, chaseSpeed, maxRadius: 200, ...extra,
  });
  const runs = (plan: Evasion | null) => plan && 'orbit' in plan ? plan.orbit : null;

  it('runs a circle a settled chase never closes on: tight enough that a chaser turning slowly trails inside it', () => {
    // At 200 a second a chaser at 225 settles on a circle up to about 94 px across the centre; wider, it cuts across.
    expect(orbitTrail(80, speed, chaseSpeed)).toBeGreaterThan(50);
    expect(orbitTrail(110, speed, chaseSpeed)).toBeNull();
    const small = orbitRadii({ speed, chaseSpeed, r: 17, chasers: [{ x: 0, y: 0, r: 14 }], maxRadius: 200 });
    expect(small.band).not.toBeNull();
    expect(small.preferred).toBeGreaterThan(small.band![0]);
    expect(small.preferred).toBeLessThan(small.band![1]);
    // One too big to trail clear of the player at this speed has no circle that holds; a faster player has one.
    expect(orbitRadii({ speed, chaseSpeed, r: 17, chasers: [{ x: 0, y: 0, r: 45 }], maxRadius: 200 }).band).toBeNull();
    expect(orbitRadii({ speed: 300, chaseSpeed: 325, r: 17, chasers: [{ x: 0, y: 0, r: 45 }], maxRadius: 300 }).band).not.toBeNull();
    // A crowd strings out along the circle: it needs more room, until no circle holds and a wide loop is run instead.
    const crowd = (count: number) => orbitRadii({ speed, chaseSpeed, r: 17, chasers: Array.from({ length: count }, () => ({ x: 0, y: 0, r: 20 })), maxRadius: 200 });
    expect(crowd(3).band![1] - crowd(3).band![0]).toBeLessThan(crowd(1).band![1] - crowd(1).band![0]);
    expect(crowd(12).band).toBeNull();
    expect(crowd(12).preferred).toBeGreaterThan(crowd(1).preferred);
    // Never wider than the bow reaches.
    expect(crowd(12).radii.every(radius => radius <= 200)).toBe(true);
  });

  it('keeps the whole circle out of another camp\'s wake zone, and costs a little in its own', () => {
    // Another camp just past the chaser's side: the circle goes round the other way.
    const camp: WakeZone = { x: 1_000, y: 1_330, r: 257 };
    const orbit = chooseOrbit(orbitBase({ wake: [camp] }))!;
    expect(orbit).not.toBeNull();
    for (const point of loop(orbit)) expect(Math.hypot(point.x - camp.x, point.y - camp.y)).toBeGreaterThan(camp.r);
    // The farmed camp's own zone is no wall: a circle through it is allowed when nothing else is.
    const own = chooseOrbit(orbitBase({ wake: [{ x: 1_000, y: 1_000, r: 400, own: true }] }));
    expect(own).not.toBeNull();
    // With other camps all round, nowhere is safe: no circle at all.
    const ring = Array.from({ length: 8 }, (_, index): WakeZone => ({ x: 1_000 + Math.cos(index * Math.PI / 4) * 290, y: 1_000 + Math.sin(index * Math.PI / 4) * 290, r: 257 }));
    expect(chooseOrbit(orbitBase({ wake: ring }))).toBeNull();
  });

  it('keeps the circle inside the map and clear of portals and the boss', () => {
    // Backed against the left edge: the circle stays in.
    const edge = chooseOrbit(orbitBase({ from: { x: 40, y: 1_000 }, chasers: [{ x: 110, y: 1_000, r: 14 }] }))!;
    for (const point of loop(edge)) expect(point.x).toBeGreaterThanOrEqual(17);
    // A portal (or the boss's body) beside it: the circle never crosses it.
    const portal = { x: 1_000, y: 860, r: 90 };
    const standable = (point: Position) => !inside(point, portal);
    const clear = chooseOrbit(orbitBase({ standable }))!;
    for (const point of loop(clear)) expect(inside(point, portal)).toBe(false);
  });

  it('never runs into an attack in play: dodging wins, a circle out of it in time is fine', () => {
    // A hazard landing soon right where the circle would go: the circle chosen runs elsewhere.
    const hazard = { x: 1_000, y: 1_090, r: 70 };
    const orbit = chooseOrbit(orbitBase({ danger: landing(hazard, .5) }))!;
    const step = .05, at = (time: number) => {
      const angle = Math.atan2(1_000 - orbit.y, 1_000 - orbit.x) + orbit.dir * speed * time / orbit.r;
      return { x: orbit.x + Math.cos(angle) * orbit.r, y: orbit.y + Math.sin(angle) * orbit.r };
    };
    for (let time = .4; time <= 1; time += step) expect(inside(at(time), hazard)).toBe(false);
    // Standing in a hazard about to land, with no way round in time: no circle, the dodge takes over.
    const plan = planEvasion(orbitBase({ danger: landing({ x: 1_000, y: 1_000, r: 150 }, .05) }));
    expect(plan && 'to' in plan).toBe(true);
    expect(plan && 'to' in plan && plan.kiting).toBe(false);
  });

  it('never circles a wounded target it is finishing out of reach', () => {
    // A regen camp's archer, half down, 190 off: almost any circle carries the player out of a 200 reach of it.
    const archer = { x: 810, y: 1_000 };
    const orbitHold = (point: Position) => Math.hypot(point.x - archer.x, point.y - archer.y) <= 200;
    const orbit = chooseOrbit(orbitBase({ orbitHold }));
    if (orbit) for (const point of loop(orbit)) expect(orbitHold(point)).toBe(true);
    // Behind the player as it starts circling, the target stays in reach only on a circle bent its way: that one is run.
    const behind = { x: 800, y: 1_000 }, near = (point: Position) => Math.hypot(point.x - behind.x, point.y - behind.y) <= 201;
    const bent = chooseOrbit(orbitBase({ orbitHold: near }))!;
    for (const point of loop(bent)) expect(near(point)).toBe(true);
    // Where no circle can keep it (it is held to the player's own spot), none is run.
    expect(chooseOrbit(orbitBase({ orbitHold: point => Math.hypot(point.x - 1_000, point.y - 1_000) < 5 }))).toBeNull();
  });

  it('flips when the arc ahead is blocked: the circle turns the other way, carrying on in the direction it runs', () => {
    const kept: Orbit = { x: 1_000, y: 920, r: 80, dir: 1 };
    // It keeps the circle it runs while that stays clear...
    expect(chooseOrbit(orbitBase({ orbit: kept }))).toEqual(kept);
    // ...and with an attack about to land on the arc ahead, it curves the other way instead.
    const ahead = { x: 1_000 + Math.cos(Math.PI / 2 + .9) * 80, y: 920 + Math.sin(Math.PI / 2 + .9) * 80, r: 40 };
    const flipped = chooseOrbit(orbitBase({ orbit: kept, danger: landing(ahead, .6) }))!;
    expect(flipped.dir).toBe(-1);
    expect(flipped.x).toBeCloseTo(1_000);
    expect(flipped.y).toBeCloseTo(1_080);
  });

  it('starts once a chaser comes close, runs until none is near, and falls back to backing off with no safe circle', () => {
    const near = { x: 1_000 + 17 + 14 + KITE_TUNING.startGap - 10, y: 1_000, r: 14 };
    const far = { ...near, x: 1_000 + 17 + 14 + KITE_TUNING.startGap + 10 };
    expect(runs(planEvasion(orbitBase({ chasers: [near] })))).not.toBeNull();
    expect(planEvasion(orbitBase({ chasers: [far] }))).toBeNull();
    // Already circling, one a little further off keeps it going.
    expect(runs(planEvasion(orbitBase({ chasers: [far], orbit: { x: 1_000, y: 920, r: 80, dir: 1 } })))).not.toBeNull();
    // Hemmed in by other camps all round, it backs off (or stands) rather than circle into one.
    const ring = Array.from({ length: 8 }, (_, index): WakeZone => ({ x: 1_000 + Math.cos(index * Math.PI / 4) * 290, y: 1_000 + Math.sin(index * Math.PI / 4) * 290, r: 257 }));
    const close = { x: 1_040, y: 1_000, r: 14 };
    const fallback = planEvasion(orbitBase({ chasers: [close], wake: ring }));
    expect(fallback === null || 'to' in fallback).toBe(true);
    if (fallback && 'to' in fallback) for (const zone of ring) expect(Math.hypot(fallback.to.x - zone.x, fallback.to.y - zone.y)).toBeGreaterThan(zone.r);
  });

  it('kites a crowd on a wider loop, and stands with more chasers than its tuning allows', () => {
    const crowd = Array.from({ length: 8 }, (_, index) => ({ x: 1_060 + (index % 4) * 30, y: 980 + Math.floor(index / 4) * 40, r: 20 }));
    const single = runs(planEvasion(orbitBase()))!;
    const wide = runs(planEvasion(orbitBase({ chasers: crowd })))!;
    expect(wide.r).toBeGreaterThan(single.r);
    expect(planEvasion(orbitBase({ chasers: crowd, tuning: { ...KITE_TUNING, maxChasers: 3 } }))).toBeNull();
    // Off and back-off never circle.
    expect(planEvasion(orbitBase({ tuning: { ...KITE_TUNING, mode: 'off' } }))).toBeNull();
    expect(runs(planEvasion(orbitBase({ chasers: [{ x: 1_040, y: 1_000, r: 14 }], tuning: { ...KITE_TUNING, mode: 'back-off' } })))).toBeNull();
  });

  it('against the real chase, keeps one or a few melee enemies off a bow inside a small circle, where standing takes every blow', () => {
    /** Real enemies chase a player who plans as the farm does (every tenth of a second, steering each frame). */
    function fight(count: number, kite: boolean) {
      WORLD.w = 6_000; WORLD.h = 6_000;
      const enemies: EnemyState[] = [], sites: SpawnSite[] = [];
      for (let index = 0; index < count; index++) sites.push({ id: index, x: 3_400 + index * 40, y: 3_000 + index * 25, campName: 'c', type: 'Bramble', leashRange: 2_000, alive: false, respawnAt: 0 });
      const lifecycle = createEnemyLifecycle(enemies, sites, () => {});
      for (const site of sites) lifecycle.spawnFromSite(site);
      const player = { x: 3_000, y: 3_000, r: 17, attackRange: 200 } as PlayerState;
      let hits = 0, hurt = 0, clock = 1e12, orbit: Orbit | null = null, to: Position | null = null, replan = 0, furthest = 0;
      const simulation = createEnemySimulation(enemies, () => {}, player, () => ({ width: 1_280, height: 720, zoom: 1 }), lifecycle.engageEnemy,
        () => { if (hurt > 0) return false; hurt = .1; hits++; return true; }, { serverNowMs: () => clock, playerMovementSpeed: () => speed, pullAggro: () => true });
      const dt = 1 / 60;
      for (let frame = 0; frame < 60 * 60; frame++) {
        hurt = Math.max(0, hurt - dt);
        if (kite && (replan -= dt) <= 0) {
          replan = .1;
          const plan = planEvasion({ ...base({ from: { x: player.x, y: player.y }, speed, standable: () => true }), chasers: enemies.filter(enemy => enemy.engaged), orbit, chaseSpeed, maxRadius: 200 });
          orbit = runs(plan); to = plan && 'to' in plan ? plan.to : null;
        }
        const goal = orbit ? orbitStep(orbit, player, speed) : to;
        if (goal) {
          const length = Math.hypot(goal.x - player.x, goal.y - player.y), share = Math.min(1, length / (speed * dt));
          if (length > 0) { player.x += (goal.x - player.x) / length * share * speed * dt; player.y += (goal.y - player.y) / length * share * speed * dt; }
        }
        simulation.update(dt);
        clock += dt * 1_000;
        furthest = Math.max(furthest, Math.hypot(player.x - 3_000, player.y - 3_000));
      }
      return { hits, furthest };
    }
    for (const count of [1, 3]) {
      const stood = fight(count, false), kited = fight(count, true);
      // Standing, each lands a blow a second; circling, almost none over the minute.
      expect(stood.hits, `${count} standing`).toBeGreaterThan(50 * count);
      expect(kited.hits, `${count} kited`).toBeLessThanOrEqual(2);
      // And it never runs off across the map: the circle stays where the fight is.
      expect(kited.furthest, `${count} kited`).toBeLessThan(450);
    }
  });
});
