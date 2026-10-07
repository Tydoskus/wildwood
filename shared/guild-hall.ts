import geometry from "./guild-hall-geometry.json";

/**
 * Guild halls: every guild's own hall, a map of its own that only its members
 * enter (`guild_hall_<guildId>`), with a courtyard outside and a great hall
 * inside. Upgrades change how it looks and how big it is, never anyone's
 * stats. They are paid from the hall fund, which the guild's weekly quest
 * points fill as they are earned: every point still counts for the week's
 * bonus as well.
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

/** The hall's world: the courtyard and building on the left, the great hall's rooms (one per size) on the right. Under 6553 wide, so the narrow motion format still carries it. */
export const GUILD_HALL_WORLD = Object.freeze({ width: 6_400, height: 2_400 });
/** Where a member arrives: at the foot of the yard, by the portal home. */
export const GUILD_HALL_ARRIVAL = Object.freeze({ x: 800, y: 1_760 });
/** The portal home, on the round pad at the foot of the yard's path. */
export const GUILD_HALL_HOME_PAD = Object.freeze({ x: 800, y: 1_960, width: 150, height: 150, depth: 1_960 });

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
