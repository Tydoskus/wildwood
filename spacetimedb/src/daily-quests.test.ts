import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportKills } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
import { WEEKLY_QUEST_COUNT, questDay, questWeek } from "../../shared/daily-quests";
import { GUILD_POOL_FROM, collectGuildQuests, collectMemberQuests, ensureDailyQuests, guildQuestBonusFor, memberQuestStanding, moveSoloQuestsToGuild, pruneOldGuildQuestWeeks, questCollectStanding, refreshQuestBonus } from "./daily-quests";
import { Identity } from "spacetimedb";
import { statRewardMultiplier } from "./prestige";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const DAY = 86_400_000_000n;

function questing(withGuild = true) {
  const f = crystalFixture();
  // A month in, so the member below joined well before today and this week.
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 30n * DAY);
  f.patch("player", { mapId: "tutorial_forest" });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1_000 });
  if (withGuild) {
    f.seed("guild", { id: 7n, directoryId: 0n, nameKey: "oaks", name: "Oaks", leader: f.ctx.sender, members: 1, champions: 0, week: 0, score: 0,
      wins: 0, battles: 0, attackDay: 0, attacks: 0, opponents: "", emblem: -1 });
    f.seed("guildMember", { identity: f.ctx.sender, guildId: 7n, name: "Me", joinedAt: 0n, eligibleAt: 0n, champion: false, fighter: "", power: 0, vicePresident: false });
  }
  const day = questDay(f.ctx.timestamp.microsSinceUnixEpoch);
  f.seed("playerDailyQuest", { identity: f.ctx.sender, day, bonus: 1, guildPoints: 0, guildName: "",
    questsJson: JSON.stringify([{ mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 45 },
      { mapId: "tutorial_forest", enemy: "Bramble", target: 80, progress: 0 }]) });
  fillDefeatBudget(f, "tutorial_forest", "Spitter");
  return { f, day };
}
const spitters = (f: any, count: number, sequence = 1n) =>
  reportKills(f, { streamId: "quest-stream-0001", sequence, mapId: "tutorial_forest", enemies: [{ enemy: "Spitter", count }] });

it("finishes a quest from accepted kills and gives the guild a point for the week", () => {
  const { f, day } = questing();
  spitters(f, 10);
  const row = f.db.playerDailyQuest.identity.find(f.ctx.sender);
  const quests = JSON.parse(row.questsJson);
  expect(quests[0].progress).toBe(50);
  expect(quests[1].progress).toBe(0);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`)).toMatchObject({ points: 1, guildName: "Oaks" });
  expect(row).toMatchObject({ guildPoints: 1, guildName: "Oaks" });
  // Already finished: more kills give nothing more.
  spitters(f, 10, 2n);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`).points).toBe(1);
});

it("pays the guild's bonus the week after: 0.1% of stat gains per point", () => {
  const { f, day } = questing();
  const base = statRewardMultiplier(f.ctx, f.ctx.sender);
  f.seed("guildQuestWeek", { key: `${questWeek(day) - 1}:7`, week: questWeek(day) - 1, guildId: 7n, guildName: "Oaks", points: 300 });
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(1.3);
  expect(statRewardMultiplier(f.ctx, f.ctx.sender)).toBeCloseTo(base * 1.3);
  expect(ensureDailyQuests(f.ctx, f.ctx.sender).bonus).toBeCloseTo(1.3);
});

it("pays a guildless player 1% a quest the week after, up to 15%", () => {
  const { f } = questing(false);
  spitters(f, 10);
  // The row carries their own count for the board's bonus line.
  expect(f.db.playerDailyQuest.identity.find(f.ctx.sender)).toMatchObject({ guildName: "", guildPoints: 1 });
  expect(JSON.parse(f.db.playerDailyQuest.identity.find(f.ctx.sender).questsJson)[0].progress).toBe(50);
  expect([...f.db.guildQuestWeek.iter()]).toHaveLength(0);
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBe(1);
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 7n * DAY);
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(1.01);
  // Two weeks on, last week's empty solo week pays nothing.
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 7n * DAY);
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBe(1);
});

it("keeps points with the guild that earned them when a member hops", () => {
  const { f, day } = questing();
  spitters(f, 10);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`).points).toBe(1);
  f.seed("guild", { id: 8n, directoryId: 1n, nameKey: "pines", name: "Pines", leader: f.ctx.sender, members: 1, champions: 0, week: 0, score: 0,
    wins: 0, battles: 0, attackDay: 0, attacks: 0, opponents: "", emblem: -1 });
  f.patch("guildMember", { guildId: 8n, joinedAt: f.ctx.timestamp.microsSinceUnixEpoch - DAY });
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`).points).toBe(1);
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 8n).questPoints).toBe(0);
});

it("draws fifteen when the week turns, and tops a daily list up to fifteen keeping its progress", () => {
  const { f, day } = questing();
  const topped = JSON.parse(ensureDailyQuests(f.ctx, f.ctx.sender).questsJson);
  expect(topped).toHaveLength(WEEKLY_QUEST_COUNT);
  expect(topped.slice(0, 2).map((q: any) => q.progress)).toEqual([45, 0]);
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 7n * DAY);
  const row = ensureDailyQuests(f.ctx, f.ctx.sender);
  expect(row.day).toBe(day + 7);
  const quests = JSON.parse(row.questsJson);
  expect(quests).toHaveLength(WEEKLY_QUEST_COUNT);
  expect(quests.every((q: any) => q.progress === 0)).toBe(true);
});

it("counts a new member's quests for the guild from the moment they join, and gives them its bonus at once", () => {
  const { f, day } = questing();
  f.patch("guildMember", { joinedAt: f.ctx.timestamp.microsSinceUnixEpoch });
  f.seed("guildQuestWeek", { key: `${questWeek(day) - 1}:7`, week: questWeek(day) - 1, guildId: 7n, guildName: "Oaks", points: 300 });
  // Joined today: the guild's whole bonus from last week, not the member's own (Ryan).
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(1.3);
  spitters(f, 10);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`).points).toBe(1);
  expect(f.db.soloQuestWeek.identity.find(f.ctx.sender)).toBeNull();
  // In the guild when the week turns: its bonus, not the solo one.
  f.db.guildQuestWeek.key.update({ ...f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`), points: 100 });
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 7n * DAY);
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(1.1);
  expect(JSON.parse(f.db.playerDailyQuest.identity.find(f.ctx.sender).questsJson)[0].progress).toBe(50);
});

it("tallies each member's points for the Guild window, for the guild they earned them in", () => {
  const { f } = questing();
  spitters(f, 10);
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 7n)).toMatchObject({ questsDone: 1, questsTotal: 15, questsOpen: 14, questPoints: 1 });
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 8n).questPoints).toBe(0);
});

const member = (f: any, last: string, joinedAt = 0n) => {
  const who = Identity.fromString("00".repeat(31) + last);
  f.seed("guildMember", { identity: who, guildId: 7n, name: `M${last}`, joinedAt, eligibleAt: 0n, champion: false, fighter: "", power: 0, vicePresident: false });
  return who;
};
const finishedWeek = () => JSON.stringify(Array.from({ length: WEEKLY_QUEST_COUNT }, () => ({ mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 50 })));

it("lets a member whose own fifteen are done take more from the guild's pool, without touching anyone's quests", () => {
  const { f, day } = questing();
  // The guild: the sender (with two quests open) and two members.
  const sleepy = member(f, "42"), helper = member(f, "44");
  f.db.guild.id.update({ ...f.db.guild.id.find(7n), members: 3 });
  f.seed("playerDailyQuest", { identity: sleepy, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: JSON.stringify([
    { mapId: "tutorial_forest", enemy: "Spitter", target: 60, progress: 10 },
  ]) });
  f.seed("playerDailyQuest", { identity: helper, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: finishedWeek() });
  f.seed("guildQuestWeek", { key: `${questWeek(day)}:7`, week: questWeek(day), guildId: 7n, guildName: "Oaks", points: 15 });
  // 300 in the pool at any size, less only the 15 finished: nobody's open quests hold any of it.
  expect(questCollectStanding(f.ctx, helper)).toMatchObject({ ready: true, left: 15, pool: 285, poolSize: 300 });
  expect(collectGuildQuests(f.ctx, helper)).toBe(15);
  const mine = JSON.parse(f.db.playerDailyQuest.identity.find(helper).questsJson);
  expect(mine.filter((quest: any) => quest.from === GUILD_POOL_FROM)).toHaveLength(15);
  // Nobody's quests were taken.
  expect(JSON.parse(f.db.playerDailyQuest.identity.find(sleepy).questsJson).some((quest: any) => quest.takenBy)).toBe(false);
  // Collected quests hold nothing either: the pool goes down only as quests are finished.
  expect(questCollectStanding(f.ctx, helper)).toMatchObject({ left: 0, pool: 285 });
  // Finished pool quests show beside the member's own fifteen.
  const list = JSON.parse(f.db.playerDailyQuest.identity.find(helper).questsJson);
  f.db.playerDailyQuest.identity.update({ ...f.db.playerDailyQuest.identity.find(helper), questsJson: JSON.stringify(list.map((quest: any, index: number) => index === 15 ? { ...quest, progress: quest.target } : quest)) });
  expect(memberQuestStanding(f.ctx, helper, 7n)).toMatchObject({ questsDone: 15, questsCollected: 1 });
  expect(() => collectGuildQuests(f.ctx, helper)).toThrow("collected 15");
  // The old reducer still collects, from the pool.
  expect(() => collectMemberQuests(f.ctx, f.ctx.sender, sleepy)).toThrow("Finish your own quests first");
});

it("caps a guild's week at 300 points whatever its size", () => {
  const { f, day } = questing();
  f.db.guild.id.update({ ...f.db.guild.id.find(7n), members: 1 });
  // One member past fifteen still pays: the cap is 300, not fifteen a member.
  f.seed("guildQuestWeek", { key: `${questWeek(day)}:7`, week: questWeek(day), guildId: 7n, guildName: "Oaks", points: 15 });
  spitters(f, 10);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`).points).toBe(16);
  f.db.guildQuestWeek.key.update({ ...f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`), points: 300 });
  f.db.playerDailyQuest.identity.update({ ...f.db.playerDailyQuest.identity.find(f.ctx.sender), questsJson: JSON.stringify([
    { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 49 }]) });
  spitters(f, 10, 2n);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`).points).toBe(300);
});

it("leaves the pool to whoever finishes: an extra collected and left undone blocks nobody", () => {
  const { f, day } = questing();
  const helper = member(f, "44"), other = member(f, "46");
  f.db.guild.id.update({ ...f.db.guild.id.find(7n), members: 3 });
  f.seed("playerDailyQuest", { identity: helper, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: finishedWeek() });
  f.seed("playerDailyQuest", { identity: other, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: finishedWeek() });
  f.seed("guildQuestWeek", { key: `${questWeek(day)}:7`, week: questWeek(day), guildId: 7n, guildName: "Oaks", points: 285 });
  // Fifteen left. The helper collects fifteen and then goes quiet; the other member can still collect.
  expect(collectGuildQuests(f.ctx, helper)).toBe(15);
  expect(questCollectStanding(f.ctx, other)).toMatchObject({ pool: 15 });
  expect(collectGuildQuests(f.ctx, other)).toBe(15);
  // The sender's own quest still pays while the pool has room.
  spitters(f, 10);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`).points).toBe(286);
});

it("lets a full guild reach 300 though a member who opened their quests never does one", () => {
  const { f, day } = questing();
  // Twenty members, every board open on the first day: the sender's fifteen unfinished, and nineteen others'.
  const others = Array.from({ length: 19 }, (_, i) => member(f, (0x80 + i).toString(16)));
  f.db.guild.id.update({ ...f.db.guild.id.find(7n), members: 20 });
  const openWeek = JSON.stringify(Array.from({ length: WEEKLY_QUEST_COUNT }, () => ({ mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 0 })));
  for (const who of others) f.seed("playerDailyQuest", { identity: who, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: openWeek });
  // All 300 are in the pool before anyone has done a thing.
  expect(questCollectStanding(f.ctx, others[0])).toMatchObject({ pool: 300 });
  // Eighteen finish their own; the sender never plays. One of the eighteen makes up the sender's fifteen.
  for (const who of others.slice(0, 18)) f.db.playerDailyQuest.identity.update({ ...f.db.playerDailyQuest.identity.find(who), questsJson: finishedWeek() });
  f.seed("guildQuestWeek", { key: `${questWeek(day)}:7`, week: questWeek(day), guildId: 7n, guildName: "Oaks", points: 270 });
  expect(questCollectStanding(f.ctx, others[0])).toMatchObject({ ready: true, left: 15, pool: 30 });
  expect(collectGuildQuests(f.ctx, others[0])).toBe(15);
});

it("moves a new member's guildless quests from this week to their guild, up to the 300 cap", () => {
  const { f, day } = questing();
  const week = questWeek(day);
  f.patch("guildMember", { joinedAt: f.ctx.timestamp.microsSinceUnixEpoch });
  f.seed("soloQuestWeek", { identity: f.ctx.sender, week, points: 10, lastWeek: 0, lastPoints: 0 });
  expect(moveSoloQuestsToGuild(f.ctx, f.ctx.sender)).toBe(10);
  expect(f.db.guildQuestWeek.key.find(`${week}:7`).points).toBe(10);
  expect(f.db.guildMemberQuestWeek.identity.find(f.ctx.sender)).toMatchObject({ week, guildId: 7n, points: 10 });
  expect(f.db.soloQuestWeek.identity.find(f.ctx.sender).points).toBe(0);
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 7n).questPoints).toBe(10);
  // Nothing left to move the second time; a full pool takes no more.
  expect(moveSoloQuestsToGuild(f.ctx, f.ctx.sender)).toBe(0);
  f.db.soloQuestWeek.identity.update({ ...f.db.soloQuestWeek.identity.find(f.ctx.sender), points: 9 });
  f.db.guildQuestWeek.key.update({ ...f.db.guildQuestWeek.key.find(`${week}:7`), points: 295 });
  expect(moveSoloQuestsToGuild(f.ctx, f.ctx.sender)).toBe(5);
  expect(f.db.soloQuestWeek.identity.find(f.ctx.sender).points).toBe(4);
});

it("shows a new member their guild's bonus the moment they join, and drops it when they leave", () => {
  const { f, day } = questing();
  f.patch("guildMember", { joinedAt: f.ctx.timestamp.microsSinceUnixEpoch });
  f.seed("guildQuestWeek", { key: `${questWeek(day) - 1}:7`, week: questWeek(day) - 1, guildId: 7n, guildName: "Oaks", points: 300 });
  moveSoloQuestsToGuild(f.ctx, f.ctx.sender);
  expect(f.db.playerDailyQuest.identity.find(f.ctx.sender).bonus).toBeCloseTo(1.3);
  f.db.guildMember.identity.delete(f.ctx.sender);
  refreshQuestBonus(f.ctx, f.ctx.sender);
  expect(f.db.playerDailyQuest.identity.find(f.ctx.sender).bonus).toBe(1);
});

it("leaves last week's guildless quests with the solo bonus", () => {
  const { f, day } = questing();
  const week = questWeek(day);
  const joiner = member(f, "45", f.ctx.timestamp.microsSinceUnixEpoch);
  f.seed("soloQuestWeek", { identity: joiner, week: week - 1, points: 7, lastWeek: 0, lastPoints: 0 });
  expect(moveSoloQuestsToGuild(f.ctx, joiner)).toBe(0);
  expect(f.db.soloQuestWeek.identity.find(joiner).points).toBe(7);
});


it("pays the full solo week when quests were finished before the solo count began, and keeps it past the new draw", () => {
  const { f, day } = questing(false);
  // Fifteen done; the solo count only saw thirteen of them (two came before 0.853).
  f.patch("playerDailyQuest", { questsJson: finishedWeek() });
  f.seed("soloQuestWeek", { identity: f.ctx.sender, week: questWeek(day), points: 13, lastWeek: 0, lastPoints: 0 });
  expect(ensureDailyQuests(f.ctx, f.ctx.sender).guildPoints).toBe(15);
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 7n * DAY);
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(1.15);
  // The new week's draw replaces the list; the settled count keeps the bonus.
  const row = ensureDailyQuests(f.ctx, f.ctx.sender);
  expect(JSON.parse(row.questsJson).every((q: any) => q.progress === 0)).toBe(true);
  expect(row.bonus).toBeCloseTo(1.15);
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(1.15);
});

it("never shows a member fewer points than their list shows done", () => {
  const { f, day } = questing();
  f.patch("playerDailyQuest", { questsJson: JSON.stringify([
    { mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 50 },
    { mapId: "tutorial_forest", enemy: "Brood", target: 50, progress: 50 },
    { mapId: "tutorial_forest", enemy: "Needle", target: 50, progress: 50 },
  ]) });
  // The tally began after two of them.
  f.seed("guildMemberQuestWeek", { identity: f.ctx.sender, week: questWeek(day), guildId: 7n, points: 1 });
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 7n).questPoints).toBe(3);
  // A tally ahead of the list (earlier days' daily quests) stands.
  f.patch("guildMemberQuestWeek", { points: 9 });
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 7n).questPoints).toBe(9);
});

it("drops guild weeks before last week, keeping last week's for the bonus and this week's for the board", () => {
  const f = crystalFixture();
  f.ctx.timestamp = new Timestamp(DAY * 20_000n);
  const week = questWeek(questDay(f.ctx.timestamp.microsSinceUnixEpoch));
  for (const offset of [3, 2, 1, 0]) f.seed("guildQuestWeek", { key: `${week - offset}:1`, week: week - offset, guildId: 1n, guildName: "Oak", points: 5 });
  expect(pruneOldGuildQuestWeeks(f.ctx)).toBe(2);
  expect([...f.db.guildQuestWeek.iter()].map((row: any) => row.week).sort()).toEqual([week - 1, week]);
});

it("holds own quests only for members who opened this week's: a full guild's absent members leave room in the pool", () => {
  const { f, day } = questing();
  const helper = member(f, "44");
  // Eighteen members who have not opened their quests this week.
  for (let i = 0; i < 18; i++) member(f, (0x80 + i).toString(16));
  f.db.guild.id.update({ ...f.db.guild.id.find(7n), members: 20 });
  f.seed("playerDailyQuest", { identity: helper, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: finishedWeek() });
  f.seed("guildQuestWeek", { key: `${questWeek(day)}:7`, week: questWeek(day), guildId: 7n, guildName: "Oaks", points: 15 });
  // 300 - 15 points: the sender's open fifteen hold nothing, and nor do the absent eighteen.
  expect(questCollectStanding(f.ctx, helper)).toMatchObject({ pool: 285 });
});

it("pays a player without a guild bonus 1% for every quest they finished last week, guild ones included", () => {
  const { f, day } = questing();
  spitters(f, 10);
  // Next week, after leaving the guild that week's quest counted for.
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 7n * DAY);
  f.db.guildMember.identity.delete(f.ctx.sender);
  expect(questWeek(questDay(f.ctx.timestamp.microsSinceUnixEpoch))).toBe(questWeek(day) + 1);
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(1.01);
});
