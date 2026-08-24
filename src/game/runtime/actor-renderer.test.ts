import { describe, expect, it } from "vitest";
import { ENEMY_BOW_AIM_OFFSET_RADIANS, type LoadedEnemySprite, type LoadedSpriteLayer } from "../enemies";
import { drawableEnemyLayers, enemyShadowOffsetY, enemySpriteVerticalBounds, enemyWeaponAimRotation, enemyWeaponLayerRotation } from "./actor-renderer";

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

  it("turns source-up archer bows to actor-local right before tracking a target", () => {
    const enemy = { x: 10, y: 10, facingX: 1 as const, engaged: false };
    expect(enemyWeaponLayerRotation(enemy, { x: 30, y: 10 }, ENEMY_BOW_AIM_OFFSET_RADIANS)).toBeCloseTo(Math.PI / 2);
    expect(enemyWeaponLayerRotation({ ...enemy, engaged: true }, { x: 30, y: 30 }, ENEMY_BOW_AIM_OFFSET_RADIANS)).toBeCloseTo(Math.PI * .75);
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
});
