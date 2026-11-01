import geometry from "./guild-hall-geometry.json";

/**
 * Guild halls: every guild's own hall, a map of its own that only its members
 * enter (`guild_hall_<guildId>`), with a courtyard outside and a great hall
 * inside. Upgrades change how it looks and how big it is, and each gives every
 * member a small bonus (GUILD_HALL_BONUSES), never a fighting stat. They are
 * paid from the hall fund, which the guild's weekly quest points fill as they
 * are earned: every point still counts for the week's bonus as well.
 */
export const GUILD_HALL_MAP_PREFIX = "guild_hall_";
export const guildHallMapId = (guildId: bigint | string | number) => `${GUILD_HALL_MAP_PREFIX}${String(guildId)}`;
export type GuildHallMapId = `guild_hall_${string}`;
export const isGuildHallMap = (mapId: unknown): mapId is GuildHallMapId =>
  typeof mapId === "string" && /^guild_hall_\d{1,20}$/.test(mapId);
/** The guild a hall map belongs to, or null for any other map. */
export function guildHallGuildId(mapId: unknown): bigint | null {
  return isGuildHallMap(mapId) ? BigInt(mapId.slice(GUILD_HALL_MAP_PREFIX.length)) : null;
}

/**
 * The hall's world: outdoors on the left (the courtyard in the middle of a wood), the great hall's rooms (one per
 * size) on the right. Under 6553 each way, so the narrow motion format still carries it.
 */
export const GUILD_HALL_WORLD = Object.freeze({ width: 6_400, height: 4_000 });
/** Where a member arrives: at the foot of the yard, by the portal home (baked with the art, scripts/art/bake-guild-hall.mjs). */
export const GUILD_HALL_ARRIVAL = Object.freeze({ ...geometry.arrival });
/** The portal home, on the round pad at the foot of the yard's path. */
export const GUILD_HALL_HOME_PAD = Object.freeze({ ...geometry.homePad, width: 150, height: 150, depth: geometry.homePad.y });

export type GuildHallPart = "table" | "size" | "banners" | "hearth" | "trophies" | "lights" | "courtyard";
export type GuildHallLevels = Record<GuildHallPart, number>;
/** Each upgrade's name, what each level is, and what each level costs in quest points (level 0 is free). */
export const GUILD_HALL_PARTS: readonly { id: GuildHallPart; name: string; levels: readonly string[]; costs: readonly number[] }[] = [
  { id: "table", name: "Great Table", levels: ["Six Seats", "Ten Seats", "Fourteen Seats", "Twenty Seats"], costs: [0, 150, 400, 800] },
  { id: "size", name: "Hall Size", levels: ["Small Hall", "Long Hall", "Grand Hall"], costs: [0, 400, 1_000] },
  { id: "banners", name: "Crest Banners", levels: ["One Banner", "Banners At The Door", "Banners Everywhere"], costs: [0, 100, 300] },
  { id: "hearth", name: "Hearth", levels: ["No Hearth", "Fireplace", "Great Hearth"], costs: [0, 200, 500] },
  { id: "trophies", name: "Trophy Wall", levels: ["Bare Wall", "Trophy Shelf", "Trophy Wall"], costs: [0, 250, 600] },
  { id: "lights", name: "Lanterns", levels: ["A Few Lanterns", "Lantern Rows", "Chandeliers"], costs: [0, 100, 250] },
  { id: "courtyard", name: "Courtyard", levels: ["Bare Yard", "Trees And Flowers", "Fountain Garden"], costs: [0, 150, 400] },
];
export const GUILD_HALL_PART_IDS = GUILD_HALL_PARTS.map(part => part.id);
export const EMPTY_GUILD_HALL_LEVELS: Readonly<GuildHallLevels> = Object.freeze(Object.fromEntries(GUILD_HALL_PART_IDS.map(id => [id, 0])) as GuildHallLevels);

const percent = (value: number) => `${Math.round(value * 100)}%`;
/**
 * What each upgrade gives every member, by level (level 0 gives nothing). Small, and never a fighting stat, so the
 * server's kill bounds stand; the server applies them (spacetimedb/src/guild-hall-bonus.ts).
 */
export const GUILD_HALL_BONUSES: Readonly<Record<GuildHallPart, { values: readonly number[]; text: (value: number) => string }>> = {
  // Feasts at the table: gold drops a little more often.
  table: { values: [0, .05, .1, .15], text: value => `+${percent(value)} Gold Drop Chance` },
  // A bigger hall draws more: quest points add a share again to the fund.
  size: { values: [0, .1, .2], text: value => `+${percent(value)} Quest Points To The Hall Fund` },
  // Members train under the crest.
  banners: { values: [0, .05, .1], text: value => `+${percent(value)} Weapon Mastery` },
  // A warm place to rest: a longer offline window, in seconds.
  hearth: { values: [0, 1_800, 3_600], text: value => value >= 3_600 ? `+${value / 3_600} Hour Offline Time` : `+${value / 60} Min Offline Time` },
  // Every boss's head wants a place on the wall: gold on its first clear in a run.
  trophies: { values: [0, 2, 4], text: value => `+${value} Gold Per First Boss Clear` },
  // Work goes on by lantern light while away.
  lights: { values: [0, .1, .2], text: value => `+${percent(value)} Offline Mining And Chopping Speed` },
  // The garden's soil: a chance of one more ore or log from each rock or tree.
  courtyard: { values: [0, .03, .06], text: value => `+${percent(value)} Chance Of An Extra Ore Or Log` },
};
/** An upgrade's bonus at the hall's levels. */
export const guildHallBonus = (levels: GuildHallLevels, part: GuildHallPart) => GUILD_HALL_BONUSES[part].values[levels[part]] ?? 0;

/** Seats at the great table, by its level. */
export const GUILD_HALL_TABLE_SEATS = [6, 10, 14, 20] as const;

/** A stored levels value, cleaned: unknown parts dropped, every level within its part's range. */
export function parseGuildHallLevels(json: string | null | undefined): GuildHallLevels {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(json || "{}") ?? {}; } catch { raw = {}; }
  const levels = { ...EMPTY_GUILD_HALL_LEVELS };
  for (const part of GUILD_HALL_PARTS) {
    const value = Number(raw[part.id]);
    if (Number.isInteger(value)) levels[part.id] = Math.max(0, Math.min(part.levels.length - 1, value));
  }
  return levels;
}

/** What the next level of a part costs, or null when it is at its last. */
export function guildHallUpgradeCost(levels: GuildHallLevels, part: GuildHallPart) {
  const definition = GUILD_HALL_PARTS.find(entry => entry.id === part);
  if (!definition) return null;
  const next = levels[part] + 1;
  return next < definition.levels.length ? definition.costs[next] : null;
}

/** Where feet are below a player's position: what the door and walls are measured against. */
export const GUILD_HALL_FEET_OFFSET = 29;
/** How far from the door (or out of the room) the server still lets a player through it: their position lags a little. */
export const GUILD_HALL_DOOR_REACH = 160;
/** The hall's door, baked with its art (scripts/art/bake-guild-hall.mjs): its sill, half-width, and the wall's front where feet stop. */
export const GUILD_HALL_DOOR = Object.freeze({ ...geometry.door, outside: { x: geometry.door.x, y: geometry.door.y + 44 - GUILD_HALL_FEET_OFFSET } });
/** The great hall in each size: its floor, the doorway out, and where a member stands on coming in. */
export const GUILD_HALL_ROOMS = geometry.rooms.map(room => {
  const [x, y, w, h] = room.floor;
  return Object.freeze({ left: x, top: y, right: x + w, bottom: y + h, exit: room.exit,
    inside: { x: room.exit.x, y: room.exit.y - 60 - GUILD_HALL_FEET_OFFSET } });
});
/** Everything east of this is indoors: the great hall's rooms and the dark round them. West of it is the wood and the yard. */
export const GUILD_HALL_INDOORS_LEFT = geometry.interiorLeft;
/** The room of a hall this size. */
export const guildHallRoom = (size: number) => GUILD_HALL_ROOMS[Math.max(0, Math.min(GUILD_HALL_ROOMS.length - 1, size))];
/**
 * Where going through the hall's door takes a player at this position: in, from just outside the door; out, from
 * inside the room for the hall's size; nowhere (null) from anywhere else. The server's rule, and the client's.
 */
export function guildHallDoorDestination(size: number, x: number, y: number) {
  const room = guildHallRoom(size);
  if (Math.hypot(x - GUILD_HALL_DOOR.x, y + GUILD_HALL_FEET_OFFSET - GUILD_HALL_DOOR.enter) <= GUILD_HALL_DOOR_REACH) return room.inside;
  const spare = GUILD_HALL_DOOR_REACH;
  if (x >= room.left - spare && x <= room.right + spare && y >= room.top - spare - 200 && y <= room.bottom + spare) return GUILD_HALL_DOOR.outside;
  return null;
}
/** The yard feet can reach outdoors, inside the wood: left, top, right, bottom. */
export const GUILD_HALL_YARD = Object.freeze({ left: geometry.yard[0], top: geometry.yard[1], right: geometry.yard[2], bottom: geometry.yard[3] });
/**
 * Where someone saved at (x, y) in a hall this size comes back: there if it is ground they could stand on (the
 * yard, or the room for the hall's size), otherwise at the arrival. Positions saved before the courtyard moved,
 * or in a room the hall has since outgrown, land at the arrival instead of in the wood or the dark.
 */
export function guildHallReturnPoint(size: number, x: number, y: number) {
  const feet = y + GUILD_HALL_FEET_OFFSET, room = guildHallRoom(size);
  const inYard = x >= GUILD_HALL_YARD.left && x <= GUILD_HALL_YARD.right && feet >= GUILD_HALL_YARD.top && feet <= GUILD_HALL_YARD.bottom;
  const inRoom = x >= room.left && x <= room.right && feet >= room.top && feet <= room.bottom;
  return inYard || inRoom ? { x, y } : { ...GUILD_HALL_ARRIVAL };
}
/** Where a member stands to go through the hall's door, by their position: at its sill outside, and in the room's doorway. */
export function guildHallDoorSides(size: number) {
  const room = guildHallRoom(size);
  return [{ x: GUILD_HALL_DOOR.x, y: GUILD_HALL_DOOR.enter - GUILD_HALL_FEET_OFFSET }, { x: room.exit.x, y: room.exit.y - GUILD_HALL_FEET_OFFSET }];
}
