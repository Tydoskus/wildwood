import {
  EMPTY_GUILD_HALL_LEVELS, GUILD_HALL_DOOR, GUILD_HALL_FEET_OFFSET, guildHallGuildId, guildHallRoom, isGuildHallMap, type GuildHallLevels,
} from "../../../shared/guild-hall";
import { guildHallBoard, guildHallDecor, guildHallDoorState, guildHallSeatAt, guildHallSeats, guildHallShown, guildHallSolids } from "../guild-hall";
import type { SoulSolid } from "../soul-village";
import type { MapId, WorldDecor } from "../world";
import { pushOutOf } from "./town-runtime";
import type { PlayerState } from "./types";

export type GuildHallSource = {
  guildHall?: () => { guildId: string; fund: number; levels: GuildHallLevels } | null;
  useGuildHallDoor?: () => Promise<boolean>;
};

const FEET_OFFSET = GUILD_HALL_FEET_OFFSET;
const FEET_RADIUS = 12;
/** The door swings open while feet are this near its sill. */
const DOOR_OPEN_RANGE = 120;
/** Going through: a few steps into the doorway while the screen goes dark. */
const DOORWAY_STEP = 22, DOORWAY_MS = 240;
/** Feet this near the upgrade board open it. */
const BOARD_RANGE = 55;
/** Sitting faces the table: north seats look down at it, south seats up. Facing is an angle, y down. */
const SEAT_FACING = { north: Math.PI / 2, south: -Math.PI / 2 } as const;

/**
 * Runs a guild hall on the client: its decor, walls and seats follow the
 * hall's upgrade levels; the front door opens as a member walks up and takes
 * them through (the dark comes down, the server moves them); standing still
 * at the great table sits down; the upgrade board opens the Guild Hall window.
 */
export function createGuildHallRuntime(deps: {
  source: () => GuildHallSource | null | undefined;
  player: PlayerState;
  decor: WorldDecor[];
  currentMapId: () => MapId;
  invalidateDepthOrder: () => void;
  /** Darkens the screen, runs the action once it is black, and brings the world back around the player. */
  fadeToWorld?: (onBlack: () => void, durationMs?: number) => void;
  clearInput?: () => void;
  openBoard: () => void;
  /** The guild's badge, fetched when a member arrives (-1 until it is known). */
  loadEmblem: () => Promise<number>;
}) {
  let shownKey = "";
  let solids: readonly SoulSolid[] = [];
  let size = 0;
  let lastY = Number.NaN;
  let atBoard = false;
  let emblemFor = "";
  let doorway: { inward: boolean; x: number; y: number; elapsed: number; done: boolean } | null = null;

  const levels = (): GuildHallLevels => deps.source()?.guildHall?.()?.levels ?? EMPTY_GUILD_HALL_LEVELS;

  /** The decor, walls and seats for the hall's levels: rebuilt when they change or a map load empties the decor. */
  function refresh(mapId: string) {
    const current = levels();
    const key = `${mapId}:${JSON.stringify(current)}`;
    if (key === shownKey && deps.decor.length) return;
    shownKey = key;
    size = current.size;
    guildHallShown.size = size;
    solids = guildHallSolids(current);
    guildHallShown.seats = guildHallSeats(current);
    deps.decor.splice(0, deps.decor.length, ...guildHallDecor(current));
    deps.invalidateDepthOrder();
  }

  function fetchEmblem(mapId: string) {
    if (emblemFor === mapId) return;
    emblemFor = mapId;
    guildHallShown.emblem = -1;
    void deps.loadEmblem().then(emblem => { if (emblemFor === mapId) guildHallShown.emblem = emblem; }, () => { emblemFor = ""; });
  }

  function resolveCollision() {
    const { player } = deps;
    const feet = { x: player.x, y: player.y + FEET_OFFSET, r: FEET_RADIUS };
    for (const solid of solids) {
      if (feet.x <= solid.left - feet.r || feet.x >= solid.right + feet.r || feet.y <= solid.top - feet.r || feet.y >= solid.bottom + feet.r) continue;
      pushOutOf(feet, solid);
    }
    player.x = feet.x;
    player.y = feet.y - FEET_OFFSET;
  }

  function finishDoorway() {
    const trip = doorway;
    if (!trip || trip.done) return;
    trip.done = true;
    const { player } = deps;
    const to = trip.inward ? guildHallRoom(size).inside : GUILD_HALL_DOOR.outside;
    player.x = to.x;
    player.y = to.y;
    player.moving = false;
    lastY = player.y;
    doorway = null;
    void (deps.source()?.useGuildHallDoor?.() ?? Promise.resolve(false)).catch(() => false);
  }
  function startDoorway(inward: boolean) {
    const { player } = deps;
    doorway = { inward, x: player.x, y: player.y, elapsed: 0, done: false };
    deps.clearInput?.();
    if (deps.fadeToWorld) deps.fadeToWorld(finishDoorway, DOORWAY_MS);
    else finishDoorway();
  }
  /** The few steps in: on into the doorway, through the wall, as the dark comes down. */
  function walkDoorway(dt: number) {
    if (!doorway) return;
    const { player } = deps;
    doorway.elapsed += dt;
    const t = Math.min(1, doorway.elapsed * 1_000 / DOORWAY_MS);
    player.x = doorway.x + (GUILD_HALL_DOOR.x - doorway.x) * t * (doorway.inward ? 1 : 0);
    player.y = doorway.y + (doorway.inward ? -1 : 1) * DOORWAY_STEP * t;
    player.moving = true;
    // A fade that never came (one was already running) must not leave the player stuck in a doorway.
    if (doorway.elapsed > 1.5) finishDoorway();
  }
  /** The door stands open while someone is near it; walking on into it, or out of the room's doorway, goes through. */
  function checkDoor() {
    const { player } = deps;
    const feetX = player.x, feetY = player.y + FEET_OFFSET;
    guildHallDoorState.open = player.hp > 0 && Math.hypot(feetX - GUILD_HALL_DOOR.x, feetY - GUILD_HALL_DOOR.enter) < DOOR_OPEN_RANGE;
    if (player.hp <= 0) return;
    const heading = Number.isFinite(lastY) ? player.y - lastY : 0;
    if (guildHallDoorState.open && heading < 0 && Math.abs(feetX - GUILD_HALL_DOOR.x) < GUILD_HALL_DOOR.half && feetY < GUILD_HALL_DOOR.enter + FEET_RADIUS + 8) {
      startDoorway(true);
      return;
    }
    const room = guildHallRoom(size);
    const inRoom = player.x >= room.left && player.x <= room.right && feetY >= room.top - 60 && feetY <= room.bottom + 60;
    if (inRoom && heading > 0 && Math.abs(feetX - room.exit.x) < room.exit.half && feetY > room.exit.y + 4) startDoorway(false);
  }

  /** Standing still by a seat sits down in it, facing the table (the renderer draws them on the seat itself). */
  function checkSeat() {
    const { player } = deps;
    if (player.moving || player.hp <= 0) return;
    const seat = guildHallSeatAt(player.x, player.y + FEET_OFFSET);
    if (seat) player.facing = SEAT_FACING[seat.side];
  }

  function checkBoard() {
    const { player } = deps;
    const board = guildHallBoard(size);
    const near = player.hp > 0 && Math.hypot(player.x - board.x, player.y + FEET_OFFSET - board.y) < BOARD_RANGE;
    if (near && !atBoard) { deps.clearInput?.(); deps.openBoard(); }
    atBoard = near;
  }

  return {
    update(dt: number) {
      const mapId = deps.currentMapId();
      if (!isGuildHallMap(mapId)) {
        if (shownKey) { shownKey = ""; guildHallShown.seats = []; guildHallDoorState.open = false; doorway = null; emblemFor = ""; }
        return;
      }
      refresh(mapId);
      fetchEmblem(mapId);
      if (doorway) { walkDoorway(dt); return; }
      checkDoor();
      if (doorway) return;
      resolveCollision();
      checkSeat();
      checkBoard();
      lastY = deps.player.y;
    },
    /** The guild whose hall the player is in, or null outside one. */
    guildId: () => guildHallGuildId(deps.currentMapId()),
  };
}
export type GuildHallRuntime = ReturnType<typeof createGuildHallRuntime>;
