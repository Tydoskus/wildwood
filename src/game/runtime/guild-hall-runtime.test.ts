import { expect, it, vi } from "vitest";
import { EMPTY_GUILD_HALL_LEVELS, GUILD_HALL_DOOR, GUILD_HALL_FEET_OFFSET, guildHallRoom, type GuildHallLevels } from "../../../shared/guild-hall";
import { guildHallBoard, guildHallDoorState, guildHallSeatAt, guildHallSeats, guildHallShown } from "../guild-hall";
import type { MapId, WorldDecor } from "../world";
import { createGuildHallRuntime } from "./guild-hall-runtime";
import type { PlayerState } from "./types";

function hall(levels: GuildHallLevels = EMPTY_GUILD_HALL_LEVELS) {
  const player = { x: GUILD_HALL_DOOR.outside.x, y: GUILD_HALL_DOOR.outside.y + 80, r: 16, hp: 100, maxHp: 100, moving: false, facing: 0 } as unknown as PlayerState;
  const decor: WorldDecor[] = [];
  let mapId: MapId = "guild_hall_7";
  const state = { levels };
  const useGuildHallDoor = vi.fn(async () => true);
  const openBoard = vi.fn();
  let onBlack: (() => void) | null = null;
  const runtime = createGuildHallRuntime({
    source: () => ({ guildHall: () => ({ guildId: "7", fund: 0, levels: state.levels }), useGuildHallDoor }),
    player, decor, currentMapId: () => mapId, invalidateDepthOrder: () => {}, openBoard,
    fadeToWorld: action => { onBlack = action; }, loadEmblem: async () => 3,
  });
  const step = (dy = 0, frames = 1) => { for (let i = 0; i < frames; i++) { player.y += dy; runtime.update(1 / 60); } };
  return { player, decor, runtime, state, useGuildHallDoor, openBoard, step, black: () => onBlack?.(), leave: () => { mapId = "home_exterior"; } };
}

it("lays out the hall's decor for its levels, and again when an upgrade lands", async () => {
  const h = hall();
  h.step();
  const bare = h.decor.length;
  expect(bare).toBeGreaterThan(0);
  expect(guildHallShown.seats).toHaveLength(6);
  h.state.levels = { ...EMPTY_GUILD_HALL_LEVELS, table: 3, banners: 2 };
  h.step();
  expect(h.decor.length).toBeGreaterThan(bare);
  expect(guildHallShown.seats).toHaveLength(20);
  await Promise.resolve();
  expect(guildHallShown.emblem).toBe(3);
  h.leave(); h.step();
  expect(guildHallShown.seats).toHaveLength(0);
});

it("opens the door as a member walks up, takes them in on the dark, and out of the room's doorway", () => {
  const h = hall();
  h.step();
  expect(guildHallDoorState.open).toBe(false);
  // Walk up the yard to the door.
  for (let i = 0; i < 120 && !h.useGuildHallDoor.mock.calls.length; i++) { h.step(-2); if (guildHallDoorState.open) h.black(); }
  expect(h.useGuildHallDoor).toHaveBeenCalledTimes(1);
  expect([h.player.x, h.player.y]).toEqual([guildHallRoom(0).inside.x, guildHallRoom(0).inside.y]);
  // And back out: down through the doorway.
  for (let i = 0; i < 120 && h.useGuildHallDoor.mock.calls.length === 1; i++) { h.step(2); h.black(); }
  expect(h.useGuildHallDoor).toHaveBeenCalledTimes(2);
  expect([h.player.x, h.player.y]).toEqual([GUILD_HALL_DOOR.outside.x, GUILD_HALL_DOOR.outside.y]);
});

it("sits a player down when they stop by a seat, facing the table, without moving them", () => {
  const h = hall();
  h.step();
  const [north] = guildHallSeats(EMPTY_GUILD_HALL_LEVELS).filter(seat => seat.side === "north");
  const south = guildHallSeats(EMPTY_GUILD_HALL_LEVELS).find(seat => seat.side === "south")!;
  Object.assign(h.player, { x: south.x + 10, y: south.y - GUILD_HALL_FEET_OFFSET + 8, moving: true });
  h.step();
  expect(h.player.facing).toBe(0);
  h.player.moving = false;
  h.step();
  // The renderer draws them on the seat; their position, which other players see too, stays theirs.
  expect([h.player.x, h.player.y]).toEqual([south.x + 10, south.y - GUILD_HALL_FEET_OFFSET + 8]);
  expect(guildHallSeatAt(h.player.x, h.player.y + GUILD_HALL_FEET_OFFSET)).toEqual(south);
  expect(h.player.facing).toBeCloseTo(-Math.PI / 2);
  Object.assign(h.player, { x: north.x - 6, y: north.y - GUILD_HALL_FEET_OFFSET });
  h.step();
  expect(h.player.facing).toBeCloseTo(Math.PI / 2);
});

it("opens the upgrade board once as a player walks up to it", () => {
  const h = hall();
  const board = guildHallBoard(0);
  Object.assign(h.player, { x: board.x, y: board.y - GUILD_HALL_FEET_OFFSET });
  h.step(); h.step();
  expect(h.openBoard).toHaveBeenCalledTimes(1);
  h.player.x -= 200; h.step();
  Object.assign(h.player, { x: board.x, y: board.y - GUILD_HALL_FEET_OFFSET }); h.step();
  expect(h.openBoard).toHaveBeenCalledTimes(2);
});

it("tells the server where the member stands before the door, and puts them back outside when it refuses", async () => {
  const h = hall();
  const syncMovementState = vi.fn();
  const refuse = vi.fn(async () => { throw new Error("The door is too far away."); });
  const fade: { onBlack?: () => void } = {};
  const runtime = createGuildHallRuntime({
    source: () => ({ guildHall: () => ({ guildId: "7", fund: 0, levels: EMPTY_GUILD_HALL_LEVELS }), useGuildHallDoor: refuse, syncMovementState }),
    player: h.player, decor: [], currentMapId: () => "guild_hall_7", invalidateDepthOrder: () => {}, openBoard: () => {},
    fadeToWorld: action => { fade.onBlack = action; }, loadEmblem: async () => 3,
  });
  for (let i = 0; i < 120 && !refuse.mock.calls.length; i++) { h.player.y -= 2; runtime.update(1 / 60); if (guildHallDoorState.open) fade.onBlack?.(); }
  expect(refuse).toHaveBeenCalledTimes(1);
  expect(syncMovementState).toHaveBeenCalledTimes(1);
  expect(syncMovementState.mock.calls[0].slice(2)).toEqual([0, 0, "keyboard", true]);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(Math.hypot(h.player.x - GUILD_HALL_DOOR.x, h.player.y + GUILD_HALL_FEET_OFFSET - GUILD_HALL_DOOR.enter)).toBeLessThan(60);
});
