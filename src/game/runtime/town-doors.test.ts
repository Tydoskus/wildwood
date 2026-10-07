import { expect, it, vi } from "vitest";
vi.mock("../../app/developer", () => ({ isDeveloperIdentity: () => true }));
import { TOWN_DOORS, TOWN_MAP_ID } from "../../../shared/town";
import { SOUL_DOORS_OPEN } from "../soul-village";
import { createTownRuntime } from "./town-runtime";
import type { PlayerState } from "./types";

function world() {
  const player = { x: 0, y: 0, r: 16, hp: 100, maxHp: 100, moving: false, facing: 0 } as unknown as PlayerState;
  const useTownDoor = vi.fn(async () => true);
  const runtime = createTownRuntime({
    source: () => ({ useTownDoor }),
    player, decor: [], currentMapId: () => TOWN_MAP_ID, invalidateDepthOrder: () => {},
  });
  /** Holds a direction for up to `frames` frames, as a player walking would, until a door takes them. */
  const walk = (dy: number, frames = 120) => {
    const calls = useTownDoor.mock.calls.length;
    for (let i = 0; i < frames && useTownDoor.mock.calls.length === calls; i++) { player.y += dy; runtime.update(1 / 60); }
  };
  return { player, runtime, useTownDoor, walk };
}

it("opens every village door as a player walks up, takes them in at its sill, and out through the room's doorway", () => {
  for (const door of TOWN_DOORS) {
    const { player, runtime, useTownDoor, walk } = world();
    Object.assign(player, door.outside);
    runtime.update(1 / 60);
    expect(SOUL_DOORS_OPEN.has(door.index)).toBe(true);
    walk(-4);
    expect(useTownDoor).toHaveBeenLastCalledWith(door.index);
    expect([player.x, player.y]).toEqual([door.inside.x, door.inside.y]);
    walk(4);
    expect(useTownDoor).toHaveBeenCalledTimes(2);
    expect([player.x, player.y]).toEqual([door.outside.x, door.outside.y]);
  }
});

it("does not take a player who only walks past a door", () => {
  const door = TOWN_DOORS[0];
  const { player, runtime, useTownDoor } = world();
  Object.assign(player, door.outside);
  for (let i = 0; i < 40; i++) { player.x += 4; runtime.update(1 / 60); }
  expect(useTownDoor).not.toHaveBeenCalled();
});

it("keeps a player in a room: its walls and furniture stop them, only the doorway lets them out", () => {
  const door = TOWN_DOORS[3];
  const { player, runtime, useTownDoor } = world();
  Object.assign(player, door.inside);
  for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6]] as const) {
    Object.assign(player, door.inside);
    for (let i = 0; i < 400; i++) { player.x += dx; player.y += dy; runtime.update(1 / 60); }
    expect(player.x).toBeGreaterThan(door.room.left);
    expect(player.x).toBeLessThan(door.room.right);
    expect(player.y).toBeGreaterThan(door.room.top - 60);
  }
  expect(useTownDoor).not.toHaveBeenCalled();
});
