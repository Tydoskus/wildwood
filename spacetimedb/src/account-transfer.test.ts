import { describe, expect, it, vi } from "vitest";
import { Identity, Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
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
