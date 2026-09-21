import { afterEach, describe, expect, it, vi } from "vitest";
import { FROST_ARMOR, STARTER_BOW } from "./inventory";
import {
  bowHeldAlignment,
  bowHeldAnchorX,
  bowHeldRotationRadians,
  drawStartingPlayer,
  loadPlayerAppearanceAssets,
  PLAYER_PART_RETRY_DELAYS_MS,
  heldWeaponRunMotion,
  type PlayerAppearanceAssets,
} from "./player-appearance";

const degrees = (radians: number) => radians * 180 / Math.PI;

describe("Bow pose", () => {
  it("keeps the native downward pose until combat aiming begins", () => {
    expect(degrees(bowHeldRotationRadians({ facingLeft: false, heldInLeftHand: false }))).toBe(0);
    expect(degrees(bowHeldRotationRadians({ facingLeft: true, heldInLeftHand: true }))).toBe(0);
  });

  it("rotates mirrored left- and right-hand bows only when following combat aim", () => {
    for (const combatFacing of [0, Math.PI / 4, Math.PI / 2, Math.PI * .75, Math.PI, -Math.PI / 4, -Math.PI * .75]) {
      for (const heldInLeftHand of [false, true]) {
        const facingLeft = Math.cos(combatFacing) < 0;
        const rotation = bowHeldRotationRadians({ combatFacing, facingLeft, heldInLeftHand });
        // The source firing axis is (0, 1). Hand mirroring preserves it;
        // rotate it, then apply the character's horizontal mirror.
        const x = -Math.sin(rotation) * (facingLeft ? -1 : 1);
        const y = Math.cos(rotation);
        expect(x).toBeCloseTo(Math.cos(combatFacing));
        expect(y).toBeCloseTo(Math.sin(combatFacing));
      }
    }
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
          stroke() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, bezierCurveTo() {}, closePath() {}, fill() {},
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

describe("body-part sprites that fail to load", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("are asked for again with a fresh request instead of staying broken for the page", () => {
    vi.useFakeTimers();
    const images: FakeImage[] = [];
    class FakeImage extends EventTarget {
      src = "";
      constructor() { super(); images.push(this); }
    }
    vi.stubGlobal("Image", FakeImage);
    const settled = vi.fn();
    loadPlayerAppearanceAssets(settled);
    const leg = images.find((image) => image.src.endsWith("basic-leg-front.webp"))!;
    for (const image of images) if (image !== leg) image.dispatchEvent(new Event("load"));
    expect(settled).not.toHaveBeenCalled();
    leg.dispatchEvent(new Event("error"));
    expect(settled).toHaveBeenCalledTimes(1);           // the world is not held back for one sprite
    vi.advanceTimersByTime(PLAYER_PART_RETRY_DELAYS_MS[0]);
    expect(leg.src).toContain("basic-leg-front.webp?asset-retry=1");
    leg.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(PLAYER_PART_RETRY_DELAYS_MS[1]);
    expect(leg.src).toContain("?asset-retry=2");
    for (let attempt = 3; attempt <= PLAYER_PART_RETRY_DELAYS_MS.length + 2; attempt++) {
      leg.dispatchEvent(new Event("error"));
      vi.advanceTimersByTime(PLAYER_PART_RETRY_DELAYS_MS[PLAYER_PART_RETRY_DELAYS_MS.length - 1]);
    }
    expect(leg.src).toContain(`?asset-retry=${PLAYER_PART_RETRY_DELAYS_MS.length + 2}`); // the last delay repeats
    leg.dispatchEvent(new Event("load"));
    expect(settled).toHaveBeenCalledTimes(2);           // a late arrival redraws
  });
});
