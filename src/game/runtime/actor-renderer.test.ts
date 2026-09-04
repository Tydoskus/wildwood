import { describe, expect, it, vi } from "vitest";
import { ENEMY_BOW_AIM_OFFSET_RADIANS, type LoadedEnemySprite, type LoadedSpriteLayer } from "../enemies";
import { drawableEnemyLayers, enemyShadowOffsetY, enemySpriteVerticalBounds, enemyWeaponAimRotation, enemyWeaponLayerRotation } from "./actor-renderer";
import { createActorRenderer, rockProjectileSize } from "./actor-renderer";
import { ENEMY_SPRITE_LAYOUTS } from "../enemy-sprite-layouts.mjs";
import type { EnemyState } from "./types";
import { PLAYER_WORLD_SCALE } from "../player-render-scale";
import { STARTER_STONE } from "../../../shared/items";

describe("thrown rock size", () => {
  it("matches the held rock's world scale instead of the full-size source image", () => {
    const size = rockProjectileSize(STARTER_STONE, 26, 26);
    expect(size.width).toBeCloseTo(26 * PLAYER_WORLD_SCALE);
    expect(size.height).toBeCloseTo(26 * PLAYER_WORLD_SCALE);
    expect(size.width).toBeLessThan(26);
  });
});

describe("enemy weapon aiming", () => {
  it("aims right-facing enemy weapons directly at target", () => {
    expect(enemyWeaponAimRotation(
      { x: 10, y: 10, facingX: 1 },
      { x: 30, y: 10 },
    )).toBeCloseTo(0);
    expect(enemyWeaponAimRotation(
      { x: 10, y: 10, facingX: 1 },
      { x: 30, y: 30 },
    )).toBeCloseTo(Math.PI / 4);
  });

  it("keeps left-facing enemy aim correct after actor mirroring", () => {
    expect(enemyWeaponAimRotation(
      { x: 30, y: 10, facingX: -1 },
      { x: 10, y: 10 },
    )).toBeCloseTo(0);
    expect(enemyWeaponAimRotation(
      { x: 30, y: 30, facingX: -1 },
      { x: 10, y: 10 },
    )).toBeCloseTo(-Math.PI / 4);
  });

  it("keeps the authored bow angle before tracking an engaged target", () => {
    const enemy = { x: 10, y: 10, facingX: 1 as const, engaged: false };
    expect(enemyWeaponLayerRotation(enemy, { x: 30, y: 10 }, ENEMY_BOW_AIM_OFFSET_RADIANS)).toBeCloseTo(0);
    expect(enemyWeaponLayerRotation({ ...enemy, engaged: true }, { x: 30, y: 30 }, ENEMY_BOW_AIM_OFFSET_RADIANS)).toBeCloseTo(Math.PI / 4);
  });
});

describe("layered enemy rendering", () => {
  const image = (ready: boolean) => ({ complete: ready, naturalWidth: ready ? 32 : 0 }) as HTMLImageElement;
  const layer = (ready: boolean, y: number, h: number) => ({
    src: "test.png", x: 0, y, w: 10, h, image: image(ready),
  }) as LoadedSpriteLayer;

  it("uses configured feet for the shadow instead of the enemy hit-circle center", () => {
    const sprite = { size: 68, height: 76, layers: [layer(true, -43, 39), layer(true, 22, 16)] } as LoadedEnemySprite;
    expect(enemySpriteVerticalBounds(sprite, 17)).toEqual({ top: -46, bottom: 35, height: 81 });
    expect(enemyShadowOffsetY(sprite, 17)).toBe(33);
  });

  it("draws available layers while delayed Android assets continue loading", () => {
    const layers = [layer(true, 0, 10), layer(false, 10, 10), layer(true, 20, 10)];
    expect(drawableEnemyLayers(layers)).toEqual([layers[0], layers[2]]);
  });

  it("keeps animated sprite bounds fixed even when the sprite has no loose layers", () => {
    const layout = ENEMY_SPRITE_LAYOUTS["Fen Prowler"];
    const sprite = { ...layout, layers: [], animation: { ...layout.animation!, pages: [] } };
    expect(enemySpriteVerticalBounds(sprite, 20)).toEqual({ top: -28.5, bottom: 22.5, height: 51 });
    expect(enemyShadowOffsetY(sprite, 20)).toBe(20.5);
  });

  it.each(Object.entries(ENEMY_SPRITE_LAYOUTS))("adds a ground shadow only for original-family enemies: %s", (kind, layout) => {
    const sprite = {
      ...layout,
      layers: layout.layers.map((part) => ({ ...part, image: image(true) })),
      animation: layout.animation ? {
        ...layout.animation,
        pages: layout.animation.pages.map((page) => ({ ...page, image: { complete: true, naturalWidth: page.width, naturalHeight: page.height } as HTMLImageElement })),
      } : undefined,
    };
    const drawShadow = vi.fn();
    const renderer = createActorRenderer({
      ctx: { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), globalAlpha: 1 },
      camera: { x: 0, y: 0, zoom: 1 }, viewport: () => ({ width: 800, height: 800 }),
      devicePixelRatio: () => 1, gameTime: () => 0, player: { x: 200, y: 100 },
      enemySprites: { [kind]: sprite }, drawShadow, enemyTextVisible: () => false,
    } as unknown as Parameters<typeof createActorRenderer>[0]);
    renderer.drawEnemy({ type: kind, x: 100, y: 100, vx: 0, vy: 0, r: 20, phase: 0,
      facingX: 1, engaged: false, hurt: 0 } as EnemyState);
    expect(drawShadow).toHaveBeenCalledTimes(layout.animation ? 0 : 1);
  });

  it("crops an atlas frame without a bow overlay while preserving hit/death transforms", () => {
    const layout = ENEMY_SPRITE_LAYOUTS["Petal Archer"];
    const atlas = layout.animation!;
    const pages = atlas.pages.map((page) => ({ ...page, image: { complete: true, naturalWidth: page.width, naturalHeight: page.height } as HTMLImageElement }));
    const sprite = { ...layout, animation: { ...atlas, pages }, layers: layout.layers.map((part) => ({ ...part, image: image(true) })) };
    const ctx = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), globalAlpha: 1,
    };
    const renderer = createActorRenderer({
      ctx, camera: { x: 0, y: 0, zoom: 1 }, viewport: () => ({ width: 800, height: 800 }),
      devicePixelRatio: () => 1, gameTime: () => 1, player: { x: 200, y: 100 },
      enemySprites: { "Petal Archer": sprite }, drawShadow: vi.fn(), enemyTextVisible: () => false,
    } as unknown as Parameters<typeof createActorRenderer>[0]);
    const enemy = { type: "Petal Archer", x: 100, y: 100, vx: 0, vy: 0, r: 20, phase: 0,
      facingX: -1, engaged: true, hurt: .1, remoteCombatDeathProgress: .25 } as EnemyState;
    renderer.drawEnemy(enemy);
    const frame = atlas.animations.idle.frames[0];
    expect(ctx.drawImage.mock.calls[0]).toEqual([pages[frame.page].image, frame.x, frame.y, frame.w, frame.h, atlas.x, atlas.y - 3 + ((sprite as LoadedEnemySprite).visualOffsetY ?? 0), atlas.w, atlas.h]);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
    expect(ctx.rotate).toHaveBeenCalledWith(.25 * .42 * -1);
    expect(ctx.globalAlpha).toBeCloseTo(.7 * .75);
  });

  const animatedFacingCases = Object.entries(ENEMY_SPRITE_LAYOUTS)
    .filter(([, layout]) => layout.animation)
    .flatMap(([kind]) => ([-1, 1] as const).flatMap((facingX) =>
      (["idle", "walk", "attack"] as const).map((motion) => ({ kind, facingX, motion }))));

  it.each(animatedFacingCases)("faces $kind toward $facingX during $motion without moving its anchor", ({ kind, facingX, motion }) => {
    const layout = ENEMY_SPRITE_LAYOUTS[kind];
    const atlas = layout.animation!;
    const pages = atlas.pages.map((page) => ({ ...page, image: { complete: true, naturalWidth: page.width, naturalHeight: page.height } as HTMLImageElement }));
    const sprite = { ...layout, animation: { ...atlas, pages }, layers: layout.layers.map((part) => ({ ...part, image: image(true) })) };
    let transform = { scaleX: 1, x: 0 };
    const stack: typeof transform[] = [];
    const drawTransforms: typeof transform[] = [];
    const ctx = {
      save: () => stack.push({ ...transform }),
      restore: () => { transform = stack.pop()!; },
      translate: (x: number) => { transform.x += x * transform.scaleX; },
      rotate: vi.fn(),
      scale: (x: number) => { transform.scaleX *= x; },
      drawImage: vi.fn(() => { drawTransforms.push({ ...transform }); }),
      globalAlpha: 1,
    };
    const renderer = createActorRenderer({
      ctx, camera: { x: 0, y: 0, zoom: 1 }, viewport: () => ({ width: 800, height: 800 }),
      devicePixelRatio: () => 1, gameTime: () => 0, player: { x: 100 + facingX * 100, y: 100 },
      enemySprites: { [kind]: sprite }, drawShadow: vi.fn(), enemyTextVisible: () => false,
    } as unknown as Parameters<typeof createActorRenderer>[0]);
    const enemy = { type: kind, x: 100, y: 100, vx: motion === "walk" ? facingX * 10 : 0, vy: 0,
      r: 20, phase: 0, facingX, engaged: motion === "attack", hurt: 0,
      attackAnimationElapsed: motion === "attack" ? 0 : undefined } as EnemyState;
    const before = { ...enemy };
    renderer.drawEnemy(enemy);
    const frame = atlas.animations[motion].frames[0];
    expect(ctx.drawImage.mock.calls[0]).toEqual([pages[frame.page].image, frame.x, frame.y, frame.w, frame.h, atlas.x, atlas.y - 3 + ((sprite as LoadedEnemySprite).visualOffsetY ?? 0), atlas.w, atlas.h]);
    // These captures are authored facing left, unlike the original enemy art.
    expect(-drawTransforms[0].scaleX).toBe(facingX);
    const anchorOffset = atlas.x + atlas.anchorX * atlas.w / atlas.frameWidth;
    expect(drawTransforms[0].x + drawTransforms[0].scaleX * anchorOffset).toBeCloseTo(100);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(enemy).toEqual(before);
    expect(transform).toEqual({ scaleX: 1, x: 0 });
    expect(stack).toHaveLength(0);
  });
});
