import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "../wildstat-coop";
import { leaderboardPodiumEntries, leaderboardValueText, sortedLeaderboardEntries } from "./leaderboard";

function entry(identity: string, name: string, values: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    identity,
    name,
    gender: 0,
    power: 0,
    damage: 0,
    maxHp: 100,
    armor: 0,
    regen: 0,
    playedSeconds: 0,
    isGuest: false,
    skinTone: 3,
    headItem: "basic_paper_hat",
    chestItem: "",
    feetItem: "",
    rightHandItem: "starter_stone",
    leftHandItem: "",
    ...values,
  };
}

describe("leaderboard podium", () => {
  const entries = [
    entry("a", "Alpha", { power: 300, damage: 10 }),
    entry("b", "Bravo", { power: 200, damage: 400 }),
    entry("c", "Charlie", { power: 100, damage: 300 }),
    entry("d", "Delta", { power: 50, damage: 200 }),
  ];

  it("places third left, first center, and second right for the active tab", () => {
    expect(leaderboardPodiumEntries("power", entries).map(({ rank, entry: player }) => [rank, player?.name])).toEqual([
      [3, "Charlie"],
      [1, "Alpha"],
      [2, "Bravo"],
    ]);
    expect(leaderboardPodiumEntries("damage", entries).map(({ rank, entry: player }) => [rank, player?.name])).toEqual([
      [3, "Delta"],
      [1, "Bravo"],
      [2, "Charlie"],
    ]);
  });

  it("sorts a snapshot without mutating its original order", () => {
    expect(sortedLeaderboardEntries("power", entries, 2).map((player) => player.name)).toEqual(["Alpha", "Bravo"]);
    expect(entries.map((player) => player.name)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });

  it("formats podium values with the same rules as leaderboard rows", () => {
    expect(leaderboardValueText("regen", entry("r", "Regen", { regen: 12.345 }))).toBe("12.35/s");
    expect(leaderboardValueText("time", entry("t", "Time", { playedSeconds: 9_000 }))).toBe("2h 30m");
  });
});
