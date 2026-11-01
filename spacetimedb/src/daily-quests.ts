import { Range, table, t, SenderError } from "spacetimedb/server";
import { WEEKLY_QUEST_COUNT, GUILD_QUEST_COLLECT_LIMIT, GUILD_WEEK_QUEST_CAP, applyQuestKills, weeklyQuestsFor, guildQuestBonus, ownQuest, parseWeeklyQuests, questDay, questDone, questOpen, questWeek, soloQuestBonus, type WeeklyQuest } from "../../shared/weekly-quests";
import { readPlayerProgress } from "./wide-stats";
import { QUEST_BOARD_SEEN_BIT, unlockedPortalCutsceneMask } from "../../shared/portal-cutscenes";
import { creditGuildHall } from "./guild-hall";

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
 * Drops guild weeks before last week: the board shows this week, and this
 * week's bonus reads last week's points. Every client subscribed to the whole
 * table, so it grew for every guild every week.
 */
export function pruneOldGuildQuestWeeks(ctx: Ctx) {
  const lastWeek = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch)) - 1;
  const old = [...ctx.db.guildQuestWeek.week.filter(new Range({ tag: "unbounded" }, { tag: "excluded", value: lastWeek }))];
  for (const row of old) ctx.db.guildQuestWeek.key.delete(row.key);
  return old.length;
}

/**
 * Each player's quest points this week, for the guild they earned them in:
 * one row per player, replaced when the week or the guild changes. Private;
 * the Guild window reads it through the guild snapshot.
 */
export const guildMemberQuestWeek = table({ name: "guild_member_quest_week" }, {
  identity: t.identity().primaryKey(), week: t.u32(), guildId: t.u64(), points: t.u32(),
});

/**
 * Quests a player finished without a guild: this week's count and the week
 * before's, one row per player. Next week's solo bonus reads it.
 */
export const soloQuestWeek = table({ name: "player_solo_quest_week" }, {
  identity: t.identity().primaryKey(), week: t.u32(), points: t.u32(), lastWeek: t.u32(), lastPoints: t.u32(),
});

/**
 * Every quest a player finished each week, for a guild or not: this week's
 * count and last week's. A player without a guild bonus this week (no guild,
 * or one joined this week) gets the personal bonus from all of last week's,
 * not only those done without a guild.
 */
export const playerQuestWeekTotal = table({ name: "player_quest_week_total" }, {
  identity: t.identity().primaryKey(), week: t.u32(), done: t.u32(), lastWeek: t.u32(), lastDone: t.u32(),
});

type Ctx = { db: any; timestamp: { microsSinceUnixEpoch: bigint } };

/** Quests a player finished without a guild in the given week, from their soloQuestWeek row. */
const pointsIn = (row: any, week: number) => row?.week === week ? row.points : row?.lastWeek === week ? row.lastPoints : 0;
function soloPoints(ctx: Ctx, identity: any, week: number) {
  return pointsIn(ctx.db.soloQuestWeek.identity.find(identity), week);
}
const weekKey = (week: number, guildId: bigint) => `${week}:${guildId}`;

/** What a list for `week` shows done: own quests and collected ones. Null when the daily row is not that week's. */
function doneIn(daily: any, week: number, quests?: WeeklyQuest[]) {
  if (!quests && (!daily || questWeek(daily.day) !== week)) return null;
  const done = (quests ?? parseWeeklyQuests(daily.questsJson)).filter(questDone);
  return { own: done.filter(ownQuest).length, collected: done.filter(quest => !ownQuest(quest)).length };
}

/** What the player's list for `week` shows done: their own quests and the ones they collected. Null once the week's list is gone. */
function listDone(ctx: Ctx, identity: any, week: number, quests?: WeeklyQuest[]) {
  return doneIn(quests ? null : ctx.db.playerDailyQuest.identity.find(identity), week, quests);
}

/** Points a guildMemberQuestWeek row holds for `week`, for the guild given (or any guild). */
const tallyIn = (row: any, week: number, guildId?: bigint) =>
  row && row.week === week && (guildId === undefined || row.guildId === guildId) ? row.points : 0;
function guildTally(ctx: Ctx, identity: any, week: number, guildId?: bigint) {
  return tallyIn(ctx.db.guildMemberQuestWeek.identity.find(identity), week, guildId);
}

/** The rows the solo figures read, found once so a refresh does not read each again per figure. */
type SoloRows = { daily: any; solo: any; tally: any };
const soloRowsFor = (ctx: Ctx, identity: any, daily: any): SoloRows =>
  ({ daily, solo: ctx.db.soloQuestWeek.identity.find(identity), tally: ctx.db.guildMemberQuestWeek.identity.find(identity) });

/**
 * Quests that count toward a week's solo bonus: the count kept as they
 * finished, or, when more, what the week's list shows done that no guild was
 * credited with.
 */
function soloQuestsIn(rows: SoloRows, week: number, quests?: WeeklyQuest[]) {
  const stored = pointsIn(rows.solo, week);
  const done = doneIn(quests ? null : rows.daily, week, quests);
  return done ? Math.max(stored, done.own + done.collected - tallyIn(rows.tally, week)) : stored;
}
function soloQuestsFor(ctx: Ctx, identity: any, week: number, quests?: WeeklyQuest[]) {
  return soloQuestsIn(soloRowsFor(ctx, identity, quests ? null : ctx.db.playerDailyQuest.identity.find(identity)), week, quests);
}

function noteQuestsDone(ctx: Ctx, identity: any, week: number, count: number) {
  const row = ctx.db.playerQuestWeekTotal.identity.find(identity);
  const next = !row ? { identity, week, done: count, lastWeek: 0, lastDone: 0 }
    : row.week === week ? { ...row, done: row.done + count }
    : row.week < week ? { identity, week, done: count, lastWeek: row.week, lastDone: row.done }
    : row;
  if (row) ctx.db.playerQuestWeekTotal.identity.update(next); else ctx.db.playerQuestWeekTotal.insert(next);
}

/**
 * Every quest the player finished in `week`, guild or solo: the stored count,
 * or the solo count plus their guild tally when that is more.
 */
function questsDoneIn(ctx: Ctx, identity: any, week: number, rows: SoloRows) {
  const row = ctx.db.playerQuestWeekTotal.identity.find(identity);
  const counted = row?.week === week ? row.done : row?.lastWeek === week ? row.lastDone : 0;
  return Math.max(counted, soloQuestsIn(rows, week) + tallyIn(rows.tally, week));
}

/** Records a week's solo count, keeping the week before it, so it outlives the list it was read from. */
function settleSoloWeek(ctx: Ctx, identity: any, week: number, points: number) {
  const solo = ctx.db.soloQuestWeek.identity.find(identity);
  const next = !solo ? { identity, week, points, lastWeek: 0, lastPoints: 0 }
    : solo.week === week ? { ...solo, points: Math.max(solo.points, points) }
    : solo.week < week ? { identity, week, points, lastWeek: solo.week, lastPoints: solo.points }
    : solo.lastWeek === week ? { ...solo, lastPoints: Math.max(solo.lastPoints, points) } : solo;
  if (solo) ctx.db.soloQuestWeek.identity.update(next); else ctx.db.soloQuestWeek.insert(next);
}

/**
 * On joining a guild: this week's quests that counted for no guild (done while
 * guildless) move to it, up to its pool.
 * Quests already counted for another guild stay there.
 */
export function moveSoloQuestsToGuild(ctx: Ctx, identity: any) {
  const moved = moveSoloQuests(ctx, identity);
  // The guild's bonus is theirs at once: the board shows it now, not at the next kill report.
  refreshQuestBonus(ctx, identity);
  return moved;
}

/** The board's cached bonus, worked out again: a join or a leave changes it at once. */
export function refreshQuestBonus(ctx: Ctx, identity: any) {
  const row = ctx.db.playerDailyQuest.identity.find(identity);
  if (!row) return;
  const bonus = guildQuestBonusFor(ctx, identity);
  if (row.bonus !== bonus) ctx.db.playerDailyQuest.identity.update({ ...row, bonus });
}

function moveSoloQuests(ctx: Ctx, identity: any) {
  const guild = guildOf(ctx, identity);
  if (!guild) return 0;
  const week = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch));
  const solo = ctx.db.soloQuestWeek.identity.find(identity);
  const owned = solo?.week === week ? solo.points : 0;
  const room = Math.max(0, GUILD_WEEK_QUEST_CAP - weekPoints(ctx, week, guild.id));
  const moved = Math.min(owned, room);
  if (!moved) return 0;
  ctx.db.soloQuestWeek.identity.update({ ...solo, points: owned - moved });
  const key = weekKey(week, guild.id), current = ctx.db.guildQuestWeek.key.find(key);
  const total = { key, week, guildId: guild.id, guildName: guild.name, points: (current?.points ?? 0) + moved };
  if (current) ctx.db.guildQuestWeek.key.update(total); else ctx.db.guildQuestWeek.insert(total);
  creditGuildHall(ctx, guild.id, moved);
  const mine = ctx.db.guildMemberQuestWeek.identity.find(identity);
  const tally = { identity, week, guildId: guild.id, points: (mine && mine.week === week && mine.guildId === guild.id ? mine.points : 0) + moved };
  if (mine) ctx.db.guildMemberQuestWeek.identity.update(tally); else ctx.db.guildMemberQuestWeek.insert(tally);
  const row = ctx.db.playerDailyQuest.identity.find(identity);
  if (row && questWeek(row.day) === week) ctx.db.playerDailyQuest.identity.update({ ...row, guildPoints: total.points });
  return moved;
}

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
 * This week's multiplier on every stat reward the player earns: 0.1% for
 * each point their guild earned last week, from the moment they join it
 * (joining a guild gives its bonus for the week, period). It is only
 * ever the current guild's, so leaving drops it and nothing stacks. Without a
 * guild it is their own week: 1% for each quest they finished, guild or not, up to 15%.
 */
export function guildQuestBonusFor(ctx: Ctx, identity: any, guild = guildOf(ctx, identity), rows?: SoloRows) {
  const week = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch));
  if (!guild) return soloQuestBonus(questsDoneIn(ctx, identity, week - 1, rows ?? soloRowsFor(ctx, identity, ctx.db.playerDailyQuest.identity.find(identity))));
  return guildQuestBonus(weekPoints(ctx, week - 1, guild.id));
}

/** guildQuestBonusFor with the rows it read, so a kill report's quest refresh can start from them. */
export type QuestStanding = { bonus: number; guild: ReturnType<typeof guildOf>; daily: any; rows?: SoloRows };
export function questStandingFor(ctx: Ctx, identity: any): QuestStanding {
  const guild = guildOf(ctx, identity), daily = ctx.db.playerDailyQuest.identity.find(identity);
  const rows = guild ? undefined : soloRowsFor(ctx, identity, daily);
  return { bonus: guildQuestBonusFor(ctx, identity, guild, rows), guild, daily, rows };
}

/**
 * This week's quests for the player, drawing fifteen when the week has turned;
 * `day` records the last visit, and the guild figures are refreshed every
 * time. A list from the daily quests (three) keeps its progress and is topped
 * up to fifteen from the week's draw.
 */
export function ensureDailyQuests(ctx: Ctx, identity: any) {
  return dailyQuestsFor(ctx, identity).row;
}

/**
 * ensureDailyQuests, plus the row's quests parsed and the guild it read, for a kill report to reuse.
 * `known` is questStandingFor read earlier in the same transaction, with no quest row written since.
 */
function dailyQuestsFor(ctx: Ctx, identity: any, known?: QuestStanding) {
  const day = questDay(ctx.timestamp.microsSinceUnixEpoch);
  const existing = known ? known.daily : ctx.db.playerDailyQuest.identity.find(identity);
  const guild = known ? known.guild : guildOf(ctx, identity), week = questWeek(day);
  // Without a guild, guildPoints carries the player's own solo quests this week, for the board's bonus line.
  // A new week replaces the list: settle the last week's solo count from it first, so its bonus survives.
  const newWeek = Boolean(existing && questWeek(existing.day) < week);
  if (newWeek) {
    const last = questWeek(existing.day), settled = soloQuestsFor(ctx, identity, last);
    if (settled > soloPoints(ctx, identity, last)) settleSoloWeek(ctx, identity, last, settled);
  }
  const current = existing && questWeek(existing.day) === week ? parseWeeklyQuests(existing.questsJson) : null;
  // Read after the settle above, which can write the solo row; the caller's rows stand when there was none.
  const fresh = !known || newWeek;
  const rows = guild ? undefined : fresh ? soloRowsFor(ctx, identity, existing) : known.rows;
  const guildFields = { bonus: fresh ? guildQuestBonusFor(ctx, identity, guild, rows) : known.bonus,
    guildPoints: guild ? weekPoints(ctx, week, guild.id) : soloQuestsIn(rows!, week, current ?? undefined), guildName: guild?.name ?? "" };
  let questsJson = existing?.questsJson ?? "[]";
  const own = current?.filter(ownQuest).length ?? 0;
  if (!current || own < WEEKLY_QUEST_COUNT) {
    const progress = readPlayerProgress(ctx, identity) ?? {};
    const drawn = weeklyQuestsFor(identity.toHexString(), week, progress);
    // Own quests stay ahead of collected ones, so the board works through a player's own first.
    const kept = current ?? [];
    questsJson = JSON.stringify([...kept.filter(ownQuest), ...drawn.slice(own), ...kept.filter(quest => !ownQuest(quest))]);
  }
  const row = { identity, day, questsJson, ...guildFields };
  // Runs on every kill report; a public row rewritten unchanged still goes out to subscribers.
  if (!existing) ctx.db.playerDailyQuest.insert(row);
  else if (existing.day !== row.day || existing.questsJson !== row.questsJson || existing.bonus !== row.bonus
    || existing.guildPoints !== row.guildPoints || existing.guildName !== row.guildName) ctx.db.playerDailyQuest.identity.update(row);
  return { row, guild, quests: current && questsJson === existing.questsJson ? current : parseWeeklyQuests(questsJson) };
}

/**
 * Accepted kills move the player's quests on. Each quest a report finishes is
 * a point for their guild this week; without a guild it is finished for nothing.
 */
export function recordDailyQuestKills(ctx: Ctx, identity: any, mapId: string, kills: { enemy: string; count: number }[], known?: QuestStanding) {
  if (!kills.some(kill => kill.count > 0)) return 0;
  const { row, guild: seat, quests: list } = dailyQuestsFor(ctx, identity, known);
  const { quests, completed } = applyQuestKills(list, mapId, kills);
  if (completed) noteQuestsDone(ctx, identity, questWeek(row.day), completed);
  let guildPoints = row.guildPoints;
  // A member's quests count for their guild from the moment they join.
  // Each quest counts once, for the guild they are in when it finishes,
  // and stays with that guild whatever they join afterwards.
  const member = completed ? seat : null;
  const guild = member;
  if (completed && !guild) {
    // No guild: the quest counts toward next week's solo bonus, and moves to a guild they join this week.
    const week = questWeek(row.day);
    settleSoloWeek(ctx, identity, week, soloPoints(ctx, identity, week) + completed);
  }
  // A guild's week is worth at most GUILD_WEEK_QUEST_CAP, whatever its size.
  const credited = guild ? Math.min(completed, Math.max(0, GUILD_WEEK_QUEST_CAP - weekPoints(ctx, questWeek(row.day), guild.id))) : 0;
  if (guild && credited) {
    const week = questWeek(row.day), key = weekKey(week, guild.id);
    const current = ctx.db.guildQuestWeek.key.find(key);
    const next = { key, week, guildId: guild.id, guildName: guild.name, points: (current?.points ?? 0) + credited };
    if (current) ctx.db.guildQuestWeek.key.update(next); else ctx.db.guildQuestWeek.insert(next);
    creditGuildHall(ctx, guild.id, credited);
    guildPoints = next.points;
    const mine = ctx.db.guildMemberQuestWeek.identity.find(identity);
    const carried = mine && mine.week === week && mine.guildId === guild.id ? mine.points : 0;
    const tally = { identity, week, guildId: guild.id, points: carried + credited };
    if (mine) ctx.db.guildMemberQuestWeek.identity.update(tally); else ctx.db.guildMemberQuestWeek.insert(tally);
  }
  // Without a guild the row shows the player's own solo count, from the updated list.
  if (completed && !member) guildPoints = soloQuestsFor(ctx, identity, questWeek(row.day), quests);
  const questsJson = JSON.stringify(quests);
  if (questsJson !== row.questsJson || guildPoints !== row.guildPoints) ctx.db.playerDailyQuest.identity.update({ ...row, questsJson, guildPoints });
  return completed;
}

/** This week's quests for a player, or none when this week's have not been drawn yet. */
function weeksQuests(ctx: Ctx, identity: any): WeeklyQuest[] | null {
  const row = ctx.db.playerDailyQuest.identity.find(identity);
  return row && questWeek(row.day) === questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch)) ? parseWeeklyQuests(row.questsJson) : null;
}

/**
 * A guild member's quests for the Guild window: how many of this week's own
 * fifteen are done, collected by someone else, or still open to collect, and
 * the points they have earned this guild this week. Two key lookups. A member
 * who has not opened the board this week has all fifteen still to come.
 */
export function memberQuestStanding(ctx: Ctx, identity: any, guildId: bigint) {
  const quests = weeksQuests(ctx, identity);
  const own = quests?.filter(ownQuest);
  const week = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch));
  // Never fewer points than the list shows done for this guild.
  // A member who joined this week may have done those for another guild, so theirs stand.
  const member = ctx.db.guildMember.identity.find(identity);
  const joinedThisWeek = member?.guildId !== guildId || questWeek(questDay(member.joinedAt)) >= week;
  const done = joinedThisWeek ? null : listDone(ctx, identity, week);
  const tally = guildTally(ctx, identity, week, guildId);
  return {
    questsDone: own ? own.filter(questDone).length : 0,
    // A list from the daily quests is topped up to fifteen on the member's next visit; count it full now.
    questsTotal: Math.max(WEEKLY_QUEST_COUNT, own?.length ?? 0),
    questsOpen: own ? own.filter(questOpen).length + Math.max(0, WEEKLY_QUEST_COUNT - own.length) : WEEKLY_QUEST_COUNT,
    questsTaken: own ? own.filter(quest => quest.takenBy && !questDone(quest)).length : 0,
    // Quests collected from the guild's pool and finished: points beyond the member's own fifteen.
    questsCollected: quests ? quests.filter(quest => quest.from && questDone(quest)).length : 0,
    questPoints: done ? Math.max(tally, done.own + done.collected - soloPoints(ctx, identity, week)) : tally,
    // Quests done on or before the day they joined count toward their own bonus, not this guild's.
    joinedThisWeek,
  };
}

/** Whether a member may collect, and how many more: their own fifteen done first, then up to fifteen unfinished at a time. */
export function questCollectStanding(ctx: Ctx, identity: any) {
  const quests = weeksQuests(ctx, identity);
  const seat = ctx.db.guildMember.identity.find(identity);
  const pool = seat ? guildQuestPool(ctx, seat.guildId) : { size: 0, left: 0 };
  return { ready: Boolean(quests?.length) && !quests!.filter(ownQuest).some(questOpen),
    left: Math.max(0, GUILD_QUEST_COLLECT_LIMIT - (quests ?? []).filter(quest => quest.from && !questDone(quest)).length),
    pool: pool.left, poolSize: pool.size };
}

/** Who a quest drawn from the guild's pool is for, on the collector's board. */
export const GUILD_POOL_FROM = "your guild";

/**
 * A guild's quest pool for the week: GUILD_WEEK_QUEST_CAP (300) at any size,
 * used up only by quests finished. Nothing on anyone's board holds it, so an
 * unfinished quest never blocks anyone else. Points stop at 300 however many quests are finished, so holding
 * nothing never overpays; whoever finishes first counts.
 */
export function guildQuestPool(ctx: Ctx, guildId: bigint) {
  const week = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch));
  return { size: GUILD_WEEK_QUEST_CAP, left: Math.max(0, GUILD_WEEK_QUEST_CAP - weekPoints(ctx, week, guildId)) };
}

/**
 * A member whose own fifteen are done draws extra quests from the guild's
 * pool, fresh from the maps they can reach, up to fifteen unfinished at a time
 * and as many as the pool holds. Nothing is taken from anyone and nothing is held: the pool is the
 * guild's whole week, so a member who misses theirs leaves room for the rest
 * to make it up.
 */
export function collectGuildQuests(ctx: Ctx, collector: any) {
  const fail = (message: string): never => { throw new SenderError(message); };
  const seat = ctx.db.guildMember.identity.find(collector) ?? fail("Join a guild first.");
  if (!ctx.db.guild.id.find(seat.guildId)) fail("Guild no longer exists.");
  const day = questDay(ctx.timestamp.microsSinceUnixEpoch);
  const mine = ensureDailyQuests(ctx, collector);
  const standing = questCollectStanding(ctx, collector);
  if (!standing.ready) fail("Finish your own quests first.");
  if (!standing.left) fail(`Finish some of your ${GUILD_QUEST_COLLECT_LIMIT} collected quests first.`);
  const pool = guildQuestPool(ctx, seat.guildId);
  const count = Math.min(standing.left, pool.left);
  if (!count) fail(`Your guild has finished its ${GUILD_WEEK_QUEST_CAP} quests this week.`);
  const quests = parseWeeklyQuests(mine.questsJson);
  const taken = quests.filter(quest => quest.from).length;
  const drawn = weeklyQuestsFor(`${collector.toHexString()}:pool:${taken}`, questWeek(day), readPlayerProgress(ctx, collector) ?? {})
    .slice(0, count).map(quest => ({ ...quest, from: GUILD_POOL_FROM }));
  ctx.db.playerDailyQuest.identity.update({ ...mine, questsJson: JSON.stringify([...quests, ...drawn]) });
  return drawn.length;
}

/** Older clients still name a member to take from here; every collect draws from the guild's pool. */
export function collectMemberQuests(ctx: Ctx, collector: any, _member?: any) {
  return collectGuildQuests(ctx, collector);
}

/** Migration 67: everyone who already has quests counts as having seen the Quest Board, so their HUD keeps showing them. */
export function markQuestHoldersSeenBoard(ctx: Ctx) {
  for (const row of [...ctx.db.playerDailyQuest.iter()]) {
    const history = ctx.db.playerCutsceneHistory.identity.find(row.identity);
    if (history) ctx.db.playerCutsceneHistory.identity.update({ ...history, seenMask: history.seenMask | QUEST_BOARD_SEEN_BIT });
    else ctx.db.playerCutsceneHistory.insert({ identity: row.identity,
      seenMask: unlockedPortalCutsceneMask(readPlayerProgress(ctx, row.identity)) | QUEST_BOARD_SEEN_BIT, generation: 0 });
  }
}
