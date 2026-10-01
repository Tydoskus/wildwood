import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportKills } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
import { WEEKLY_QUEST_COUNT, questDay, questWeek } from "../../shared/daily-quests";
import { collectMemberQuests, ensureDailyQuests, guildQuestBonusFor, memberQuestStanding, questCollectStanding } from "./daily-quests";
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

it("counts a new member's quests for the guild from tomorrow (today's go solo), and its bonus from next week", () => {
  const { f, day } = questing();
  f.patch("guildMember", { joinedAt: f.ctx.timestamp.microsSinceUnixEpoch });
  f.seed("guildQuestWeek", { key: `${questWeek(day) - 1}:7`, week: questWeek(day) - 1, guildId: 7n, guildName: "Oaks", points: 420 });
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBe(1);
  spitters(f, 10);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`)).toBeNull();
  expect(f.db.soloQuestWeek.identity.find(f.ctx.sender)).toMatchObject({ week: questWeek(day), points: 1 });
  // In the guild when the week turns: its bonus, not the solo one.
  f.seed("guildQuestWeek", { key: `${questWeek(day)}:7`, week: questWeek(day), guildId: 7n, guildName: "Oaks", points: 100 });
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

it("lets any member whose own fifteen are done collect up to fifteen of another's unfinished ones", () => {
  const { f, day } = questing();
  const sleepy = member(f, "42"), helper = member(f, "44");
  f.seed("playerDailyQuest", { identity: sleepy, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: JSON.stringify([
    { mapId: "tutorial_forest", enemy: "Spitter", target: 60, progress: 10 },
    { mapId: "tutorial_forest", enemy: "Bramble", target: 70, progress: 70 },
  ]) });
  // The collector's own week is still open.
  expect(() => collectMemberQuests(f.ctx, f.ctx.sender, sleepy)).toThrow("Finish your own quests first");
  // Not only leaders: an ordinary member with a finished week can collect.
  f.seed("playerDailyQuest", { identity: helper, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: finishedWeek() });
  expect(questCollectStanding(f.ctx, helper)).toEqual({ ready: true, left: 15 });
  // Their 14 open (one started, thirteen drawn to top the week up) all move.
  expect(collectMemberQuests(f.ctx, helper, sleepy)).toBe(14);
  const theirs = JSON.parse(f.db.playerDailyQuest.identity.find(sleepy).questsJson);
  expect(theirs.filter((quest: any) => quest.takenBy === "M44" || quest.takenBy)).toHaveLength(14);
  const mine = JSON.parse(f.db.playerDailyQuest.identity.find(helper).questsJson);
  expect(mine.filter((quest: any) => quest.from).map((quest: any) => quest.progress).slice(0, 2)).toEqual([10, 0]);
  expect(questCollectStanding(f.ctx, helper).left).toBe(1);
  expect(memberQuestStanding(f.ctx, sleepy, 7n)).toMatchObject({ questsDone: 1, questsTaken: 14, questsOpen: 0 });
  expect(() => collectMemberQuests(f.ctx, helper, sleepy)).toThrow("no unfinished quests");
});

it("does not collect from or for a member who joined today", () => {
  const { f } = questing();
  const fresh = member(f, "43", f.ctx.timestamp.microsSinceUnixEpoch);
  f.patch("playerDailyQuest", { questsJson: finishedWeek() });
  expect(() => collectMemberQuests(f.ctx, f.ctx.sender, fresh)).toThrow("from tomorrow");
  expect(() => collectMemberQuests(f.ctx, fresh, f.ctx.sender)).toThrow("from tomorrow");
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
