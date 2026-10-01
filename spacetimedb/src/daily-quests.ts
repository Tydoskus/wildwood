import { table, t, SenderError } from "spacetimedb/server";
import { DAILY_QUEST_COUNT, GUILD_QUEST_COLLECT_LIMIT, applyQuestKills, dailyQuestCandidates, dailyQuestsFor, guildQuestBonus, ownQuest, parseDailyQuests, questDay, questDone, questOpen, questWeek, type DailyQuest } from "../../shared/daily-quests";

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

/**
 * Each player's quest points this week, for the guild they earned them in:
 * one row per player, replaced when the week or the guild changes. Private;
 * the Guild window reads it through the guild snapshot.
 */
export const guildMemberQuestWeek = table({ name: "guild_member_quest_week" }, {
  identity: t.identity().primaryKey(), week: t.u32(), guildId: t.u64(), points: t.u32(),
});

type Ctx = { db: any; timestamp: { microsSinceUnixEpoch: bigint } };
const weekKey = (week: number, guildId: bigint) => `${week}:${guildId}`;

function guildOf(ctx: Ctx, identity: any): { id: bigint; name: string; joinedDay: number } | null {
  const member = ctx.db.guildMember.identity.find(identity);
  if (!member) return null;
  const guild = ctx.db.guild.id.find(member.guildId);
  return guild ? { id: guild.id, name: guild.name, joinedDay: questDay(member.joinedAt) } : null;
}

function weekPoints(ctx: Ctx, week: number, guildId: bigint) {
  return ctx.db.guildQuestWeek.key.find(weekKey(week, guildId))?.points ?? 0;
}

/**
 * This week's multiplier on every stat reward the player earns: 0.25% for
 * each point their guild earned last week. Only for members who were in the
 * guild before this week began, so hopping into last week's top guild pays
 * nothing until the week after.
 */
export function guildQuestBonusFor(ctx: Ctx, identity: any) {
  const guild = guildOf(ctx, identity);
  const week = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch));
  if (!guild || questWeek(guild.joinedDay) >= week) return 1;
  return guildQuestBonus(weekPoints(ctx, week - 1, guild.id));
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
  // A member's quests count for their guild from the day after they join, so
  // joining a guild for the day sends it nothing.
  const member = completed ? guildOf(ctx, identity) : null;
  const guild = member && member.joinedDay < row.day ? member : null;
  if (guild) {
    const week = questWeek(row.day), key = weekKey(week, guild.id);
    const current = ctx.db.guildQuestWeek.key.find(key);
    const next = { key, week, guildId: guild.id, guildName: guild.name, points: (current?.points ?? 0) + completed };
    if (current) ctx.db.guildQuestWeek.key.update(next); else ctx.db.guildQuestWeek.insert(next);
    guildPoints = next.points;
    const mine = ctx.db.guildMemberQuestWeek.identity.find(identity);
    const carried = mine && mine.week === week && mine.guildId === guild.id ? mine.points : 0;
    const tally = { identity, week, guildId: guild.id, points: carried + completed };
    if (mine) ctx.db.guildMemberQuestWeek.identity.update(tally); else ctx.db.guildMemberQuestWeek.insert(tally);
  }
  ctx.db.playerDailyQuest.identity.update({ ...row, questsJson: JSON.stringify(quests), guildPoints });
  return completed;
}

/** Today's quests for a player, or none when today's have not been drawn yet. */
function todaysQuests(ctx: Ctx, identity: any): DailyQuest[] | null {
  const row = ctx.db.playerDailyQuest.identity.find(identity);
  return row?.day === questDay(ctx.timestamp.microsSinceUnixEpoch) ? parseDailyQuests(row.questsJson) : null;
}

/**
 * A guild member's quests for the Guild window: how many of today's own three
 * are done, how many are still open for a leader to collect, and the points
 * they have earned this guild this week. Two key lookups. A member who has not
 * opened the board today has all three still to come.
 */
export function memberQuestStanding(ctx: Ctx, identity: any, guildId: bigint) {
  const own = todaysQuests(ctx, identity)?.filter(ownQuest);
  const week = ctx.db.guildMemberQuestWeek.identity.find(identity);
  return {
    questsDone: own ? own.filter(questDone).length : 0,
    questsTotal: own ? own.length : DAILY_QUEST_COUNT,
    questsOpen: own ? own.filter(questOpen).length : DAILY_QUEST_COUNT,
    questsTaken: own ? own.filter(quest => quest.takenBy && !questDone(quest)).length : 0,
    questPoints: week && week.week === questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch)) && week.guildId === guildId ? week.points : 0,
  };
}

/** Whether a leader may collect today, and how many more: their own quests must all be done first. */
export function questCollectStanding(ctx: Ctx, identity: any) {
  const quests = todaysQuests(ctx, identity);
  return { ready: Boolean(quests?.length) && !quests!.filter(ownQuest).some(questOpen),
    left: Math.max(0, GUILD_QUEST_COLLECT_LIMIT - (quests ?? []).filter(quest => quest.from).length) };
}

/**
 * The President or Vice President takes a member's unfinished quests onto
 * their own board, up to three a day each and only once their own are done.
 * The member's copies are marked taken, so a quest pays the guild once.
 * Only quests on maps the leader has unlocked can be taken.
 */
export function collectMemberQuests(ctx: Ctx, leader: any, memberIdentity: any) {
  const fail = (message: string): never => { throw new SenderError(message); };
  const seat = ctx.db.guildMember.identity.find(leader) ?? fail("Join a guild first.");
  const guild = ctx.db.guild.id.find(seat.guildId) ?? fail("Guild no longer exists.");
  if (!guild.leader.equals(leader) && !seat.vicePresident) fail("Only the President or Vice President can collect quests.");
  if (memberIdentity.equals(leader)) fail("Choose another member.");
  const target = ctx.db.guildMember.identity.find(memberIdentity);
  if (!target || target.guildId !== guild.id) fail("Choose a member of your guild.");
  const today = questDay(ctx.timestamp.microsSinceUnixEpoch);
  if (questDay(seat.joinedAt) >= today) fail("Your quests count for this guild from tomorrow.");
  if (questDay(target.joinedAt) >= today) fail("New members' quests count for the guild from tomorrow.");
  const mine = ensureDailyQuests(ctx, leader);
  const standing = questCollectStanding(ctx, leader);
  if (!standing.ready) fail("Finish your own quests first.");
  if (!standing.left) fail(`You have collected ${GUILD_QUEST_COLLECT_LIMIT} quests today.`);
  const theirs = ensureDailyQuests(ctx, memberIdentity);
  const reachable = new Set(dailyQuestCandidates(ctx.db.playerProgress.identity.find(leader) ?? {}).map(quest => `${quest.mapId}:${quest.enemy}`));
  const leaderName = ctx.db.playerProfile.identity.find(leader)?.displayName ?? "Your leader";
  const memberName = ctx.db.playerProfile.identity.find(memberIdentity)?.displayName ?? target.name;
  const collected: DailyQuest[] = [];
  let unreachable = 0;
  const remaining = parseDailyQuests(theirs.questsJson).map(quest => {
    if (collected.length >= standing.left || !ownQuest(quest) || !questOpen(quest)) return quest;
    if (!reachable.has(`${quest.mapId}:${quest.enemy}`)) { unreachable += 1; return quest; }
    collected.push({ mapId: quest.mapId, enemy: quest.enemy, target: quest.target, progress: quest.progress, from: memberName });
    return { ...quest, takenBy: leaderName };
  });
  if (!collected.length) fail(unreachable ? "Their unfinished quests are on maps you have not unlocked." : `${memberName} has no unfinished quests today.`);
  ctx.db.playerDailyQuest.identity.update({ ...theirs, questsJson: JSON.stringify(remaining) });
  ctx.db.playerDailyQuest.identity.update({ ...mine, questsJson: JSON.stringify([...parseDailyQuests(mine.questsJson), ...collected]) });
  return collected.length;
}
