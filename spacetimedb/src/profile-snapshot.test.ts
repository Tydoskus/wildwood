import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { BASIC_PAPER_HAT, SAMURAI_HAT, STARTER_BOW, WOODEN_ARMOR } from "../../shared/items";
import { HIDDEN_COSMETIC_ITEM_ID } from "../../shared/equipment-appearance";
import { PROFILE_ICON_BLACK_BACKGROUND, PROFILE_ICON_SNAPSHOT } from "../../shared/profile-icons";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { ERASURE_TARGETS, eraseIdentityRows } from "./account-erasure";
import { mergeProfileSnapshot } from "./profile-snapshot";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const later = (f: ReturnType<typeof crystalFixture>, seconds: number) => {
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(seconds * 1_000_000));
};

it("copies the look from the server's own rows, cosmetics over gear, whatever the client sends", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BASIC_PAPER_HAT, SAMURAI_HAT, WOODEN_ARMOR, STARTER_BOW]),
    equippedHead: BASIC_PAPER_HAT, cosmeticHead: SAMURAI_HAT, equippedChest: WOODEN_ARMOR, equippedRightHand: STARTER_BOW,
    cosmeticChest: HIDDEN_COSMETIC_ITEM_ID });
  f.patch("playerProfile", { skinTone: 7 });
  // The reducer takes no arguments; anything a modified client adds is dropped.
  f.run(server.snapshotProfileCharacter, { headItem: "developer_crown", skinTone: 1, image: "data:image/png;base64,AAAA" });
  expect(f.db.playerProfileSnapshot.identity.find(f.ctx.sender)).toMatchObject({
    skinTone: 7, headItem: SAMURAI_HAT, chestItem: "", feetItem: "", rightHandItem: STARTER_BOW, leftHandItem: "",
    takenAt: f.ctx.timestamp,
  });
});

it("stays frozen when the gear changes, until the player snapshots again", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BASIC_PAPER_HAT]), equippedHead: BASIC_PAPER_HAT });
  f.run(server.snapshotProfileCharacter);
  f.patch("playerProgress", { equippedHead: "" });
  expect(f.db.playerProfileSnapshot.identity.find(f.ctx.sender).headItem).toBe(BASIC_PAPER_HAT);
  later(f, 31);
  f.run(server.snapshotProfileCharacter);
  expect(f.db.playerProfileSnapshot.identity.find(f.ctx.sender).headItem).toBe("");
});

it("refuses a second snapshot within 30 seconds and keeps the first", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BASIC_PAPER_HAT]), equippedHead: BASIC_PAPER_HAT });
  f.run(server.snapshotProfileCharacter);
  const first = f.db.playerProfileSnapshot.identity.find(f.ctx.sender);
  f.patch("playerProgress", { equippedHead: "" });
  later(f, 1);
  expect(() => f.run(server.snapshotProfileCharacter)).toThrow("You can snapshot your character again in 29 seconds.");
  later(f, 28.5);
  expect(() => f.run(server.snapshotProfileCharacter)).toThrow("again in 1 second.");
  expect(f.db.playerProfileSnapshot.identity.find(f.ctx.sender)).toEqual(first);
  later(f, .5);
  f.run(server.snapshotProfileCharacter);
  expect(f.db.playerProfileSnapshot.identity.find(f.ctx.sender).headItem).toBe("");
});

it("makes the snapshot the picture, on the backdrop the player already chose, leaderboard too", () => {
  const f = crystalFixture();
  f.seed("leaderboardEntry", { identity: f.ctx.sender, displayName: "Test Player", isGuest: false });
  f.run(server.setProfileIcon, { profileIcon: 42 | PROFILE_ICON_BLACK_BACKGROUND });
  f.run(server.snapshotProfileCharacter);
  const icon = PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND;
  expect(f.db.playerProfile.identity.find(f.ctx.sender).profileIcon).toBe(icon);
  expect(f.db.leaderboardEntry.identity.find(f.ctx.sender).profileIcon).toBe(icon);
  // Backdrop changes and a normal picture work as before, and the snapshot can be chosen again without retaking it.
  f.run(server.setProfileIcon, { profileIcon: PROFILE_ICON_SNAPSHOT });
  expect(f.db.playerProfile.identity.find(f.ctx.sender).profileIcon).toBe(PROFILE_ICON_SNAPSHOT);
  f.run(server.setProfileIcon, { profileIcon: 9 });
  f.run(server.setProfileIcon, { profileIcon: PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND });
  expect(f.db.playerProfile.identity.find(f.ctx.sender).profileIcon).toBe(icon);
  expect([...f.db.playerProfileSnapshot.iter()]).toHaveLength(1);
});

it("will not choose the snapshot picture before there is a snapshot", () => {
  const f = crystalFixture();
  f.run(server.setProfileIcon, { profileIcon: 4 });
  expect(() => f.run(server.setProfileIcon, { profileIcon: PROFILE_ICON_SNAPSHOT })).toThrow("Snapshot your character first.");
  expect(f.db.playerProfile.identity.find(f.ctx.sender).profileIcon).toBe(4);
  // Bits above the backdrop are still refused.
  expect(() => f.run(server.setProfileIcon, { profileIcon: PROFILE_ICON_SNAPSHOT | 0x20000 })).toThrow("Choose an available profile picture.");
});

it("is erased with the account, and moves with a character", () => {
  expect(ERASURE_TARGETS).toContainEqual({ table: "playerProfileSnapshot", columns: ["identity"], pk: "identity", mode: "key" });
  const f = crystalFixture(), other = identity("c");
  f.run(server.snapshotProfileCharacter);
  f.seed("playerProfileSnapshot", { identity: other, skinTone: 2, headItem: "", chestItem: "", feetItem: "",
    rightHandItem: "", leftHandItem: "", takenAt: f.ctx.timestamp });
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(f.db.playerProfileSnapshot.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerProfileSnapshot.identity.find(other)).not.toBeNull();
});

it("keeps the newer snapshot when a guest signs in to an account, and drops the guest row", () => {
  const f = crystalFixture(), guest = identity("d"), account = identity("e");
  const row = (who: any, headItem: string, micros: bigint) => f.seed("playerProfileSnapshot", { identity: who, skinTone: 1,
    headItem, chestItem: "", feetItem: "", rightHandItem: "", leftHandItem: "", takenAt: new Timestamp(micros) });
  row(guest, "guest_hat", 5n);
  mergeProfileSnapshot(f.ctx, guest, account);
  expect(f.db.playerProfileSnapshot.identity.find(account).headItem).toBe("guest_hat");
  expect(f.db.playerProfileSnapshot.identity.find(guest)).toBeNull();
  row(guest, "older", 1n);
  mergeProfileSnapshot(f.ctx, guest, account);
  expect(f.db.playerProfileSnapshot.identity.find(account).headItem).toBe("guest_hat");
  row(guest, "newer", 9n);
  mergeProfileSnapshot(f.ctx, guest, account);
  expect(f.db.playerProfileSnapshot.identity.find(account).headItem).toBe("newer");
  expect(f.db.playerProfileSnapshot.identity.find(guest)).toBeNull();
});
