// The market's baked sprites, each at 1x and 2x on plain grass, its extents dashed round it and its foot crossed.
import { MARKET_SPRITES, type MarketSprite } from "../../scripts/art/market-sprites";
import { ringCentre } from "../../scripts/art/market-plaza";
import { drawUntilStable } from "./determinism";
import { label, resetCanvas, sceneCanvas, section } from "./world";

const GRASS = "#61864e";
const ROAD = "#c9a36e";
const WIDTH = 1280, GAP = 24, LABEL = 18, LABEL_WIDTH = 150;

/** A sprite, or the part of it between two x's (world units) when it is wider than the page. */
type Item = { sprite: MarketSprite; from: number; to: number; part: string };
type Cell = Item & { x: number; y: number };

/** Rows of sprites that wrap at the page width, at `zoom` CSS pixels to a world unit; each cell's point is its foot. */
function layout(zoom: number) {
  const items: Item[] = MARKET_SPRITES.flatMap(sprite => {
    const { left, right } = sprite.extents;
    if ((left + right) * zoom <= WIDTH - GAP * 2) return [{ sprite, from: -left, to: right, part: "" }];
    return [{ sprite, from: -left, to: 0, part: " left half" }, { sprite, from: 0, to: right, part: " right half" }];
  });
  const cells: Cell[] = [];
  let x = GAP, y = 0, rowHeight = 0;
  for (const item of items) {
    const e = item.sprite.extents, w = (item.to - item.from) * zoom, h = (e.up + e.down) * zoom + LABEL + GAP;
    if (x > GAP && x + w > WIDTH - GAP) { x = GAP; y += rowHeight; rowHeight = 0; }
    cells.push({ ...item, x: x - item.from * zoom, y: y + LABEL + e.up * zoom });
    x += Math.max(w, ringCentre(item.sprite.name) ? LABEL_WIDTH * 1.8 : LABEL_WIDTH) + GAP;
    rowHeight = Math.max(rowHeight, h);
  }
  return { cells, height: y + rowHeight };
}

/** How far a sprite's paint reaches past its extents, in world units: drawn alone at 2 px a unit, as the bake draws it. */
function overflow(sprite: MarketSprite) {
  const margin = 40, k = 2, e = sprite.extents, w = (e.left + e.right + margin * 2) * k, h = (e.up + e.down + margin * 2) * k;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.scale(k, k); ctx.translate(e.left + margin, e.up + margin);
  sprite.draw(ctx);
  const data = ctx.getImageData(0, 0, w, h).data, left = margin * k, right = w - margin * k, top = margin * k, bottom = h - margin * k;
  let worst = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] < 24) continue;
    worst = Math.max(worst, left - x, x + 1 - right, top - y, y + 1 - bottom);
  }
  return worst / k;
}

/** Every sprite at 1x and 2x: the gate over a road with its clear gap marked, the curved ones with their ring's middle. */
export async function marketSprites() {
  const report = document.createElement("pre");
  report.style.cssText = "margin:0;padding:6px;color:#fff;font:12px/1.4 monospace;white-space:pre-wrap";
  const over = MARKET_SPRITES.map(sprite => [sprite.name, overflow(sprite)] as const).filter(([, by]) => by > 0);
  const past = over.length ? over.map(([name, by]) => `${name} by ${by.toFixed(1)}`).join(", ") : "none";
  report.textContent = `${MARKET_SPRITES.length} sprites. Past their extents: ${past}`;
  document.body.append(report);
  const views = [1, 2].map(zoom => {
    const { cells, height } = layout(zoom);
    const scene = sceneCanvas(section(`Market sprites · ${zoom}x · extents dashed, foot crossed`), WIDTH, height);
    return () => {
      resetCanvas(scene, GRASS);
      const { ctx } = scene;
      for (const { sprite, from, to, part, x, y } of cells) {
        const e = sprite.extents, left = x + from * zoom, top = y - e.up * zoom, w = (to - from) * zoom, h = (e.up + e.down) * zoom;
        const ring = ringCentre(sprite.name);
        const note = ring ? ` · ring middle ${Math.round(ring.fx)}, ${Math.round(ring.fy)}` : "";
        label(ctx, `${sprite.name}${part} · ${zoom}x${note}`, left, top - LABEL + 3, "left");
        ctx.save();
        if (part) { ctx.beginPath(); ctx.rect(left, top - 40, w, h + 80); ctx.clip(); }
        if (sprite.name === "gate") { ctx.fillStyle = ROAD; ctx.fillRect(x - 50 * zoom, top, 100 * zoom, h); }
        ctx.translate(x, y);
        ctx.scale(zoom, zoom);
        sprite.draw(ctx);
        ctx.restore();
        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(255,255,255,.45)";
        ctx.strokeRect(left, top, w, h);
        if (sprite.name === "gate") { ctx.strokeStyle = "rgba(255,70,70,.8)"; ctx.strokeRect(x - 64 * zoom, y - 170 * zoom, 128 * zoom, 170 * zoom); }
        ctx.setLineDash([]);
        ctx.strokeStyle = "#ff3b8d";
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
        ctx.restore();
      }
    };
  });
  await drawUntilStable(() => views.forEach(draw => draw()));
}
