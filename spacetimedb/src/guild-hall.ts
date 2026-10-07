import { table, t, SenderError } from "spacetimedb/server";
import type { default as spacetimedbType } from "./index";
import {
  GUILD_HALL_ARRIVAL, GUILD_HALL_PART_IDS, guildHallDoorDestination, guildHallDoorSides, guildHallGuildId, guildHallMapId, guildHallUpgradeCost,
  isGuildHallMap, parseGuildHallLevels, type GuildHallPart,
} from "../../shared/guild-hall";
import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { questDay, questWeek } from "../../shared/daily-quests";
import { isTownMap, TOWN_ARRIVAL, TOWN_MAP_ID } from "../../shared/town";
import { doorDestinationFor } from "./door-reach";

/**
 * Guild halls on the server (shared/guild-hall.ts has the rules).
 *
 * - guild_hall holds each guild's hall: its fund and its upgrade levels. Its
 *   members read their own through my_guild_hall. A guild with no row yet has
 *   a hall at every level 0, and gets a row (its fund seeded with the quest
 *   points still on record) the first time anything touches it.
 * - The guild's quest points fill the fund as they are earned (creditGuildHall
 *   from daily-quests.ts), on top of counting for the week's bonus.
 * - Only members enter, from anywhere, as the Town is entered; someone who
 *   leaves the guild while in its hall is sent to the Town.
 */
export const guildHall = table({ name: "guild_hall", public: false }, {
  guildId: t.u64().primaryKey(),
  fund: t.u32(),
  spent: t.u32(),
  levels: t.string(),
});
export const guildHallTables = { guildHall };

const guildOf = (ctx: any, identity: any): bigint | null => ctx.db.guildMember.identity.find(identity)?.guildId ?? null;
/** Whether this player may be in this hall: only its guild's members. */
export function guildHallMember(ctx: any, identity: any, mapId: string) {
  const id = guildHallGuildId(mapId);
  return id !== null && guildOf(ctx, identity) === id;
}

/** The quest points a guild still has on record (this week's and last week's; older weeks are pruned): a new hall's fund starts with them. */
function recordedPoints(ctx: any, guildId: bigint) {
  const week = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch));
  return [week, week - 1].reduce((sum, w) => sum + (ctx.db.guildQuestWeek.key.find(`${w}:${guildId}`)?.points ?? 0), 0);
}
/** A guild's hall row, made (fund seeded) when it has none. */
function ensureGuildHall(ctx: any, guildId: bigint) {
  const existing = ctx.db.guildHall.guildId.find(guildId);
  if (existing) return existing;
  return ctx.db.guildHall.insert({ guildId, fund: recordedPoints(ctx, guildId), spent: 0, levels: "{}" });
}
/** Quest points the guild just earned go into its hall's fund too. */
export function creditGuildHall(ctx: any, guildId: bigint, points: number) {
  if (!(points > 0)) return;
  const existing = ctx.db.guildHall.guildId.find(guildId);
  // A new row is seeded from the points on record, which already hold these.
  if (!existing) { ensureGuildHall(ctx, guildId); return; }
  ctx.db.guildHall.guildId.update({ ...existing, fund: existing.fund + Math.floor(points) });
}

type GuildHallDeps = {
  requireGuildPlayer: (ctx: any) => void;
  requireControllingPlayer: (ctx: any) => any;
  playerWithMotion: (ctx: any, player: any) => any;
  transitionPlayerMap: (ctx: any, current: any, mapId: string, arrival: { x: number; y: number }) => any;
  persistWorldLocation: (ctx: any, player: any) => void;
};

/** A member coming into the world: their guild's hall gets its row (fund seeded) if it has none, so my_guild_hall reads it. */
export function memberEnteredWorld(ctx: any) {
  const guildId = guildOf(ctx, ctx.sender);
  if (guildId !== null) ensureGuildHall(ctx, guildId);
}

export function registerGuildHall(spacetimedb: typeof spacetimedbType, deps: GuildHallDeps) {
  /**
   * The member's own guild's hall, levels and fund. Views have no clock, so a guild with no row yet reads as every
   * level 0 and an empty fund until entering the world (memberEnteredWorld) or earning a quest point makes its row.
   */
  const myGuildHall = spacetimedb.view({ name: "my_guild_hall", public: true }, t.array(guildHall.rowType), (ctx: any) => {
    const guildId = guildOf(ctx, ctx.sender);
    if (guildId === null) return [];
    return [ctx.db.guildHall.guildId.find(guildId) ?? { guildId, fund: 0, spent: 0, levels: "{}" }];
  });

  /** The President or a Vice President buys a part's next level from the hall's fund. */
  const upgradeGuildHall = spacetimedb.reducer({ part: t.string() }, (ctx: any, { part }: { part: string }) => {
    deps.requireGuildPlayer(ctx);
    const member = ctx.db.guildMember.identity.find(ctx.sender) ?? (() => { throw new SenderError("Join a guild first."); })();
    const guild = ctx.db.guild.id.find(member.guildId) ?? (() => { throw new SenderError("Guild no longer exists."); })();
    if (!guild.leader.equals(ctx.sender) && !member.vicePresident) throw new SenderError("Only the President or Vice President can upgrade the hall.");
    if (!(GUILD_HALL_PART_IDS as readonly string[]).includes(part)) throw new SenderError("That is not part of the hall.");
    const hall = ensureGuildHall(ctx, member.guildId);
    const levels = parseGuildHallLevels(hall.levels);
    const cost = guildHallUpgradeCost(levels, part as GuildHallPart);
    if (cost === null) throw new SenderError("That is already as grand as it gets.");
    if (hall.fund < cost) throw new SenderError(`The hall fund needs ${cost - hall.fund} more quest points.`);
    ctx.db.guildHall.guildId.update({ ...hall, fund: hall.fund - cost, spent: hall.spent + cost,
      levels: JSON.stringify({ ...levels, [part]: levels[part as GuildHallPart] + 1 }) });
  });

  /**
   * Through the hall's door: in from just outside it, out from inside the room for the hall's size. It only
   * moves a member between the door and their own hall's room, and only when they are at one of the two.
   */
  const useGuildHallDoor = spacetimedb.reducer({}, (ctx: any) => {
    const player = deps.requireControllingPlayer(ctx);
    if (!isGuildHallMap(player.mapId) || !guildHallMember(ctx, ctx.sender, player.mapId)) throw new SenderError("There is no door here.");
    const hall = ctx.db.guildHall.guildId.find(guildHallGuildId(player.mapId));
    const moving = deps.playerWithMotion(ctx, player);
    const size = parseGuildHallLevels(hall?.levels).size;
    const destination = doorDestinationFor(ctx, moving, (x, y) => guildHallDoorDestination(size, x, y), guildHallDoorSides(size));
    if (!destination) throw new SenderError("The door is too far away.");
    deps.transitionPlayerMap(ctx, moving, player.mapId, destination);
  });
  return { myGuildHall, upgradeGuildHall, useGuildHallDoor };
}

/**
 * change_map into a guild hall: from anywhere, as the Town is, for its members only. Coming from a map with
 * enemies, that place is kept as where "Fight" from the Town returns, as going to the Town keeps it.
 */
export function enterGuildHall(ctx: any, current: any, mapId: string, x: number, y: number, deps: Pick<GuildHallDeps, "transitionPlayerMap" | "persistWorldLocation">) {
  if (!guildHallMember(ctx, ctx.sender, mapId)) throw new SenderError("Only the guild's members can enter its hall.");
  if (current.hp <= 0) throw new SenderError("Respawn before travelling.");
  if (current.mapId !== HOME_EXTERIOR_MAP_ID && !isGuildHallMap(current.mapId) && !isTownMap(current.mapId) && [x, y].every(Number.isFinite)) {
    const saved = { identity: ctx.sender, mapId: current.mapId, x, y, facing: current.facing };
    if (ctx.db.homeReturnLocation.identity.find(ctx.sender)) ctx.db.homeReturnLocation.identity.update(saved);
    else ctx.db.homeReturnLocation.insert(saved);
  }
  ensureGuildHall(ctx, guildHallGuildId(mapId)!);
  deps.transitionPlayerMap(ctx, current, mapId, GUILD_HALL_ARRIVAL);
  deps.persistWorldLocation(ctx, ctx.db.player.identity.find(ctx.sender));
}

/**
 * A member left (or was removed from) a guild: out of its hall if they are in it, and no way back through
 * the Town's "Fight". The last member leaving deletes the guild, and its hall with it.
 */
export function guildHallMemberLeft(ctx: any, identity: any, guildId: bigint, guildDeleted: boolean, deps: Pick<GuildHallDeps, "transitionPlayerMap" | "persistWorldLocation">) {
  const hallMap = guildHallMapId(guildId);
  const player = ctx.db.player.identity.find(identity);
  if (player?.mapId === hallMap) {
    deps.transitionPlayerMap({ ...ctx, sender: identity }, player, TOWN_MAP_ID, TOWN_ARRIVAL);
    deps.persistWorldLocation({ ...ctx, sender: identity }, ctx.db.player.identity.find(identity));
  }
  if (ctx.db.homeReturnLocation.identity.find(identity)?.mapId === hallMap) ctx.db.homeReturnLocation.identity.delete(identity);
  if (guildDeleted && ctx.db.guildHall.guildId.find(guildId)) ctx.db.guildHall.guildId.delete(guildId);
}

// index.ts has no lines to spare, so what it needs from the shared module comes through here.
export { GUILD_HALL_ARRIVAL, isGuildHallMap } from "../../shared/guild-hall";
