import { expect, it, vi } from "vitest";
vi.mock("../../../app/developer", () => ({ isDeveloperIdentity: () => true }));
import { TOWN_ARRIVAL as SOUL_ARRIVAL, TOWN_FEET_OFFSET as SOUL_FEET_OFFSET, TOWN_MAP_ID } from "../../../../shared/town";
import { TOWN_VILLAGE_PITS } from "../../town-village";
import { createTownRuntime } from "../town/town-runtime";
import { drawSoulWellFall, soulWellFall } from "./soul-well-fall";
import type { PlayerState } from "../types";

function world() {
  const player = { x: 0, y: 0, r: 16, hp: 100, maxHp: 100, moving: false, facing: 0 } as unknown as PlayerState;
  const fallIntoWell = vi.fn(async () => true);
  let onBlack: (() => void) | null = null;
  const fadeToWorld = vi.fn((action: () => void) => { onBlack = action; });
  const runtime = createTownRuntime({
    camera: { x: 0, y: 0, zoom: 1 }, source: () => ({ fallIntoWell }),
    player, decor: [], currentMapId: () => TOWN_MAP_ID, invalidateDepthOrder: () => {}, fadeToWorld,
  });
  const well = TOWN_VILLAGE_PITS[0];
  const cx = well.xs.reduce((sum, v) => sum + v, 0) / well.xs.length, cy = well.ys.reduce((sum, v) => sum + v, 0) / well.ys.length;
  return { player, runtime, fallIntoWell, fadeToWorld, black: () => onBlack?.(), cx, cy };
}
const frames = (runtime: ReturnType<typeof createTownRuntime>, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) runtime.update(1 / 60); };

it("lets a player walk into the opening and see the chamber before returning", () => {
  const { player, runtime, fallIntoWell, fadeToWorld, black, cx, cy } = world();
  Object.assign(player, { x: cx + 65, y: cy - SOUL_FEET_OFFSET });
  frames(runtime, 1.4);
  expect(soulWellFall.active).toBe(false);
  Object.assign(player, { x: cx - 8, moving: true });
  runtime.update(1 / 60);
  expect(soulWellFall.active).toBe(true);
  frames(runtime, .2);
  expect(player.x).toBeCloseTo(cx, 0);
  const atLip = player.y;
  frames(runtime, 3.4);
  expect(player.y).toBeGreaterThan(atLip);
  expect(soulWellFall.elapsed).toBeGreaterThan(3);
  expect(fadeToWorld).not.toHaveBeenCalled();
  expect(fallIntoWell).not.toHaveBeenCalled();
  frames(runtime, 2.5);
  expect(fadeToWorld).toHaveBeenCalledTimes(1);
  black();
  expect([player.x, player.y]).toEqual([SOUL_ARRIVAL.x, SOUL_ARRIVAL.y]);
  expect(soulWellFall.active).toBe(false);
  expect(fallIntoWell).toHaveBeenCalledTimes(1);
});

it("requires entering the opening and returns even when the fade callback never comes", () => {
  const { player, runtime, fallIntoWell, black, cx, cy } = world();
  Object.assign(player, { x: cx + 65, y: cy - SOUL_FEET_OFFSET });
  frames(runtime, 1.4);
  expect(runtime.tap(cx, cy)).toBe(false);
  player.x = cx;
  frames(runtime, 8);
  expect([player.x, player.y]).toEqual([SOUL_ARRIVAL.x, SOUL_ARRIVAL.y]);
  black();
  expect(fallIntoWell).toHaveBeenCalledTimes(1);
});

it("draws only what is above the well's lip while falling, and everything otherwise", () => {
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push("save"), restore: () => calls.push("restore"), beginPath: () => {}, clip: () => calls.push("clip"),
    rect: (_x: number, y: number, _w: number, h: number) => calls.push(`rect ${y + h}`), translate: () => {}, scale: () => {}, rotate: (angle: number) => calls.push(angle < 0 ? "trip left" : "trip right"),
  } as unknown as CanvasRenderingContext2D;
  const draw = vi.fn();
  Object.assign(soulWellFall, { active: false });
  drawSoulWellFall(ctx, 100, 200, 5_000, draw);
  expect(calls).toEqual([]);
  // The lip 20 units below the player's position: the clip's bottom edge is 20 below where they are drawn.
  Object.assign(soulWellFall, { active: true, lip: 5_020, progress: .5, elapsed: .2, direction: -1 });
  drawSoulWellFall(ctx, 100, 200, 5_000, draw);
  expect(calls).toEqual(["save", "rect 220", "clip", "trip left", "restore"]);
  expect(draw).toHaveBeenCalledTimes(2);
  Object.assign(soulWellFall, { active: false });
});
