import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity } from "../../tests/helpers/crystal-hollows-fixture";
import { readLeaderboardPage, readLeaderboardWindow, writeLeaderboardPages } from "./leaderboard-pages";
import { LEADERBOARD_STATS } from "../../shared/leaderboard-window";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("indexed leaderboard windows", () => {
  it.each([10, 100_000])("reads bounded pages at population %s with absolute ranks", total => {
    const mine = Math.ceil(total / 2);
    const pageRead = vi.fn((key: string) => {
      const page = Number(key.split(":")[1]);
      return { identities: Array.from({ length: 100 }, (_, offset) => page * 100 + offset + 1) };
    });
    const entryRead = vi.fn((rank: number) => ({ identity: rank }));
    const ctx = { sender: mine, db: {
      leaderboardPosition: { identity: { find: () => ({ ranks: LEADERBOARD_STATS.map(() => mine) }) } },
      leaderboardSize: { id: { find: () => ({ total }) } },
      leaderboardRankPage: { key: { find: pageRead } },
      leaderboardEntry: { identity: { find: entryRead } },
    } };
    const rows = readLeaderboardWindow(ctx as never, "power");
    expect(rows.length).toBe(Math.min(total, 104));
    expect(rows.slice(0, 3).map(row => row.rank)).toEqual([1, 2, 3]);
    expect(rows.some(row => row.rank === mine)).toBe(true);
    if (total > 104) expect(rows.slice(3).map(row => row.rank)).toEqual(Array.from({ length: 101 }, (_, n) => mine - 50 + n));
    expect(pageRead.mock.calls.length).toBeLessThanOrEqual(3);
    expect(entryRead.mock.calls.length).toBeLessThanOrEqual(104);
  });
  it("bounds arbitrary pages to 100 lookups and returns the actual population boundary", () => {
    const entryRead = vi.fn((rank: number) => ({ identity: rank }));
    const pageRead = vi.fn((key: string) => ({ identities: Array.from({ length: 100 }, (_, i) => Number(key.split(":")[1]) * 100 + i + 1) }));
    const ctx = { sender: 50_000, db: {
      leaderboardPosition: { identity: { find: () => ({ ranks: LEADERBOARD_STATS.map(() => 50_000) }) } },
      leaderboardSize: { id: { find: () => ({ total: 100_000 }) } },
      leaderboardRankPage: { key: { find: pageRead } }, leaderboardEntry: { identity: { find: entryRead } },
    } };
    const page = readLeaderboardPage(ctx as never, "regen", 49951, 100000);
    expect(page).toMatchObject({ startRank: 49951, endRank: 50050, localRank: 50000, total: 100000 });
    expect(page.entries).toHaveLength(100);
    expect(pageRead).toHaveBeenCalledTimes(2); expect(entryRead).toHaveBeenCalledTimes(100);
    expect(readLeaderboardPage(ctx as never, "regen", 99991, 100).entries).toHaveLength(10);
    expect(readLeaderboardPage(ctx as never, "regen", 100001, 100).entries).toHaveLength(0);
  });
  it("keeps stat-specific ranks, breaks identical ties by identity, and removes deleted players", () => {
    const f = crystalFixture();
    const candidates = ["2", "1", "3"].map(digit => ({ identity: identity(digit), identityKey: identity(digit).toHexString(),
      displayName: "Same", prestige: 0, power: 1, damage: Number(digit), maxHp: 10, armor: 0, regen: 0, playedMicros: 0n }));
    for (const row of candidates) f.seed("leaderboardEntry", row);
    writeLeaderboardPages(f.ctx as never, candidates);
    expect(readLeaderboardWindow(f.ctx as never, "power").map(row => row.entry.identity.toHexString())).toEqual([identity("1"), identity("2"), identity("3")].map(id => id.toHexString()));
    expect(readLeaderboardWindow(f.ctx as never, "damage")[0].entry.identity.equals(identity("3"))).toBe(true);
    writeLeaderboardPages(f.ctx as never, candidates.slice(0, 2));
    expect(f.db.leaderboardPosition.identity.find(identity("3"))).toBeNull();
    expect(readLeaderboardWindow(f.ctx as never, "damage")).toHaveLength(2);
    expect(() => readLeaderboardWindow(f.ctx as never, "injected")).toThrow(/Unknown/);
  });
});
