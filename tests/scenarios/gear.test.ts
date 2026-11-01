import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { gameWorld, playAs } from "./harness/game";
import { answerConfirm, answered, bagItems, deliverRows, fillBag, freeSlots, giveItems, giveOres, oresOf, playUntil, press, readyToPrestige, reportKills, serverBag, setMastery, signInAs, wear, windowTitled, wornItems, giveGems, gemsOf, shownNumber, standAt, TOWN_SPOTS, visible } from "./harness/gear";
import { SCENARIO_START_MS, scenarioWorld } from "./harness/server";
import { simPlayer } from "./harness/sim";
import { connectClient } from "./harness/client";
import { createBowSkills } from "../../src/coop/services/bow-skills";
import { craftMaterialsKey, gradeCraftMaterials } from "../../shared/grade-craft";
import type { ScenarioPlayer, ScenarioWorld } from "./harness/server";
import { BASIC_PAPER_HAT, DIAMOND_GALAXY_ARMOR, GALAXY_BOW, IRON_BOW, SAMURAI_HAT, STARTER_BOW, STARTER_STONE } from "../../shared/items";
import { EQUIPMENT_OFFER_LIFETIME_MS } from "../../shared/equipment-copies";
import { cardDefinition, cardMeterFull } from "../../shared/cards";
import { cardName } from "../../shared/card-text";
import { addCard } from "../../spacetimedb/src/gear-cards";
import { refineLevelFor, setRefineLevel } from "../../spacetimedb/src/item-refine";
import { grantMasteryPoints, weaponMasteryPoints } from "../../spacetimedb/src/weapon-mastery";
import { MASTERY_MAX_LEVEL, masteryPointsForLevel } from "../../shared/weapon-mastery";
import { AGE_BAND_ADULT, TERMS_VERSION } from "../../shared/legal";
import { TOWN_BENCH_POSITION } from "../../shared/town";
import { CARD_SHOP_ROTATION_MS, cardShopOffer, cardShopRotation } from "../../shared/card-shop";
import { writeProgressAndPresentation } from "../../spacetimedb/src/player-power";
import { readPlayerProgress } from "../../spacetimedb/src/wide-stats";
import { BUILD_SLOTS } from "../../shared/builds";
import { goldFor } from "../../spacetimedb/src/gold";
import { gradeShopSalePrice } from "../../shared/grade-shop";

type BowRoll = { arrowStorm: number; ricochet: number; piercingShot: number };
const NO_ROLL: BowRoll = { arrowStorm: 0, ricochet: 0, piercingShot: 0 };
/** An offer of a duplicate waiting for Keep or Ignore. */
function waitingOffer(world: ScenarioWorld, player: ScenarioPlayer, itemId: string, roll: BowRoll = NO_ROLL) {
  world.setup(ctx => ctx.db.pendingEquipmentOffer.insert({
    id: 0n, identity: player.identity, itemId, ...roll, whirlwind: 0, deflect: 0, shockwave: 0,
    createdAt: ctx.timestamp, expiresAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(EQUIPMENT_OFFER_LIFETIME_MS) * 1_000n),
  }));
}
const offersOf = (world: ScenarioWorld, player: ScenarioPlayer) => [...world.db.pendingEquipmentOffer.identity.filter(player.identity)].map((row: any) => row.itemId);
const filtered = (world: ScenarioWorld, player: ScenarioPlayer) => [...world.db.playerIgnoredDrop.identity.filter(player.identity)].map((row: any) => row.itemId).sort();

describe("the loot filter", () => {
  it("GEAR-18 the filter and Auto equip are the account's: they outlast prestige and Reset Save and join the account on sign-in", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    ann.call("setIgnoredDrops", { itemIds: [BASIC_PAPER_HAT, "slot:FEET"], ignored: true });
    ann.call("setLootSettings", { autoKeepBest: true, autoEquipBest: false });
    // Only slots and items that drop can be listed; nothing is written for a bad list.
    for (const bad of [STARTER_STONE, GALAXY_BOW, "slot:RIGHT_HAND", "unknown"]) {
      expect(ann.refusal("setIgnoredDrops", { itemIds: [SAMURAI_HAT, bad], ignored: true }), bad).not.toBeNull();
    }
    expect(ann.refusal("setLootSettings", { autoKeepBest: true, autoEquipBest: "yes" })).not.toBeNull();
    expect(filtered(world, ann)).toEqual([BASIC_PAPER_HAT, "slot:FEET"]);

    readyToPrestige(world, ann);
    ann.call("prestigeAccount");
    expect(world.db.playerPrestige.identity.find(ann.identity)?.level).toBe(1);
    ann.call("resetPlayerProgress");
    expect(filtered(world, ann)).toEqual([BASIC_PAPER_HAT, "slot:FEET"]);
    expect(world.db.playerLootSetting.identity.find(ann.identity)?.autoEquipBest).toBe(false);

    // Signed in: the account holds the guest's list and choice, and the guest keeps none.
    const account = signInAs(world, ann, "Ann's account");
    expect(filtered(world, account)).toEqual([BASIC_PAPER_HAT, "slot:FEET"]);
    expect(world.db.playerLootSetting.identity.find(account.identity)?.autoEquipBest).toBe(false);
    expect(filtered(world, ann)).toEqual([]);
    expect(world.db.playerLootSetting.identity.find(ann.identity)).toBeFalsy();
  });
});

/** A card's drop meter one kill short of a sure drop. */
function meterAlmostFull(world: ScenarioWorld, player: ScenarioPlayer, cardId: string) {
  const full = cardMeterFull(cardDefinition(cardId)!.rarity);
  const key = `${player.hex}:${cardId}`;
  world.setup(ctx => {
    const row = ctx.db.playerCardMeter.key.find(key);
    if (row) ctx.db.playerCardMeter.key.update({ ...row, progress: full - 1 });
    else ctx.db.playerCardMeter.insert({ key, identity: player.identity, cardId, progress: full - 1 });
  });
}
const cardsHeld = (world: ScenarioWorld, player: ScenarioPlayer, cardId: string) =>
  Number([...world.db.playerCard.identity.filter(player.identity)].find((row: any) => row.cardId === cardId)?.count ?? 0);
const activeHand = (world: ScenarioWorld, player: ScenarioPlayer) => [...(world.db.playerActiveCard.identity.find(player.identity)?.hand ?? [])];

describe("cards", () => {
  it("GEAR-16 a first card gets its found moment, the Cards tab equips one, and a Quick Draw card speeds attacks without losing the run's rating", async () => {
    const world = gameWorld({ seed: 3 });
    const ann = world.join("Ann");
    meterAlmostFull(world, ann, "bramble_card");
    meterAlmostFull(world, ann, "needle_card");
    world.setup(ctx => addCard(ctx as never, ann.identity, "dune_needle_card", 1));
    // A find from an earlier session is old news: no moment on the next visit.
    world.setup(ctx => {
      addCard(ctx as never, ann.identity, "brood_card", 1);
      ctx.db.playerCardDrop.insert({ identity: ann.identity, cardIds: ["brood_card"], sequence: 1n, droppedAt: ctx.timestamp });
    });
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const session = tab.network.players.get("Ann")!;
    await tab.play(1_000);
    expect(tab.shown("cardFoundName")).toBe(false);

    // The first Bramble card: its moment shows its name, then goes by itself.
    await vi.advanceTimersByTimeAsync(5_000);
    reportKills(world, session, 1, 5_000, "Bramble");
    deliverRows(tab);
    expect(cardsHeld(world, ann, "bramble_card")).toBe(1);
    await playUntil(tab, () => tab.shown("cardFoundName"), "the card found moment shows");
    expect(tab.element("cardFoundName").textContent).toBe(cardName(cardDefinition("bramble_card")!));
    await playUntil(tab, () => !tab.shown("cardFoundName"), "the moment goes by itself", 6_000);
    // The network drops and the player reconnects: the find it already showed is not shown again.
    const first = tab.connection()!;
    first.fake.drop();
    await playUntil(tab, () => tab.shown("reconnectOverlay"), "the game shows it is reconnecting");
    await playUntil(tab, () => tab.connection() !== first && tab.coop.isConnected() === true, "the game reconnects", 20_000);
    await tab.play(1_000);
    expect(tab.shown("cardFoundName")).toBe(false);
    // Another copy is no new find: no moment.
    meterAlmostFull(world, ann, "bramble_card");
    await vi.advanceTimersByTimeAsync(5_000);
    reportKills(world, session, 1, 5_000, "Bramble");
    deliverRows(tab);
    expect(cardsHeld(world, ann, "bramble_card")).toBe(2);
    await tab.play(1_000);
    expect(tab.shown("cardFoundName")).toBe(false);
    // With Card Found Popups off, a first Needle card comes without one.
    tab.tap("cardFoundPopupsToggle");
    await vi.advanceTimersByTimeAsync(5_000);
    reportKills(world, session, 1, 5_000, "Needle");
    deliverRows(tab);
    expect(cardsHeld(world, ann, "needle_card")).toBe(1);
    await tab.play(1_000);
    expect(tab.shown("cardFoundName")).toBe(false);

    // The Cards tab: Weapon, the Dune Needle card, Equip.
    const rateBefore = ann.progress().attackRate as number;
    tab.tap("inventoryBtn");
    tab.tap("inventoryCardsTab");
    const cards = () => tab.element("inventoryContent");
    press(tab, cards().querySelector("[data-choice=equip]"));
    press(tab, cards().querySelector("[data-choice=HAND]"));
    press(tab, cards().querySelector("[data-card-id=dune_needle_card]"));
    const focus = () => cards().querySelector("[aria-live=polite]");
    press(tab, [...focus()!.querySelectorAll("button")].at(-1));
    await playUntil(tab, () => activeHand(world, ann).includes("dune_needle_card"), "the server holds the card active");
    // Shown in its slot as well as among the cards owned.
    await playUntil(tab, () => cards().querySelectorAll("[data-card-id=dune_needle_card]").length === 2, "the card shows in its slot");

    // The next kill report brings the Quick Draw cap in: faster attacks at the same rating.
    await vi.advanceTimersByTimeAsync(5_000);
    reportKills(world, session, 1, 5_000);
    deliverRows(tab);
    const rateWith = ann.progress().attackRate as number;
    expect(rateWith).toBeLessThan(rateBefore);

    // Off again: back to the same attack speed, nothing lost.
    press(tab, [...cards().querySelectorAll("[data-card-id=dune_needle_card]")][0]);
    press(tab, [...focus()!.querySelectorAll("button")].at(-1));
    await playUntil(tab, () => !activeHand(world, ann).includes("dune_needle_card"), "the card comes off");
    await vi.advanceTimersByTimeAsync(5_000);
    reportKills(world, session, 1, 5_000);
    deliverRows(tab);
    expect(ann.progress().attackRate).toBeCloseTo(rateBefore, 9);
  }, 60_000);

  it("GEAR-16 cards and the active ones stay through prestige, move to the account on sign-in, and go with the bag on Reset Save", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    world.setup(ctx => addCard(ctx as never, ann.identity, "needle_card", 3));
    ann.call("activateCard", { cardId: "needle_card", expectedActive: 0 });
    readyToPrestige(world, ann);
    ann.call("prestigeAccount");
    expect([cardsHeld(world, ann, "needle_card"), activeHand(world, ann)]).toEqual([3, ["needle_card"]]);

    const account = signInAs(world, ann, "Ann's account");
    expect([cardsHeld(world, account, "needle_card"), activeHand(world, account)]).toEqual([3, ["needle_card"]]);
    expect([cardsHeld(world, ann, "needle_card"), activeHand(world, ann)]).toEqual([0, []]);

    account.call("enterWorldWithTutorial", { tabId: "tab-account", forceTakeover: false });
    account.call("resetPlayerProgress");
    expect([cardsHeld(world, account, "needle_card"), activeHand(world, account)]).toEqual([0, []]);
  });
});

/** The first copy's bow roll on the server: the copy a slot holds. */
const firstRoll = (world: ScenarioWorld, player: ScenarioPlayer, itemId: string): BowRoll => {
  const row = world.db.playerBowSkill.key.find(`${player.hex}:${itemId}`);
  return { arrowStorm: row?.arrowStorm ?? 0, ricochet: row?.ricochet ?? 0, piercingShot: row?.piercingShot ?? 0 };
};
const keptCopies = (world: ScenarioWorld, player: ScenarioPlayer) =>
  [...world.db.playerEquipmentCopy.identity.filter(player.identity)].map((row: any) => ({ id: row.id as bigint, itemId: row.itemId as string, arrowStorm: row.arrowStorm, ricochet: row.ricochet }));

describe("duplicate gear", () => {
  it("GEAR-13 a duplicate offer compares skills, a kept copy has its own roll and slot, equip and destroy act on that copy, and an offer runs out", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    wear(world, ann, "crude_bow", "equippedRightHand");
    const yours = { arrowStorm: 1.5, ricochet: 0, piercingShot: 0 }, fresh = { arrowStorm: 0, ricochet: 2.5, piercingShot: 0 };
    world.setup(ctx => {
      const key = `${ann.hex}:crude_bow`, row = ctx.db.playerBowSkill.key.find(key);
      if (row) ctx.db.playerBowSkill.key.update({ ...row, ...yours });
      else ctx.db.playerBowSkill.insert({ key, identity: ann.identity, itemId: "crude_bow", ...yours });
    });
    waitingOffer(world, ann, "crude_bow", fresh);
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const prompt = () => tab.shown("equipmentOfferTitle") ? tab.element("equipmentOfferTitle").closest("[role=dialog]")! : null;

    // The offer pops up beside the bow worn; Keep puts the new copy in the bag with its own roll.
    await playUntil(tab, () => Boolean(prompt()), "the offer shows");
    press(tab, [...prompt()!.querySelectorAll("button")].at(-1));
    await playUntil(tab, () => keptCopies(world, ann).length === 1 && !prompt(), "the copy is kept");
    const [copy] = keptCopies(world, ann);
    expect([copy.itemId, copy.ricochet]).toEqual(["crude_bow", fresh.ricochet]);
    expect(firstRoll(world, ann, "crude_bow")).toEqual(yours);
    // It takes a bag slot of its own.
    const entry = () => tab.element("inventoryItems").querySelector(`[data-copy-id="${copy.id}"]`);
    tab.tap("inventoryBtn");
    await playUntil(tab, () => Boolean(entry()), "the copy shows in the bag");

    // Equip that copy: it becomes the one in hand, and the old roll goes to the bag.
    press(tab, entry());
    expect(tab.shown("itemInspectionTitle")).toBe(true);
    press(tab, tab.element("itemInspectionPanel").querySelector("[class*=action] button"));
    await playUntil(tab, () => firstRoll(world, ann, "crude_bow").ricochet === fresh.ricochet, "the new roll is in hand");
    expect(keptCopies(world, ann).map(row => row.arrowStorm)).toEqual([yours.arrowStorm]);
    expect(ann.progress().equippedRightHand).toBe("crude_bow");

    // Destroy the copy in the bag: only it goes; the bow in hand keeps its roll.
    await playUntil(tab, () => Boolean(entry()), "the bag shows the copy again");
    press(tab, entry());
    // The window's tool button salvages the copy on show.
    press(tab, tab.element("itemInspectionPanel").querySelector("button"));
    await answerConfirm(tab, true);
    await playUntil(tab, () => keptCopies(world, ann).length === 0, "the copy is destroyed");
    expect(firstRoll(world, ann, "crude_bow").ricochet).toBe(fresh.ricochet);
    expect(serverBag(ann)).toContain("crude_bow");

    // A full bag: Keep is refused and the offer still waits; left alone it runs out after its time.
    fillBag(world, ann, "crude_bow");
    waitingOffer(world, ann, "crude_bow", fresh);
    deliverRows(tab);
    await playUntil(tab, () => Boolean(prompt()), "the next offer shows");
    press(tab, [...prompt()!.querySelectorAll("button")].at(-1));
    await tab.play(500);
    expect(offersOf(world, ann)).toEqual(["crude_bow"]);
    await vi.advanceTimersByTimeAsync(EQUIPMENT_OFFER_LIFETIME_MS + 1_000);
    world.runDue();
    deliverRows(tab);
    expect(offersOf(world, ann)).toEqual([]);
    await playUntil(tab, () => !prompt(), "the offer goes from the screen");
  }, 60_000);
});

const lockedItems = (world: ScenarioWorld, player: ScenarioPlayer) =>
  [...world.db.playerEquipmentLock.identity.filter(player.identity)].map((row: any) => `${row.itemId}:${row.copyId}`).sort();

describe("locks and deleting", () => {
  it("GEAR-05 a locked item cannot be deleted; delete mode asks once, never takes starter or locked gear, and an ore stack frees its slot", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    wear(world, ann, "crude_bow", "equippedRightHand");
    giveItems(world, ann, "rare_bow", "crude_light_helmet");
    giveOres(world, ann, { copper_ore: 12 });
    world.setup(ctx => {
      setRefineLevel(ctx, ann.identity, "crude_light_helmet", 0n, 3);
      ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: ann.identity, itemId: "crude_bow", arrowStorm: 0, ricochet: 0, piercingShot: 0, whirlwind: 0, deflect: 0, shockwave: 0, acquiredAt: ctx.timestamp });
    });
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const session = tab.network.players.get("Ann")!;
    const entry = (itemId: string, copy = false) => bagItems(tab).find(item => item.itemId === itemId && (item.copyId !== 0n) === copy)!.node;
    const toolbar = (name: "lock" | "delete") => tab.element("inventoryPanel").querySelector<HTMLButtonElement>(`.inventory-${name}-toggle`)!;

    // Lock mode: a tap locks the Rare Bow, on the server.
    bagItems(tab);
    press(tab, toolbar("lock"));
    press(tab, entry("rare_bow"));
    await playUntil(tab, () => lockedItems(world, ann).includes("rare_bow:0"), "the bow is locked");
    press(tab, toolbar("lock"));
    expect(session.refusal("destroyEquipment", { itemId: "rare_bow" })).not.toBeNull();

    // Delete mode: the locked bow and the starter stone cannot be picked; the kept bow copy and the refined helmet can.
    press(tab, toolbar("delete"));
    for (const node of [entry("rare_bow"), entry("starter_stone"), entry("crude_bow", true), entry("crude_light_helmet")]) press(tab, node);
    const picked = () => bagItems(tab).filter(item => item.node.getAttribute("aria-pressed") === "true").map(item => item.itemId).sort();
    expect(picked()).toEqual(["crude_bow", "crude_light_helmet"]);
    // Declined: nothing goes, the picks stay.
    press(tab, toolbar("delete"));
    await answerConfirm(tab, false);
    await tab.play(200);
    expect(serverBag(ann)).toContain("crude_light_helmet");
    expect(picked()).toEqual(["crude_bow", "crude_light_helmet"]);
    // Accepted once: both are sold for what the sellers pay, as one at a time; the worn bow and everything unpicked stays.
    const goldBefore = goldFor({ db: world.db } as never, ann.identity);
    press(tab, toolbar("delete"));
    await answerConfirm(tab, true);
    await playUntil(tab, () => !serverBag(ann).includes("crude_light_helmet") && keptCopies(world, ann).length === 0, "the picks are deleted");
    expect(goldFor({ db: world.db } as never, ann.identity) - goldBefore).toBe(BigInt(gradeShopSalePrice("crude_bow")! + gradeShopSalePrice("crude_light_helmet")!));
    expect(serverBag(ann)).toEqual(expect.arrayContaining(["crude_bow", "rare_bow", "starter_stone"]));
    expect(ann.progress().equippedRightHand).toBe("crude_bow");
    expect(toolbar("delete").getAttribute("aria-pressed")).toBe("false");

    // An ore stack: its window salvages the whole stack, and its slot is free again.
    const free = freeSlots(world, ann);
    const ore = () => tab.element("inventoryItems").querySelector("[data-ore-id=copper_ore]");
    await playUntil(tab, () => Boolean(ore()), "the ore shows in the bag");
    press(tab, ore());
    press(tab, tab.element("itemInspectionPanel").querySelector("button"));
    await answerConfirm(tab, true);
    await playUntil(tab, () => oresOf(world, ann, "copper_ore") === 0, "the ore stack is destroyed");
    expect(freeSlots(world, ann)).toBe(free + 1);
    await playUntil(tab, () => !ore(), "the ore leaves the bag");
  }, 60_000);

  it("GEAR-06 destroying gear or an ore stack frees a slot; permanent items, another player's copy, a stale count and a duel are refused", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann"), bob = world.join("Bob");
    wear(world, ann, SAMURAI_HAT, "equippedHead");
    giveItems(world, ann, STARTER_BOW, IRON_BOW);
    giveOres(world, ann, { copper_ore: 12, iron_ore: 3 });
    giveItems(world, bob, IRON_BOW);
    const bobCopy = world.setup(ctx => ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: bob.identity, itemId: IRON_BOW, arrowStorm: 0, ricochet: 0, piercingShot: 0, whirlwind: 0, deflect: 0, shockwave: 0, acquiredAt: ctx.timestamp })).id;
    world.setup(ctx => ctx.db.playerItemUpgrade.insert(world.storage.row("playerItemUpgrade", { key: `${ann.hex}:HEAD`, identity: ann.identity, itemId: "HEAD", level: 4 })));
    const free = freeSlots(world, ann);

    // The worn hat goes, and its slot's tier stays; the forest bow goes too.
    ann.call("destroyEquipment", { itemId: SAMURAI_HAT });
    ann.call("destroyEquipment", { itemId: STARTER_BOW });
    expect(serverBag(ann)).not.toContain(SAMURAI_HAT);
    expect(serverBag(ann)).not.toContain(STARTER_BOW);
    expect(ann.progress().equippedHead).not.toBe(SAMURAI_HAT);
    expect(world.db.playerItemUpgrade.key.find(`${ann.hex}:HEAD`)?.level).toBe(4);
    // A whole ore stack (salvage gave some back), at the count the player confirmed.
    const copper = oresOf(world, ann, "copper_ore"), iron = oresOf(world, ann, "iron_ore");
    expect(ann.refusal("destroyOre", { oreId: "copper_ore", expectedCount: copper - 1 })).not.toBeNull();
    ann.call("destroyOre", { oreId: "copper_ore", expectedCount: copper });
    expect([oresOf(world, ann, "copper_ore"), oresOf(world, ann, "iron_ore")]).toEqual([0, iron]);
    // The bow from the bag and the copper stack give two slots back (the hat was worn, not in the bag).
    expect(freeSlots(world, ann)).toBe(free + 2);

    // Never a starter item, another player's copy, an ore not held, or anything mid-duel.
    expect(ann.refusal("destroyEquipment", { itemId: STARTER_STONE })).not.toBeNull();
    expect(ann.refusal("destroyEquipmentCopy", { itemId: IRON_BOW, copyId: bobCopy })).not.toBeNull();
    expect(world.db.playerEquipmentCopy.id.find(bobCopy)).toBeTruthy();
    expect(ann.refusal("destroyOre", { oreId: "starshard", expectedCount: 0 })).not.toBeNull();
    world.setup(ctx => ctx.db.duel.insert(world.storage.row("duel", { id: 1n, challenger: ann.identity, opponent: bob.identity, status: "active" })));
    expect(ann.refusal("destroyEquipment", { itemId: IRON_BOW })).not.toBeNull();
    expect(ann.refusal("destroyOre", { oreId: "iron_ore", expectedCount: iron })).not.toBeNull();
    expect(serverBag(ann)).toContain(IRON_BOW);
    expect(oresOf(world, ann, "iron_ore")).toBe(iron);
  });

  it("GEAR-05 a lock is its copy's: it follows the copy into the hand or into first place, outlasts sign-in, and blocks deletion", () => {
    const BOW = "crude_bow";
    const world = scenarioWorld();
    const ann = world.join("Ann");
    expect(ann.refusal("setEquipmentLocked", { itemId: BOW, copyId: 0n, locked: true })).not.toBeNull();
    wear(world, ann, BOW, "equippedRightHand");
    const copy = () => world.setup(ctx => ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: ann.identity, itemId: BOW, arrowStorm: 0, ricochet: 0, piercingShot: 0, whirlwind: 0, deflect: 0, shockwave: 0, acquiredAt: ctx.timestamp })).id;
    const spare = copy();

    // The worn bow locked: a duplicate can still replace it by hand, and the lock stays with the old bow in the bag.
    ann.call("setEquipmentLocked", { itemId: BOW, copyId: 0n, locked: true });
    ann.call("selectEquipmentCopy", { copyId: spare });
    expect(lockedItems(world, ann)).toEqual([`${BOW}:${spare}`]);
    expect(ann.refusal("destroyEquipmentCopy", { itemId: BOW, copyId: spare })).not.toBeNull();
    // Unlocked first copy deleted: the locked copy takes first place and brings its lock.
    ann.call("destroyEquipmentCopy", { itemId: BOW, copyId: 0n });
    expect(lockedItems(world, ann)).toEqual([`${BOW}:0`]);
    expect(serverBag(ann)).toContain(BOW);
    expect(ann.refusal("destroyEquipment", { itemId: BOW })).not.toBeNull();

    const account = signInAs(world, ann, "Ann's account");
    expect(lockedItems(world, account)).toEqual([`${BOW}:0`]);
    expect(lockedItems(world, ann)).toEqual([]);
  });
});

describe("the loadout the server sets", () => {
  it("GEAR-01 gear the server puts on shows in the profile, is announced, and the game never saves the old loadout over it", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    wear(world, ann, "crude_bow", "equippedRightHand");
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    expect(wornItems(tab).hand).toBe("crude_bow");
    const before = tab.element("message").textContent;

    // A grant that equips (as auto equip does after loot): the bag and the profile follow, with a message.
    const owner = world.player("Owner", "owner").connect();
    owner.call("devGrantEquipment", { identity: ann.identity, itemId: "rare_bow", equip: true });
    deliverRows(tab);
    await playUntil(tab, () => wornItems(tab).hand === "rare_bow", "the profile shows the new bow");
    expect(tab.element("message").textContent).not.toBe(before);
    expect(bagItems(tab).map(item => item.itemId)).toContain("crude_bow");
    // The game keeps saving as it plays: the server's loadout stays.
    await tab.play(5_000);
    expect(ann.progress().equippedRightHand).toBe("rare_bow");
  }, 60_000);

  it("GEAR-01 world entry never blanks a hand that held a weapon, keeps hands the player emptied, and prestige keeps the bag and loadout", () => {
    const world = scenarioWorld();
    // A weapon no longer owned falls back to the best owned one of its own kind.
    const ann = world.join("Ann");
    giveItems(world, ann, "crude_bow", "crude_sword");
    world.setup(ctx => writeProgressAndPresentation(ctx, { ...readPlayerProgress(ctx as never, ann.identity), equippedRightHand: "rare_bow" }));
    ann.disconnect();
    ann.connect().call("enterWorldWithTutorial", { tabId: "tab-ann-2", forceTakeover: false });
    expect(ann.progress().equippedRightHand).toBe("crude_bow");

    // Emptied on purpose (an unarmed run): it stays empty at entry and through prestige.
    const bob = world.join("Bob");
    world.setup(ctx => writeProgressAndPresentation(ctx, { ...readPlayerProgress(ctx as never, bob.identity), equippedRightHand: "", equippedLeftHand: "" }));
    bob.disconnect();
    bob.connect().call("enterWorldWithTutorial", { tabId: "tab-bob-2", forceTakeover: false });
    expect([bob.progress().equippedRightHand, world.db.player.identity.find(bob.identity)?.rightHandItem]).toEqual(["", ""]);
    readyToPrestige(world, bob);
    bob.call("prestigeAccount");
    expect(bob.progress().equippedRightHand).toBe("");

    // Prestige keeps the bag, the worn gear and the kept copies; Reset Save takes them.
    wear(world, ann, "rare_bow", "equippedRightHand");
    wear(world, ann, "crude_light_helmet", "equippedHead");
    world.setup(ctx => ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: ann.identity, itemId: "rare_bow", arrowStorm: 0, ricochet: 0, piercingShot: 0, whirlwind: 0, deflect: 0, shockwave: 0, acquiredAt: ctx.timestamp }));
    readyToPrestige(world, ann);
    ann.call("prestigeAccount");
    expect(serverBag(ann)).toEqual(expect.arrayContaining(["crude_bow", "crude_sword", "rare_bow", "crude_light_helmet"]));
    expect([ann.progress().equippedRightHand, ann.progress().equippedHead]).toEqual(["rare_bow", "crude_light_helmet"]);
    expect(keptCopies(world, ann)).toHaveLength(1);
    ann.call("resetPlayerProgress");
    expect(serverBag(ann)).not.toContain("rare_bow");
    expect(keptCopies(world, ann)).toEqual([]);
    expect(ann.progress().equippedRightHand).toBe(STARTER_STONE);
  });
});

describe("the bag and the profile", () => {
  it("GEAR-02 equipping from the bag shows on the profile, a full bag refuses an unequip, and a bought bag slot adds room", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    wear(world, ann, "crude_bow", "equippedRightHand");
    giveItems(world, ann, "rare_bow", "crude_light_helmet");
    giveGems(world, ann, 1_000);
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const entry = (itemId: string) => bagItems(tab).find(item => item.itemId === itemId && item.copyId === 0n)?.node;
    const firstAction = () => tab.element("itemInspectionPanel").querySelector<HTMLButtonElement>("[class*=action] button")!;

    // From the bag to the hand and the head: the profile and the server agree, the old bow back in the bag.
    press(tab, entry("rare_bow"));
    press(tab, firstAction());
    press(tab, entry("crude_light_helmet"));
    press(tab, firstAction());
    expect(wornItems(tab)).toMatchObject({ hand: "rare_bow", head: "crude_light_helmet" });
    await playUntil(tab, () => ann.progress().equippedRightHand === "rare_bow" && ann.progress().equippedHead === "crude_light_helmet", "the server has the loadout");
    expect(entry("crude_bow")).toBeTruthy();

    // A full bag has no room for the helmet: Unequip is refused and it stays on.
    fillBag(world, ann, "crude_bow");
    deliverRows(tab);
    await tab.play(200);
    tab.tap("equippedHeadSlot");
    press(tab, firstAction());
    await tab.play(500);
    expect(wornItems(tab).head).toBe("crude_light_helmet");
    expect(ann.progress().equippedHead).toBe("crude_light_helmet");

    // A bag slot bought with Gems: room for it, and Unequip works.
    const gems = gemsOf(world, ann), free = freeSlots(world, ann);
    // The slot for sale is the bag's one tile that is not a slot yet.
    const buySlot = () => tab.element("inventoryItems").querySelector<HTMLElement>(":scope > button:not([data-inventory-location])");
    await playUntil(tab, () => Boolean(buySlot()), "the bag offers a slot to buy");
    const cost = shownNumber(buySlot()!.textContent);
    press(tab, buySlot());
    await tab.play(100);
    if (tab.shown("gameConfirm")) await answerConfirm(tab, true);
    await playUntil(tab, () => freeSlots(world, ann) === free + 1, "the slot is bought");
    expect(gemsOf(world, ann)).toBe(gems - BigInt(cost));
    tab.tap("equippedHeadSlot");
    press(tab, firstAction());
    await playUntil(tab, () => ann.progress().equippedHead === "", "the helmet comes off on the server");
    expect(wornItems(tab).head).toBe("");
    expect(entry("crude_light_helmet")).toBeTruthy();

    // GEAR-04 Equip best: the strongest of each slot goes on, but the hand keeps its kind of weapon.
    world.setup(ctx => { for (const copy of [...ctx.db.playerEquipmentCopy.identity.filter(ann.identity)]) ctx.db.playerEquipmentCopy.delete(copy); });
    giveItems(world, ann, "epic_sword", "common_light_armor", "crude_ranger_boots");
    deliverRows(tab);
    await playUntil(tab, () => Boolean(entry("epic_sword")), "the new gear shows in the bag");
    press(tab, tab.element("inventoryPanel").querySelector(".inventory-equip-best"));
    expect(wornItems(tab)).toEqual({ hand: "rare_bow", head: "crude_light_helmet", chest: "common_light_armor", feet: "crude_ranger_boots" });
    await playUntil(tab, () => ann.progress().equippedChest === "common_light_armor" && ann.progress().equippedFeet === "crude_ranger_boots", "the server has the best loadout");
    expect(ann.progress().equippedRightHand).toBe("rare_bow");
  }, 60_000);
});

describe("builds", () => {
  it("GEAR-03 a saved build keeps the worn gear and active cards, and its hotkey puts them back within the copies owned", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    wear(world, ann, "crude_bow", "equippedRightHand");
    giveItems(world, ann, "rare_bow", "crude_light_helmet");
    world.setup(ctx => { addCard(ctx as never, ann.identity, "needle_card", 1); addCard(ctx as never, ann.identity, "spitter_card", 1); });
    ann.call("activateCard", { cardId: "needle_card", expectedActive: 0 });
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const session = tab.network.players.get("Ann")!;
    const card = (slot: number) => tab.element("inventoryContent").querySelectorAll<HTMLElement>(".builds-tab-card")[slot];
    const buttons = (slot: number) => [...card(slot).querySelectorAll<HTMLButtonElement>("button")];

    // Build 1 saved from the Builds tab: the bow in hand and the Needle card.
    tab.tap("inventoryBtn");
    tab.tap("inventoryBuildsTab");
    press(tab, buttons(0).at(-1));
    await playUntil(tab, () => Boolean(world.db.playerBuild.key.find(`${ann.hex}:0`)), "the build is saved");
    // The card's buttons wait until the save has answered.
    await playUntil(tab, () => buttons(0).every(button => !button.disabled), "the save has answered");

    // Another loadout: the Rare Bow and the Spitter card.
    session.call("deactivateCard", { cardType: "HAND", index: 0, cardId: "needle_card" });
    session.call("activateCard", { cardId: "spitter_card", expectedActive: 0 });
    deliverRows(tab);
    tab.tap("inventoryEquipmentTab");
    press(tab, bagItems(tab).find(item => item.itemId === "rare_bow")!.node);
    press(tab, tab.element("itemInspectionPanel").querySelector("[class*=action] button"));
    await playUntil(tab, () => ann.progress().equippedRightHand === "rare_bow", "the Rare Bow is in hand");
    expect(activeHand(world, ann)).toEqual(["spitter_card"]);

    // 1 on the keyboard: Build 1 is back on, gear and cards.
    tab.tap("closeInventoryBtn");
    tab.key("Digit1", "keydown", tab.document);
    await playUntil(tab, () => ann.progress().equippedRightHand === "crude_bow" && activeHand(world, ann).join() === "needle_card", "Build 1 is back on");
    expect(wornItems(tab).hand).toBe("crude_bow");

    // Renamed on its card: the server keeps the cleaned name.
    tab.tap("inventoryBtn");
    tab.tap("inventoryBuildsTab");
    press(tab, card(0).querySelector("button"));
    const input = card(0).querySelector<HTMLInputElement>("input")!;
    input.value = "  Boss   killer ";
    input.dispatchEvent(Object.assign(new (tab.window as any).Event("keydown", { bubbles: true, cancelable: true }), { code: "Enter", key: "Enter" }));
    await playUntil(tab, () => world.db.playerBuildName.key.find(`${ann.hex}:0`)?.name === "Boss killer", "the name is saved");
  }, 60_000);

  it("GEAR-03 a build's cards come back only as far as the copies owned and the slots in play, and names follow the account", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    world.setup(ctx => addCard(ctx as never, ann.identity, "needle_card", 1));
    // An older saved build names three Needles; two weapon slots are in play.
    world.setup(ctx => {
      ctx.db.playerBuild.insert({ key: `${ann.hex}:2`, identity: ann.identity, slot: 2, gearJson: JSON.stringify({ HAND: "", HEAD: "", CHEST: "", FEET: "" }),
        cardsJson: JSON.stringify({ any_bow: ["needle_card", "needle_card", "needle_card"] }), savedAt: ctx.timestamp });
      ctx.db.playerPrestigeCardPerk.insert({ identity: ann.identity, weaponCards: 1, helmetCards: 0, armorCards: 0 });
    });
    ann.call("applyBuildCards", { slot: 2 });
    expect(activeHand(world, ann)).toEqual(["needle_card"]);
    expect(ann.refusal("applyBuildCards", { slot: 1 })).not.toBeNull();
    expect(ann.refusal("saveBuild", { slot: BUILD_SLOTS })).not.toBeNull();
    ann.call("renameBuild", { slot: 2, name: "x".repeat(40) });
    expect(world.db.playerBuildName.key.find(`${ann.hex}:2`)?.name).toBe("x".repeat(20));
    const account = signInAs(world, ann, "Ann's account");
    expect(world.db.playerBuildName.key.find(`${account.hex}:2`)?.name).toBe("x".repeat(20));
    expect([...world.db.playerBuildName.identity.filter(ann.identity)]).toEqual([]);
  });

  it("GEAR-03 a build keeps the arrow nocked when saved, plain arrows included; a build from before arrows leaves the nock alone", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    const nocked = () => world.db.playerNockedArrow.identity.find(ann.identity)?.arrowId ?? null;
    ann.call("nockArrow", { arrowId: "fire_arrow" });
    ann.call("saveBuild", { slot: 0 });
    ann.call("nockArrow", { arrowId: "" });
    ann.call("saveBuild", { slot: 1 });
    ann.call("nockArrow", { arrowId: "star_arrow" });
    ann.call("applyBuildCards", { slot: 0 });
    expect(nocked()).toBe("fire_arrow");
    ann.call("applyBuildCards", { slot: 1 });
    expect(nocked()).toBeNull();
    // Saved before arrows: no arrow in it, so whatever is nocked stays.
    world.setup(ctx => ctx.db.playerBuild.insert({ key: `${ann.hex}:2`, identity: ann.identity, slot: 2,
      gearJson: JSON.stringify({ HAND: "", HEAD: "", CHEST: "", FEET: "" }), cardsJson: "{}", savedAt: ctx.timestamp }));
    ann.call("nockArrow", { arrowId: "venom_arrow" });
    ann.call("applyBuildCards", { slot: 2 });
    expect(nocked()).toBe("venom_arrow");
  });
});

describe("what gear does in play", () => {
  /** How far the player walks right in two seconds wearing this, and the combat's own damage figures. */
  async function wearing(gear: { weapon?: string; head?: string; chest?: string; feet?: string }) {
    const sim = simPlayer({ weapon: gear.weapon ?? "common_bow", head: gear.head, chest: gear.chest, bowSkills: { arrowStorm: 10 } });
    if (gear.feet) { sim.parts.inventory.itemIds.push(gear.feet); sim.parts.inventory.equippedFeet = gear.feet; }
    const combat = sim.parts.playerCombat();
    const dps = combat.expectedDps(), skillShare = combat.expectedFullDps() / dps - 1;
    const x = sim.parts.player.x;
    await sim.walk(1, 0, 2);
    return { walked: sim.parts.player.x - x, dps, skillShare };
  }
  const piece = (kind: "helmet" | "armor", armorClass: string) => `rare_${armorClass}_${kind}`;

  it("GEAR-04 armour classes and graded boots change walking, skill chance and damage in live play", async () => {
    const plain = await wearing({});
    const light = await wearing({ head: piece("helmet", "light"), chest: piece("armor", "light") });
    const heavy = await wearing({ head: piece("helmet", "heavy"), chest: piece("armor", "heavy") });
    const magic = await wearing({ head: piece("helmet", "magic"), chest: piece("armor", "magic") });
    // Light walks 3% faster a piece, Heavy 4% slower.
    expect(light.walked / plain.walked).toBeCloseTo(1.06, 2);
    expect(heavy.walked / plain.walked).toBeCloseTo(0.92, 2);
    // Magic raises the weapon's skill chances 3% of themselves a piece.
    expect(magic.skillShare / plain.skillShare).toBeCloseTo(1.06, 2);
    // Both pieces of the bow's own class (Light) hit 5% harder than the same grade of another class.
    expect(light.dps / magic.dps).toBeCloseTo(1.05, 2);
    const broken = await wearing({ head: piece("helmet", "light"), chest: piece("armor", "magic") });
    const swapped = await wearing({ head: piece("helmet", "magic"), chest: piece("armor", "light") });
    expect(broken.dps / swapped.dps).toBeCloseTo(1, 3);
    // Ranger Boots walk faster; Mystic Boots raise skill chances; Warrior Boots neither (they raise armor).
    const ranger = await wearing({ feet: "crude_ranger_boots" });
    expect(ranger.walked / plain.walked).toBeGreaterThan(1.01);
    const mystic = await wearing({ feet: "legendary_mystic_boots" });
    expect(mystic.skillShare / plain.skillShare).toBeGreaterThan(1.01);
    const warrior = await wearing({ feet: "eternal_warrior_boots" });
    expect([warrior.walked / plain.walked, warrior.skillShare / plain.skillShare]).toEqual([1, 1]);
  });
});

describe("refines and their copies", () => {
  it("GEAR-12 a refine stays with its copy through select and destroy, and with the save through prestige, sign-in and a login move; Reset Save takes it", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    const BOW = "crude_bow";
    const refine = (player: ScenarioPlayer, copyId = 0n) => world.setup(ctx => refineLevelFor(ctx, player.identity, BOW, copyId));
    const keep = (player: ScenarioPlayer) => world.setup(ctx => ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: player.identity, itemId: BOW, arrowStorm: 0, ricochet: 0, piercingShot: 0, whirlwind: 0, deflect: 0, shockwave: 0, acquiredAt: ctx.timestamp })).id;
    wear(world, ann, BOW, "equippedRightHand");
    const spare = keep(ann);
    world.setup(ctx => { setRefineLevel(ctx, ann.identity, BOW, 0n, 7); setRefineLevel(ctx, ann.identity, BOW, spare, 3); });
    giveOres(world, ann, { copper_ore: 5 });

    // Chosen into the hand, the kept copy brings its ★3 and leaves the ★7 in the bag.
    ann.call("selectEquipmentCopy", { copyId: spare });
    expect([refine(ann), refine(ann, spare)]).toEqual([3, 7]);
    // The first copy destroyed: the kept one takes its place with its own ★7.
    ann.call("destroyEquipmentCopy", { itemId: BOW, copyId: 0n });
    expect([refine(ann), keptCopies(world, ann)]).toEqual([7, []]);
    // A kept copy destroyed takes its refine with it.
    const another = keep(ann);
    world.setup(ctx => setRefineLevel(ctx, ann.identity, BOW, another, 5));
    ann.call("destroyEquipmentCopy", { itemId: BOW, copyId: another });
    expect([refine(ann), refine(ann, another)]).toEqual([7, 0]);

    // Prestige keeps the refine and the ore (salvage has added to it).
    const copper = oresOf(world, ann, "copper_ore");
    expect(copper).toBeGreaterThan(0);
    readyToPrestige(world, ann);
    ann.call("prestigeAccount");
    expect([refine(ann), oresOf(world, ann, "copper_ore")]).toEqual([7, copper]);
    // Signed in: the account holds them, the guest none.
    const account = signInAs(world, ann, "Ann's account");
    expect([refine(account), oresOf(world, account, "copper_ore"), refine(ann)]).toEqual([7, copper, 0]);
    // Moved to another login: they go with the character.
    account.call("enterWorldWithTutorial", { tabId: "tab-account", forceTakeover: false });
    account.call("startLoginMove", { code: `scenario-move-${"x".repeat(32)}` });
    account.disconnect();
    const login = world.player("Ann's new login", "account").connect();
    login.call("finishLoginMove", { code: `scenario-move-${"x".repeat(32)}` });
    expect([refine(login), oresOf(world, login, "copper_ore"), refine(account)]).toEqual([7, copper, 0]);
    // Reset Save takes them.
    login.call("acceptTerms", { termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
    login.call("enterWorldWithTutorial", { tabId: "tab-login", forceTakeover: false });
    login.call("resetPlayerProgress");
    expect([refine(login), oresOf(world, login, "copper_ore")]).toEqual([0, 0]);
  });
});

describe("weapon skill news", () => {
  it("GEAR-14 a better roll on a weapon is announced once, never for the standing rolls or this tab's own swap", async () => {
    const world = scenarioWorld({ seed: 11 });
    const ann = world.join("Ann");
    standAt(world, ann, TOWN_SPOTS.smith);
    giveOres(world, ann, { pine_log: 10_000, copper_ore: 10_000, arcane_crystal: 10_000 });
    ann.call("craftGradeItem", { itemId: "crude_bow", expectedMaterials: craftMaterialsKey(gradeCraftMaterials("crude_bow")!) });
    ann.call("craftGradeItem", { itemId: "crude_sword", expectedMaterials: craftMaterialsKey(gradeCraftMaterials("crude_sword")!) });
    const conn = connectClient(world, ann);
    const skills = createBowSkills(() => {});
    const news: { itemId: string; before: number; after: number }[] = [];
    skills.api.setOnBetterRollKept(kept => news.push(kept));
    skills.watch(conn, () => true);
    await conn.fake.settle();
    // What the account already has is not news.
    expect(skills.bowSkills("crude_bow")).not.toBeNull();
    expect(news).toEqual([]);

    // Reforging the bow and the sword merges fresh rolls in: each roll that went up is told once.
    let raised = 0;
    for (const itemId of ["crude_bow", "crude_sword", "crude_bow", "crude_sword", "crude_bow", "crude_sword"]) {
      const before = JSON.stringify(skills.api.weaponSkills(itemId));
      await conn.reducers.reforgeWeapon({ itemId, copyId: 0n, expectedMaterials: craftMaterialsKey(gradeCraftMaterials(itemId)!) });
      await conn.fake.settle();
      if (JSON.stringify(skills.api.weaponSkills(itemId)) !== before) raised++;
    }
    expect(raised).toBeGreaterThan(0);
    expect(news).toHaveLength(raised);
    expect(news.every(entry => entry.after > entry.before)).toBe(true);
    expect(new Set(news.map(entry => entry.itemId)).size).toBe(2);

    // A better copy chosen on this tab is the player's own doing: no news.
    const copyId = world.setup(ctx => ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: ann.identity, itemId: "crude_bow", arrowStorm: 50, ricochet: 50, piercingShot: 50, whirlwind: 0, deflect: 0, shockwave: 0, acquiredAt: ctx.timestamp })).id;
    conn.fake.deliver();
    const told = news.length;
    expect((await skills.api.selectEquipmentCopy(copyId)).ok).toBe(true);
    await conn.fake.settle();
    expect(skills.bowSkills("crude_bow")?.arrowStorm).toBe(50);
    expect(news).toHaveLength(told);
  });
});

describe("slot upgrades", () => {
  it("GEAR-15 slot upgrades start from the bench, extra queues cost the Gems shown, a finished one is flagged, and they outlast prestige", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    standAt(world, ann, { mapId: "town", ...TOWN_BENCH_POSITION });
    wear(world, ann, "crude_bow", "equippedRightHand");
    giveGems(world, ann, 1_000);
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const session = tab.network.players.get("Ann")!;
    await playUntil(tab, () => tab.shown("slotUpgradesQueueOne"), "the bench opens");
    const pick = async (queue: string, slotIndex: number) => {
      tab.tap(queue);
      await playUntil(tab, () => tab.shown("slotUpgradesPickerItems"), "the slot picker opens");
      // Picking the slot starts its upgrade; there is no second button to press.
      press(tab, tab.element("slotUpgradesPickerItems").querySelectorAll("button")[slotIndex]);
    };
    const buyQueue = async (queue: string) => {
      const cost = shownNumber(tab.element(queue).textContent), gems = gemsOf(world, ann);
      tab.tap(queue);
      await tab.play(100);
      if (tab.shown("gameConfirm")) await answerConfirm(tab, true);
      await playUntil(tab, () => gemsOf(world, ann) < gems, `${queue} is bought`);
      expect(gemsOf(world, ann)).toBe(gems - BigInt(cost));
    };

    // Queue one: the weapon slot.
    await pick("slotUpgradesQueueOne", 0);
    await playUntil(tab, () => world.db.activeItemUpgrade.identity.find(ann.identity)?.itemId === "HAND", "the weapon slot upgrade runs");
    // Queues two and three are bought at the price on them, then run beside it.
    await buyQueue("slotUpgradesQueueTwo");
    await playUntil(tab, () => tab.shown("slotUpgradesQueueThree"), "a third queue is offered");
    await buyQueue("slotUpgradesQueueThree");
    // The busy weapon slot is not offered again: the first slot listed now is another.
    await pick("slotUpgradesQueueTwo", 0);
    await playUntil(tab, () => Boolean(world.db.activeItemUpgradeSlotTwo.identity.find(ann.identity)), "a second slot upgrade runs");
    const second = world.db.activeItemUpgradeSlotTwo.identity.find(ann.identity)!.itemId;
    expect(second).not.toBe("HAND");

    // The weapon slot's time passes: it finishes on the server and the inventory button is flagged.
    tab.tap("slotUpgradesBack");
    const flagBefore = visible(tab, tab.element("inventoryBtn").querySelector("span[aria-hidden=true]"));
    expect(flagBefore).toBe(false);
    const job = world.db.activeItemUpgrade.identity.find(ann.identity)!;
    await vi.advanceTimersByTimeAsync(Number(job.completesAt.microsSinceUnixEpoch / 1000n) - Date.now() + 1_000);
    world.runDue();
    deliverRows(tab);
    await playUntil(tab, () => world.db.playerItemUpgrade.key.find(`${ann.hex}:HAND`)?.level === 1, "the weapon slot reaches +1");
    // The flag is the button's first decorative mark after its icon.
    const flag = () => tab.element("inventoryBtn").querySelector<HTMLElement>("span[aria-hidden=true]");
    await playUntil(tab, () => visible(tab, flag()), "the inventory button is flagged");

    // Prestige keeps the tiers and a job still running.
    session.call("startItemUpgrade", { slot: 1, itemId: "HAND" });
    readyToPrestige(world, ann);
    session.call("prestigeAccount");
    expect(world.db.playerItemUpgrade.key.find(`${ann.hex}:HAND`)?.level).toBe(1);
    expect(world.db.playerItemUpgrade.key.find(`${ann.hex}:${second}`)?.level).toBe(1);
    expect(world.db.activeItemUpgrade.identity.find(ann.identity)?.itemId).toBe("HAND");
  }, 60_000);
});

describe("the Card Seller", () => {
  it("GEAR-17 sells this rotation's cards for the ore shown, each once, and shows the server's refusal of a stale offer", async () => {
    // A few minutes before the cards change.
    const world = gameWorld({ start: (cardShopRotation(SCENARIO_START_MS) + 1) * CARD_SHOP_ROTATION_MS - 5 * 60_000 });
    const ann = world.join("Ann");
    standAt(world, ann, TOWN_SPOTS.cardSeller);
    const ORES = ["copper_ore", "iron_ore", "mithril_ore", "adamant_ore", "starshard"] as const;
    giveOres(world, ann, Object.fromEntries(ORES.map(id => [id, 500])));
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const sheet = () => windowTitled(tab, "cardSellerTitle");
    await playUntil(tab, () => Boolean(sheet()), "the Card Seller's window opens");
    const offers = () => [...sheet()!.querySelectorAll<HTMLElement>("[role=list] > [data-card-id]")];
    const buyButton = (offer: HTMLElement) => [...offer.querySelectorAll<HTMLButtonElement>("button")].at(-1)!;
    const held = () => ORES.map(id => oresOf(world, ann, id));
    const [first] = offers();
    const cardId = first.dataset.cardId!;
    // The window's one line kept hidden until there is an outcome to say.
    const outcome = [...sheet()!.querySelectorAll("p")].find(line => line.hasAttribute("hidden"))!;
    // What the offer says it costs, amounts only.
    const shownCost = [...first.querySelectorAll("[aria-label=Price] li")].map(line => shownNumber(line.firstElementChild!.textContent)).sort((a, b) => a - b);

    const before = held();
    press(tab, buyButton(first));
    await playUntil(tab, () => cardsHeld(world, ann, cardId) === 1, "the card is bought");
    const spent = held().map((count, index) => before[index] - count).filter(Boolean).sort((a, b) => a - b);
    expect(spent).toEqual(shownCost);
    // Once a rotation: its button no longer sells, and the server refuses a second buy.
    await playUntil(tab, () => buyButton(offers()[0]).disabled, "the bought card's button rests");
    expect((await answered(tab, tab.coop.buyShopCard(cardShopRotation(Date.now()), cardId))).ok).toBe(false);
    expect(cardsHeld(world, ann, cardId)).toBe(1);

    // The window left open into the next rotation: a buy from the old offer is refused, said on screen, and costs nothing.
    const stale = offers()[1];
    const staleCard = stale.dataset.cardId!;
    const next = (cardShopRotation(Date.now()) + 1) * CARD_SHOP_ROTATION_MS;
    await vi.advanceTimersByTimeAsync(next - Date.now() + 1_000);
    const ores = held();
    press(tab, buyButton(stale));
    await playUntil(tab, () => visible(tab, outcome) && Boolean(outcome.textContent), "the refusal shows");
    expect(cardsHeld(world, ann, staleCard)).toBe(0);
    expect(held()).toEqual(ores);
  }, 60_000);

  it("GEAR-17 the stall sells only at its counter, keeps only this rotation's buys, and a guest's buys follow onto the account", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    giveOres(world, ann, { copper_ore: 500, iron_ore: 500, mithril_ore: 500, adamant_ore: 500, starshard: 500 });
    const rotation = () => cardShopRotation(world.now());
    const buy = (player: ScenarioPlayer, cardId: string) => player.refusal("buyShopCard", { rotation: BigInt(rotation()), cardId });
    const boughtNow = (player: ScenarioPlayer) => [...world.db.playerCardShopPurchase.identity.filter(player.identity)].flatMap((row: any) => row.cardIds);
    const [a] = cardShopOffer(rotation());
    // Away from the counter, or not in Town, nothing is sold.
    standAt(world, ann, { ...TOWN_SPOTS.cardSeller, x: TOWN_SPOTS.cardSeller.x + 400 });
    expect(buy(ann, a)).not.toBeNull();
    standAt(world, ann, { ...TOWN_SPOTS.cardSeller, mapId: "crystal_hollows" });
    expect(buy(ann, a)).not.toBeNull();
    standAt(world, ann, TOWN_SPOTS.cardSeller);
    expect(buy(ann, a)).toBeNull();
    // The next rotation keeps only its own buys.
    world.advance(CARD_SHOP_ROTATION_MS);
    const [c] = cardShopOffer(rotation());
    expect(buy(ann, c)).toBeNull();
    expect(boughtNow(ann)).toEqual([c]);
    // Signed in, the guest's buy this rotation still counts on the account.
    const account = signInAs(world, ann, "Ann's account");
    expect(boughtNow(account)).toEqual([c]);
    expect(boughtNow(ann)).toEqual([]);
  });
});

describe("looks", () => {
  it("GEAR-19 a look changes what others see but never the stats; a hand look shows on any weapon; hidden hides without unequipping", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    wear(world, ann, "rare_light_helmet", "equippedHead");
    wear(world, ann, "crude_bow", "equippedRightHand");
    giveItems(world, ann, "crude_light_helmet", "crude_sword");
    giveGems(world, ann, 1_000);
    ann.call("convertItemToCosmetic", { itemId: "crude_light_helmet" });
    ann.call("convertItemToCosmetic", { itemId: "crude_sword" });
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    // What everyone else is sent about Ann, and her power.
    const seen = () => world.db.player.identity.find(ann.identity)!;
    const power = seen().powerLevel;
    expect([seen().headItem, seen().rightHandItem]).toEqual(["rare_light_helmet", "crude_bow"]);
    tab.tap("inventoryBtn");
    tab.tap("inventoryCosmeticsTab");
    const useLook = (itemId: string) => {
      press(tab, bagItems(tab).find(item => item.itemId === itemId)!.node);
      press(tab, tab.element("itemInspectionPanel").querySelector("[class*=action] button"));
    };

    // Hidden: the helmet is not drawn, yet it is still worn and still counts.
    tab.tap("equippedHeadSlot");
    await playUntil(tab, () => seen().headItem === "", "the helmet is hidden");
    expect(ann.progress().equippedHead).toBe("rare_light_helmet");
    expect(seen().powerLevel).toBe(power);

    // A helmet look over it: drawn for everyone, stats from the helmet under it.
    useLook("crude_light_helmet");
    await playUntil(tab, () => seen().headItem === "crude_light_helmet", "the look is drawn");
    expect(ann.progress().equippedHead).toBe("rare_light_helmet");
    expect(seen().powerLevel).toBe(power);
    // The profile shows the look on the Cosmetics tab and the helmet under it on the Equipment tab.
    expect(tab.element("equippedHeadSlot").dataset.itemId).toBe("crude_light_helmet");
    tab.tap("inventoryEquipmentTab");
    expect(wornItems(tab).head).toBe("rare_light_helmet");
    tab.tap("inventoryCosmeticsTab");

    // A sword's look worn over a bow is drawn, but the bow is still what she fights with.
    useLook("crude_sword");
    await playUntil(tab, () => seen().rightHandItem === "crude_sword", "the sword look is drawn over the bow");
    expect(ann.progress().cosmeticRightHand).toBe("crude_sword");
    expect(ann.progress().equippedRightHand).toBe("crude_bow");
    expect(seen().powerLevel).toBe(power);
  }, 60_000);
});

describe("the Diamond Galaxy set", () => {
  it("GEAR-20 shows while a Diamond membership lends it, survives a reload, goes when it lapses, and is never sold or destroyed", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    const patreon = (validForMs: number) => world.setup(ctx => {
      const now = world.now(), row = ctx.db.patreonLink.identity.find(ann.identity);
      const next = { identity: ann.identity, userId: "1", accessToken: "access", refreshToken: "refresh", tier: "diamond", frame: "none", validUntilMs: now + validForMs, checkedAtMs: now, attemptedAtMs: now };
      if (row) ctx.db.patreonLink.identity.update({ ...row, ...next }); else ctx.db.patreonLink.insert(world.storage.row("patreonLink", next));
    });
    patreon(24 * 3_600_000);
    giveItems(world, ann, "crude_light_helmet");
    ann.disconnect();
    let tab = await playAs(world, "Ann");
    const seen = () => world.db.player.identity.find(ann.identity)!;
    tab.tap("inventoryBtn");
    tab.tap("inventoryCosmeticsTab");
    const armor = () => bagItems(tab).find(item => item.itemId === DIAMOND_GALAXY_ARMOR);
    await playUntil(tab, () => Boolean(armor()), "the lent set shows among the looks");

    // Worn: everyone sees it; it was lent, so it is not in the bag and has nothing to sell or salvage.
    press(tab, armor()!.node);
    const actions = [...tab.element("itemInspectionPanel").querySelectorAll<HTMLButtonElement>("[class*=action] button")];
    expect(actions).toHaveLength(1);
    press(tab, actions[0]);
    await playUntil(tab, () => seen().chestItem === DIAMOND_GALAXY_ARMOR, "others see the Diamond armor");
    expect(serverBag(ann)).not.toContain(DIAMOND_GALAXY_ARMOR);
    expect(tab.network.players.get("Ann")!.refusal("destroyEquipment", { itemId: DIAMOND_GALAXY_ARMOR })).not.toBeNull();

    // A reload: while the membership loads, the game does not save the look off.
    tab = await tab.reload();
    await playUntil(tab, tab.playing, "back in the world", 20_000);
    await tab.play(3_000);
    expect(ann.progress().cosmeticChest).toBe(DIAMOND_GALAXY_ARMOR);
    expect(seen().chestItem).toBe(DIAMOND_GALAXY_ARMOR);

    // The membership lapses: the next save the game makes (here, putting on a helmet) takes the look off.
    patreon(-1);
    deliverRows(tab);
    tab.tap("inventoryBtn");
    tab.tap("inventoryEquipmentTab");
    press(tab, bagItems(tab).find(item => item.itemId === "crude_light_helmet")!.node);
    press(tab, tab.element("itemInspectionPanel").querySelector("[class*=action] button"));
    await playUntil(tab, () => ann.progress().cosmeticChest === "", "the lapsed look is taken off", 20_000);
    expect(seen().chestItem).not.toBe(DIAMOND_GALAXY_ARMOR);
  }, 60_000);

  it("GEAR-20 the server keeps the set only on a Diamond member: not a Gold one, not a player without a membership", () => {
    const world = scenarioWorld();
    const wearSet = (player: ScenarioPlayer) => {
      player.call("savePlayerProgress", { ...player.progress(), cosmeticChest: DIAMOND_GALAXY_ARMOR, enemyKills: 0 });
      return player.progress().cosmeticChest;
    };
    const member = (player: ScenarioPlayer, tier: string) => world.setup(ctx => ctx.db.patreonLink.insert(world.storage.row("patreonLink", {
      identity: player.identity, userId: player.hex.slice(0, 8), accessToken: "access", refreshToken: "refresh", tier, frame: "none",
      validUntilMs: world.now() + 3_600_000, checkedAtMs: world.now(), attemptedAtMs: world.now() })));
    const diamond = world.join("Dia"), gold = world.join("Goldie"), none = world.join("Nobody");
    member(diamond, "diamond");
    member(gold, "gold");
    expect([wearSet(diamond), wearSet(gold), wearSet(none)]).toEqual([DIAMOND_GALAXY_ARMOR, "", ""]);
    expect(serverBag(diamond)).not.toContain(DIAMOND_GALAXY_ARMOR);
  });
});

describe("weapon schools", () => {
  it("GEAR-21 a school shows the Mastery the server holds and follows it as it grows, up to the top level", async () => {
    const world = gameWorld();
    const ann = world.join("Ann");
    standAt(world, ann, TOWN_SPOTS.school("archery"));
    setMastery(world, ann, "archery", 3);
    world.setup(ctx => grantMasteryPoints(ctx as never, ann.identity, "archery", 10));
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const school = () => windowTitled(tab, "schoolWindowTitle");
    await playUntil(tab, () => Boolean(school()), "the Archery Range opens");
    const bar = () => {
      const node = school()!.querySelector("[role=progressbar]")!;
      return [Number(node.getAttribute("aria-valuenow")), Number(node.getAttribute("aria-valuemax"))];
    };
    const points = () => Number(world.setup(ctx => weaponMasteryPoints(ctx as never, ann.identity)).archery);
    const expected = () => {
      let level = 0;
      while (level < MASTERY_MAX_LEVEL && masteryPointsForLevel(level + 1) <= points()) level++;
      return level >= MASTERY_MAX_LEVEL ? [1, 1] : [points() - masteryPointsForLevel(level), masteryPointsForLevel(level + 1) - masteryPointsForLevel(level)];
    };
    expect(bar()).toEqual(expected());
    expect(bar()[0]).toBe(10);

    // Mastery earned while the window is open moves the bar, past a level too.
    world.setup(ctx => grantMasteryPoints(ctx as never, ann.identity, "archery", masteryPointsForLevel(5) - points() + 7));
    deliverRows(tab);
    await playUntil(tab, () => bar()[0] === 7, "the bar follows the server");
    expect(bar()).toEqual(expected());
    // At the top level the bar is full.
    world.setup(ctx => grantMasteryPoints(ctx as never, ann.identity, "archery", masteryPointsForLevel(MASTERY_MAX_LEVEL)));
    deliverRows(tab);
    await playUntil(tab, () => bar()[0] === 1 && bar()[1] === 1, "the bar is full at the top");
  }, 60_000);
});
