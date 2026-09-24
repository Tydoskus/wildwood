import { readFileSync } from "node:fs";
import { Timestamp } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy } from "../../tests/helpers/enemy-defeat";
import { eraseIdentityRows } from "./account-erasure";
import { bowSkillKey, bowSkillRollFor, duelBowSkillFields } from "./bow-skills";
import { offerDuplicateEquipment, publishItemDrop } from "./equipment-copies";
import {
  EQUIPMENT_OFFER_LIFETIME_MS, MAX_PENDING_EQUIPMENT_OFFERS, bagSlotsUsed, isDuplicateOfferItem,
} from "../../shared/equipment-copies";
import { BASIC_PAPER_HAT, IRON_BOW, SAMURAI_HAT, STARTER_ITEM_IDS, STARTER_STONE, WOODEN_SWORD } from "../../shared/items";
import { BASE_INVENTORY_SLOT_CAPACITY } from "../../shared/gems";
import { ATTACK_BALANCE_VERSION, BOSS_REWARD_CLAIM_BITS, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { cosmeticUnlocks } from "../../shared/cosmetic-conversion";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
type Roll = { arrowStorm: number; ricochet: number; piercingShot: number };
const A: Roll = { arrowStorm: 2, ricochet: 0, piercingShot: 0 };
const B: Roll = { arrowStorm: 0, ricochet: 3, piercingShot: 0 };
const C: Roll = { arrowStorm: 0, ricochet: 0, piercingShot: 4 };
const NONE: Roll = { arrowStorm: 0, ricochet: 0, piercingShot: 0 };

const offers = (f: Fixture, who = f.ctx.sender) => [...f.db.pendingEquipmentOffer.identity.filter(who)];
const copies = (f: Fixture, who = f.ctx.sender) => [...f.db.playerEquipmentCopy.identity.filter(who)];
const rollOf = (row: any): Roll => ({ arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot });
const firstRoll = (f: Fixture, itemId = IRON_BOW, who = f.ctx.sender) => rollOf(bowSkillRollFor(f.ctx as any, who, itemId));
const inventory = (f: Fixture, who = f.ctx.sender): string[] => JSON.parse(f.db.playerProgress.identity.find(who).inventoryJson);
const seedFirst = (f: Fixture, roll: Roll, itemId = IRON_BOW, who = f.ctx.sender) =>
  f.seed("playerBowSkill", { key: bowSkillKey(who, itemId), identity: who, itemId, ...roll });
const seedCopy = (f: Fixture, roll: Roll, itemId = IRON_BOW, who = f.ctx.sender) =>
  f.seed("playerEquipmentCopy", { id: 0n, identity: who, itemId, ...roll, acquiredAt: f.ctx.timestamp });
const seedOffer = (f: Fixture, roll: Roll, itemId = IRON_BOW, who = f.ctx.sender, expiresInMs = EQUIPMENT_OFFER_LIFETIME_MS) =>
  f.seed("pendingEquipmentOffer", { id: 0n, identity: who, itemId, ...roll, createdAt: f.ctx.timestamp,
    expiresAt: new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(expiresInMs) * 1_000n) });
const later = (f: Fixture, ms: number) => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(ms) * 1_000n); };
/** Every skill appears, at the bottom tenth of its range, and every loot roll wins. */
const luckyRandom = (f: Fixture, float = .1) => {
  Object.assign(f.ctx, { random: Object.assign(() => float, { integerInRange: (min: number) => min }) });
};
/** Auto keep best off: duplicates from loot become Keep/Ignore offers, as they did before it existed. */
const askMe = (f: Fixture, who = f.ctx.sender) =>
  f.seed("playerLootSetting", { identity: who, autoKeepBest: false, autoEquipBest: true, updatedAt: f.ctx.timestamp });
/** A player holding an iron bow with roll A in their hand. */
function archer(extra: Record<string, unknown> = {}) {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([IRON_BOW, SAMURAI_HAT]), equippedRightHand: IRON_BOW, ...extra });
  seedFirst(f, A);
  return f;
}

it("offers equipment only: never cosmetic looks, starter or developer items", () => {
  expect(isDuplicateOfferItem(IRON_BOW)).toBe(true);
  expect(isDuplicateOfferItem(SAMURAI_HAT)).toBe(true);
  expect(isDuplicateOfferItem(BASIC_PAPER_HAT)).toBe(false);
  expect(isDuplicateOfferItem(STARTER_STONE)).toBe(false);
  expect(isDuplicateOfferItem(WOODEN_SWORD)).toBe(false);
  expect(isDuplicateOfferItem("unknown")).toBe(false);
  // Equipped items and cosmetics take no bag slot; each kept copy takes one.
  expect(bagSlotsUsed([IRON_BOW, SAMURAI_HAT, BASIC_PAPER_HAT, IRON_BOW], [IRON_BOW], 2)).toBe(3);
});

it("with Auto keep best off, turns a duplicate enemy drop into an offer instead of throwing it away", () => {
  const f = crystalFixture();
  askMe(f);
  luckyRandom(f);
  f.patch("playerProgress", { damage: 1e15, inventoryJson: '["crystal_armor"]' });
  fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
  reportEnemy(f, "Shard Hopper", 1);
  // The bow and helmet were new and went into the bag; the armor waits as an offer.
  expect(inventory(f)).toEqual(expect.arrayContaining(["crystal_bow", "crystal_helmet", "crystal_armor"]));
  expect(inventory(f).filter(id => id === "crystal_armor")).toHaveLength(1);
  expect(offers(f).map(offer => [offer.itemId, rollOf(offer)])).toEqual([["crystal_armor", NONE]]);
  const [armor] = offers(f);
  expect(armor.expiresAt.microsSinceUnixEpoch - armor.createdAt.microsSinceUnixEpoch).toBe(BigInt(EQUIPMENT_OFFER_LIFETIME_MS) * 1_000n);
  // The drop event still says "already owned", which older clients ignore.
  expect(f.db.playerItemDrop.key.find(`${f.ctx.sender.toHexString()}:crystal_armor`).alreadyOwned).toBe(true);
});

it("with Auto keep best off, rolls an offered bow like a new bow and leaves the first copy's roll alone", () => {
  const f = archer();
  askMe(f);
  luckyRandom(f, .05);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, "crystal_bow", true));
  // Tier 10: 4.9-10.7%; a draw of .05 lands 2 tenths in. A duplicate never rolls onto the first copy.
  expect(offers(f).map(rollOf)).toEqual([{ arrowStorm: 5.1, ricochet: 5.1, piercingShot: 5.1 }]);
  expect(f.db.playerBowSkill.key.find(bowSkillKey(f.ctx.sender, "crystal_bow"))).toBeNull();
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, IRON_BOW, true));
  expect(firstRoll(f)).toEqual(A);
});

it("with Auto keep best off, offers every copy past the first when one report drops several", () => {
  const f = crystalFixture();
  askMe(f);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, IRON_BOW, false, 3));
  expect(offers(f)).toHaveLength(2);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, IRON_BOW, true, 2));
  expect(offers(f)).toHaveLength(4);
  // A cosmetic look dropping again is only announced, as before.
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, BASIC_PAPER_HAT, true, 2));
  expect(offers(f)).toHaveLength(4);
});

it("offers a gifted item the player already has instead of dropping it", () => {
  const f = archer();
  f.seed("playerItemGift", { key: "test:gift", identity: f.ctx.sender, campaign: "test", itemId: IRON_BOW, claimed: false, createdAt: f.ctx.timestamp });
  f.run(server.claimDeveloperItemGift, { key: "test:gift" });
  expect(offers(f).map(offer => offer.itemId)).toEqual([IRON_BOW]);
  expect(firstRoll(f)).toEqual(A);
});

it("keeps an offered copy as another copy in the bag with its own roll, and ignores idempotently", () => {
  const f = archer();
  const kept = seedOffer(f, B);
  const ignored = seedOffer(f, C);
  f.run(server.resolveEquipmentOffer, { id: kept.id, keep: true });
  expect(copies(f).map(rollOf)).toEqual([B]);
  expect(copies(f)[0].itemId).toBe(IRON_BOW);
  expect(firstRoll(f)).toEqual(A);
  expect(inventory(f).filter(id => id === IRON_BOW)).toHaveLength(1);
  f.run(server.resolveEquipmentOffer, { id: ignored.id, keep: false });
  expect(offers(f)).toEqual([]);
  expect(copies(f)).toHaveLength(1);
  // Answering again, either way, changes nothing.
  f.run(server.resolveEquipmentOffer, { id: kept.id, keep: true });
  f.run(server.resolveEquipmentOffer, { id: ignored.id, keep: true });
  expect(copies(f)).toHaveLength(1);
});

it("never lets another player answer an offer", () => {
  const f = archer();
  const theirs = seedOffer(f, B, IRON_BOW, identity("2"));
  f.run(server.resolveEquipmentOffer, { id: theirs.id, keep: true });
  f.run(server.resolveEquipmentOffer, { id: theirs.id, keep: false });
  expect(offers(f, identity("2"))).toHaveLength(1);
  expect(copies(f)).toEqual([]);
  expect((server.myEquipmentOffers as any)(f.ctx)).toEqual([]);
  expect((server.myEquipmentCopies as any)(f.ctx)).toEqual([]);
});

it("refuses Keep with a full bag and leaves the offer waiting", () => {
  // The bow is equipped, the hat and starter items take their slots, and kept copies fill the rest.
  const f = archer();
  const used = bagSlotsUsed([SAMURAI_HAT, ...STARTER_ITEM_IDS], [], 0);
  for (let n = used; n < BASE_INVENTORY_SLOT_CAPACITY; n += 1) seedCopy(f, NONE, SAMURAI_HAT);
  const offer = seedOffer(f, B);
  expect(() => f.run(server.resolveEquipmentOffer, { id: offer.id, keep: true })).toThrow("bag is full");
  expect(offers(f)).toHaveLength(1);
  // One more bag slot, and it fits.
  f.seed("playerInventoryCapacity", { identity: f.ctx.sender, slotsUnlocked: 1, updatedAt: f.ctx.timestamp });
  f.run(server.resolveEquipmentOffer, { id: offer.id, keep: true });
  expect(offers(f)).toEqual([]);
});

it("makes a kept copy the first one when the copy the player had is gone", () => {
  const f = archer({ inventoryJson: JSON.stringify([SAMURAI_HAT]), equippedRightHand: "" });
  const offer = seedOffer(f, B);
  f.run(server.resolveEquipmentOffer, { id: offer.id, keep: true });
  expect(inventory(f)).toContain(IRON_BOW);
  expect(copies(f)).toEqual([]);
  expect(firstRoll(f)).toEqual(B);
});

it("ignores unanswered offers after five minutes, and an ignored offer cannot be kept", () => {
  const f = archer();
  const offer = seedOffer(f, B);
  later(f, EQUIPMENT_OFFER_LIFETIME_MS - 1);
  f.run(server.runMaintenance, {});
  expect(offers(f)).toHaveLength(1);
  later(f, 1);
  expect(() => f.run(server.resolveEquipmentOffer, { id: offer.id, keep: true })).toThrow("ran out of time");
  f.run(server.runMaintenance, {});
  expect(offers(f)).toEqual([]);
  expect(copies(f)).toEqual([]);
});

it(`caps waiting offers at ${MAX_PENDING_EQUIPMENT_OFFERS}, ignoring the oldest`, () => {
  const f = archer();
  for (let n = 0; n < MAX_PENDING_EQUIPMENT_OFFERS + 2; n += 1) {
    f.run((ctx: any) => offerDuplicateEquipment(ctx, ctx.sender, n < 2 ? SAMURAI_HAT : IRON_BOW));
  }
  expect(offers(f)).toHaveLength(MAX_PENDING_EQUIPMENT_OFFERS);
  expect(offers(f).map(offer => offer.itemId)).not.toContain(SAMURAI_HAT);
  // Someone else's offers do not count against this player's.
  f.run((ctx: any) => offerDuplicateEquipment(ctx, identity("2"), IRON_BOW, 50));
  expect(offers(f, identity("2"))).toHaveLength(MAX_PENDING_EQUIPMENT_OFFERS);
  expect(offers(f)).toHaveLength(MAX_PENDING_EQUIPMENT_OFFERS);
});

it("equips a chosen copy by swapping rolls, so kill bounds and duels read the copy in hand", () => {
  const f = archer();
  const b = seedCopy(f, B);
  const c = seedCopy(f, C);
  f.run(server.selectEquipmentCopy, { copyId: c.id });
  expect(firstRoll(f)).toEqual(C);
  expect(copies(f).map(row => [row.id, rollOf(row)])).toEqual([[b.id, B], [c.id, A]]);
  expect(duelBowSkillFields(f.ctx as any, { challenger: f.ctx.sender, opponent: identity("2"), challengerWeaponItem: IRON_BOW }))
    .toMatchObject({ challengerArrowStorm: 0, challengerRicochet: 0, challengerPiercingShot: 4 });
  expect(() => f.run(server.selectEquipmentCopy, { copyId: 999n })).toThrow("not in your inventory");
});

it("gives a bow held before skills existed an explicit no-skills roll when another copy is equipped", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([IRON_BOW]), equippedRightHand: IRON_BOW });
  const b = seedCopy(f, B);
  f.run(server.selectEquipmentCopy, { copyId: b.id });
  expect(firstRoll(f)).toEqual(B);
  expect(copies(f).map(rollOf)).toEqual([NONE]);
});

it("destroys exactly the copy asked for, and a destroyed first copy is replaced by the oldest kept one", () => {
  const f = archer();
  const b = seedCopy(f, B);
  const c = seedCopy(f, C);
  f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: c.id });
  expect(copies(f).map(row => row.id)).toEqual([b.id]);
  expect(firstRoll(f)).toEqual(A);
  // The first copy is the equipped one: B takes its place, still in hand.
  f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: 0n });
  expect(firstRoll(f)).toEqual(B);
  expect(copies(f)).toEqual([]);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).equippedRightHand).toBe(IRON_BOW);
  // The last copy goes the way it always has, and its roll is remembered.
  f.run(server.destroyEquipment, { itemId: IRON_BOW });
  expect(inventory(f)).not.toContain(IRON_BOW);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).equippedRightHand).toBe("");
  expect(firstRoll(f)).toEqual(B);
});

it("routes the old destroy_equipment through the same replacement rule and refuses a copy of another item", () => {
  const f = archer();
  const hat = seedCopy(f, NONE, SAMURAI_HAT);
  seedCopy(f, C);
  f.run(server.destroyEquipment, { itemId: IRON_BOW });
  expect(inventory(f)).toContain(IRON_BOW);
  expect(firstRoll(f)).toEqual(C);
  expect(() => f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: hat.id })).toThrow("not in your inventory");
  expect(() => f.run(server.destroyEquipmentCopy, { itemId: STARTER_STONE, copyId: 0n })).toThrow("cannot be destroyed");
  const theirs = seedCopy(f, B, IRON_BOW, identity("2"));
  expect(() => f.run(server.destroyEquipmentCopy, { itemId: IRON_BOW, copyId: theirs.id })).toThrow("not in your inventory");
});

it("converts an item to a cosmetic without touching any copy", () => {
  const f = archer();
  seedCopy(f, B);
  f.seed("playerGemWallet", { identity: f.ctx.sender, balance: 100n, revision: 0n, updatedAt: f.ctx.timestamp });
  f.run(server.convertItemToCosmetic, { itemId: IRON_BOW });
  expect(cosmeticUnlocks(f.db.playerProgress.identity.find(f.ctx.sender).cosmeticItemsJson)).toContain(IRON_BOW);
  expect(copies(f).map(rollOf)).toEqual([B]);
  expect(firstRoll(f)).toEqual(A);
});

it("keeps kept copies through prestige but takes them on reset; waiting offers go either way", () => {
  for (const [reducer, keepsCopies] of [["prestigeAccount", true], ["resetPlayerProgress", false]] as const) {
    const f = archer({ bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
    seedCopy(f, B);
    seedOffer(f, C);
    seedCopy(f, B, IRON_BOW, identity("2"));
    f.run(server[reducer], {});
    expect(copies(f).map(rollOf)).toEqual(keepsCopies ? [B] : []);
    expect(offers(f)).toEqual([]);
    expect(copies(f, identity("2"))).toHaveLength(1);
    expect(firstRoll(f)).toEqual(A); // Rolls are never taken: a bow dropping again keeps its roll.
  }
});

it("moves a guest's copies and offers to the account it links to, replacing the account's copies", () => {
  const f = crystalFixture();
  const guest = identity("2");
  seedCopy(f, NONE, SAMURAI_HAT); // the account's own, from a bag the guest's replaces
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest, { inventoryJson: JSON.stringify([IRON_BOW]) });
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  seedCopy(f, B, IRON_BOW, guest);
  seedOffer(f, C, IRON_BOW, guest);
  f.seed("accountLink", { code: "copy-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "copy-link" });
  expect(copies(f, guest)).toEqual([]);
  expect(offers(f, guest)).toEqual([]);
  expect(copies(f).map(row => [row.itemId, rollOf(row)])).toEqual([[IRON_BOW, B]]);
  expect(offers(f).map(rollOf)).toEqual([C]);
});

it("is erased with the account and removed on every deletion path", () => {
  const f = archer();
  seedCopy(f, B);
  seedOffer(f, C);
  seedCopy(f, B, IRON_BOW, identity("3"));
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(copies(f)).toEqual([]);
  expect(offers(f)).toEqual([]);
  expect(copies(f, identity("3"))).toHaveLength(1);
  // Both deletion paths remove item drops, and removing drops removes copies and offers.
  const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const drops = index.slice(index.indexOf("function removePlayerItemDrops"), index.indexOf("function removePlayerItemUpgradeData"));
  expect(drops).toContain("removeEquipmentCopies(ctx, identity)");
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const section = (start: string, end: string) => lifecycle.slice(lifecycle.indexOf(start), lifecycle.indexOf(end, lifecycle.indexOf(start)));
  expect(section("function removeVirtualPlayerData", "function removePlayerIdentityData")).toContain("removePlayerItemUpgradeData(ctx, identity, true)");
  expect(section("function removePlayerIdentityData", "return {")).toContain("removePlayerItemUpgradeData(ctx, identity, true)");
});
