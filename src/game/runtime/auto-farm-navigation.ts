import type { Circle, Position } from './types';

type Bounds = { w: number; h: number };
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

/** Visibility graph around the few solid boss/portal obstacles in a map. */
export function farmRoute(start: Position, goal: Position, obstacles: Circle[], bounds: Bounds, margin: number): Position[] {
  const inside = (p: Position) => p.x >= margin && p.y >= margin && p.x <= bounds.w - margin && p.y <= bounds.h - margin;
  const clear = (a: Position, b: Position) => obstacles.every(o => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / lengthSq)) : 0;
    // A player already inside an avoidance radius may move directly out of it.
    if (distance(a, o) < o.r) return (a.x - o.x) * dx + (a.y - o.y) * dy >= 0 && distance(b, o) > distance(a, o);
    return Math.hypot(a.x + t * dx - o.x, a.y + t * dy - o.y) >= o.r;
  });
  if (!inside(goal)) return [];
  if (clear(start, goal)) return [goal];
  const nodes: Position[] = [start, goal];
  for (const obstacle of obstacles) {
    // Extra radius keeps each straight polygon edge outside the real circle.
    const radius = (obstacle.r + 3) / Math.cos(Math.PI / 16);
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      const point = { x: obstacle.x + Math.cos(angle) * radius, y: obstacle.y + Math.sin(angle) * radius };
      if (inside(point) && obstacles.every(o => distance(point, o) >= o.r)) nodes.push(point);
    }
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current])) return [];
    if (current === 1) {
      const route: Position[] = [];
      for (let i = 1; i !== 0; i = previous[i]) route.unshift(nodes[i]);
      return route;
    }
    visited.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (visited.has(next) || !clear(nodes[current], nodes[next])) continue;
      const cost = costs[current] + distance(nodes[current], nodes[next]);
      if (cost < costs[next]) { costs[next] = cost; previous[next] = current; }
    }
  }
  return [];
}
