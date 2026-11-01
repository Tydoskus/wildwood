import type { DbConnection } from "../../module_bindings";
import { createOfflineProgressPreference } from "./offline-progress-watch";
import { createBowSkills } from "./bow-skills";
import { createAdGemReward } from "./ad-gem-reward";
import { createChatMute } from "./chat-mute";
import { createRunTimingRows } from "./run-timing-service";
import { createArrowRows } from "./arrow-service";
import { createSoulDimensionRows } from "./soul-dimension-service";
import { createGuildHallRows } from "./guild-hall-service";
import { createItemRefineRows } from "./item-refine-service";
import { createMiningRows } from "./mining-service";
import { createWoodcuttingRows } from "./woodcutting-service";
import type { GatherClock } from "./gather-queue";
import { monotonicNowMs, wallClockNowMs } from "../../app/trusted-clock";
import { createCardRows } from "./card-service";
import { createCardShopRows } from "./card-shop-service";
import { createBuildRows } from "./build-service";
import { createWeaponMasteryRows } from "./weapon-mastery-service";
import { createGoldRows } from "./gold-service";
import { createExchangeRows } from "./exchange-service";
import { createCraftingRows } from "./crafting-service";
import { createToolRows } from "./tool-service";
import { createItemCollectionRows } from "./item-collection-service";
import { createStarterChestRows } from "./starter-chest-service";
import { createServerBoostRows } from "./server-boost-service";
import { createChatAnnouncementRows } from "./chat-announcement-service";
import { itemLevelParts, type ItemLevel } from "../../../shared/items";
import { NO_CARDS, cardStatFactors, cardTotals, type CardTotals } from "../../../shared/card-effects";
import { BASE_CARD_SLOTS, activeCardSlots, activeCardsInPlay, type ActiveCardSlots, type ActiveCards } from "../../../shared/active-cards";
import type { OreId } from "../../../shared/refine";

type Ores = Readonly<Partial<Record<OreId, number>>>;
/** The server's ores with the ones from breaks it has not answered yet; the server's own object while there are none. */
function oresWithPending(server: Ores, ...pending: Ores[]): Ores {
  if (pending.every(part => !Object.keys(part).length)) return server;
  const sum: Partial<Record<OreId, number>> = { ...server };
  for (const part of pending) for (const [oreId, count] of Object.entries(part)) sum[oreId as OreId] = (sum[oreId as OreId] ?? 0) + (count ?? 0);
  return sum;
}

type ServerClockSource = { api: { serverNowMs: () => number }; tables: { observeServerTime: (serverAtMs: number) => void } };
/** The gathering reports' clock on the session's presence (presence-service.ts), read when used: presence is made later. */
export function presenceGatherClock(presence: () => ServerClockSource | undefined): GatherClock {
  return {
    serverNowMs: () => presence()?.api.serverNowMs() ?? wallClockNowMs(),
    monotonicNowMs,
    observeServerTime: serverAtMs => presence()?.tables.observeServerTime(serverAtMs),
  };
}

/** The active card slots for the perks in play, worked out again only when the perks change. */
export function keptCardSlots(perks: () => Parameters<typeof activeCardSlots>[0]): () => ActiveCardSlots {
  let slotsFor: Parameters<typeof activeCardSlots>[0] = null, slots = activeCardSlots(null);
  return () => {
    const ranks = perks();
    if (ranks !== slotsFor) { slotsFor = ranks; slots = activeCardSlots(ranks); }
    return slots;
  };
}

/**
 * The account's own small rows, each read through a caller-scoped view and
 * followed for as long as the connection is current: the offline-progress
 * opt-out, the bow skill rolls with their copies and loot settings, the
 * rewarded ad's Gem claims, the automatic chat mute and the Soul Dimension's
 * rows (soul stats, kills by reward type, whether it is open) and the guild
 * hall's fund and levels, each item's refine with the ores it costs, mining, woodcutting (with breaks not yet sent), cards, the Card Seller's buys, Weapon Mastery, gold, the Trade Chrysanthemum, crafting, tools, the Starter Chest and the Server Boost. They share one
 * lifecycle, so the connection starts them together and the coop API serves
 * them together.
 */
export function createAccountRowServices(connection: () => DbConnection | null, notify: () => void, slotTierFor: (itemId: string) => number = () => 0,
  /** Active card slots of each type in play (Card Slots perks). */
  cardSlots: () => ActiveCardSlots = () => BASE_CARD_SLOTS,
  /** The server clock the gathering reports' times are read against. */
  gatherClock?: GatherClock) {
  const offlinePreference = createOfflineProgressPreference(connection, notify);
  const bowSkills = createBowSkills(notify);
  const adGemReward = createAdGemReward(notify);
  const chatMute = createChatMute(notify);
  const runTiming = createRunTimingRows(notify);
  const soulDimension = createSoulDimensionRows(connection, notify);
  const guildHall = createGuildHallRows(connection, notify);
  const itemRefine = createItemRefineRows(notify, slotTierFor);
  const arrows = createArrowRows(connection, notify, () => itemRefine.api.ores());
  // The Server Boost doubles wood and ore, so the gathering rows read it for what a break shows.
  const serverBoost = createServerBoostRows(notify, () => gatherClock?.serverNowMs() ?? wallClockNowMs());
  const mining = createMiningRows(notify, gatherClock, serverBoost.gatherMultiplierAt);
  const woodcutting = createWoodcuttingRows(notify, gatherClock, serverBoost.gatherMultiplierAt);
  const chatAnnouncements = createChatAnnouncementRows(notify);
  const cards = createCardRows(notify);
  const cardShop = createCardShopRows(notify);
  const builds = createBuildRows(notify);
  const weaponMastery = createWeaponMasteryRows(notify);
  const gold = createGoldRows(notify);
  const exchange = createExchangeRows(notify);
  const crafting = createCraftingRows(notify);
  const tools = createToolRows(notify);
  const collection = createItemCollectionRows(notify);
  const starterChest = createStarterChestRows(notify);
  // The active cards in play, added up again only when the cards or the slots are replaced (read many times a frame).
  let activeFrom: ActiveCards | null = null, activeSlots: ActiveCardSlots | null = null;
  let active: { ids: readonly string[]; totals: CardTotals; stats: ReturnType<typeof cardStatFactors> } = { ids: [], totals: NO_CARDS, stats: cardStatFactors(NO_CARDS) };
  const activeCards = () => {
    const from = cards.api.activeCards(), slots = cardSlots();
    if (from === activeFrom && slots === activeSlots) return active;
    activeFrom = from; activeSlots = slots;
    const ids = activeCardsInPlay(from, slots);
    if (ids.join(",") !== active.ids.join(",")) {
      const totals = cardTotals(ids);
      active = { ids, totals, stats: cardStatFactors(totals) };
    }
    return active;
  };
  // Breaks made here go out ahead of any call whose server check reads ores or bag room, so it counts them.
  const flushGathering = () => { mining.api.flushMining(); woodcutting.api.flushWoodcutting(); arrows.flush(); };
  const afterGathering = <A extends unknown[], R>(call: (...args: A) => R) => (...args: A): R => { flushGathering(); return call(...args); };
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("pagehide", flushGathering);
    document.addEventListener("visibilitychange", () => { if (document.hidden) flushGathering(); });
  }
  let oreParts: Ores[] = [], ores: Ores = {};
  const oresHeld = () => {
    const parts = [itemRefine.api.ores(), mining.pendingOres(), woodcutting.pendingOres(), arrows.pendingOres()];
    if (parts.some((part, index) => part !== oreParts[index])) { oreParts = parts; ores = oresWithPending(parts[0], parts[1], parts[2], parts[3]); }
    return ores;
  };
  return {
    watch(current: DbConnection, isCurrent: () => boolean) {
      offlinePreference.watch(current, isCurrent);
      bowSkills.watch(current, isCurrent);
      adGemReward.watch(current, isCurrent);
      chatMute.watch(current, isCurrent);
      runTiming.watch(current, isCurrent);
      soulDimension.watch(current, isCurrent);
      guildHall.watch(current, isCurrent);
      itemRefine.watch(current, isCurrent);
      arrows.watch(current, isCurrent);
      mining.watch(current, isCurrent);
      woodcutting.watch(current, isCurrent);
      cards.watch(current, isCurrent);
      cardShop.watch(current, isCurrent);
      builds.watch(current, isCurrent);
      weaponMastery.watch(current, isCurrent);
      gold.watch(current, isCurrent);
      exchange.watch(current, isCurrent);
      crafting.watch(current, isCurrent);
      tools.watch(current, isCurrent);
      collection.watch(current, isCurrent);
      starterChest.watch(current, isCurrent);
      serverBoost.watch(current, isCurrent);
      chatAnnouncements.watch(current, isCurrent);
    },
    api: {
      ...offlinePreference.api,
      ...bowSkills.api,
      ...adGemReward.api,
      ...chatMute.api,
      ...runTiming.api,
      ...soulDimension.api,
      ...guildHall.api,
      ...itemRefine.api,
      ...arrows.api,
      ...mining.api,
      ...woodcutting.api,
      ...cards.api,
      ...cardShop.api,
      ...builds.api,
      ...weaponMastery.api,
      ...gold.api,
      ...exchange.api,
      ...crafting.api,
      ...tools.api,
      ...collection.api,
      ...starterChest.api,
      ...serverBoost.api,
      ...chatAnnouncements.api,
      /** Ores held, by kind, with those from breaks the server has not answered yet. */
      ores: oresHeld,
      flushGathering,
      refineItem: afterGathering(itemRefine.api.refineItem),
      destroyOre: afterGathering(itemRefine.api.destroyOre),
      buyGradeGear: afterGathering(mining.api.buyGradeGear),
      craftGradeItem: afterGathering(crafting.api.craftGradeItem),
      reforgeWeapon: afterGathering(crafting.api.reforgeWeapon),
      upgradeTool: afterGathering(tools.api.upgradeTool),
      buyShopCard: afterGathering(cardShop.api.buyShopCard),
      claimStarterWeapon: afterGathering(starterChest.api.claimStarterWeapon),
      placeExchangeOffer: afterGathering(exchange.api.placeExchangeOffer),
      collectExchange: afterGathering(exchange.api.collectExchange),
      fallIntoWell: afterGathering(soulDimension.api.fallIntoWell),
      /** An item's slot tier and refine (items.ts ItemLevel). */
      itemLevel: (itemId: string): ItemLevel => itemLevelParts(itemRefine.api.itemLevel(itemId)),
      /** The active card slots of each type in play. */
      cardSlots,
      /** The active cards that count now: each type's first slots in play. */
      activeCardIds: () => activeCards().ids,
      /** Those cards added up (card-effects.ts). */
      activeCardTotals: () => activeCards().totals,
      /** What they do to stats (card-effects.ts cardStatFactors). */
      activeCardStats: () => activeCards().stats,
    },
  };
}
