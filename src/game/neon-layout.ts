import type { SpawnCamp, WorldDecor, WorldPath } from "./world";

/** A circuit-shaped district: the upper and lower boulevards join through
 * three avenues, with a clear southeast plaza for Voltwarden. */
export function createNeonBastionLayout(camps: readonly SpawnCamp[]) {
  const paths: WorldPath[] = [
    { x: 300, y: 650, w: 3300, h: 180 },
    { x: 850, y: 650, w: 180, h: 2900 },
    { x: 2200, y: 650, w: 180, h: 3400 },
    { x: 3420, y: 650, w: 180, h: 3400 },
    { x: 850, y: 1750, w: 2750, h: 180 },
    { x: 850, y: 3250, w: 2750, h: 180 },
    { x: 2200, y: 3870, w: 2000, h: 180 },
    { x: 3900, y: 3700, w: 330, h: 530 },
  ];
  const decor: WorldDecor[] = [];
  const near = (x: number, y: number) => Math.hypot(x - 580, y - 770) < 350
    || Math.hypot(x - 4050, y - 4050) < 720
    || camps.some(c => Math.hypot(x - c.x, y - c.y) < c.radius + 140);
  const onRoad = (x: number, y: number, margin = 100) => paths.some(p =>
    x > p.x - margin && x < p.x + p.w + margin && y > p.y - margin && y < p.y + p.h + margin);
  // Repeating towers make the area read as a built district. Seeded placement
  // is stable across clients, and all objects remain map-editor compatible.
  for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) {
    const x = 220 + col * 345, y = 220 + row * 345, i = row * 13 + col;
    if (near(x, y) || onRoad(x, y)) continue;
    decor.push({ type: "rock", x, y, s: 1.8, variant: i % 4 });
    decor.push({ type: "skyShard", x, y: y - 7, s: 2.8 + (i % 3) * .3, variant: i % 3 });
    decor.push({ type: "gear", x: x + 48, y: y + 30, s: .8, variant: i % 3 });
  }
  for (let i = 0; i < 28; i++) {
    const x = 380 + i * 145;
    for (const y of [560, 3500]) {
      if (!near(x, y) && !onRoad(x, y, 25)) decor.push({ type: "skyShard", x, y, s: .65, variant: i % 3 });
    }
  }
  return { paths, decor };
}
