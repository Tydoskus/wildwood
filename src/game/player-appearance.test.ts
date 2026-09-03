import { describe, expect, it } from "vitest";
import { FROST_ARMOR, STARTER_BOW } from "./inventory";
import {
  BOW_RIGHT_HAND_ANGLE_DEGREES,
  bowHeldAlignment,
  bowHeldAnchorX,
  bowHeldRotationRadians,
  drawStartingPlayer,
  heldWeaponRunMotion,
  type PlayerAppearanceAssets,
} from "./player-appearance";

const degrees = (radians: number) => radians * 180 / Math.PI;

describe("Bow pose", () => {
  it("keeps the native downward pose until combat aiming begins", () => {
    expect(BOW_RIGHT_HAND_ANGLE_DEGREES).toBe(125);
    expect(degrees(bowHeldRotationRadians({ facingLeft: false, heldInLeftHand: false }))).toBe(0);
    expect(degrees(bowHeldRotationRadians({ facingLeft: true, heldInLeftHand: true }))).toBe(0);
  });

  it("rotates mirrored left- and right-hand bows only when following combat aim", () => {
    expect(degrees(bowHeldRotationRadians({ combatFacing: Math.PI / 4, facingLeft: false, heldInLeftHand: false }))).toBeCloseTo(-10);
    expect(degrees(bowHeldRotationRadians({ combatFacing: Math.PI * .75, facingLeft: true, heldInLeftHand: false }))).toBeCloseTo(-10);
  });

  it("centers either hand's bow on the actor through actor mirroring", () => {
    expect(bowHeldAnchorX(false, false)).toBe(0);
    expect(bowHeldAnchorX(true, false)).toBe(0);
    expect(bowHeldAnchorX(false, true)).toBe(0);
    expect(bowHeldAnchorX(true, true)).toBe(0);
    expect(bowHeldAlignment(false)).toEqual({ x: 0, y: 0, scaleX: 1 });
    expect(bowHeldAlignment(true)).toEqual({ x: 0, y: 0, scaleX: -1 });
  });
});

describe("held weapon running motion", () => {
  it("keeps every held weapon steady while idle", () => {
    expect(heldWeaponRunMotion({ moving: false, gameTime: .25, heldInLeftHand: false })).toEqual({ x: 0, y: 0, rotation: 0 });
  });

  it("adds subtle mirrored arm sway while running", () => {
    const right = heldWeaponRunMotion({ moving: true, gameTime: .125, heldInLeftHand: false });
    const left = heldWeaponRunMotion({ moving: true, gameTime: .125, heldInLeftHand: true });
    expect(right.x).not.toBe(0);
    expect(right.y).not.toBe(0);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.y).toBeCloseTo(right.y);
    expect(left.rotation).toBeCloseTo(-right.rotation);
  });

  it("draws either weapon hand in front of chest armor in both directions", () => {
    const image = (name: string) => ({ complete: true, naturalWidth: 40, naturalHeight: 40, name }) as unknown as HTMLImageElement;
    const assets: PlayerAppearanceAssets = {
      basicFrontLeg: image("front-leg"),
      basicBackLeg: image("back-leg"),
      equipment: {
        [FROST_ARMOR]: { sprite: image("chest") },
        [STARTER_BOW]: { sprite: image("weapon") },
      },
    };

    for (const facing of [0, Math.PI]) {
      for (const hand of ["right", "left"] as const) {
        const draws: string[] = [];
        const context = {
          save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
          beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, bezierCurveTo() {}, closePath() {}, fill() {},
          drawImage(asset: HTMLImageElement) { draws.push((asset as unknown as { name: string }).name); },
        } as unknown as CanvasRenderingContext2D;
        drawStartingPlayer(context, assets, {
          x: 0,
          y: 0,
          facing,
          gameTime: 0,
          chestItem: FROST_ARMOR,
          rightHandItem: hand === "right" ? STARTER_BOW : "",
          leftHandItem: hand === "left" ? STARTER_BOW : "",
        });
        expect(draws.indexOf("weapon"), `${hand} hand facing ${facing}`).toBeGreaterThan(draws.indexOf("chest"));
      }
    }
  });
});
