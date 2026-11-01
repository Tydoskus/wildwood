// DOM scenes: the game's own index.html markup and stylesheets, filled by the game's own UI code.
import { renderInventoryView, renderPlayerHud } from "../../src/ui/hud";
import { ITEM_DEFINITIONS, type InventoryState } from "../../src/game/inventory";
import { itemPresentation } from "../../src/game/item-presentation";
import { createInventoryCharacterPreview } from "../../src/game/runtime/inventory-character-preview";
import { bindPlayerNameTags } from "../../src/app/player-name-tags";
import { applyProfileIcon } from "../../src/app/profile-icons";
import { GEAR_GRADES, GEAR_GRADE_NAMES } from "../../shared/gear-grades";
import { isGradeItemId, gradeOf } from "../../shared/grade-equipment";
import { PLAYER_GENDER_MALE } from "../../shared/player-gender";
import { craftExperienceForLevel } from "../../shared/crafting";
import { createSmithController } from "../../src/ui/smith-window";
import { createPrestigeRunsTab } from "../../src/ui/prestige-runs-tab";
import { installPrestigeTabs } from "../../src/ui/prestige-challenge-panel";
import { createGearSellerController, type GearSellerDeps } from "../../src/ui/gear-seller-window";
import { renderProfileGuild } from "../../src/ui/profile-guild";
import { createProfileActionsMenu } from "../../src/ui/profile-actions-menu";
import { createGemShopController } from "../../src/ui/gem-shop-controller";
import { markChatAnnouncement } from "../../src/ui/chat-announcement-line";
import { createDiamondLookDrawer } from "../../src/game/runtime/diamond-look-preview";
import { installServerBoostHud } from "../../src/ui/server-boost-hud";
import { createHudArrowChip } from "../../src/ui/hud-arrow-chip";
import { createExchangeController } from "../../src/ui/exchange-window";
import { appendBagTileContents } from "../../src/ui/bag-item-tile";
import { createItemInspectionController } from "../../src/ui/item-inspection-controller";
import { gradeShopSalePrice } from "../../shared/grade-shop";
import { settleFrames, settleImages } from "./determinism";
import { GROUND, playerAppearance } from "./world";
import { createBuildsTab } from "../../src/ui/builds-tab";
import { itemDisplayName } from "../../shared/items";
import { itemInspectionButtonLabel } from "../../src/ui/item-inspection-controller";
import { installQuestTracker } from "../../src/ui/quest-tracker";
import { installDpsBreakdown } from "../../src/ui/dps-breakdown";
import { createOfflineProgressSummary } from "../../src/ui/offline-progress-summary";
import { questTrackerView } from "../../src/ui/quest-board-controller";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { CARDS } from "../../shared/cards";
import { createMapGuideController } from "../../src/ui/map-guide-controller";
import { createGameBootstrap } from "../../src/game/runtime/game-bootstrap";
import { mapWorldLayout } from "../../src/game/map-layout";
import { mapArtReady, sharedAssets } from "./game-world";
import { TOWN_ARRIVAL } from "../../shared/town";

let markup: Promise<Document> | null = null;

/** public/index.html, parsed (scripts never run), with its stylesheets added to this page. */
async function gameMarkup() {
  markup ??= (async () => {
    const response = await fetch("index.html");
    if (!response.ok) throw new Error(`index.html: ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    const loads: Promise<unknown>[] = [];
    for (const node of doc.head.querySelectorAll("style, link[rel=stylesheet]")) {
      const copy = document.importNode(node, true) as HTMLElement;
      if (copy instanceof HTMLLinkElement) loads.push(new Promise((resolve, reject) => {
        copy.addEventListener("load", resolve, { once: true });
        copy.addEventListener("error", () => reject(new Error(`stylesheet ${copy.href}`)), { once: true });
      }));
      document.head.append(copy);
    }
    await Promise.all(loads);
    return doc;
  })();
  return markup;
}

async function importById(id: string) {
  const doc = await gameMarkup();
  const source = doc.getElementById(id);
  if (!source) throw new Error(`index.html has no #${id}`);
  const element = document.importNode(source, true) as HTMLElement;
  // Relative asset paths resolve against this page, as they do against the game's.
  document.body.append(element);
  return element;
}

const byId = <T extends HTMLElement = HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
};

/** Waits for every CSS background and mask image on the page, which the image tracker does not see. */
async function settleCssImages() {
  const urls = new Set<string>();
  for (const element of document.querySelectorAll<HTMLElement>("*")) {
    for (const pseudo of [null, "::before", "::after"]) {
      const style = getComputedStyle(element, pseudo);
      for (const value of [style.backgroundImage, style.maskImage, style.getPropertyValue("-webkit-mask-image")]) {
        for (const match of value.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(match[1]);
      }
    }
  }
  await Promise.all([...urls].map(url => {
    const image = new Image();
    image.src = url;
    return image.decode().catch(() => {});
  }));
  await document.fonts.ready;
  await settleImages();
  await settleFrames();
}

const BAG_REFINE_SAMPLE_GRADES = new Set<string>([GEAR_GRADES[0], GEAR_GRADES[5], GEAR_GRADES[9], GEAR_GRADES[GEAR_GRADES.length - 1]]);

/**
 * The inventory window open on a full bag: every item with bag art, and for a few grades each graded piece
 * again at ★10 and ★20 (kept copies carry their own refine). The window is unpinned from the viewport
 * so the whole bag lands in one full-page capture.
 */
async function icons() {
  // The window alone: no stylesheet rule depends on where it sits in the HUD.
  const hudElement = await importById("hud");
  const panel = hudElement.querySelector<HTMLElement>("#inventoryPanel")!;
  document.body.append(panel);
  hudElement.remove();
  panel.hidden = false;
  const unpin = document.createElement("style");
  unpin.textContent = `
    html, body { position: static !important; height: auto !important; overflow: visible !important; }
    .card.inventory-panel { position: relative !important; inset: auto !important; min-height: 100vh; overflow: visible !important; }
    .inventory-panel .inventory-scroll, .inventory-panel .inventory-content { overflow: visible !important; max-height: none !important; }
  `;
  document.head.append(unpin);
  const items = Object.keys(ITEM_DEFINITIONS).filter(id => itemPresentation(id)?.inventory.source);
  const inventory: InventoryState = {
    itemIds: items, cosmeticItemIds: [],
    equippedHead: "legendary_heavy_helmet", equippedChest: "legendary_heavy_armor", equippedFeet: "legendary_warrior_boots",
    equippedRightHand: "legendary_bow", equippedLeftHand: "",
    cosmeticHead: "", cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "",
  };
  const copies = items.filter(id => isGradeItemId(id) && BAG_REFINE_SAMPLE_GRADES.has(gradeOf(id)!))
    .flatMap((itemId, index) => [{ id: BigInt(index * 2 + 1), itemId }, { id: BigInt(index * 2 + 2), itemId }]);
  const refineLevel = (_itemId: string, copyId = 0n) => copyId === 0n ? 0 : copyId % 2n ? 10 : 20;
  renderInventoryView({
    items: byId("inventoryItems"), count: byId("inventoryCount"),
    equippedHead: byId("equippedHeadSlot"), equippedChest: byId("equippedChestSlot"),
    equippedFeet: byId("equippedFeetSlot"), equippedRightHand: byId("equippedRightHandSlot"),
  }, { ...inventory, selectedItemId: "" }, "EQUIPMENT", {
    onInspect: () => {}, upgradeLevel: () => 0, slotTier: () => 7, refineLevel, slotCapacity: items.length + copies.length,
    copies, nextSlotCost: 150n,
    ores: { iron_ore: 12, pine_log: 900, steel_arrow: 1_240, fire_arrow: 80, piercing_arrow: 12_500 }, nockedArrow: "steel_arrow",
  });
  const preview = createInventoryCharacterPreview(byId<HTMLCanvasElement>("inventoryCharacterCanvas"), await playerAppearance());
  const drawPreview = () => preview.draw({ visible: true, inventory, skinTone: 2, power: 54_321 });
  drawPreview();
  await settleCssImages();
  drawPreview();
  await settleFrames();
}

/** The in-game HUD over plain ground: player card, toolbar icons, gem wallet, minimap and chat. */
async function hud() {
  document.body.style.background = GROUND;
  await importById("hud");
  bindPlayerNameTags({ prefix: () => "[TheG]", revision: () => 0, prestigeLevel: () => 4 });
  renderPlayerHud({
    hpFill: byId("hpFill"), hpText: byId("hpText"), playerName: byId("playerName"), playerPower: byId("playerPower"),
    coopStatus: byId("coopStatus"), minimapPlayers: byId("minimapPlayers"),
  }, { hp: 840, maxHp: 1_200 }, "Rymel", 12, 12_345, false, PLAYER_GENDER_MALE, "p-local", false);
  byId("hudGemBalance").textContent = "1,250";
  applyProfileIcon(byId("playerHudProfileIcon"), 0);
  await settleCssImages();
}

/** The HUD corner as the game builds it: gems, gold and the nocked arrow chip with a bow in hand. */
async function hudArrow() {
  const doc = await gameMarkup();
  document.body.style.background = GROUND;
  for (const node of doc.body.children) document.body.append(document.importNode(node, true));
  await import("../../src/ui/game-shell");
  byId("start").remove();
  byId("hudGemBalance").textContent = "1,250";
  byId("hudGoldBalance").textContent = "8,420";
  createHudArrowChip({ weapon: () => "rare_bow", nocked: () => "fire_arrow", held: () => 1_240, open: () => {} })();
  await settleCssImages();
}

/** The Prestige window's Runs tab: a run under way with splits against the bests, and past runs, one opened. */
async function prestigeRuns() {
  const doc = await gameMarkup();
  document.body.style.background = GROUND;
  for (const node of doc.body.children) document.body.append(document.importNode(node, true));
  await import("../../src/ui/game-shell");
  byId("start").remove();
  byId("prestigeLevel").textContent = "PRESTIGE 6";
  byId("prestigeOverlay").hidden = false;
  installPrestigeTabs(document).select("prestigeRunsTabBtn");
  const min = 60_000, splits = (...minutes: number[]) => ["tutorial_forest", "beginner_desert", "intermediate_snowlands", "advanced_lava_wastes", "infernal_depths", "endless_1"]
    .slice(0, minutes.length).map((mapId, index) => ({ mapId, playedMs: minutes[index] * min }));
  const history = [
    { prestige: 3, playedMs: 600 * min, wholeRun: false, bossClears: splits(), endedAtMs: 1 },
    { prestige: 4, playedMs: 402 * min + 17_000, wholeRun: true, bossClears: splits(9, 31, 74, 160, 251, 402), endedAtMs: 2 },
    { prestige: 5, playedMs: 371 * min + 5_000, wholeRun: true, bossClears: splits(8, 29, 70, 151, 240, 371), endedAtMs: 3 },
  ];
  createPrestigeRunsTab({ container: byId("prestigeRunsTab"), history: () => history,
    timing: () => ({ prestige: 6, wholeRun: true, runPlayedMs: 164 * min + 42_000, bossClears: splits(7.5, 30.2, 66, 158) }) }).render();
  byId("prestigeRunsTab").querySelector("details")?.setAttribute("open", "");
  await settleCssImages();
}

/** Settings with "time" typed in its search: matching rows from every tab, under each tab's name. */
async function settingsSearch() {
  const doc = await gameMarkup();
  document.body.style.background = GROUND;
  for (const node of doc.body.children) document.body.append(document.importNode(node, true));
  await import("../../src/ui/game-shell");
  byId("start").remove();
  const panel = byId("settingsPanel");
  panel.hidden = false;
  const input = panel.querySelector<HTMLInputElement>(".settings-search input")!;
  input.value = "time";
  input.dispatchEvent(new Event("input"));
  await settleCssImages();
}

/** The Guild Hall window as a President sees it, part-way through the upgrades, with each one's bonus. */
async function guildHallWindow() {
  await gameMarkup();
  document.body.style.background = GROUND;
  const { createGuildHallWindow } = await import("../../src/ui/guild-hall-window");
  const levels = { table: 2, size: 1, banners: 0, hearth: 2, trophies: 1, lights: 0, courtyard: 1 };
  createGuildHallWindow({
    state: () => ({ guild: { name: "Wild Ones", emblem: 3, canUpgrade: true }, fund: 420, levels, inHall: false }),
    upgrade: async () => true, enter: async () => true, pause: () => {},
  }).open();
  await settleCssImages();
}

/** The start screen's wordmark and choice panel, as a new visitor first sees them. */
async function wordmark() {
  await importById("start");
  await settleCssImages();
}

/**
 * The Smith on each of Craft (gear, then an arrow picked), Reforge and Refine, the Weapon Seller on Sell and the Armor
 * Seller on Buy, filled by their own window code from fake rows. Each window keeps its real size, so its pinned detail
 * and grid show as in the game; they are stacked so one full-page capture shows all six.
 */
async function shops() {
  await gameMarkup();
  document.body.style.background = GROUND;
  const unpin = document.createElement("style");
  unpin.textContent = `
    html, body { position: static !important; height: auto !important; overflow: visible !important; }
    dialog.farm-sheet[open] { position: relative !important; inset: auto !important; margin: 12px auto !important; }
  `;
  document.head.append(unpin);
  const ores = { pine_log: 900, oak_log: 40, copper_ore: 300, iron_ore: 12, starshard: 5, steel_arrow: 1_240, fire_arrow: 80 };
  const bow = { arrowStorm: 3.1, ricochet: 1.2, piercingShot: 0 }, sword = { whirlwind: 2, deflect: 0, shockwave: 1.5 };
  const done = async () => ({ ok: true });
  const held = [
    { itemId: "rare_bow", copyId: 0n, equipped: true },
    { itemId: "rare_bow", copyId: 7n, equipped: false },
    { itemId: "fine_sword", copyId: 0n, equipped: false },
    { itemId: "rare_light_helmet", copyId: 0n, equipped: true },
    { itemId: "fine_light_armor", copyId: 0n, equipped: true },
    { itemId: "common_ranger_boots", copyId: 0n, equipped: true },
  ];
  // Craft twice: once on the gear, once with Fire Arrow picked.
  for (const view of ["craft", "craft", "reforge", "refine"] as const) {
    createSmithController({
      inTown: () => true, items: () => held, refineLevel: (_itemId, copyId) => copyId ? 2 : 7, slotTier: () => 3, ores: () => ores, refine: done,
      refineFails: () => 3,
      showMessage: () => {},
      craft: {
        craftSkills: () => ({ fletching: BigInt(craftExperienceForLevel(24)), smithing: BigInt(craftExperienceForLevel(6)) }),
        ores: () => ores, masteryLevels: () => ({ archery: 20 }), bagFull: () => false, craft: done, craftArrows: done,
        weapons: () => [
          { itemId: "rare_bow", copyId: 0n, equipped: true, roll: bow },
          { itemId: "rare_bow", copyId: 7n, equipped: false, roll: { arrowStorm: 0, ricochet: 2, piercingShot: 0.8 } },
          { itemId: "fine_sword", copyId: 0n, equipped: false, roll: sword },
        ],
        refineLevel: (_itemId, copyId) => copyId ? 2 : 7, reforge: done, showMessage: () => {},
      },
    }).open(view);
  }
  // One grade step on the gear: every line follows it, past Smithing's level for the sword.
  document.querySelector<HTMLElement>('.smith-sheet [data-view="craft"] .craft-grade-step[aria-label="Lower Grade"]')?.click();
  const arrowSmith = document.querySelectorAll<HTMLElement>(".smith-sheet")[1];
  arrowSmith?.querySelector<HTMLElement>('.station-arrows [data-item-id="fire_arrow"]')?.click();
  try { localStorage.setItem("wildstat.gearSellerView.weapons", "sell"); localStorage.setItem("wildstat.gearSellerView.armor", "buy"); } catch { /* the default views */ }
  const seller: GearSellerDeps = {
    inTown: () => true, showMessage: () => {}, gold: () => 12_480n, masteryLevels: () => ({ archery: 20 }),
    heldItems: () => ["rare_bow", "fine_sword", "rare_light_helmet"], bagFull: () => false, buyGear: done,
    worn: () => ({ equippedRightHand: "rare_bow", equippedHead: "rare_light_helmet" }), slotTier: () => 3,
    refineLevel: (_itemId, copyId) => copyId ? 2 : 7,
    items: () => [
      { itemId: "rare_bow", copyId: 0n, equipped: true, roll: bow },
      { itemId: "rare_bow", copyId: 7n, equipped: false, roll: { arrowStorm: 0, ricochet: 2, piercingShot: 0.8 } },
      { itemId: "fine_sword", copyId: 0n, equipped: false, roll: sword },
      { itemId: "crude_staff", copyId: 0n, equipped: false, roll: null },
    ],
    locked: (_itemId, copyId) => copyId === 7n, sell: done,
  };
  createGearSellerController("weapons", seller).open();
  createGearSellerController("armor", seller).open();
  for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog[open]")) { dialog.close(); dialog.show(); }
  await settleCssImages();
  // The arrow's grid sits under the gear's: scrolled to it.
  const scroll = arrowSmith?.querySelector<HTMLElement>('[data-view="craft"] .station-scroll');
  const heading = scroll?.querySelector<HTMLElement>(".station-subhead");
  if (scroll && heading) scroll.scrollTop += heading.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 4;
}

/** The gem Shop on the web: the Patreon rows and the dev note with its three frames and the Diamond Galaxy set. */
async function gemShop() {
  await gameMarkup();
  document.body.style.background = GROUND;
  const assets = await playerAppearance();
  const button = document.createElement("button");
  document.body.append(button);
  createGemShopController({ button, setOpen: () => {}, drawDiamondLook: createDiamondLookDrawer(assets) }).open();
  await settleCssImages();
}

/**
 * The profile window's header from the game shell's own markup: the name, online line and guild row,
 * the pencil on your own and the ⋯ button on anyone else's. The stats and preview stay empty.
 */
async function profileWindow(own: boolean) {
  const doc = await gameMarkup();
  document.body.style.background = GROUND;
  for (const node of doc.body.children) document.body.append(document.importNode(node, true));
  await import("../../src/ui/game-shell");
  byId("playerProfile").hidden = false;
  byId("playerProfileName").textContent = own ? "Rymel" : "Moss";
  const presence = byId("playerProfilePresence");
  presence.textContent = "Online - Forest"; presence.classList.add("is-online");
  applyProfileIcon(byId("playerProfileIcon"), own ? 0 : 3);
  renderProfileGuild(byId<HTMLButtonElement>("playerProfileGuild"), "TheG", { id: "1", name: "TheG", emblem: 5 });
  byId("editPlayerNameBtn").hidden = !own;
  byId("settingsBtn").hidden = !own;
  byId("profileMoreBtn").hidden = own;
  byId("profileDuelBtn").hidden = own;
  if (!own) createProfileActionsMenu({ isBlocked: () => false, openSafety: () => {}, showMessage: () => {}, openPrivateChat: () => {} }).open("p-moss", "Moss");
  await settleCssImages();
}

/**
 * The Server Boost: its timer at the top of the column under the minimap, and the Shop's row three ways
 * (a supporter on cooldown during a boost, a supporter ready, a non-supporter), stacked at phone width.
 */
async function serverBoost() {
  await hud();
  const column = document.createElement("div");
  column.className = "hud-timer-column";
  document.querySelector(".minimap-meta")!.append(column);
  installServerBoostHud(() => 14 * 60_000 + 32_000);
  const unpin = document.createElement("style");
  unpin.textContent = `
    html, body { position: static !important; height: auto !important; overflow: visible !important; }
    dialog.gem-shop[open] { position: relative !important; inset: auto !important; height: auto !important; margin: 12px auto !important; }
    dialog.gem-shop .gem-shop-scroll { overflow: visible !important; max-height: none !important; }
  `;
  document.head.append(unpin);
  const done = async () => ({ ok: true });
  const views = [
    { serverBoost: () => ({ remainingMs: 14 * 60_000 + 32_000, supporterName: "Moss", cooldownMs: 22 * 3_600_000 + 5 * 60_000 }), supporterTier: () => "gold" },
    { serverBoost: () => ({ remainingMs: 0, supporterName: "", cooldownMs: 0 }), supporterTier: () => "silver" },
    { serverBoost: () => ({ remainingMs: 0, supporterName: "", cooldownMs: 0 }), supporterTier: () => "none" },
  ];
  for (const view of views) {
    const button = document.createElement("button");
    document.body.append(button);
    createGemShopController({ button, setOpen: () => {}, serverBoost: { ...view, triggerServerBoost: done, localIdentity: () => "p-local" } }).open();
  }
  await settleCssImages();
}

/** The Trade Chrysanthemum's window: a free player's slots, a supporter's, a search with sellers, one with none, an offer. */
async function exchangeWindow() {
  await gameMarkup();
  document.body.style.background = GROUND;
  const unpin = document.createElement("style");
  unpin.textContent = `
    html, body { position: static !important; height: auto !important; overflow: visible !important; }
    body { display: flex !important; flex-wrap: wrap; gap: 12px; align-items: flex-start; padding: 12px; }
    dialog.exchange-sheet[open] { position: relative !important; inset: auto !important; margin: 0 !important; flex: 0 0 345px; }
  `;
  document.head.append(unpin);
  const me = "aa", them = "bb", at = 0, done = async () => ({ ok: true });
  const offers = [
    { id: 1n, identity: them, name: "Moss", nameColor: 7, buy: false, itemId: "copper_ore", price: 12n, quantity: 400, filled: 0, placedAtMs: at },
    { id: 6n, identity: "cc", name: "Oogway", nameColor: 0, buy: false, itemId: "copper_ore", price: 14n, quantity: 90, filled: 0, placedAtMs: at },
    { id: 2n, identity: them, name: "Moss", nameColor: 7, buy: true, itemId: "iron_ore", price: 30n, quantity: 200, filled: 50, placedAtMs: at },
    { id: 3n, identity: "cc", name: "Oogway", nameColor: 0, buy: false, itemId: "iron_ore", price: 33n, quantity: 1_000, filled: 0, placedAtMs: at },
    { id: 4n, identity: me, name: "Me", nameColor: 0, buy: true, itemId: "mithril_ore", price: 95n, quantity: 60, filled: 20, placedAtMs: at },
  ];
  const listings = [
    { id: 1n, identity: them, name: "Moss", nameColor: 7, itemId: "rare_bow", rollJson: JSON.stringify({ arrowStorm: 3.1, ricochet: 1.2 }), refine: 7, price: 25_000n, listedAtMs: at },
    { id: 3n, identity: me, name: "Me", nameColor: 0, itemId: "rare_light_helmet", rollJson: "{}", refine: 3, price: 9_999n, listedAtMs: at },
  ];
  // The price table as the server keeps it from these rows.
  const prices = [...new Set([...offers.map(o => o.itemId), ...listings.map(l => l.itemId)])].map(itemId => {
    const asks = [...offers.filter(o => o.itemId === itemId && !o.buy).map(o => o.price), ...listings.filter(l => l.itemId === itemId).map(l => l.price)];
    const bids = offers.filter(o => o.itemId === itemId && o.buy).map(o => o.price);
    return { itemId, lowestAsk: asks.length ? asks.reduce((a, b) => (b < a ? b : a)) : null, highestBid: bids.length ? bids.reduce((a, b) => (b > a ? b : a)) : null,
      forSale: offers.filter(o => o.itemId === itemId && !o.buy).reduce((n, o) => n + o.quantity - o.filled, 0) + listings.filter(l => l.itemId === itemId).length,
      lastPrice: itemId === "copper_ore" ? 11n : null };
  });
  const collect = [{ id: 1n, itemId: "mithril_ore", count: 20, rollJson: "", refine: 0 }, { id: 2n, itemId: "fine_sword", count: 0, rollJson: "{}", refine: 2 }];
  const views: { supporter: boolean; mine: boolean; screen: any; search?: string }[] = [
    { supporter: false, mine: false, screen: { kind: "slots" } },
    { supporter: true, mine: true, screen: { kind: "slots" } },
    { supporter: true, mine: true, screen: { kind: "pick", side: "buy" }, search: "ore" },
    { supporter: true, mine: true, screen: { kind: "pick", side: "buy" }, search: "adamant" },
    { supporter: true, mine: true, screen: { kind: "pick", side: "buy" }, search: "bow" },
    { supporter: true, mine: true, screen: { kind: "offer", draft: { buy: false, itemId: "copper_ore", refine: 0, quantity: 300, max: 300, price: 12n } } },
  ];
  for (const view of views) {
    const window = createExchangeController({
      inTown: () => true, showMessage: () => {}, identity: () => me, supporter: () => view.supporter, gold: () => 12_480n,
      ores: () => ({ pine_log: 900, oak_log: 40, copper_ore: 300, iron_ore: 12, starshard: 5 }),
      gear: () => [{ itemId: "fine_sword", copyId: 0n, refine: 4, roll: { whirlwind: 2, deflect: 0, shockwave: 1.5 } }],
      follow: () => {}, watch: () => {}, prices: () => prices, collect: () => view.mine ? collect : [],
      offers: () => offers, listings: () => listings,
      myOffers: () => view.mine ? offers.filter(offer => offer.identity === me) : [],
      myListings: () => view.mine ? listings.filter(listing => listing.identity === me) : [],
      place: done, cancelOffer: done, list: done, buyListing: done, cancelListing: done, collectAll: done,
    });
    window.open(view.screen);
    // Side by side in the page rather than one modal over the next.
    const sheet = [...document.querySelectorAll<HTMLDialogElement>("dialog.exchange-sheet")].at(-1)!;
    sheet.close(); sheet.show();
    const search = sheet.querySelector<HTMLInputElement>(".exchange-search input");
    if (search && view.search) { search.value = view.search; search.dispatchEvent(new Event("input")); search.blur(); }
  }
  await settleCssImages();
}

/** Every grade's tile background, Crude to Eternal: a bow of each grade as the bag draws it, its grade under it. */
async function grades() {
  await gameMarkup();
  document.body.style.background = "#151515";
  const style = document.createElement("style");
  style.textContent = `
    html, body { position: static !important; height: auto !important; overflow: visible !important; }
    .grade-sheet { display: grid; grid-template-columns: repeat(5, 72px); gap: 14px 12px; padding: 16px; }
    .grade-cell { display: grid; gap: 6px; justify-items: center; color: #e8e8e2; font: 900 11px/1.2 var(--font-rounded); }
    .grade-cell .inventory-item { width: 72px; height: 72px; }
  `;
  document.head.append(style);
  const sheet = document.createElement("div");
  sheet.className = "grade-sheet";
  for (const grade of GEAR_GRADES) {
    const cell = document.createElement("div");
    cell.className = "grade-cell";
    const tile = document.createElement("button");
    tile.className = "inventory-item is-filled";
    appendBagTileContents(tile, `${grade}_bow`, { stats: false });
    const name = document.createElement("span");
    name.textContent = GEAR_GRADE_NAMES[grade];
    cell.append(tile, name);
    sheet.append(cell);
  }
  document.body.append(sheet);
  await settleCssImages();
}

/** Public chat, compact and expanded: a player's line, the server's Server Boost and Patreon banners, and the same words typed by a player. */
async function chatAnnouncement() {
  const unpin = document.createElement("style");
  unpin.textContent = `
    html, body { position: static !important; height: auto !important; overflow: visible !important; }
    #chatPanel { position: relative !important; inset: auto !important; transform: none !important; margin: 12px auto !important; }
    #chatPanel.is-large { width: 100% !important; height: auto !important; }
    #chatPanel #chatMessages { height: auto !important; max-height: none !important; overflow: visible !important; }
  `;
  document.head.append(unpin);
  const boost = "Started a Server Boost: 2x Rewards for 15 min";
  const playerLine = (name: string, words: string) => {
    const line = document.createElement("div");
    line.className = "chat-line";
    line.innerHTML = '<span class="chat-profile-icon"></span><div class="chat-message-content"><span class="chat-name"></span>'
      + '<span class="chat-text"><span class="chat-message-body"><span></span></span></span></div>';
    line.querySelector(".chat-name")!.textContent = name;
    line.querySelector(".chat-message-body span")!.textContent = words;
    return line;
  };
  const announcement = (name: string, words: string, kind: "server-boost" | "patreon") => {
    const line = playerLine(name, words);
    markChatAnnouncement(line, line.querySelector<HTMLElement>(".chat-name")!, kind);
    return line;
  };
  for (const large of [false, true]) {
    const panel = await importById("chatPanel");
    panel.classList.toggle("is-large", large);
    const messages = panel.querySelector("#chatMessages")!;
    const rows = [
      playerLine("Moss", "anyone up for the boss?"),
      announcement("Oogway", boost, "server-boost"),
      announcement("Oogway", "Extended a Server Boost by 15 min", "server-boost"),
      announcement("Fern", "Became a Gold supporter on Patreon. Thank you for supporting WildStat! ♥", "patreon"),
      playerLine("Faker", boost),
    ];
    messages.append(...(large ? rows : rows.slice(1, 2).concat(rows.slice(4))));
  }
  await settleCssImages();
}

/** The item window on a graded bow from the bag: its skills, Equip, and the trash can that sells it (greyed while worn). */
async function itemWindow(worn: boolean) {
  const doc = await gameMarkup();
  document.body.style.background = GROUND;
  for (const node of doc.body.children) document.body.append(document.importNode(node, true));
  await import("../../src/ui/game-shell");
  const itemId = "rare_bow";
  const controller = createItemInspectionController({
    panel: byId("itemInspectionPanel"), title: byId("itemInspectionTitle"), content: byId("itemInspectionContent"),
    back: byId<HTMLButtonElement>("itemInspectionBack"),
  });
  controller.open({
    itemId, refine: 7, ownItem: true, skills: { arrowStorm: 2.4, ricochet: 1.1, piercingShot: 3.2 },
    actions: [
      { label: worn ? "Unequip" : "Equip", kind: worn ? "SECONDARY" : "PRIMARY", onActivate: () => {} },
      { label: worn ? "Take It Off Before Selling It" : `Sell for ${gradeShopSalePrice(itemId)} Gold`, kind: "DESTROY", blocked: worn, onActivate: () => {} },
    ],
  });
  await settleCssImages();
}

/** A card's window with three copies in play: each stacking number shows its total and one card's share times three. */
async function cardWindow() {
  const doc = await gameMarkup();
  document.body.style.background = GROUND;
  for (const node of doc.body.children) document.body.append(document.importNode(node, true));
  await import("../../src/ui/game-shell");
  const controller = createItemInspectionController({
    panel: byId("itemInspectionPanel"), title: byId("itemInspectionTitle"), content: byId("itemInspectionContent"),
    back: byId<HTMLButtonElement>("itemInspectionBack"),
  });
  const card = CARDS.find(card => card.enemy === "Desert Spider") ?? CARDS[0];
  controller.openCard({ cardId: card.id, count: 4, copies: 3, context: "Armor Card · 4 Owned · 3 Equipped",
    odds: "Desert · 1 in 877 kills · Sure by 2,000 kills", note: "Armor Slots 1, 2, 3",
    actions: [{ label: "Remove", kind: "SECONDARY", onActivate: () => {} }] });
  await settleCssImages();
}

/** The Builds tab at phone width: ten rows, a few saved and named, one being renamed. */
async function builds() {
  await gameMarkup();
  document.body.style.background = "#151515";
  const style = document.createElement("style");
  style.textContent = `html, body { position: static !important; height: auto !important; overflow: visible !important; }
    .builds-tab { width: 360px; }`;
  document.head.append(style);
  const gear = (HAND: string, HEAD = "", CHEST = "", FEET = "") => ({ HAND, HEAD, CHEST, FEET });
  const none = { HAND: [], HEAD: [], CHEST: [] };
  const saved = [
    { slot: 0, gear: gear("rare_bow", "rare_light_helmet", "rare_light_armor", "rare_boots"), cards: { ...none, HAND: ["needle_card"] } },
    { slot: 1, gear: gear("iron_bow", "crude_light_helmet"), cards: none },
    null,
    { slot: 3, gear: gear("crude_bow"), cards: none },
  ];
  const ok = async () => ({ ok: true });
  const view = createBuildsTab({
    actions: { builds: () => saved, names: () => ["Boss Killer", "", "", "Mining"], save: ok, rename: ok, equip: ok } as never,
    itemName: itemId => itemInspectionButtonLabel(itemDisplayName(itemId)), showMessage: () => {},
  });
  document.body.append(view.element);
  view.show(true);
  await settleCssImages();
}

/** The "While You Were Away" choice: fight, mine or chop, each with its own Collect. */
async function offlineChoice() {
  await gameMarkup();
  document.body.style.background = "#151515";
  const summary = createOfflineProgressSummary({ acknowledge: () => {}, pending: () => null, readyToShow: () => false });
  summary.show({
    mapId: "intermediate_snowlands", seconds: 8 * 3600, kills: 4_210, damage: 1_820, health: 9_400, armor: 640, regen: 120, attackSpeed: 0.004,
    blocked: false,
    choice: { rocks: 1_174, miningGain: 7_560, mineOres: { mithril_ore: 2_310, starshard: 17 }, trees: 995, woodcuttingGain: 7_960, chopOres: { yew_log: 2_050 } },
  });
  // Fight opened, Mine and Chop folded: both states of a row in one capture.
  document.querySelector<HTMLButtonElement>('.offline-choice[data-activity="fight"] .offline-choice-toggle')?.click();
  await settleCssImages();
}

/** The HUD quest tracker: one quest on the player's map, two elsewhere with the map named above the stat. */
async function questTracker() {
  document.body.style.background = GROUND;
  await importById("hud");
  const [here, there, far] = CAMPAIGN_MAPS;
  const quests = [
    { mapId: here.id, stat: "damage" as const, target: 80, progress: 34 },
    { mapId: there.id, stat: "health" as const, target: 60, progress: 12, from: "your guild" },
    { mapId: far.id, stat: "regen" as const, target: 100, progress: 0 },
  ];
  const memory = new Map<string, string>();
  installQuestTracker({ view: () => questTrackerView({ day: 0, quests, bonus: 0, guildPoints: 0, guildName: "" }, here.id,
    id => CAMPAIGN_MAPS.find(map => map.id === id)?.name ?? id), hiddenHere: () => false, enabled: () => true,
    storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } } }).render();
  await settleCssImages();
}

/** The DPS breakdown switched on, over a bow build with Koi and Dragon: each source's DPS and share. */
async function dpsBreakdown() {
  document.body.style.background = GROUND;
  await importById("hud");
  const rows = [
    { source: "bow-hit" as const, perSecond: 12_400 }, { source: "card-koi" as const, perSecond: 3_100 },
    { source: "card-splash" as const, perSecond: 2_900 }, { source: "bow-storm" as const, perSecond: 2_200 },
    { source: "bow-ricochet" as const, perSecond: 1_100 }, { source: "card-burn" as const, perSecond: 640 },
  ];
  const memory = new Map<string, string>([["wildstat-dps-breakdown-enabled", "true"]]);
  installDpsBreakdown({ meter: { breakdown: () => rows },
    storage: () => ({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } }) });
  await settleCssImages();
}

/** The World Map opened in the Town: the Town's own page, with the player at the arrival. */
async function worldMapTown() {
  const doc = await gameMarkup();
  document.body.style.background = "#151515";
  for (const node of doc.body.children) document.body.append(document.importNode(node, true));
  await import("../../src/ui/game-shell");
  const guide = byId("mapGuide");
  await mapArtReady("town");
  const state = createGameBootstrap();
  const player = Object.assign(state.player, { x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  const town = state.mapConfig.town;
  const trigger = document.createElement("button");
  createMapGuideController({
    trigger, overlay: guide, title: byId("mapGuideTitle"), canvas: byId<HTMLCanvasElement>("mapGuideCanvas"),
    zoneLabels: byId("mapGuideZoneLabels"), dropItems: byId("mapGuideDropItems"), back: byId<HTMLButtonElement>("mapGuideBack"),
  }, {
    currentMapId: () => "town", mapName: mapId => state.mapConfig[mapId].name, paths: mapWorldLayout(player, "town").paths, spawnSites: [], player,
    boss: () => null, mapUnlocked: () => true,
    portals: () => [town.portal, town.secondaryPortal].flatMap(portal => portal ? [{ x: portal.x, y: portal.y, destination: portal.destination, unlocked: true }] : []),
    villageGround: () => sharedAssets().assets.townVillageGround, beforeOpen: () => {}, clearPlayerInput: () => {},
  });
  trigger.click();
  await settleCssImages();
}

export const DOM_SCENES: Record<string, () => Promise<void>> = { "world-map-town": worldMapTown, icons, hud, "hud-arrow": hudArrow, "prestige-runs": prestigeRuns, "guild-hall": guildHallWindow, "settings-search": settingsSearch, wordmark, shops, "gem-shop": gemShop, "server-boost": serverBoost, "exchange-window": exchangeWindow, grades, "quest-tracker": questTracker, "dps-breakdown": dpsBreakdown, builds, "offline-choice": offlineChoice,
  "chat-announcement": chatAnnouncement, "item-window": () => itemWindow(false), "card-window": cardWindow, "item-window-worn": () => itemWindow(true),
  "profile-own": () => profileWindow(true), "profile-other": () => profileWindow(false) };
