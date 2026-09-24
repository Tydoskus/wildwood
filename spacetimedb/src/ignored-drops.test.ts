import { readFileSync } from "node:fs";
import { Timestamp } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy } from "../../tests/helpers/enemy-defeat";
import { eraseIdentityRows } from "./account-erasure";
import { publishItemDrop } from "./equipment-copies";
import { ignoredDropKey } from "./ignored-drops";
import { EQUIPMENT_OFFER_LIFETIME_MS, MAX_IGNORED_DROP_BATCH } from "../../shared/equipment-copies";
import { BASIC_PAPER_HAT, IRON_BOW, SAMURAI_HAT, STARTER_STONE, WOODEN_SWORD } from "../../shared/items";
import { ATTACK_BALANCE_VERSION, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;

const ignored = (f: Fixture, who = f.ctx.sender) => [...f.db.playerIgnoredDrop.identity.filter(who)].map(row => row.itemId).sort();
const offers = (f: Fixture, who = f.ctx.sender) => [...f.db.pendingEquipmentOffer.identity.filter(who)];
const inventory = (f: Fixture, who = f.ctx.sender): string[] => JSON.parse(f.db.playerProgress.identity.find(who).inventoryJson);
const mark = (f: Fixture, itemIds: string[], value = true) => f.run(server.setIgnoredDrops, { itemIds, ignored: value });
const seedIgnored = (f: Fixture, itemId: string, who = f.ctx.sender) =>
  f.seed("playerIgnoredDrop", { key: ignoredDropKey(who, itemId), identity: who, itemId });
const seedOffer = (f: Fixture, itemId: string, who = f.ctx.sender) =>
  f.seed("pendingEquipmentOffer", { id: 0n, identity: who, itemId, arrowStorm: 0, ricochet: 0, piercingShot: 0, createdAt: f.ctx.timestamp,
    expiresAt: new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(EQUIPMENT_OFFER_LIFETIME_MS) * 1_000n) });
/** Every loot roll wins. */
const luckyRandom = (f: Fixture) => {
  Object.assign(f.ctx, { random: Object.assign(() => .1, { integerInRange: (min: number) => min }) });
};

it("marks and unmarks items for the caller only, and reads them back through its own view", () => {
  const f = crystalFixture();
  seedIgnored(f, SAMURAI_HAT, identity("3"));
  mark(f, [IRON_BOW, SAMURAI_HAT]);
  expect(ignored(f)).toEqual([IRON_BOW, SAMURAI_HAT]);
  expect((server.myIgnoredDrops as any)(f.ctx).map((row: any) => row.itemId).sort()).toEqual([IRON_BOW, SAMURAI_HAT]);
  // Marking again, and a list naming one item twice, write nothing new.
  mark(f, [IRON_BOW, IRON_BOW]);
  expect(ignored(f)).toEqual([IRON_BOW, SAMURAI_HAT]);
  mark(f, [SAMURAI_HAT], false);
  expect(ignored(f)).toEqual([IRON_BOW]);
  expect(ignored(f, identity("3"))).toEqual([SAMURAI_HAT]);
});

it("refuses anything that is not droppable equipment, and writes nothing from a refused list", () => {
  const f = crystalFixture();
  for (const bad of [BASIC_PAPER_HAT, STARTER_STONE, WOODEN_SWORD, "unknown", ""]) {
    expect(() => mark(f, [IRON_BOW, bad])).toThrow(/cannot be ignored/);
  }
  expect(() => mark(f, Array.from({ length: MAX_IGNORED_DROP_BATCH + 1 }, () => IRON_BOW))).toThrow(/at most/);
  expect(ignored(f)).toEqual([]);
  mark(f, Array.from({ length: MAX_IGNORED_DROP_BATCH }, () => IRON_BOW));
  expect(ignored(f)).toEqual([IRON_BOW]);
});

it("needs the controlling session", () => {
  const f = crystalFixture();
  f.db.playerController.identity.delete(f.ctx.sender);
  expect(() => mark(f, [IRON_BOW])).toThrow();
  expect(ignored(f)).toEqual([]);
});

it("ignores a copy of a marked item on arrival: no offer, the drop still announced", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([IRON_BOW, SAMURAI_HAT]) });
  mark(f, [IRON_BOW]);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, IRON_BOW, true, 3));
  expect(offers(f)).toEqual([]);
  expect(f.db.playerItemDrop.key.find(`${f.ctx.sender.toHexString()}:${IRON_BOW}`).alreadyOwned).toBe(true);
  // Items not marked are still offered.
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, SAMURAI_HAT, true));
  expect(offers(f).map(offer => offer.itemId)).toEqual([SAMURAI_HAT]);
  // Unmarking brings the offers back.
  mark(f, [IRON_BOW], false);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, IRON_BOW, true));
  expect(offers(f).map(offer => offer.itemId)).toEqual([SAMURAI_HAT, IRON_BOW]);
});

it("still puts the first copy of a marked item in the bag, and ignores the rest of that batch", () => {
  const f = crystalFixture();
  luckyRandom(f);
  f.patch("playerProgress", { damage: 1e15, inventoryJson: '["crystal_armor"]' });
  mark(f, ["crystal_bow", "crystal_armor", "crystal_helmet"]);
  fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
  reportEnemy(f, "Shard Hopper", 2);
  // New gear lands even when marked; only the copies are ignored.
  expect(inventory(f)).toEqual(expect.arrayContaining(["crystal_bow", "crystal_helmet", "crystal_armor"]));
  expect(offers(f)).toEqual([]);
  // The same through publishItemDrop directly: three new copies at once, the first kept.
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, SAMURAI_HAT, false, 3));
  expect(offers(f).map(offer => offer.itemId)).toEqual([SAMURAI_HAT, SAMURAI_HAT]);
  offers(f).forEach(offer => f.db.pendingEquipmentOffer.id.delete(offer.id));
  mark(f, [SAMURAI_HAT]);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, SAMURAI_HAT, false, 3));
  expect(offers(f)).toEqual([]);
});

it("clears offers of an item as soon as it is marked, and leaves other offers and players alone", () => {
  const f = crystalFixture();
  seedOffer(f, IRON_BOW);
  seedOffer(f, IRON_BOW);
  seedOffer(f, SAMURAI_HAT);
  seedOffer(f, IRON_BOW, identity("2"));
  mark(f, [IRON_BOW]);
  expect(offers(f).map(offer => offer.itemId)).toEqual([SAMURAI_HAT]);
  expect(offers(f, identity("2"))).toHaveLength(1);
  // Unmarking never touches offers.
  mark(f, [SAMURAI_HAT], false);
  expect(offers(f)).toHaveLength(1);
});

it("still offers a gifted copy: a gift is handed over on purpose, not dropped", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([IRON_BOW]) });
  mark(f, [IRON_BOW]);
  f.seed("playerItemGift", { key: "test:gift", identity: f.ctx.sender, campaign: "test", itemId: IRON_BOW, claimed: false, createdAt: f.ctx.timestamp });
  f.run(server.claimDeveloperItemGift, { key: "test:gift" });
  expect(offers(f).map(offer => offer.itemId)).toEqual([IRON_BOW]);
});

it("survives prestige and reset, like the account's other settings", () => {
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  // Only the two deletion paths remove the rows; nothing on the progress-wipe paths does.
  expect(lifecycle.match(/removeIgnoredDrops\(ctx, identity\)/g)).toHaveLength(2);
  expect(index).not.toContain("removeIgnoredDrops");
});

it("is removed wherever a player's or simulated client's rows are removed", () => {
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const section = (start: string, end: string) => lifecycle.slice(lifecycle.indexOf(start), lifecycle.indexOf(end, lifecycle.indexOf(start)));
  expect(section("function removeVirtualPlayerData", "function removePlayerIdentityData")).toContain("removeIgnoredDrops(ctx, identity)");
  expect(section("function removePlayerIdentityData", "return {")).toContain("removeIgnoredDrops(ctx, identity)");
});

it("is erased with the account and leaves other accounts alone", () => {
  const f = crystalFixture();
  mark(f, [IRON_BOW, SAMURAI_HAT]);
  seedIgnored(f, IRON_BOW, identity("3"));
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(ignored(f)).toEqual([]);
  expect(ignored(f, identity("3"))).toEqual([IRON_BOW]);
});

it("joins a guest's list to the account's on link and leaves no guest rows", () => {
  const f = crystalFixture();
  const guest = identity("2");
  seedIgnored(f, IRON_BOW);
  seedIgnored(f, IRON_BOW, guest);
  seedIgnored(f, SAMURAI_HAT, guest);
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest);
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  f.seed("accountLink", { code: "ignore-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "ignore-link" });
  expect(ignored(f)).toEqual([IRON_BOW, SAMURAI_HAT]);
  expect(ignored(f, guest)).toEqual([]);
  expect(f.db.playerIgnoredDrop.key.find(ignoredDropKey(f.ctx.sender, SAMURAI_HAT))).not.toBeNull();
});
