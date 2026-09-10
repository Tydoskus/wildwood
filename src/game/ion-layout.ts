import type { SpawnCamp, WorldDecor, WorldPath } from './world';

/** A central reactor court connects four ramparts and the southeast command deck. */
export function createIonCitadelLayout(camps: readonly SpawnCamp[]) {
  const paths: WorldPath[] = [
    { x: 300, y: 670, w: 1810, h: 200 },
    { x: 1910, y: 670, w: 200, h: 2850 },
    { x: 760, y: 1720, w: 2840, h: 200 },
    { x: 760, y: 1720, w: 200, h: 1800 },
    { x: 3400, y: 790, w: 200, h: 2730 },
    { x: 1910, y: 790, w: 1690, h: 200 },
    { x: 760, y: 3320, w: 2840, h: 200 },
    { x: 3400, y: 3320, w: 200, h: 830 },
    { x: 3400, y: 3950, w: 850, h: 200 },
    { x: 1770, y: 1580, w: 480, h: 480 },
  ];
  const decor: WorldDecor[] = [];
  const clear = (x: number, y: number) => Math.hypot(x - 580, y - 770) > 350
    && Math.hypot(x - 4050, y - 4050) > 760
    && !camps.some(c => Math.hypot(x - c.x, y - c.y) < c.radius + 125)
    && !paths.some(p => x > p.x - 95 && x < p.x + p.w + 95 && y > p.y - 95 && y < p.y + p.h + 95);
  for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
    const x = 170 + col * 300, y = 180 + row * 300, i = row * 15 + col;
    if (!clear(x, y)) continue;
    decor.push({ type: 'rock', x, y, s: 1.7, variant: i % 4 });
    decor.push({ type: 'skyShard', x, y: y - 15, s: 2.3 + (i % 2) * .4, variant: i % 3 });
    if (i % 2 === 0) decor.push({ type: 'gear', x: x + 40, y: y + 35, s: .9, variant: i % 3 });
  }
  return { paths, decor };
}
