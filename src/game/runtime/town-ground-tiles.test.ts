import { afterEach, describe, expect, it, vi } from "vitest";
import { TOWN_ARRIVAL, TOWN_CENTER } from "../../../shared/town";
import { SOUL_VILLAGE_GROUND } from "../soul-village";
import { townWindowDecor } from "../town-world";
import type { WorldDecor } from "../world";
import { createSoulGroundRenderer, SOUL_SHADOW_STRENGTH, soulPropExtent, type SoulPropDecor } from "./soul-prop-renderer";
import { createTownGroundTilePainter, townGroundPropsIn } from "./town-ground-tiles";

const TILE = 640;
const rectOfTile = (tileX: number, tileY: number) => ({ left: tileX * TILE, top: tileY * TILE, right: (tileX + 1) * TILE, bottom: (tileY + 1) * TILE });
const overlaps = (item: SoulPropDecor, rect: ReturnType<typeof rectOfTile>) => {
  const extent = soulPropExtent(item);
  return item.x + extent.right > rect.left && item.x - extent.left < rect.right && item.y + extent.down > rect.top && item.y - extent.up < rect.bottom;
};
/** What the old renderer drew flat on the ground in a rectangle, from the decor window around a point. */
function windowGroundProps(x: number, y: number, rect: ReturnType<typeof rectOfTile>) {
  const items = townWindowDecor(x, y).filter((item): item is SoulPropDecor => item.type === "soulProp" && Boolean(item.ground || item.shadow));
  return new Set(items.filter(item => overlaps(item, rect)));
}

describe("the Town's baked ground props", () => {
  it("are exactly the flat props and shadows the decor window drew there, on the square and out in the countryside", () => {
    for (const [x, y] of [[TOWN_ARRIVAL.x, TOWN_ARRIVAL.y], [TOWN_CENTER.x + 3_000, TOWN_CENTER.y - 1_500]]) {
      const tileX = Math.floor(x / TILE), tileY = Math.floor(y / TILE);
      const rect = rectOfTile(tileX, tileY);
      const { flat, shadows } = townGroundPropsIn(rect);
      expect(new Set([...flat, ...shadows])).toEqual(windowGroundProps(x, y, rect));
      expect(flat.length + shadows.length).toBeGreaterThan(0);
    }
  });

  it("do not depend on where the player stands or which chunks are loaded", () => {
    const rect = rectOfTile(9, 7);
    const first = townGroundPropsIn(rect);
    townWindowDecor(TOWN_CENTER.x + 6_000, TOWN_CENTER.y + 4_000);
    expect(townGroundPropsIn(rect)).toEqual(first);
  });

  it("hold no standing props, keep flat props in depth order, and only what reaches into the rectangle", () => {
    const rect = rectOfTile(Math.floor(TOWN_CENTER.x / TILE), Math.floor(TOWN_CENTER.y / TILE));
    const { flat, shadows } = townGroundPropsIn(rect);
    expect(flat.every(item => item.ground && !item.shadow)).toBe(true);
    expect(shadows.every(item => item.shadow)).toBe(true);
    for (let i = 1; i < flat.length; i++) expect(flat[i].y).toBeGreaterThanOrEqual(flat[i - 1].y);
    expect([...flat, ...shadows].every(item => overlaps(item, rect))).toBe(true);
  });
});

type Draw = { image: unknown; args: number[]; alpha: number };
function fakeContext(draws: Draw[]) {
  const context = {
    fillStyle: "", globalAlpha: 1, imageSmoothingEnabled: true,
    fillRect: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), setTransform: vi.fn(),
    drawImage: vi.fn((image: unknown, ...args: number[]) => { draws.push({ image, args, alpha: context.globalAlpha }); }),
  };
  return context;
}
const image = (name: string, complete = true) => ({ name, complete, naturalWidth: complete ? 2048 : 0, naturalHeight: complete ? 2048 : 0 }) as unknown as HTMLImageElement;

describe("painting a Town ground tile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("waits, drawing nothing, until every image it needs has loaded", () => {
    const loading = image("props", false);
    const painter = createTownGroundTilePainter({ ground: () => image("ground"), interiors: () => image("rooms"), villageProps: () => loading, atlas: () => image("atlas") });
    const draws: Draw[] = [];
    expect(painter.ready()).toBe(false);
    expect(painter.paint(fakeContext(draws) as unknown as CanvasRenderingContext2D, 9, 7, TILE)).toBe(false);
    expect(draws).toEqual([]);
  });

  it("lays the ground, then the flat props, then every shadow at once through one layer at the shadow strength", () => {
    const layerDraws: Draw[] = [];
    const layer = fakeContext(layerDraws);
    const scratch = { width: 0, height: 0, getContext: () => layer };
    vi.stubGlobal("document", { createElement: () => scratch });
    const images = { ground: image("ground"), rooms: image("rooms"), props: image("props"), atlas: image("atlas") };
    const painter = createTownGroundTilePainter({ ground: () => images.ground, interiors: () => images.rooms, villageProps: () => images.props, atlas: () => images.atlas });
    const tileX = Math.floor(TOWN_ARRIVAL.x / TILE), tileY = Math.floor(TOWN_ARRIVAL.y / TILE);
    const { flat, shadows } = townGroundPropsIn(rectOfTile(tileX, tileY));
    const draws: Draw[] = [];
    expect(painter.ready()).toBe(true);
    expect(painter.paint(fakeContext(draws) as unknown as CanvasRenderingContext2D, tileX, tileY, TILE)).toBe(true);
    // The square lies on the village's ground image, which comes first, under everything.
    expect(SOUL_VILLAGE_GROUND.x).toBeLessThan(TOWN_ARRIVAL.x);
    expect(draws[0].image).toBe(images.ground);
    expect(draws.slice(1, 1 + flat.length).every(draw => draw.image === images.props || draw.image === images.atlas)).toBe(true);
    expect(draws).toHaveLength(1 + flat.length + 1);
    expect(draws.at(-1)).toMatchObject({ image: scratch, alpha: SOUL_SHADOW_STRENGTH });
    expect(layerDraws).toHaveLength(shadows.length);
    expect(layerDraws.every(draw => draw.alpha === 1)).toBe(true);
    expect(scratch).toMatchObject({ width: TILE, height: TILE });
  });

  it("bakes a countryside prop into every tile it reaches, so a prop across a tile edge is whole", () => {
    const countryside = townWindowDecor(TOWN_CENTER.x + 3_000, TOWN_CENTER.y - 1_500)
      .filter((item): item is SoulPropDecor => item.type === "soulProp" && Boolean(item.shadow));
    const across = countryside.find((item: WorldDecor & SoulPropDecor) => {
      const extent = soulPropExtent(item);
      return Math.floor((item.x - extent.left) / TILE) !== Math.floor((item.x + extent.right) / TILE);
    });
    expect(across).toBeDefined();
    const extent = soulPropExtent(across!);
    const row = Math.floor(across!.y / TILE);
    for (const tileX of [Math.floor((across!.x - extent.left) / TILE), Math.floor((across!.x + extent.right) / TILE)]) {
      expect(townGroundPropsIn(rectOfTile(tileX, row)).shadows).toContain(across);
    }
  });
});

describe("the Town's ground each frame, once baked", () => {
  it("draws only its moving water: no ground, rooms, flat props or shadow layer", () => {
    const draws: Draw[] = [];
    const ctx = fakeContext(draws);
    const drawWater = vi.fn(), drawProp = vi.fn();
    const ground = createSoulGroundRenderer({
      ctx: ctx as unknown as CanvasRenderingContext2D, camera: { x: TOWN_ARRIVAL.x - 700, y: TOWN_ARRIVAL.y - 400, zoom: 1 } as never,
      ground: () => image("ground"), interiors: () => image("rooms"), decor: townWindowDecor(TOWN_ARRIVAL.x, TOWN_ARRIVAL.y), drawProp, drawWater,
      viewport: () => ({ width: 1_400, height: 800 }), devicePixelRatio: () => 2, active: () => true, baked: true,
    });
    ground.draw();
    expect(drawWater).toHaveBeenCalledOnce();
    expect(drawProp).not.toHaveBeenCalled();
    expect(draws).toEqual([]);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
