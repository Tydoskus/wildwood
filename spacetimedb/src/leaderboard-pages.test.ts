import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
import { moveLeaderboardPrestigePosition, readLeaderboardPage, readLeaderboardWindow, readPrestigeLeaderboardPage, writeLeaderboardPages } from "./leaderboard-pages";
import { eraseIdentityRows } from "./account-erasure";
import { LEADERBOARD_STATS } from "../../shared/leaderboard-window";
import { ATTACK_BALANCE_VERSION, BOSS_REWARD_CLAIM_BITS, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
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

type Fixture = ReturnType<typeof crystalFixture>;
const candidate = (digit: string, prestige: number, power: number, playedMicros = 0n) => ({
  identity: identity(digit), identityKey: identity(digit).toHexString(), displayName: `Player ${digit}`, prestige,
  power, damage: power, maxHp: power, armor: power, regen: power, playedMicros,
});
/** Many-player boards need more identities than the single-digit helper makes. */
const numbered = (n: number, prestige: number, power: number) => {
  const id = new Identity(n.toString(16).padStart(64, "0"));
  return { ...candidate("0", prestige, power), identity: id, identityKey: id.toHexString(), displayName: `Player ${n}` };
};
function writeBoards(f: Fixture, candidates: ReturnType<typeof candidate>[]) {
  for (const row of candidates) {
    if (!f.db.leaderboardEntry.identity.find(row.identity)) f.seed("leaderboardEntry", { identity: row.identity, displayName: row.displayName, isGuest: false });
  }
  writeLeaderboardPages(f.ctx as never, candidates);
}
const as = (f: Fixture, sender: Identity) => ({ ...f.ctx, sender }) as never;
const names = (page: { entries: Array<{ rank: number; entry: { displayName: string } }> }) => page.entries.map(row => `${row.rank}:${row.entry.displayName}`);

describe("per-prestige leaderboards", () => {
  it("ranks each level among itself, so every level has its own first place", () => {
    const f = crystalFixture();
    writeBoards(f, [candidate("a", 0, 900), candidate("b", 0, 800), candidate("c", 2, 50), candidate("d", 2, 70), candidate("e", 1, 10)]);
    expect(names(readPrestigeLeaderboardPage(as(f, identity("c")), "power", 2, 0, 100))).toEqual(["1:Player d", "2:Player c"]);
    expect(names(readPrestigeLeaderboardPage(as(f, identity("c")), "power", 0, 0, 100))).toEqual(["1:Player a", "2:Player b"]);
    expect(names(readPrestigeLeaderboardPage(as(f, identity("c")), "power", 1, 0, 100))).toEqual(["1:Player e"]);
    // The combined board is unchanged for tabs still asking for it.
    expect(readLeaderboardPage(as(f, identity("c")), "power", 0, 100).localRank).toBe(2);
  });

  it("orders time played within the level too, not across levels", () => {
    const f = crystalFixture();
    writeBoards(f, [candidate("a", 0, 1, 9_000n), candidate("b", 3, 1, 10n), candidate("c", 3, 1, 500n)]);
    expect(names(readPrestigeLeaderboardPage(as(f, identity("b")), "time", 3, 0, 100))).toEqual(["1:Player c", "2:Player b"]);
    expect(readPrestigeLeaderboardPage(as(f, identity("b")), "time", 3, 0, 100).localRank).toBe(2);
  });

  it("takes each level's top 100 from that level, not from a filtered global top 100", () => {
    const f = crystalFixture();
    // 150 unprestiged players outrank every Prestige 2 player on raw power, and
    // the combined board is grouped by prestige, so check both directions.
    const none = Array.from({ length: 150 }, (_, n) => numbered(1_000 + n, 0, 10_000 + n));
    const second = Array.from({ length: 120 }, (_, n) => numbered(2_000 + n, 2, 1 + n));
    writeBoards(f, [...none, ...second]);
    const viewer = none[0].identity;
    const top = readPrestigeLeaderboardPage(as(f, viewer), "damage", 2, 0, 100);
    expect(top).toMatchObject({ prestige: 2, total: 120, localRank: 0, startRank: 1, endRank: 100, levels: [0, 2] });
    expect(top.entries).toHaveLength(100);
    expect(top.entries[0].entry.displayName).toBe("Player 2119");
    expect(top.entries.every(row => second.some(player => player.identity.equals(row.entry.identity)))).toBe(true);
    const rest = readPrestigeLeaderboardPage(as(f, viewer), "damage", 2, 101, 100);
    expect(rest).toMatchObject({ startRank: 101, endRank: 120 });
    expect(rest.entries.map(row => row.rank)).toEqual(Array.from({ length: 20 }, (_, n) => 101 + n));
    // The viewer's own level opens at the viewer, fifty either side.
    const mine = readPrestigeLeaderboardPage(as(f, viewer), "damage", 0, 0, 100);
    expect(mine).toMatchObject({ localRank: 150, total: 150, startRank: 100, endRank: 150 });
    expect(mine.entries.slice(0, 3).map(row => row.rank)).toEqual([1, 2, 3]);
  });

  it("gives a viewer a rank only on their own level", () => {
    const f = crystalFixture();
    writeBoards(f, [candidate("a", 0, 5), candidate("b", 2, 5), candidate("c", 2, 9)]);
    expect(readPrestigeLeaderboardPage(as(f, identity("b")), "power", 2, 0, 100).localRank).toBe(2);
    expect(readPrestigeLeaderboardPage(as(f, identity("c")), "power", 2, 0, 100).localRank).toBe(1);
    expect(readPrestigeLeaderboardPage(as(f, identity("b")), "power", 0, 0, 100).localRank).toBe(0);
    // Someone not on any board, and a level nobody is on.
    expect(readPrestigeLeaderboardPage(as(f, identity("9")), "power", 2, 0, 100)).toMatchObject({ localRank: 0, total: 2 });
    expect(readPrestigeLeaderboardPage(as(f, identity("b")), "power", 7, 0, 100)).toMatchObject({ entries: [], total: 0, levels: [0, 2] });
    expect(() => readPrestigeLeaderboardPage(as(f, identity("b")), "injected", 2, 0, 100)).toThrow(/Unknown/);
  });

  it("moves a player to their new level's board when a snapshot sees a prestige", () => {
    const f = crystalFixture();
    writeBoards(f, [candidate("a", 1, 5), candidate("b", 1, 9), candidate("c", 0, 1)]);
    expect(f.db.leaderboardPrestigePosition.identity.find(identity("b"))).toMatchObject({ prestige: 1 });
    expect(f.db.leaderboardPrestigePosition.identity.find(identity("b"))!.ranks[0]).toBe(1);
    writeBoards(f, [candidate("a", 1, 5), candidate("b", 2, 3), candidate("c", 0, 1)]);
    expect(f.db.leaderboardPrestigePosition.identity.find(identity("b"))).toMatchObject({ prestige: 2, ranks: [1, 1, 1, 1, 1, 1] });
    expect(names(readPrestigeLeaderboardPage(as(f, identity("b")), "power", 1, 0, 100))).toEqual(["1:Player a"]);
    expect(readPrestigeLeaderboardPage(as(f, identity("b")), "power", 2, 0, 100)).toMatchObject({ localRank: 1, total: 1, levels: [0, 1, 2] });
    // The last Prestige 1 player leaving empties that level out of the switcher.
    writeBoards(f, [candidate("a", 2, 5), candidate("b", 2, 3), candidate("c", 0, 1)]);
    expect(f.db.leaderboardPrestigeSize.prestige.find(1)).toBeNull();
    expect([...f.db.leaderboardPrestigeRankPage.iter()].some(page => page.key.includes(":1:"))).toBe(false);
    expect(readPrestigeLeaderboardPage(as(f, identity("b")), "power", 2, 0, 100).levels).toEqual([0, 2]);
    // A player who leaves the board leaves every level's tables.
    writeBoards(f, [candidate("a", 2, 5)]);
    expect(f.db.leaderboardPrestigePosition.identity.find(identity("c"))).toBeNull();
    expect(f.db.leaderboardPrestigeSize.prestige.find(0)).toBeNull();
  });

  it("puts a player on their new level's board the moment they prestige", () => {
    const f = crystalFixture();
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime, desertUnlocked: true, damage: 5_000_000, maxHp: 900_000 });
    f.run(server.prestigeAccount, {});
    expect(f.db.leaderboardPrestigePosition.identity.find(f.ctx.sender)?.prestige).toBe(1);
    expect(readPrestigeLeaderboardPage(f.ctx as never, "power", 1, 0, 100)).toMatchObject({ localRank: 1, total: 1 });
    expect(readPrestigeLeaderboardPage(f.ctx as never, "power", 0, 0, 100).localRank).toBe(0);
  });

  it("carries a linked guest's place to the account until the next snapshot", () => {
    const f = crystalFixture();
    const guest = identity("7"), account = f.ctx.sender;
    writeBoards(f, [candidate("7", 2, 9), candidate("a", 2, 5)]);
    f.db.leaderboardEntry.identity.delete(guest);
    f.seed("leaderboardEntry", { identity: account, displayName: "Linked", isGuest: false });
    moveLeaderboardPrestigePosition(f.ctx as never, guest, account);
    expect(f.db.leaderboardPrestigePosition.identity.find(guest)).toBeNull();
    expect(f.db.leaderboardPrestigePosition.identity.find(account)).toMatchObject({ prestige: 2 });
    expect(names(readPrestigeLeaderboardPage(f.ctx as never, "power", 2, 0, 100))).toEqual(["1:Linked", "2:Player a"]);
    expect(readPrestigeLeaderboardPage(f.ctx as never, "power", 2, 0, 100).localRank).toBe(1);
  });

  it("links a guest through the claim reducer", () => {
    const f = crystalFixture();
    const guest = identity("7");
    writeBoards(f, [candidate("7", 1, 9)]);
    f.db.playerProgress.identity.delete(f.ctx.sender);
    f.progress(guest);
    f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
    f.seed("accountLink", { code: "board-link", guest, createdAt: f.ctx.timestamp });
    f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } } as never;
    f.run(server.claimGuestAccount, { code: "board-link" });
    expect(f.db.leaderboardPrestigePosition.identity.find(guest)).toBeNull();
    expect(f.db.leaderboardPrestigePosition.identity.find(f.ctx.sender)).toMatchObject({ prestige: 1 });
  });

  it("erases the per-level position with the account", () => {
    const f = crystalFixture();
    writeBoards(f, [candidate("1", 3, 9), candidate("a", 3, 5)]);
    expect(f.db.leaderboardPrestigePosition.identity.find(f.ctx.sender)).toBeTruthy();
    eraseIdentityRows(f.ctx as never, [f.ctx.sender]);
    expect(f.db.leaderboardPrestigePosition.identity.find(f.ctx.sender)).toBeNull();
    expect(f.db.leaderboardPrestigePosition.identity.find(identity("a"))).toBeTruthy();
  });
});
