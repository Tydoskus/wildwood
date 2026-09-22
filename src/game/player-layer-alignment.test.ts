import { describe, expect, it } from "vitest";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "./player-appearance";
import { drawAlignedPlayerLayer } from "./player-layer-alignment";
import { withGrip } from "../tools/sprite-aligner/weapon-transform";
import { WEAPON_ALIGNMENT_DEFAULTS } from "./equipment-alignment";

function recordingContext() {
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, alpha = 1;
  const stack: Array<{ m: typeof m; alpha: number }> = [];
  const draws: unknown[] = [];
  const ctx = {
    get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
    save() { stack.push({ m: { ...m }, alpha }); },
    restore() { ({ m, alpha } = stack.pop()!); },
    getTransform() { return { ...m }; },
    translate(x: number, y: number) { m.e += m.a * x + m.c * y; m.f += m.b * x + m.d * y; },
    scale(x: number, y: number) { m.a *= x; m.b *= x; m.c *= y; m.d *= y; },
    rotate(r: number) {
      const { a, b, c, d } = m, cos = Math.cos(r), sin = Math.sin(r);
      Object.assign(m, { a: a * cos + c * sin, b: b * cos + d * sin, c: c * cos - a * sin, d: d * cos - b * sin });
    },
    stroke() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, bezierCurveTo() {}, closePath() {},
    fill() { if (alpha) draws.push(["fill", { ...m }]); },
    drawImage(...args: unknown[]) { if (alpha) draws.push(["image", ...args, { ...m }]); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws };
}

describe("optional alignment instrumentation", () => {
  it("uses the exported sword default once, and permits a per-item or editor override", () => {
    const sprite = { complete: true, naturalWidth: 118, naturalHeight: 64 } as HTMLImageElement;
    const assets: PlayerAppearanceAssets = { basicFrontLeg: sprite, basicBackLeg: sprite, equipment: { sword: { sprite } } };
    for (const facing of [0, Math.PI]) {
      const world = { kind: "SPRITE" as const, source: "sword.webp", layer: "HAND" as const, top: 116, weaponCategory: "SWORD" as const };
      const options = { x: 0, y: 0, gameTime: 0, facing, headItem: "", rightHandItem: "sword", presentationOverrides: { sword: world } };
      const inherited = recordingContext(), explicit = recordingContext();
      drawStartingPlayer(inherited.ctx, assets, options);
      drawStartingPlayer(explicit.ctx, assets, { ...options, alignment: { weapon: { ...WEAPON_ALIGNMENT_DEFAULTS.SWORD } } });
      expect(inherited.draws).toEqual(explicit.draws);
      const perItem = recordingContext(), editor = recordingContext(), override = { x: 2, y: 3, scale: .9 };
      drawStartingPlayer(perItem.ctx, assets, { ...options, presentationOverrides: { sword: { ...world, alignment: override } } });
      drawStartingPlayer(editor.ctx, assets, { ...options, alignment: { weapon: override } });
      expect(perItem.draws).toEqual(editor.draws);
      expect(editor.draws).not.toEqual(inherited.draws);
    }
  });

  it("rotates and flips around the chosen grip, keeping the handle fixed", () => {
    const source = { x: 0, y: 0, width: 120, height: 60 };
    for (const flipX of [false, true]) for (const angle of [-90, 0, 37, 180]) {
      const { ctx } = recordingContext();
      let pivot = { x: NaN, y: NaN };
      drawAlignedPlayerLayer(ctx, "weapon", source,
        { x: 7, y: 11, scale: 1.2, pivotX: .15, pivotY: .5, flipX, angle },
        () => {}, (_, bounds) => { pivot = bounds.pivot!; });
      expect(pivot.x).toBeCloseTo(25);
      expect(pivot.y).toBeCloseTo(41);
    }
  });

  it("changing the grip after rotating and flipping preserves the image's transform", () => {
    const source = { x: -60, y: -30, width: 120, height: 60 };
    const original = { x: 10, y: -4, scale: 1.3, angle: 43, flipX: true };
    const changed = withGrip(original, source, .15, .7);
    const matrices: DOMMatrix[] = [];
    for (const adjustment of [original, changed]) {
      const { ctx } = recordingContext();
      drawAlignedPlayerLayer(ctx, "weapon", source, adjustment, () => matrices.push(ctx.getTransform()));
    }
    for (const key of ["a", "b", "c", "d", "e", "f"] as const) expect(matrices[0][key]).toBeCloseTo(matrices[1][key]);
  });

  it("mirrors a held weapon's grip consistently when turning in either hand", () => {
    const image = { complete: true, naturalWidth: 120, naturalHeight: 60 } as HTMLImageElement;
    const assets: PlayerAppearanceAssets = { basicFrontLeg: image, basicBackLeg: image, equipment: { starter_stone: { sprite: image } } };
    for (const leftHand of [false, true]) for (const moving of [false, true]) {
      const pivots: Array<{ x: number; y: number }> = [];
      for (const facing of [0, Math.PI]) {
        drawStartingPlayer(recordingContext().ctx, assets, {
          x: 50, y: 20, facing, moving, gameTime: .13,
          rightHandItem: leftHand ? "" : "starter_stone", leftHandItem: leftHand ? "starter_stone" : "",
          alignment: { weapon: { x: 12, y: -9, scale: .8, angle: -50, pivotX: .15, pivotY: .5, flipX: true } },
          onLayerBounds(layer, bounds) { if (layer === "weapon") pivots.push(bounds.pivot!); },
        });
      }
      expect(pivots).toHaveLength(2);
      expect(pivots[0].x - 50).toBeCloseTo(50 - pivots[1].x);
      expect(pivots[0].y).toBeCloseTo(pivots[1].y);
    }
  });
  it("reports transformed bounds and restores the caller's transform", () => {
    const { ctx } = recordingContext();
    ctx.translate(100, 40); ctx.scale(-2, 2);
    const before = ctx.getTransform();
    let bounds;
    drawAlignedPlayerLayer(ctx, "head", { x: 0, y: 0, width: 10, height: 20 },
      { x: 3, y: 4, scale: 2 }, () => {}, (_, value) => { bounds = value; });
    expect(bounds).toMatchObject({ x: 64, y: 28, width: 40, height: 80 });
    expect(ctx.getTransform()).toEqual(before);
  });

  it("does not change visible draw positions or layer order when the editor collects bounds", () => {
    const image = (name: string) => ({ complete: true, naturalWidth: 40, naturalHeight: 40, name }) as unknown as HTMLImageElement;
    const assets: PlayerAppearanceAssets = {
      basicFrontLeg: image("front"), basicBackLeg: image("back"),
      equipment: { basic_paper_hat: { sprite: image("hat") }, starter_stone: { sprite: image("stone") } },
    };
    for (const facing of [0, Math.PI]) for (const moving of [false, true]) for (const gameTime of [0, .13, .25, .7]) {
      const options = { x: 12, y: 50, facing, moving, gameTime, headItem: "basic_paper_hat" };
      const game = recordingContext(), editor = recordingContext();
      drawStartingPlayer(game.ctx, assets, options);
      const layers: string[] = [];
      drawStartingPlayer(editor.ctx, assets, { ...options, alignment: {}, onLayerBounds: layer => layers.push(layer) });
      expect(editor.draws).toEqual(game.draws);
      expect(layers).toEqual(["backLeg", "frontLeg", "body", "head", "eyes", "helmet", "weapon"]);
      expect(editor.ctx.getTransform()).toEqual(game.ctx.getTransform());
    }
  });
});
