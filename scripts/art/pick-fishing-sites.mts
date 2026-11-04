// Lists candidate fishing sites in the Town's village river for shared/fishing.ts: open water with standable bank
// in reach and no prop drawn over the swirl or the angler, spread out. Run: npx tsx scripts/art/pick-fishing-sites.mts
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sharp = createRequire(import.meta.url)("sharp");
const { townFeetClear } = await import(`${root}src/game/runtime/town/town-path.ts`);
const { TOWN_VILLAGE_GROUND } = await import(`${root}src/game/town-village.ts`);
const { townWindowDecor } = await import(`${root}src/game/town-world.ts`);
const { soulPropExtent } = await import(`${root}src/game/runtime/soul/soul-prop-renderer.ts`);
const { TOWN_EAST_BRIDGE, TOWN_WEST_BRIDGE } = await import(`${root}shared/town.ts`);
const { FISHING_REACH } = await import(`${root}shared/fishing.ts`);

const { data, info } = await sharp(`${root}public/assets/wildstat/soul-dimension/village-water.webp`).raw().toBuffer({ resolveWithObject: true });
const scale = TOWN_VILLAGE_GROUND.w / info.width;
const wet = (x: number, y: number) => {
  const px = Math.floor((x - TOWN_VILLAGE_GROUND.x) / scale), py = Math.floor((y - TOWN_VILLAGE_GROUND.y) / scale);
  return px >= 0 && py >= 0 && px < info.width && py < info.height && data[(py * info.width + px) * info.channels + 3] > 128;
};
type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
// The south bridge is part of the baked village: its deck's middle.
const bridges = [{ ...TOWN_WEST_BRIDGE, r: 240 }, { x: 5_398, y: 6_230, r: 240 }];
const nearEastBridge = (x: number, y: number) => Math.abs(x - TOWN_EAST_BRIDGE.x) < TOWN_EAST_BRIDGE.halfWidth + 140 && Math.abs(y - TOWN_EAST_BRIDGE.y) < TOWN_EAST_BRIDGE.halfHeight + 160;

const clear: { x: number; y: number }[] = [];
for (let y = TOWN_VILLAGE_GROUND.y; y < TOWN_VILLAGE_GROUND.y + TOWN_VILLAGE_GROUND.h; y += 40) {
  for (let x = TOWN_VILLAGE_GROUND.x; x < TOWN_VILLAGE_GROUND.x + TOWN_VILLAGE_GROUND.w; x += 40) {
    if (!wet(x, y) || bridges.some(bridge => Math.hypot(x - bridge.x, y - bridge.y) < bridge.r) || nearEastBridge(x, y)) continue;
    // Water all round, so the swirl sits in open water.
    let open = true;
    for (let a = 0; a < 16 && open; a++) open = wet(x + Math.cos(a * Math.PI / 8) * 36, y + Math.sin(a * Math.PI / 8) * 36);
    if (!open) continue;
    // The nearest standable bank, well inside reach.
    let feet: { x: number; y: number } | null = null, best = FISHING_REACH - 30;
    for (let dy = -110; dy <= 110; dy += 10) for (let dx = -110; dx <= 110; dx += 10) {
      const distance = Math.hypot(dx, dy);
      if (distance <= best && townFeetClear(x + dx, y + dy)) { best = distance; feet = { x: x + dx, y: y + dy }; }
    }
    if (!feet) continue;
    // Nothing drawn over the swirl, nor in front of the angler on the bank.
    const swirl = { left: x - 50, right: x + 50, top: y - 26, bottom: y + 26 };
    const body = { left: feet.x - 22, right: feet.x + 22, top: feet.y - 80, bottom: feet.y };
    const hidden = townWindowDecor(x, y).some((item: any) => {
      if (item.type !== "soulProp") return false;
      const e = soulPropExtent(item), box = { left: item.x - e.left, right: item.x + e.right, top: item.y - e.up, bottom: item.y + e.down };
      return overlaps(box, swirl) || (item.y > feet!.y && overlaps(box, body));
    });
    if (!hidden) clear.push({ x, y });
  }
}
// Spread out: each next site the furthest from those picked, down to this gap.
const picked = [clear.reduce((a, b) => a.x < b.x ? a : b)];
for (;;) {
  let next = null, gap = 0;
  for (const point of clear) {
    const nearest = Math.min(...picked.map(site => Math.hypot(point.x - site.x, point.y - site.y)));
    if (nearest > gap) { gap = nearest; next = point; }
  }
  if (!next || gap < 330) break;
  picked.push(next);
}
console.log(`${clear.length} clear points; ${picked.length} sites:`);
for (const site of picked) console.log(`[${site.x}, ${site.y}]`);
