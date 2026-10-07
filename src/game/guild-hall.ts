import type { GuildHallLevels, GuildHallPart } from "../../shared/guild-hall";
import scene from "./guild-hall-scene.json";
import type { SoulSolid } from "./soul-village";
import type { WorldDecor } from "./world";

/**
 * A guild hall's art, baked by scripts/art/bake-guild-hall.mjs: the courtyard's
 * ground, the great hall's room pictures (one per size), every prop with the
 * upgrade levels it shows at, the crest points the guild's badge is drawn on,
 * the table's seats, the upgrade board and what nobody walks through.
 */
export const GUILD_HALL_PROPS_SOURCE = "assets/wildstat/guild-hall/hall-props.webp";
export const GUILD_HALL_GROUND_SOURCE = "assets/wildstat/guild-hall/hall-ground.webp";
export const GUILD_HALL_ROOMS_SOURCE = "assets/wildstat/guild-hall/hall-rooms.webp";

type Condition = readonly (readonly [string, number, number])[];
/** Whether something baked with these conditions shows in a hall at these levels. */
export function shownAt(levels: GuildHallLevels, when: Condition | undefined) {
  return !when || when.every(([part, min, max]) => {
    const level = levels[part as GuildHallPart] ?? 0;
    return level >= min && level <= max;
  });
}

type Frame = { x: number; y: number; w: number; h: number; ax: number; ay: number };
const frames = new Map<string, Frame>(Object.entries(scene.frames).map(([id, [x, y, w, h, ax, ay]]) => [id, { x, y, w, h, ax, ay }]));
/** A hall prop's frame in hall-props.webp. */
export const guildHallFrame = (name: string) => frames.get(name) ?? null;

/** The courtyard's ground image's rectangle in world units. */
export const GUILD_HALL_GROUND = Object.freeze({ ...scene.ground });
/** Everything east of this is the dark around the great hall's room. */
export const GUILD_HALL_INTERIOR_LEFT = scene.interiorLeft;

/** Whether the hall's front door stands open: the runtime opens it as someone walks up, the renderer draws it so. */
export const guildHallDoorState = { open: false };
/** The hall's badge (its index in GUILD_EMBLEMS, -1 until the guild is known) and seats now: set by the runtime, drawn by the renderer. */
export const guildHallShown: { emblem: number; size: number; seats: readonly GuildHallSeat[] } = { emblem: -1, size: 0, seats: [] };
/**
 * How close a standing player's feet must be to a seat to be sitting in it. Sitting is drawn, never moved: every
 * client draws everyone from the positions it already has, so a sitter needs no packet the server would weigh.
 */
export const GUILD_HALL_SEATED_WITHIN = 26;
/** The nearest seat a player standing with their feet here is sitting in, if any. */
export function guildHallSeatAt(x: number, feetY: number) {
  let nearest: GuildHallSeat | null = null, distance = GUILD_HALL_SEATED_WITHIN;
  for (const seat of guildHallShown.seats) {
    const d = Math.hypot(seat.x - x, seat.y - feetY);
    if (d < distance) { nearest = seat; distance = d; }
  }
  return nearest;
}

type Prop = (typeof scene.props)[number] & { open?: number; door?: number; ground?: boolean; shadow?: boolean;
  anim?: { frames: number[]; times: number[]; length: number }; when?: Condition };
type Crest = (typeof scene.crests)[number] & { when?: Condition };

/** The hall's props and crests at these levels, as world decor that sorts by depth like the Soul village's. */
export function guildHallDecor(levels: GuildHallLevels): WorldDecor[] {
  const decor: WorldDecor[] = [];
  for (const prop of scene.props as Prop[]) {
    if (!shownAt(levels, prop.when)) continue;
    decor.push({
      type: "soulProp", sheet: "hall", frame: String(prop.f), s: 1, x: prop.x, y: prop.d, dy: prop.y - prop.d,
      ...(prop.ground ? { ground: true } : {}), ...(prop.shadow ? { shadow: true } : {}),
      ...(prop.open !== undefined ? { door: prop.door ?? 0, openFrame: String(prop.open) } : {}),
      ...(prop.anim ? { anim: { frames: prop.anim.frames, times: prop.anim.times, length: prop.anim.length } } : {}),
    });
  }
  for (const crest of scene.crests as Crest[]) {
    if (!shownAt(levels, crest.when)) continue;
    // Just in front of its banner, so the badge is never under the cloth.
    decor.push({ type: "soulProp", sheet: "hall", frame: "", crest: crest.size, s: 1, x: crest.x, y: crest.d + .01, dy: crest.dy });
  }
  return decor;
}

function solid(flat: readonly number[]): SoulSolid {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { xs.push(flat[i]); ys.push(flat[i + 1]); }
  return { xs, ys, left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}
const SOLIDS = (scene.solids as { points: number[]; when?: Condition }[]).map(entry => ({ when: entry.when, solid: solid(entry.points) }));
/** What nobody walks through at these levels: the building, trees, walls and furniture. */
export const guildHallSolids = (levels: GuildHallLevels) => SOLIDS.filter(entry => shownAt(levels, entry.when)).map(entry => entry.solid);

export type GuildHallSeat = { x: number; y: number; side: "north" | "south" };
/** The great table's seats at these levels. North seats are behind the table, south seats in front. */
export const guildHallSeats = (levels: GuildHallLevels): GuildHallSeat[] =>
  (scene.seats as unknown as (GuildHallSeat & { when?: Condition })[]).filter(seat => shownAt(levels, seat.when)).map(({ x, y, side }) => ({ x, y, side }));

/** Where a player stands to read the upgrade board in a hall this size. */
export const guildHallBoard = (size: number) => scene.boards.find(board => board.size === size) ?? scene.boards[0];

/** The room picture for a hall this size: its rectangle in hall-rooms.webp and where it stands in the world. */
export function guildHallRoomPicture(size: number) {
  const room = scene.rooms.find(entry => entry.size === size) ?? scene.rooms[0];
  const [sx, sy, w, h] = room.sheet;
  return { sx, sy, w, h, x: room.at[0], y: room.at[1] };
}
