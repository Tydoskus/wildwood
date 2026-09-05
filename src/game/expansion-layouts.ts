import type { SpawnCamp, WorldDecor, WorldPath } from "./world";

/** Authored routes share clearance rules, while each region has its own silhouette. */
export function createExpansionLayout(orchard: boolean, camps: readonly SpawnCamp[]) {
  const paths: WorldPath[] = orchard ? [
    { x: 300, y: 640, w: 1300, h: 180 },
    { x: 1420, y: 640, w: 180, h: 1100 },
    { x: 980, y: 1360, w: 2100, h: 180 },
    { x: 2900, y: 920, w: 180, h: 2100 },
    { x: 2900, y: 920, w: 360, h: 180 },
    { x: 980, y: 1360, w: 180, h: 2060 },
    { x: 980, y: 3240, w: 1700, h: 180 },
    { x: 2500, y: 2860, w: 580, h: 180 },
    { x: 2500, y: 2860, w: 180, h: 1180 },
    { x: 2900, y: 2360, w: 1100, h: 180 },
    { x: 3820, y: 2360, w: 180, h: 800 },
    { x: 2500, y: 3860, w: 1640, h: 180 },
    { x: 3960, y: 3860, w: 180, h: 370 },
  ] : [
    { x: 300, y: 640, w: 1700, h: 200 },
    { x: 1800, y: 640, w: 200, h: 3400 },
    { x: 1000, y: 1360, w: 1000, h: 180 },
    { x: 1800, y: 920, w: 1360, h: 180 },
    { x: 2980, y: 920, w: 180, h: 1580 },
    { x: 1800, y: 2340, w: 2200, h: 200 },
    { x: 1000, y: 3240, w: 1000, h: 180 },
    { x: 1800, y: 3860, w: 2340, h: 180 },
    { x: 3960, y: 2340, w: 180, h: 1880 },
  ];
  const decor: WorldDecor[] = [];
  const unit = (i: number, seed: number) => {
    const value = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let i = 0; i < 520; i++) {
    const x = Math.round(100 + unit(i, orchard ? 151 : 141) * 4600);
    const y = Math.round(100 + unit(i, orchard ? 152 : 142) * 4600);
    if (Math.hypot(x - 580, y - 770) < 360 || Math.hypot(x - 4050, y - 4050) < 740) continue;
    if (camps.some(camp => Math.hypot(x - camp.x, y - camp.y) < camp.radius + 100)) continue;
    if (paths.some(path => x > path.x - 80 && x < path.x + path.w + 80 && y > path.y - 80 && y < path.y + path.h + 80)) continue;
    const s = .8 + unit(i, 153) * .65;
    decor.push({ type: orchard ? "pumpkin" : "gear", x, y, s, variant: i % 3 });
    if (i % 3 === 0) decor.push({ type: orchard ? "charredTree" : "rock", x: x + 42, y: y - 30, s: orchard ? .9 : 1.5, variant: i % 3 });
  }
  return { paths, decor };
}
