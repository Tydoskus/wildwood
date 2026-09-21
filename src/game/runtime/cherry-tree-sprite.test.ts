import { describe, expect, it } from "vitest";
import {
  CHERRY_TREE_BASE_SIZE,
  CHERRY_TREE_SOURCE_SCALES,
  cherryTreeColors,
  cherryTreeDrift,
  cherryTreeSourceScale,
  cherryTreeSpriteBox,
} from "./cherry-tree-sprite";
import { cherryTreeRenderScale } from "./world-renderer";

describe("cherryTreeSourceScale", () => {
  it("never picks a source smaller than the tree, so blits only sample down", () => {
    for (let treeScale = .7; treeScale <= 1.18; treeScale += .02) {
      expect(cherryTreeSourceScale(treeScale)).toBeGreaterThanOrEqual(treeScale);
    }
  });

  it("uses the tighter band for small trees", () => {
    expect(cherryTreeSourceScale(.7)).toBe(CHERRY_TREE_SOURCE_SCALES[0]);
    expect(cherryTreeSourceScale(1.1)).toBe(CHERRY_TREE_SOURCE_SCALES[1]);
  });

  it("clamps past the widest band instead of growing the cache", () => {
    expect(cherryTreeSourceScale(9)).toBe(CHERRY_TREE_SOURCE_SCALES[CHERRY_TREE_SOURCE_SCALES.length - 1]);
  });

  it("falls back to a usable band for nonsense input", () => {
    expect(cherryTreeSourceScale(0)).toBe(CHERRY_TREE_SOURCE_SCALES[1]);
    expect(cherryTreeSourceScale(Number.NaN)).toBe(CHERRY_TREE_SOURCE_SCALES[1]);
  });
});

describe("cherryTreeSpriteBox", () => {
  it("leaves the ground point inside the canvas", () => {
    const box = cherryTreeSpriteBox(CHERRY_TREE_BASE_SIZE);
    expect(box.originX).toBeGreaterThan(0);
    expect(box.originX).toBeLessThan(box.width);
    expect(box.originY).toBeGreaterThan(0);
    expect(box.originY).toBeLessThan(box.height);
  });

  it("covers the painted crown, which reaches about a draw size above the base", () => {
    const box = cherryTreeSpriteBox(CHERRY_TREE_BASE_SIZE);
    expect(box.originY).toBeGreaterThanOrEqual(152);
    expect(box.width).toBeGreaterThanOrEqual(170);
  });

  it("scales with the draw size", () => {
    const small = cherryTreeSpriteBox(100);
    const large = cherryTreeSpriteBox(200);
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.originY).toBeGreaterThan(small.originY);
  });
});

describe("cherryTreeDrift", () => {
  it("gives the three variant classes distinct sway", () => {
    const drifts = [0, 1, 2].map(variant => cherryTreeDrift(variant, 1));
    expect(new Set(drifts).size).toBe(3);
    expect(drifts[1]).toBe(0);
  });

  it("repeats every three variants, which is what the sprite cache keys on", () => {
    for (let variant = 0; variant < 16; variant += 1) {
      expect(cherryTreeDrift(variant, 1)).toBe(cherryTreeDrift(variant % 3, 1));
    }
  });
});

describe("cherryTreeColors", () => {
  it("reads one palette colour per blossom cluster", () => {
    const asked: number[] = [];
    const colors = cherryTreeColors(index => { asked.push(index); return `#00000${index}`; });
    expect(asked).toEqual([0, 1, 2, 3, 4]);
    expect(colors.clusters).toHaveLength(5);
    expect(colors.shadow).not.toBe(colors.clusters[0]);
  });

  it("lets an editor colour override the whole crown", () => {
    const colors = cherryTreeColors(() => "#ffffff", "#123456");
    expect(colors.shadow).toBe("#123456");
    expect(colors.clusters.every(color => color === "#123456")).toBe(true);
  });
});

describe("cherryTreeRenderScale", () => {
  it("rounds up, so a sprite is never sampled larger than it was painted", () => {
    expect(cherryTreeRenderScale(1.1, 1)).toBeGreaterThanOrEqual(1.1);
    expect(cherryTreeRenderScale(1.6, 1)).toBeGreaterThanOrEqual(1.6);
    expect(cherryTreeRenderScale(1, 2)).toBeGreaterThanOrEqual(2);
  });

  it("collapses a smoothly drifting zoom onto a few steps", () => {
    const steps = new Set<number>();
    for (let zoom = 1; zoom <= 1.5; zoom += .001) steps.add(cherryTreeRenderScale(zoom, 2));
    expect(steps.size).toBeLessThanOrEqual(3);
  });

  it("stays at or above one and caps so a huge ratio cannot blow up the canvas", () => {
    expect(cherryTreeRenderScale(.2, 1)).toBe(1);
    expect(cherryTreeRenderScale(20, 4)).toBeLessThanOrEqual(3);
  });

  it("falls back to one for nonsense input", () => {
    expect(cherryTreeRenderScale(Number.NaN, 2)).toBe(1);
    expect(cherryTreeRenderScale(0, 0)).toBe(1);
  });
});
