import { describe, expect, it, vi } from "vitest";
import { Identity, Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
const vis = identity("a"), moth = identity("b"), friend = identity("c");
const hex = (who: Identity) => who.toHexString();
const dmKey = (a: Identity, b: Identity) => `dm:${[hex(a), hex(b)].sort().join(":")}`;

/** Vis with gear, a friend and a DM thread; the empty moth on the login Vis's magic link now opens. */
function fixture() {
  const f = crystalFixture();
  f.progress(vis, { damage: 9_999, inventoryJson: JSON.stringify(["IRON_BOW"]) });
  f.progress(moth);
  f.seed("playerProfile", { identity: vis, displayName: "Vis", skinTone: 1 });
  f.seed("playerProfile", { identity: moth, displayName: "Brave Moth 509", skinTone: 2 });
  for (const who of [vis, moth]) f.seed("playerAccountStatus", { identity: who, isGuest: false });
  f.seed("playerItemUpgrade", { key: `${hex(vis)}:IRON_BOW`, identity: vis, itemId: "IRON_BOW", level: 5 });
  f.seed("socialFriend", { key: `${hex(vis)}:${hex(friend)}`, owner: vis, peer: friend });
  f.seed("socialFriend", { key: `${hex(friend)}:${hex(vis)}`, owner: friend, peer: vis });
  f.seed("socialMessage", { id: 1n, channel: "dm", conversation: dmKey(vis, friend), guildId: 0n, sender: friend, recipient: vis,
    senderName: "Friend", message: "hi", sentAt: new Timestamp(1n) });
  f.seed("accountEmail", { identity: moth, email: "same@example.com", emailVerified: true, loginId: "user_moth", named: true, seenAt: new Timestamp(1n) });
  f.ctx.sender = owner;
  const swap = (overrides: Record<string, unknown> = {}) => f.run(server.devSwapCharacters, {
    firstIdentity: hex(vis), secondIdentity: `0x${hex(moth)}`, expectedFirstName: "Vis", expectedSecondName: "Brave Moth 509",
    reason: "Magic link opens a second SpacetimeAuth user", confirmation: "SWAP", ...overrides,
  });
  return { ...f, swap };
}

describe("swapping characters between logins", () => {
  it("puts Vis on the login the magic link opens, and the moth on Vis's old login", () => {
    const f = fixture();
    f.swap();
    expect(f.db.playerProfile.identity.find(moth)?.displayName).toBe("Vis");
    expect(f.db.playerProfile.identity.find(vis)?.displayName).toBe("Brave Moth 509");
    expect(f.db.playerProgress.identity.find(moth)?.damage).toBe(9_999);
    expect(f.db.playerItemUpgrade.key.find(`${hex(moth)}:IRON_BOW`)).toMatchObject({ identity: moth, level: 5 });
    expect(f.db.playerItemUpgrade.key.find(`${hex(vis)}:IRON_BOW`)).toBeFalsy();
    // Both directions of the friendship, and the DM thread, follow the character.
    expect(f.db.socialFriend.key.find(`${hex(moth)}:${hex(friend)}`)).toMatchObject({ owner: moth, peer: friend });
    expect(f.db.socialFriend.key.find(`${hex(friend)}:${hex(moth)}`)).toMatchObject({ owner: friend, peer: moth });
    expect(f.db.socialMessage.id.find(1n)).toMatchObject({ recipient: moth, conversation: dmKey(moth, friend) });
    // The login keeps what describes the login.
    expect(f.db.accountEmail.identity.find(moth)?.loginId).toBe("user_moth");
    expect([...f.db.moderationAction.iter()].filter((row: any) => row.action === "Character moved to this login")).toHaveLength(2);
  });

  it("swaps back when run again", () => {
    const f = fixture();
    f.swap();
    f.swap({ expectedFirstName: "Brave Moth 509", expectedSecondName: "Vis" });
    expect(f.db.playerProfile.identity.find(vis)?.displayName).toBe("Vis");
    expect(f.db.playerProgress.identity.find(vis)?.damage).toBe(9_999);
    expect(f.db.playerItemUpgrade.key.find(`${hex(vis)}:IRON_BOW`)).toMatchObject({ identity: vis });
    expect(f.db.socialMessage.id.find(1n)).toMatchObject({ recipient: vis, conversation: dmKey(vis, friend) });
  });

  it("refuses anyone but the database owner, a stale name, a missing confirmation, or a signed-in player", () => {
    const f = fixture();
    f.ctx.sender = friend;
    expect(() => f.swap()).toThrow("Database owner required");
    f.ctx.sender = owner;
    expect(() => f.swap({ expectedSecondName: "Someone Else" })).toThrow("name does not match");
    expect(() => f.swap({ confirmation: "yes" })).toThrow("SWAP");
    f.seed("playerSession", { connectionId: new (f.ctx.connectionId as any).constructor(7n), identity: vis,
      enteredWorld: true, protocolVersion: 0, connectedAt: f.ctx.timestamp, tabId: "t" });
    expect(() => f.swap()).toThrow("signed out");
    expect(f.db.playerProfile.identity.find(vis)?.displayName).toBe("Vis");
  });
});

describe("tables whose player index is unique", () => {
  it("reads them through find, as the live server exposes them, instead of crashing", async () => {
    const { moveIdentityRows } = await import("./account-transfer");
    const row = { key: `${hex(vis)}:1`, identity: vis, remaining: 3 };
    const written: any[] = [];
    // The live module gives a unique index find/update/delete, and no filter.
    const handle = {
      identity: { find: (who: Identity) => (who.isEqual(vis) ? row : undefined) },
      key: { delete: () => true, update: (next: any) => written.push(next) },
      insert: (next: any) => written.push(next),
      iter: () => [row][Symbol.iterator](),
    };
    const moved = moveIdentityRows({ db: { enemyDefeatBudget: handle } }, vis, moth);
    expect(moved).toEqual({ enemyDefeatBudget: 1 });
    expect(written).toEqual([{ key: `${hex(moth)}:1`, identity: moth, remaining: 3 }]);
  });
});

describe("a player moving their character to another sign-in", () => {
  // Vis starts the move on their email login, then signs in with Google as `google`.
  const google = identity("d");
  function moveFixture() {
    const f = fixture();
    const ConnectionId = f.ctx.connectionId!.constructor as any;
    const protocolVersion = (f.db.playerSession.connectionId.find(f.ctx.connectionId) as any).protocolVersion;
    f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
    f.seed("analyticsPlayer", { identity: vis, firstSeenDayKey: "2026-09-01", firstKillDayKey: "2026-09-01" });
    f.progress(google);
    f.seed("playerProfile", { identity: google, displayName: "Quiet Fern 12", skinTone: 2 });
    f.seed("playerAccountStatus", { identity: google, isGuest: false });
    const connect = (who: Identity, id: bigint, enteredWorld = false) => {
      f.ctx.sender = who;
      f.ctx.connectionId = new ConnectionId(id);
      f.seed("playerSession", { connectionId: f.ctx.connectionId, identity: who, enteredWorld, protocolVersion,
        connectedAt: f.ctx.timestamp, tabId: "t" });
    };
    const disconnect = () => f.db.playerSession.connectionId.delete(f.ctx.connectionId);
    const code = "c".repeat(40);
    const start = () => f.run(server.startLoginMove, { code });
    const finish = () => f.run(server.finishLoginMove, { code });
    // Vis on the email login, starting the move, then leaving for the sign-in page.
    connect(vis, 20n);
    start();
    disconnect();
    connect(google, 21n);
    return { ...f, connect, disconnect, finish, start, code };
  }

  it("puts the character on the Google login and the empty one on the old login", () => {
    const f = moveFixture();
    f.finish();
    expect(f.db.playerProfile.identity.find(google)?.displayName).toBe("Vis");
    expect(f.db.playerProgress.identity.find(google)?.damage).toBe(9_999);
    expect(f.db.playerProfile.identity.find(vis)?.displayName).toBe("Quiet Fern 12");
    expect(f.db.socialFriend.key.find(`${hex(friend)}:${hex(google)}`)).toMatchObject({ peer: google });
    // The live connection stays with the login that opened it, and the code is spent.
    expect(f.db.playerSession.connectionId.find(f.ctx.connectionId)).toMatchObject({ identity: google });
    expect(f.db.loginMove.code.find(f.code)).toBeNull();
    expect(() => f.finish()).toThrow("expired");
  });

  it("refuses a Google login that already has a played character", () => {
    const f = moveFixture();
    f.seed("analyticsPlayer", { identity: google, firstSeenDayKey: "2026-09-01", firstKillDayKey: "2026-09-02" });
    expect(() => f.finish()).toThrow("already has a character (Quiet Fern 12)");
    expect(f.db.playerProfile.identity.find(vis)?.displayName).toBe("Vis");
  });

  it("refuses while the old login is still in the world somewhere, but not for an idle tab", () => {
    const f = moveFixture();
    f.seed("playerSession", { connectionId: new (f.ctx.connectionId as any).constructor(31n), identity: vis,
      enteredWorld: false, protocolVersion: 0, connectedAt: f.ctx.timestamp, tabId: "idle" });
    f.seed("playerSession", { connectionId: new (f.ctx.connectionId as any).constructor(30n), identity: vis,
      enteredWorld: true, protocolVersion: 0, connectedAt: f.ctx.timestamp, tabId: "other" });
    expect(() => f.finish()).toThrow("old login is still open");
    // Nothing changed and the code survives, so closing that tab and retrying works.
    expect(f.db.playerProfile.identity.find(google)?.displayName).toBe("Quiet Fern 12");
    expect(f.db.loginMove.code.find(f.code)).not.toBeNull();
    f.db.playerSession.connectionId.delete(new (f.ctx.connectionId as any).constructor(30n));
    f.finish();
    expect(f.db.playerProfile.identity.find(google)?.displayName).toBe("Vis");
    expect(f.db.playerSession.connectionId.find(new (f.ctx.connectionId as any).constructor(31n))).toMatchObject({ identity: vis });
  });

  it("refuses the same login, a guest, and an expired code", () => {
    const f = moveFixture();
    f.disconnect();
    f.connect(vis, 22n);
    expect(() => f.finish()).toThrow("same login");
    f.disconnect();
    f.connect(google, 23n);
    f.ctx.senderAuth = {};
    expect(() => f.finish()).toThrow("Sign in required");
    f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
    f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 900_000_000n);
    expect(() => f.finish()).toThrow("expired");
  });

  it("does not let a guest start one", () => {
    const f = moveFixture();
    f.ctx.senderAuth = {};
    expect(() => f.start()).toThrow("Sign in to your character first");
  });
});
