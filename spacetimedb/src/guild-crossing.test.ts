import { describe, expect, it, vi } from "vitest";
import { CROSSING_STEPS } from "../../shared/guild-crossing";
import { GUILD_WEEK_QUEST_CAP, questDay, questWeek } from "../../shared/weekly-quests";
import { creditGuildCrossingPoints, guildQuestPool } from "./daily-quests";
import { guildCrossingSummaryFor, readGuildCrossing, stepGuildCrossingFor } from "./guild-crossing";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function makeIdentity(hex: string) {
  return {
    toHexString: () => hex,
    equals: (other: { toHexString?: () => string }) => other?.toHexString?.() === hex,
  };
}

function makeTable<T extends Record<string, any>>(pk: keyof T, indexField?: keyof T) {
  const rows = new Map<any, T>();
  const keyOf = (v: any) => (v && typeof v === "object" && typeof v.toHexString === "function" ? v.toHexString() : v);
  const api: any = {
    insert: (row: T) => { rows.set(keyOf(row[pk]), row); return row; },
    iter: () => rows.values(),
    [pk]: {
      find: (val: any) => rows.get(keyOf(val)),
      update: (row: T) => { rows.set(keyOf(row[pk]), row); return row; },
      delete: (val: any) => { rows.delete(keyOf(val)); },
    },
  };
  if (indexField) {
    api[indexField] = {
      filter: (val: any) => [...rows.values()].filter(row => keyOf(row[indexField]) === keyOf(val)),
    };
  }
  return api;
}

function fixture(memberCount = 20, randomBits: number[] = []) {
  const guildId = 7n;
  const alice = makeIdentity("0xalice");
  const bob = makeIdentity("0xbob");
  const db: any = {
    guild: makeTable("id"),
    guildMember: makeTable("identity", "guildId"),
    guildCrossingWeek: makeTable("key", "week"),
    guildCrossingAttempt: makeTable("identity"),
    guildQuestWeek: makeTable("key", "week"),
    guildHall: makeTable("guildId"),
    playerDailyQuest: makeTable("identity"),
  };
  db.guild.insert({ id: guildId, name: "OAKS", emblem: 3, members: memberCount });
  db.guildMember.insert({ identity: alice, guildId, name: "Alice" });
  db.guildMember.insert({ identity: bob, guildId, name: "Bob" });

  let bitIndex = 0;
  let nowDay = 20_500;
  const ctxFor = (sender: any) => ({
    sender,
    db,
    timestamp: { microsSinceUnixEpoch: BigInt(nowDay) * 86_400_000_000n + 1_000_000n },
    random: () => {
      const bit = randomBits[bitIndex++] ?? 0;
      return bit ? 0.75 : 0.25;
    },
  });
  const profiles: Record<string, { displayName: string; profileIcon: number }> = {
    "0xalice": { displayName: "Alice", profileIcon: 2 },
    "0xbob": { displayName: "Bob", profileIcon: 5 },
  };
  const deps = {
    profileFor: (_ctx: any, id: any) => profiles[id.toHexString()] ?? null,
    creditCrossingPoints: creditGuildCrossingPoints,
  };
  return {
    guildId, alice, bob, db, deps, ctxFor,
    setDay: (d: number) => { nowDay = d; },
  };
}

describe("Glass Crossing server logic", () => {
  it("never exposes unrevealed safe sides, keeps try on safe streaks, records fallen memorials, and awards bonus points without reducing the 300-quest pool", () => {
    // All 16 steps have safe side = "left" (0).
    const f = fixture(20, Array(CROSSING_STEPS).fill(0));
    const aliceCtx = f.ctxFor(f.alice);
    const bobCtx = f.ctxFor(f.bob);

    const before = readGuildCrossing(aliceCtx, f.alice)!;
    expect(before.revealed).toBe(0);
    expect(before.revealedSides).toEqual([]);
    expect(before.dailyLimit).toBe(1);
    expect(before.remainingToday).toBe(1);

    // Alice guesses safely 5 times in a row: her daily try is preserved and streak reaches 5.
    for (let step = 0; step < 5; step++) {
      const res = stepGuildCrossingFor(aliceCtx, step, "left", f.deps);
      expect(res.outcome).toBe("safe");
    }
    const mid = readGuildCrossing(aliceCtx, f.alice)!;
    expect(mid.revealed).toBe(5);
    expect(mid.revealedSides).toHaveLength(5);
    expect(mid.remainingToday).toBe(1);
    expect(mid.currentStreak).toBe(5);
    expect(mid.pointsAwarded).toBe(0);

    // Alice steps wrong on Step 6 (index 5, "right"): shatters, spends her 1 daily try, leaves memorial, reveals step 6 -> +10 milestone!
    const fall = stepGuildCrossingFor(aliceCtx, 5, "right", f.deps);
    expect(fall.outcome).toBe("fell");
    expect(fall.pointsDelta).toBe(10);
    const afterFall = readGuildCrossing(aliceCtx, f.alice)!;
    expect(afterFall.revealed).toBe(6);
    expect(afterFall.falls).toHaveLength(1);
    expect(afterFall.falls[0]).toMatchObject({ step: 5, side: "right", name: "Alice", profileIcon: 2 });
    expect(afterFall.remainingToday).toBe(0);
    expect(afterFall.currentStreak).toBe(0);
    expect(afterFall.bestStreak).toBe(5);
    expect(afterFall.pointsAwarded).toBe(10);

    // Bonus points credited to guildQuestWeek & Hall Fund, AND the 300-quest pool stays completely full!
    const week = questWeek(questDay(aliceCtx.timestamp.microsSinceUnixEpoch));
    expect(f.db.guildQuestWeek.key.find(`${week}:7`)?.points).toBe(10);
    expect(f.db.guildHall.guildId.find(7n)?.fund).toBe(10);
    expect(guildQuestPool(aliceCtx, 7n).left).toBe(GUILD_WEEK_QUEST_CAP);

    // Alice cannot step again today, and Bob cannot double-step an outdated expectedStep.
    expect(() => stepGuildCrossingFor(aliceCtx, 6, "left", f.deps)).toThrow(/No tries left/i);
    expect(() => stepGuildCrossingFor(bobCtx, 5, "left", f.deps)).toThrow(/guildmate just stepped/i);

    // Bob pushes steps 6..14 safely, then falls on step 16 (index 15) — unlocking the Finish Portal!
    for (let step = 6; step < 15; step++) stepGuildCrossingFor(bobCtx, step, "left", f.deps);
    const lastFall = stepGuildCrossingFor(bobCtx, 15, "right", f.deps);
    expect(lastFall.outcome).toBe("fell");
    const preFinish = readGuildCrossing(bobCtx, f.bob)!;
    expect(preFinish.revealed).toBe(16);
    expect(preFinish.completed).toBe(false);
    expect(preFinish.pointsAwarded).toBe(25); // 10 + 15 milestones, final 25 waits for crossing!

    // Next day: Alice gets a fresh try and steps through the Finish Portal for the final +25 pts!
    f.setDay(20_501);
    const aliceDay2 = f.ctxFor(f.alice);
    const win = stepGuildCrossingFor(aliceDay2, 16, "finish", f.deps);
    expect(win.outcome).toBe("cleared");
    expect(win.pointsDelta).toBe(25);
    const done = readGuildCrossing(aliceDay2, f.alice)!;
    expect(done.completed).toBe(true);
    expect(done.winner?.name).toBe("Alice");
    expect(done.pointsAwarded).toBe(50);
    expect(f.db.guildQuestWeek.key.find(`${week}:7`)?.points).toBe(50);
    expect(guildCrossingSummaryFor(aliceDay2, f.alice, 7n, 20).completed).toBe(true);
  });

  it("gives smaller guilds (1–4 members) 3 tries per day so they can clear within a week", () => {
    const f = fixture(3, Array(CROSSING_STEPS).fill(1)); // all right safe
    const ctx = f.ctxFor(f.alice);
    expect(readGuildCrossing(ctx, f.alice)!.dailyLimit).toBe(3);
    // 3 falls in one day all succeed before hitting the daily cap.
    stepGuildCrossingFor(ctx, 0, "left", f.deps);
    stepGuildCrossingFor(ctx, 1, "left", f.deps);
    stepGuildCrossingFor(ctx, 2, "left", f.deps);
    expect(readGuildCrossing(ctx, f.alice)!.remainingToday).toBe(0);
    expect(() => stepGuildCrossingFor(ctx, 3, "left", f.deps)).toThrow(/No tries left/i);
  });
});
