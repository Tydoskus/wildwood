import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportKills } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
import { questDay, questWeek } from "../../shared/daily-quests";
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

it("pays the guild's bonus the week after: 0.25% of stat gains per point", () => {
  const { f, day } = questing();
  const base = statRewardMultiplier(f.ctx, f.ctx.sender);
  f.seed("guildQuestWeek", { key: `${questWeek(day) - 1}:7`, week: questWeek(day) - 1, guildId: 7n, guildName: "Oaks", points: 420 });
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBeCloseTo(2.05);
  expect(statRewardMultiplier(f.ctx, f.ctx.sender)).toBeCloseTo(base * 2.05);
  expect(ensureDailyQuests(f.ctx, f.ctx.sender).bonus).toBeCloseTo(2.05);
});

it("finishes quests without a guild, for no point", () => {
  const { f } = questing(false);
  spitters(f, 10);
  expect(JSON.parse(f.db.playerDailyQuest.identity.find(f.ctx.sender).questsJson)[0].progress).toBe(50);
  expect([...f.db.guildQuestWeek.iter()]).toHaveLength(0);
});

it("draws a fresh set when the day turns", () => {
  const { f, day } = questing();
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 86_400_000_000n);
  const row = ensureDailyQuests(f.ctx, f.ctx.sender);
  expect(row.day).toBe(day + 1);
  const quests = JSON.parse(row.questsJson);
  expect(quests).toHaveLength(3);
  expect(quests.every((q: any) => q.progress === 0)).toBe(true);
});

it("counts a new member's quests for the guild from tomorrow, and its bonus from next week", () => {
  const { f, day } = questing();
  f.patch("guildMember", { joinedAt: f.ctx.timestamp.microsSinceUnixEpoch });
  f.seed("guildQuestWeek", { key: `${questWeek(day) - 1}:7`, week: questWeek(day) - 1, guildId: 7n, guildName: "Oaks", points: 420 });
  expect(guildQuestBonusFor(f.ctx, f.ctx.sender)).toBe(1);
  spitters(f, 10);
  expect(f.db.guildQuestWeek.key.find(`${questWeek(day)}:7`)).toBeNull();
  expect(JSON.parse(f.db.playerDailyQuest.identity.find(f.ctx.sender).questsJson)[0].progress).toBe(50);
});

it("tallies each member's points for the Guild window, for the guild they earned them in", () => {
  const { f } = questing();
  spitters(f, 10);
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 7n)).toMatchObject({ questsDone: 1, questsTotal: 2, questsOpen: 1, questPoints: 1 });
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 8n).questPoints).toBe(0);
});

it("lets a leader whose own quests are done collect up to three of a member's unfinished ones", () => {
  const { f, day } = questing();
  const member = Identity.fromString("00".repeat(31) + "42");
  f.seed("guildMember", { identity: member, guildId: 7n, name: "Sleepy", joinedAt: 0n, eligibleAt: 0n, champion: false, fighter: "", power: 0, vicePresident: false });
  f.seed("playerDailyQuest", { identity: member, day, bonus: 1, guildPoints: 0, guildName: "Oaks", questsJson: JSON.stringify([
    { mapId: "tutorial_forest", enemy: "Spitter", target: 60, progress: 10 },
    { mapId: "tutorial_forest", enemy: "Bramble", target: 70, progress: 70 },
    { mapId: "tutorial_forest", enemy: "Spitter", target: 90, progress: 0 },
  ]) });
  // The leader's own Bramble quest is still open.
  expect(() => collectMemberQuests(f.ctx, f.ctx.sender, member)).toThrow("Finish your own quests first");
  f.patch("playerDailyQuest", { questsJson: JSON.stringify([{ mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 50 }]) });
  expect(questCollectStanding(f.ctx, f.ctx.sender)).toEqual({ ready: true, left: 3 });
  expect(collectMemberQuests(f.ctx, f.ctx.sender, member)).toBe(2);
  const theirs = JSON.parse(f.db.playerDailyQuest.identity.find(member).questsJson);
  expect(theirs.filter((quest: any) => quest.takenBy)).toHaveLength(2);
  const mine = JSON.parse(f.db.playerDailyQuest.identity.find(f.ctx.sender).questsJson);
  expect(mine.filter((quest: any) => quest.from === "Sleepy").map((quest: any) => quest.progress)).toEqual([10, 0]);
  expect(questCollectStanding(f.ctx, f.ctx.sender).left).toBe(1);
  // Nothing left open to take: the finished Bramble stays theirs.
  expect(() => collectMemberQuests(f.ctx, f.ctx.sender, member)).toThrow("no unfinished quests");
  // Finishing a collected quest is a point for the guild, credited to the leader.
  spitters(f, 50);
  expect(memberQuestStanding(f.ctx, f.ctx.sender, 7n).questPoints).toBe(1);
  expect(memberQuestStanding(f.ctx, member, 7n)).toMatchObject({ questsDone: 1, questsOpen: 0 });
});

it("collects only for the President and Vice President, and not from a member who joined today", () => {
  const { f, day } = questing();
  const member = Identity.fromString("00".repeat(31) + "43");
  f.seed("guildMember", { identity: member, guildId: 7n, name: "New", joinedAt: f.ctx.timestamp.microsSinceUnixEpoch, eligibleAt: 0n, champion: false, fighter: "", power: 0, vicePresident: false });
  f.patch("playerDailyQuest", { questsJson: JSON.stringify([{ mapId: "tutorial_forest", enemy: "Spitter", target: 50, progress: 50 }]) });
  expect(() => collectMemberQuests(f.ctx, f.ctx.sender, member)).toThrow("from tomorrow");
  expect(() => collectMemberQuests(f.ctx, member, f.ctx.sender)).toThrow("President or Vice President");
  void day;
});
