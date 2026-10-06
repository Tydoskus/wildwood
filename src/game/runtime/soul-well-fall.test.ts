import { expect, it, vi } from "vitest";
vi.mock("../../app/developer", () => ({ isDeveloperIdentity: () => true }));
import { SOUL_ARRIVAL, SOUL_FEET_OFFSET, SOUL_MAP_ID } from "../../../shared/soul-dimension";
import { SOUL_VILLAGE_PITS } from "../soul-village";
import { createSoulDimensionRuntime } from "./soul-dimension-runtime";
import { drawSoulWellFall, soulWellFall } from "./soul-well-fall";
import type { PlayerState } from "./types";

function world() {
  const player = { x: 0, y: 0, r: 16, hp: 100, maxHp: 100, moving: false, facing: 0 } as unknown as PlayerState;
  const fallIntoWell = vi.fn(async () => true);
  let onBlack: (() => void) | null = null;
  const fadeToWorld = vi.fn((action: () => void) => { onBlack = action; });
  const runtime = createSoulDimensionRuntime({
    source: () => ({ fallIntoWell, soulDimensionOpen: () => true }),
    player, enemies: [], spawnSites: [], decor: [], currentMapId: () => SOUL_MAP_ID, spawnFromSite: () => {},
    invalidateDepthOrder: () => {}, homeMap: {}, strength: () => ({ dps: 10, maxHp: 100, armor: 0, regen: 0 }), fadeToWorld,
  });
  const well = SOUL_VILLAGE_PITS[0];
  const cx = well.xs.reduce((sum, v) => sum + v, 0) / well.xs.length, cy = well.ys.reduce((sum, v) => sum + v, 0) / well.ys.length;
  return { player, runtime, fallIntoWell, fadeToWorld, black: () => onBlack?.(), cx, cy };
}
const frames = (runtime: ReturnType<typeof createSoulDimensionRuntime>, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) runtime.update(1 / 60); };

it("falls into a well: to its middle, down past the lip with the camera, dark, then back on the square", () => {
  const { player, runtime, fallIntoWell, fadeToWorld, black, cx, cy } = world();
  // Feet a little off the middle, inside the opening.
  Object.assign(player, { x: cx - 8, y: cy - SOUL_FEET_OFFSET + 4 });
  runtime.update(1 / 60);
  expect(soulWellFall.active).toBe(true);
  // The stumble: to the well's middle.
  frames(runtime, .2);
  expect(player.x).toBeCloseTo(cx, 0);
  const atLip = player.y;
  // The drop: the player (and so the camera) goes down, faster and faster, as they shrink.
  frames(runtime, .3);
  const partway = player.y;
  expect(partway).toBeGreaterThan(atLip);
  expect(soulWellFall.progress).toBeGreaterThan(0);
  // The dark comes down once, partway into the drop.
  expect(fadeToWorld).toHaveBeenCalledTimes(1);
  frames(runtime, .3);
  expect(player.y - partway).toBeGreaterThan(partway - atLip);
  expect(fallIntoWell).not.toHaveBeenCalled();
  // On black: back on the square, and the server is told.
  black();
  expect([player.x, player.y]).toEqual([SOUL_ARRIVAL.x, SOUL_ARRIVAL.y]);
  expect(soulWellFall.active).toBe(false);
  expect(fallIntoWell).toHaveBeenCalledTimes(1);
  // Walking on afterwards does not fall again.
  frames(runtime, .5);
  expect(fallIntoWell).toHaveBeenCalledTimes(1);
});

it("never leaves a player in the well when the fade does not come", () => {
  const { player, runtime, fallIntoWell, cx, cy } = world();
  Object.assign(player, { x: cx, y: cy - SOUL_FEET_OFFSET });
  frames(runtime, 3.5);
  expect([player.x, player.y]).toEqual([SOUL_ARRIVAL.x, SOUL_ARRIVAL.y]);
  expect(fallIntoWell).toHaveBeenCalledTimes(1);
});

it("draws only what is above the well's lip while falling, and everything otherwise", () => {
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push("save"), restore: () => calls.push("restore"), beginPath: () => {}, clip: () => calls.push("clip"),
    rect: (_x: number, y: number, _w: number, h: number) => calls.push(`rect ${y + h}`), translate: () => {}, scale: () => {},
  } as unknown as CanvasRenderingContext2D;
  const draw = vi.fn();
  Object.assign(soulWellFall, { active: false });
  drawSoulWellFall(ctx, 100, 200, 5_000, draw);
  expect(calls).toEqual([]);
  // The lip 20 units below the player's position: the clip's bottom edge is 20 below where they are drawn.
  Object.assign(soulWellFall, { active: true, lip: 5_020, progress: .5 });
  drawSoulWellFall(ctx, 100, 200, 5_000, draw);
  expect(calls).toEqual(["save", "rect 220", "clip", "restore"]);
  expect(draw).toHaveBeenCalledTimes(2);
  Object.assign(soulWellFall, { active: false });
});
