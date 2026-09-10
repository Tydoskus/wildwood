import type { SpawnCamp, WorldDecor, WorldPath } from './world';

/** Burial galleries form a connected ring around a central luminous garden. */
export function createVerdantCatacombsLayout(camps: readonly SpawnCamp[]) {
  const paths: WorldPath[] = [
    { x: 300, y: 660, w: 1320, h: 180 },
    { x: 1440, y: 660, w: 180, h: 2920 },
    { x: 1440, y: 1060, w: 2080, h: 180 },
    { x: 3340, y: 1060, w: 180, h: 2540 },
    { x: 760, y: 2320, w: 2760, h: 180 },
    { x: 760, y: 2320, w: 180, h: 1400 },
    { x: 760, y: 3540, w: 2900, h: 180 },
    { x: 3340, y: 3540, w: 840, h: 180 },
    { x: 3960, y: 3540, w: 220, h: 680 },
  ];
  const decor: WorldDecor[] = [];
  const clear = (x: number, y: number, margin = 80) => Math.hypot(x - 580, y - 770) > 350
    && Math.hypot(x - 4050, y - 4050) > 740
    && !camps.some(c => Math.hypot(x - c.x, y - c.y) < c.radius + 100)
    && !paths.some(p => x > p.x - margin && x < p.x + p.w + margin && y > p.y - margin && y < p.y + p.h + margin);
  for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
    const i = row * 15 + col, x = 150 + col * 300 + Math.sin(i * 2.3) * 45, y = 160 + row * 300 + Math.cos(i * 1.7) * 40;
    if (!clear(x, y)) continue;
    decor.push({ type: 'rock', x, y, s: 1.2 + (i % 3) * .35, variant: i % 4 });
    decor.push({ type: 'glowMushroom', x: x + 35, y: y + 25, s: 1.2 + (i % 4) * .25, variant: i % 3 });
    if (i % 3 === 0) decor.push({ type: 'tree', x: x - 28, y: y - 20, s: 1.3, variant: i % 3 });
  }
  for (const road of paths) {
    const horizontal = road.w > road.h, length = horizontal ? road.w : road.h;
    for (let step = 0; step < length; step += 230) for (const side of [-1, 1]) {
      const x = horizontal ? road.x + step : road.x + road.w / 2 + side * 150;
      const y = horizontal ? road.y + road.h / 2 + side * 145 : road.y + step;
      if (clear(x, y, 8)) decor.push({ type: 'glowMushroom', x, y, s: .65, variant: step % 3 });
    }
  }
  return { paths, decor };
}
