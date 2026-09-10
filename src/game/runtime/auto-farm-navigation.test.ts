import { expect, it } from 'vitest';
import { farmRoute } from './auto-farm-navigation';
import type { Circle, Position } from './types';

function clearance(a: Position, b: Position, o: Circle) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a.x + t * dx - o.x, a.y + t * dy - o.y);
}
it('takes a direct route when nothing blocks it', () => {
  expect(farmRoute({ x: 100, y: 100 }, { x: 800, y: 100 }, [], { w: 1000, h: 1000 }, 20)).toEqual([{ x: 800, y: 100 }]);
});
it('routes around a boss and portal without crossing their avoidance circles', () => {
  const start = { x: 100, y: 500 }, goal = { x: 900, y: 500 };
  const obstacles = [{ x: 400, y: 500, r: 150 }, { x: 720, y: 460, r: 100 }];
  const path = farmRoute(start, goal, obstacles, { w: 1000, h: 1000 }, 20);
  expect(path.length).toBeGreaterThan(1);
  expect(path.at(-1)).toEqual(goal);
  let previous = start;
  for (const point of path) {
    for (const obstacle of obstacles) expect(clearance(previous, point, obstacle)).toBeGreaterThanOrEqual(obstacle.r - .001);
    previous = point;
  }
});
it('can exit an avoidance circle but cannot route to a goal inside one', () => {
  const obstacle = { x: 500, y: 500, r: 150 };
  expect(farmRoute({ x: 500, y: 500 }, { x: 900, y: 500 }, [obstacle], { w: 1000, h: 1000 }, 20)).toEqual([{ x: 900, y: 500 }]);
  expect(farmRoute({ x: 100, y: 500 }, { x: 500, y: 500 }, [obstacle], { w: 1000, h: 1000 }, 20)).toEqual([]);
});
it('keeps routes within world bounds', () => {
  expect(farmRoute({ x: 100, y: 100 }, { x: 0, y: 100 }, [], { w: 1000, h: 1000 }, 20)).toEqual([]);
});
