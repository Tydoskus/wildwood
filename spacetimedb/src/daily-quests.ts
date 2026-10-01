import { table, t } from "spacetimedb/server";
import { applyQuestKills, dailyQuestsFor, guildQuestBonus, parseDailyQuests, questDay, questWeek } from "../../shared/daily-quests";

/**
 * A player's quests for one day, and what their guild stands at. The guild
 * figures ride along so the client can show the bonus and apply it to its own
 * reward prediction exactly as the server does, without reading guild tables.
 */
export const playerDailyQuest = table({ name: "player_daily_quest", public: true }, {
  identity: t.identity().primaryKey(), day: t.u32(), questsJson: t.string(),
  /** This week's stat reward multiplier: from the guild's points last week. */
  bonus: t.f64(),
  /** The guild's quest points so far this week, and its name; empty without a guild. */
  guildPoints: t.u32(), guildName: t.string(),
});

/** Each guild's quest points for each week: the weekly quest ranking. */
export const guildQuestWeek = table({ name: "guild_quest_week", public: true }, {
  key: t.string().primaryKey(), week: t.u32().index("btree"), guildId: t.u64(), guildName: t.string(), points: t.u32(),
});

type Ctx = { db: any; timestamp: { microsSinceUnixEpoch: bigint } };
const weekKey = (week: number, guildId: bigint) => `${week}:${guildId}`;

function guildOf(ctx: Ctx, identity: any): { id: bigint; name: string } | null {
  const member = ctx.db.guildMember.identity.find(identity);
  if (!member) return null;
  const guild = ctx.db.guild.id.find(member.guildId);
  return guild ? { id: guild.id, name: guild.name } : null;
}

function weekPoints(ctx: Ctx, week: number, guildId: bigint) {
  return ctx.db.guildQuestWeek.key.find(weekKey(week, guildId))?.points ?? 0;
}

/** This week's multiplier on every stat reward the player earns: 0.25% for each point their guild earned last week. */
export function guildQuestBonusFor(ctx: Ctx, identity: any) {
  const guild = guildOf(ctx, identity);
  if (!guild) return 1;
  return guildQuestBonus(weekPoints(ctx, questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch)) - 1, guild.id));
}

/** Today's quests for the player, drawing a fresh set when the day has turned; the guild figures are refreshed every time. */
export function ensureDailyQuests(ctx: Ctx, identity: any) {
  const day = questDay(ctx.timestamp.microsSinceUnixEpoch);
  const existing = ctx.db.playerDailyQuest.identity.find(identity);
  const guild = guildOf(ctx, identity), week = questWeek(day);
  const guildFields = { bonus: guildQuestBonusFor(ctx, identity), guildPoints: guild ? weekPoints(ctx, week, guild.id) : 0, guildName: guild?.name ?? "" };
  let questsJson = existing?.questsJson ?? "[]";
  if (!existing || existing.day !== day) {
    const progress = ctx.db.playerProgress.identity.find(identity) ?? {};
    questsJson = JSON.stringify(dailyQuestsFor(identity.toHexString(), day, progress));
  }
  const row = { identity, day, questsJson, ...guildFields };
  if (existing) ctx.db.playerDailyQuest.identity.update(row); else ctx.db.playerDailyQuest.insert(row);
  return row;
}

/**
 * Accepted kills move the player's quests on. Each quest a report finishes is
 * a point for their guild this week; without a guild it is finished for nothing.
 */
export function recordDailyQuestKills(ctx: Ctx, identity: any, mapId: string, kills: { enemy: string; count: number }[]) {
  if (!kills.some(kill => kill.count > 0)) return 0;
  const row = ensureDailyQuests(ctx, identity);
  const { quests, completed } = applyQuestKills(parseDailyQuests(row.questsJson), mapId, kills);
  let guildPoints = row.guildPoints;
  const guild = completed ? guildOf(ctx, identity) : null;
  if (guild) {
    const week = questWeek(row.day), key = weekKey(week, guild.id);
    const current = ctx.db.guildQuestWeek.key.find(key);
    const next = { key, week, guildId: guild.id, guildName: guild.name, points: (current?.points ?? 0) + completed };
    if (current) ctx.db.guildQuestWeek.key.update(next); else ctx.db.guildQuestWeek.insert(next);
    guildPoints = next.points;
  }
  ctx.db.playerDailyQuest.identity.update({ ...row, questsJson: JSON.stringify(quests), guildPoints });
  return completed;
}
