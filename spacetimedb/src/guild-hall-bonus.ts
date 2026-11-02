import { guildHallBonus, parseGuildHallLevels, type GuildHallPart } from "../../shared/guild-hall";

/** A member's bonus from their guild hall's upgrade (shared/guild-hall.ts GUILD_HALL_BONUSES); 0 outside a guild. */
export function guildHallBonusFor(ctx: any, identity: any, part: GuildHallPart) {
  const levels = guildHallLevelsOf(ctx, ctx.db.guildMember.identity.find(identity)?.guildId);
  return levels ? guildHallBonus(levels, part) : 0;
}

/** A guild's hall upgrades, for a caller that already knows the guild and wants several parts; null without a hall. */
export function guildHallLevelsOf(ctx: any, guildId: bigint | null | undefined) {
  if (guildId === undefined || guildId === null) return null;
  const row = ctx.db.guildHall.guildId.find(guildId);
  return row ? parseGuildHallLevels(row.levels) : null;
}

/** Card factors with the Courtyard's chance of an extra ore or log added. */
export function withCourtyardFind<T extends { oreFind: number; logFind: number }>(ctx: any, identity: any, cards: T): T {
  const find = guildHallBonusFor(ctx, identity, "courtyard");
  return find ? { ...cards, oreFind: cards.oreFind + find, logFind: cards.logFind + find } : cards;
}

/** A whole number of points with `share` more, the fraction kept as a chance, so small amounts still gain. */
export const withBonusShare = (points: number, share: number, random: () => number) =>
  share > 0 ? Math.floor(points * (1 + share) + random()) : points;
