import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { Identity, Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { findLeaderboardSpot, moveLeaderboardStanding, readLeaderboardRanks, readLeaderboardWindow, writeLeaderboardPages, type Standing } from "./leaderboard-pages";
import { markLeaderboardDirty, refreshLeaderboard } from "./leaderboard-refresh";
import { eraseIdentityRows } from "./account-erasure";
import { ATTACK_BALANCE_VERSION, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
const DAY = 86_400_000_000n;
const NOW = 400n * DAY;
const numbered = (n: number) => new Identity(n.toString(16).padStart(64, "0"));
const standing = (id: Identity, power: number, { prestige = 0, hours = 0, joinedDaysAgo = 365 } = {}): Standing =>
  ({ identity: id, prestige, power, playedMicros: BigInt(hours) * 3_600_000_000n, joinedAtMicros: NOW - BigInt(joinedDaysAgo) * DAY, pages: [] });
/** Writes the boards as a snapshot does: pages, then each player's standing with its pages. */
function writeBoards(f: Fixture, rows: Standing[]) {
  for (const row of rows) {
    if (!f.db.leaderboardEntry.identity.find(row.identity)) f.seed("leaderboardEntry", { identity: row.identity, displayName: `P${row.power}`, isGuest: false });
  }
  const pages = writeLeaderboardPages(f.ctx as never, rows);
  for (const row of rows) {
    const next = { ...row, pages: pages.get(row.identity.toHexString())! };
    if (f.db.leaderboardStanding.identity.find(row.identity)) f.db.leaderboardStanding.identity.update(next);
    else f.db.leaderboardStanding.insert(next);
  }
}
const as = (f: Fixture, sender: Identity) => ({ ...f.ctx, sender }) as never;
const names = (rows: Array<{ rank: number; entry: { displayName: string } }>) => rows.map(row => `${row.rank}:${row.entry.displayName}`);

describe("leaderboard boards", () => {
  it("ranks Power by power alone, Prestige by level then power, and Time Played by hours", () => {
    const f = crystalFixture();
    const [a, b, c] = [numbered(1), numbered(2), numbered(3)];
    writeBoards(f, [standing(a, 10, { prestige: 0, hours: 5 }), standing(b, 30, { prestige: 1, hours: 1 }), standing(c, 20, { prestige: 1, hours: 9 })]);
    expect(names(readLeaderboardRanks(as(f, a), "power", 0, 100).entries)).toEqual(["1:P30", "2:P20", "3:P10"]);
    expect(names(readLeaderboardRanks(as(f, a), "prestige", 0, 100).entries)).toEqual(["1:P30", "2:P20", "3:P10"]);
    expect(names(readLeaderboardRanks(as(f, a), "time", 0, 100).entries)).toEqual(["1:P20", "2:P10", "3:P30"]);
    // The strongest player without a prestige tops Power but stays under every prestiged player on Prestige.
    writeBoards(f, [standing(a, 99), standing(b, 30, { prestige: 1 }), standing(c, 20, { prestige: 1 })]);
    expect(names(readLeaderboardRanks(as(f, a), "power", 0, 100).entries)[0]).toBe("1:P10");
    expect(names(readLeaderboardRanks(as(f, a), "prestige", 0, 100).entries)[2]).toBe("3:P10");
  });

  it("ranks Account Created oldest first, and Rivals by power within the viewer's own prestige", () => {
    const f = crystalFixture();
    const [veteran, middle, newest, rival] = [numbered(1), numbered(2), numbered(3), numbered(4)];
    writeBoards(f, [standing(veteran, 1, { joinedDaysAgo: 200 }), standing(middle, 2, { joinedDaysAgo: 20 }),
      standing(newest, 3, { joinedDaysAgo: 3, prestige: 2 }), standing(rival, 9, { joinedDaysAgo: 50, prestige: 2 })]);
    expect(names(readLeaderboardRanks(as(f, newest), "created", 0, 100).entries)).toEqual(["1:P1", "2:P9", "3:P2", "4:P3"]);
    expect(readLeaderboardRanks(as(f, newest), "created", 0, 100).entries[0].joinedAtMicros).toBe(NOW - 200n * DAY);
    expect(readLeaderboardRanks(as(f, newest), "rivals", 0, 100)).toMatchObject({ total: 2, localRank: 2, prestige: 2 });
    expect(names(readLeaderboardRanks(as(f, newest), "rivals", 0, 100).entries)).toEqual(["1:P9", "2:P3"]);
    expect(names(readLeaderboardRanks(as(f, veteran), "rivals", 0, 100).entries)).toEqual(["1:P2", "2:P1"]);
    // A searched player on another level is not on the viewer's Rivals board.
    expect(findLeaderboardSpot(as(f, veteran), "rivals", -1, rival).rank).toBe(0);
    expect(findLeaderboardSpot(as(f, newest), "rivals", -1, rival).rank).toBe(1);
  });

  it("rewrites only the pages whose players changed", () => {
    const f = crystalFixture();
    const rows = Array.from({ length: 250 }, (_, n) => standing(numbered(n + 1), 1_000 - n, { hours: 1_000 - n }));
    writeBoards(f, rows);
    expect(readLeaderboardRanks(as(f, numbered(150)), "power", 0, 100).localRank).toBe(150);
    const updates = vi.spyOn(f.db.leaderboardRankPage.key, "update");
    // The last player overtakes the one above them: only the third page of each board changes.
    rows[249] = { ...rows[249], power: 752.5, playedMicros: 752n * 3_600_000_000n + 1n };
    writeLeaderboardPages(f.ctx as never, rows);
    expect(updates.mock.calls.map(([page]) => (page as { key: string }).key).sort()).toEqual(["power:2", "prestige:2", "rivals:0:2", "time:2"]);
  });

  it("reads a window of the top three and the hundred around the viewer, from their page", () => {
    const f = crystalFixture();
    const rows = Array.from({ length: 400 }, (_, n) => standing(numbered(n + 1), 1_000 - n));
    writeBoards(f, rows);
    const window = readLeaderboardWindow(as(f, numbered(300)), "power");
    expect(window.slice(0, 3).map(row => row.rank)).toEqual([1, 2, 3]);
    expect(window.slice(3).map(row => row.rank)).toEqual(Array.from({ length: 101 }, (_, n) => 250 + n));
    expect(findLeaderboardSpot(f.ctx as never, "power", -1, numbered(300))).toEqual({ rank: 300, prestige: -1 });
  });

  it("reads older stat board names as Power", () => {
    const f = crystalFixture();
    writeBoards(f, [standing(numbered(1), 5, { prestige: 2 }), standing(numbered(2), 9)]);
    expect(names(readLeaderboardRanks(f.ctx as never, "damage", 1, 100).entries)).toEqual(["1:P9", "2:P5"]);
    expect(() => readLeaderboardRanks(f.ctx as never, "injected", 1, 100)).toThrow(/Unknown/);
  });
});

describe("leaderboard snapshots", () => {
  function eligible(f: Fixture, who: Identity, damage: number) {
    if (!f.db.playerProgress.identity.find(who)) f.progress(who);
    f.patch("playerProgress", { desertUnlocked: true, damage }, who);
    if (!f.db.playerProfile.identity.find(who)) f.seed("playerProfile", { identity: who, displayName: `Player ${who.toHexString().slice(-1)}` });
  }
  const power = (f: Fixture, who: Identity) => f.db.leaderboardStanding.identity.find(who)?.power ?? 0;

  it("recomputes the players online and those marked, and sorts everyone else from their standing", () => {
    const f = crystalFixture(), online = f.ctx.sender, offline = identity("5");
    eligible(f, online, 100); eligible(f, offline, 100);
    refreshLeaderboard(f.ctx);
    const before = power(f, offline);
    f.patch("playerProgress", { damage: 1e9 }, offline);
    f.patch("playerProgress", { damage: 1e9 }, online);
    refreshLeaderboard(f.ctx, { full: false });
    expect(power(f, offline)).toBe(before);
    expect(power(f, online)).toBeGreaterThan(before);
    markLeaderboardDirty(f.ctx, offline);
    refreshLeaderboard(f.ctx, { full: false });
    expect(power(f, offline)).toBeGreaterThan(before);
    expect([...f.db.leaderboardDirty.iter()]).toHaveLength(0);
  });

  it("marks a player who leaves, so their last minutes reach the board", () => {
    const f = crystalFixture();
    eligible(f, f.ctx.sender, 100);
    f.run(server.onDisconnect);
    expect(f.db.leaderboardDirty.identity.find(f.ctx.sender)).toBeTruthy();
  });

  it("drops a player who no longer qualifies, and empties the retired per-level tables on a full snapshot", () => {
    const f = crystalFixture(), gone = identity("5");
    eligible(f, f.ctx.sender, 100); eligible(f, gone, 50);
    f.seed("leaderboardPrestigePosition", { identity: gone, prestige: 0, ranks: [1] });
    f.seed("leaderboardPrestigeSize", { prestige: 0, total: 1 });
    refreshLeaderboard(f.ctx);
    expect(f.db.leaderboardStanding.identity.find(gone)).toBeTruthy();
    expect([...f.db.leaderboardPrestigePosition.iter()]).toHaveLength(0);
    expect(f.db.leaderboardPrestigeSize.prestige.find(0)).toMatchObject({ total: 2 });
    f.patch("playerProgress", { desertUnlocked: false }, gone);
    refreshLeaderboard(f.ctx);
    expect(f.db.leaderboardStanding.identity.find(gone)).toBeNull();
    expect(f.db.leaderboardEntry.identity.find(gone)).toBeNull();
    expect(readLeaderboardRanks(f.ctx as never, "power", 0, 100).total).toBe(1);
  });

  it("starts with a full snapshot after an update, then the cheap one on the timer", async () => {
    const { refreshLeaderboardIfDue } = await import("./leaderboard-refresh");
    const f = crystalFixture();
    eligible(f, f.ctx.sender, 100);
    f.seed("leaderboardRefreshState", { id: 1, refreshedAtMicros: 1n, version: 13 });
    refreshLeaderboardIfDue(f.ctx);
    expect(f.db.leaderboardRefreshState.id.find(2)).toMatchObject({ version: 15 });
    expect(f.db.leaderboardStanding.identity.find(f.ctx.sender)).toBeTruthy();
    f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 1_000_000_000n);
    refreshLeaderboardIfDue(f.ctx);
    expect(f.db.leaderboardRefreshState.id.find(2)!.refreshedAtMicros).toBeLessThan(f.db.leaderboardRefreshState.id.find(1)!.refreshedAtMicros);
  });
});

describe("leaderboard accounts", () => {
  it("carries a linked guest's place to the account until the next snapshot", () => {
    const f = crystalFixture();
    const guest = identity("7"), account = f.ctx.sender;
    writeBoards(f, [standing(guest, 9), standing(identity("a"), 5)]);
    f.db.leaderboardEntry.identity.delete(guest);
    f.seed("leaderboardEntry", { identity: account, displayName: "Linked", isGuest: false });
    moveLeaderboardStanding(f.ctx as never, guest, account);
    expect(f.db.leaderboardStanding.identity.find(guest)).toBeNull();
    expect(names(readLeaderboardRanks(f.ctx as never, "power", 0, 100).entries)).toEqual(["1:Linked", "2:P5"]);
    expect(readLeaderboardRanks(f.ctx as never, "power", 0, 100).localRank).toBe(1);
  });

  it("links a guest through the claim reducer", () => {
    const f = crystalFixture();
    const guest = identity("7");
    writeBoards(f, [standing(guest, 9)]);
    f.db.playerProgress.identity.delete(f.ctx.sender);
    f.progress(guest);
    f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
    f.seed("accountLink", { code: "board-link", guest, createdAt: f.ctx.timestamp });
    f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } } as never;
    f.run(server.claimGuestAccount, { code: "board-link" });
    expect(f.db.leaderboardStanding.identity.find(guest)).toBeNull();
    expect(f.db.leaderboardStanding.identity.find(f.ctx.sender)).toBeTruthy();
  });

  it("erases the standing with the account", () => {
    const f = crystalFixture();
    writeBoards(f, [standing(f.ctx.sender, 9), standing(identity("a"), 5)]);
    eraseIdentityRows(f.ctx as never, [f.ctx.sender]);
    expect(f.db.leaderboardStanding.identity.find(f.ctx.sender)).toBeNull();
    expect(f.db.leaderboardStanding.identity.find(identity("a"))).toBeTruthy();
  });
});
