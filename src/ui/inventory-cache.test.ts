import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createInventoryController } from "./inventory-controller";
import { SUPERIOR_GOLDEN_HELMET, STARTER_BOW, STARTER_STONE, FROST_ARMOR } from "../game/inventory";
afterEach(() => vi.unstubAllGlobals());
it("keeps slots mounted until inventory, upgrades, or selection changes", () => {
  const ids = ["inventoryPanel", "inventoryItems", "inventoryCount", "equippedHeadSlot", "equippedChestSlot", "equippedFeetSlot", "equippedRightHandSlot", "inventoryEquipmentTab", "inventoryCosmeticsTab", "inventoryContent"];
  const { document, window } = parseHTML(`<html><body>${ids.map(id => `<div id="${id}"></div>`).join("")}</body></html>`);
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  const inventory = { itemIds: [STARTER_STONE, STARTER_BOW], equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_STONE, equippedLeftHand: "", cosmeticHead: "", cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "", selectedItemId: "", selectedItemLocation: "" as const };
  let level = 0;
  const controller = createInventoryController({ inventory, move: () => false, moveCosmetic: () => false, toggleCosmeticVisibility: () => false,
    upgradeLevel: () => level, itemInspection: { close() {}, open() {} } as any, inventorySlotsUnlocked: () => 0, gemBalance: () => 0n,
    destroyEquipment: async () => undefined, unlockInventorySlot: async () => undefined, showMessage() {} });
  const items = document.getElementById("inventoryItems")!;
  controller.render();
  expect(items.querySelector(".inventory-item-bonuses")!.textContent).toBe("+5%");
  level = 10; controller.render();
  expect(items.querySelector(".inventory-item-bonuses")!.textContent).toBe("+7%");
  level = 0; controller.render();
  let first = items.firstElementChild;
  controller.prepareOpen(); controller.render();
  expect(items.firstElementChild).toBe(first);
  inventory.itemIds.push(FROST_ARMOR); controller.render();
  expect(items.firstElementChild).not.toBe(first);
  first = items.firstElementChild; level = 1; controller.render();
  expect(items.firstElementChild).not.toBe(first);
  first = items.firstElementChild; inventory.selectedItemId = STARTER_BOW; controller.render();
  expect(items.firstElementChild).not.toBe(first);
});


it("switches to a cosmetic-only collection without equipment capacity purchases", () => {
  const ids = ["inventoryPanel", "inventoryItems", "inventoryCount", "equippedHeadSlot", "equippedChestSlot", "equippedFeetSlot", "equippedRightHandSlot", "inventoryEquipmentTab", "inventoryCosmeticsTab", "inventoryContent"];
  const { document, window } = parseHTML(`<html><body>${ids.map(id => `<div id="${id}"></div>`).join("")}</body></html>`);
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  const inventory = { itemIds: [STARTER_BOW, SUPERIOR_GOLDEN_HELMET], equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: "", equippedLeftHand: "", cosmeticHead: SUPERIOR_GOLDEN_HELMET, cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "", selectedItemId: "", selectedItemLocation: "" as const };
  const controller = createInventoryController({ inventory, move: () => false, moveCosmetic: () => false, toggleCosmeticVisibility: () => false,
    upgradeLevel: () => 0, itemInspection: { close() {}, open() {} } as any, inventorySlotsUnlocked: () => 0, gemBalance: () => 0n,
    destroyEquipment: async () => undefined, unlockInventorySlot: async () => undefined, showMessage() {} });
  const items = document.getElementById("inventoryItems")!;
  controller.render();
  expect(items.querySelectorAll("[data-item-id]").length).toBe(1);
  expect(items.querySelector("[data-item-id]")!.getAttribute("data-item-id")).toBe(STARTER_BOW);
  document.getElementById("inventoryCosmeticsTab")!.click();
  expect(items.querySelectorAll("[data-item-id]").length).toBe(1);
  expect(items.querySelector("[data-item-id]")!.getAttribute("data-item-id")).toBe(SUPERIOR_GOLDEN_HELMET);
  expect(items.children.length).toBe(50);
  expect(items.querySelector(".is-locked")).toBeNull();
  expect(items.querySelector(".inventory-item-bonuses")).toBeNull();
  expect(items.classList.contains("has-stat-bonuses")).toBe(false);
  expect(document.getElementById("inventoryCount")!.textContent).toBe("1 / 50 Cosmetics");
});

it("opens inspection on the first tap and only equips from its action", () => {
  const ids = ["inventoryPanel", "inventoryItems", "inventoryCount", "equippedHeadSlot", "equippedChestSlot", "equippedFeetSlot", "equippedRightHandSlot", "inventoryEquipmentTab", "inventoryCosmeticsTab", "inventoryContent"];
  const { document, window } = parseHTML(`<html><body>${ids.map(id => `<div id="${id}"></div>`).join("")}</body></html>`);
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  const inventory = { itemIds: [STARTER_STONE, STARTER_BOW, SUPERIOR_GOLDEN_HELMET], equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_STONE, equippedLeftHand: "", cosmeticHead: "", cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "", selectedItemId: "", selectedItemLocation: "" as const };
  const move = vi.fn(() => false), open = vi.fn();
  const controller = createInventoryController({ inventory, move, moveCosmetic: move, toggleCosmeticVisibility: () => false,
    upgradeLevel: () => 0, itemInspection: { close() {}, open } as any, inventorySlotsUnlocked: () => 0, gemBalance: () => 0n,
    destroyEquipment: async () => undefined, unlockInventorySlot: async () => undefined, showMessage() {} });
  controller.render();
  const bow = document.querySelector<HTMLButtonElement>(`#inventoryItems [data-item-id="${STARTER_BOW}"]`)!;
  bow.click();
  expect(open).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[0][0].itemId).toBe(STARTER_BOW);
  expect(inventory.selectedItemId).toBe("");
  expect(move).not.toHaveBeenCalled();
  expect(document.querySelector("[data-inventory-drag-source]")).toBeNull();
  open.mock.calls[0][0].actions.find((action: any) => action.label === "EQUIP").onActivate();
  expect(move).toHaveBeenCalledWith(STARTER_BOW, "RIGHT_HAND");
  move.mockClear();
  document.getElementById("equippedRightHandSlot")!.click();
  expect(open.mock.lastCall![0]).toMatchObject({ itemId: STARTER_STONE, actions: [expect.objectContaining({ label: "UNEQUIP" })] });
  document.getElementById("equippedHeadSlot")!.click();
  expect(move).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLParagraphElement>(".inventory-cosmetics-note")!.hidden).toBe(true);
  document.getElementById("inventoryCosmeticsTab")!.click();
  expect(document.querySelector<HTMLParagraphElement>(".inventory-cosmetics-note")!.hidden).toBe(false);
  document.querySelector<HTMLButtonElement>(`#inventoryItems [data-item-id="${SUPERIOR_GOLDEN_HELMET}"]`)!.click();
  expect(open.mock.lastCall![0]).toMatchObject({ itemId: SUPERIOR_GOLDEN_HELMET, actions: [expect.objectContaining({ label: "USE COSMETIC" })] });
});

it("filters the bag without changing capacity and applies best equipment once", () => {
  const ids = ["inventoryPanel", "inventoryItems", "inventoryCount", "equippedHeadSlot", "equippedChestSlot", "equippedFeetSlot", "equippedRightHandSlot", "inventoryEquipmentTab", "inventoryCosmeticsTab", "inventoryContent"];
  const { document, window } = parseHTML(`<html><body>${ids.map(id => `<div id="${id}"></div>`).join("")}</body></html>`);
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  const inventory = { itemIds: [STARTER_STONE, STARTER_BOW, FROST_ARMOR], equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_STONE, equippedLeftHand: "", cosmeticHead: "", cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "", selectedItemId: "", selectedItemLocation: "" as const };
  const equipBest = vi.fn(() => true);
  const controller = createInventoryController({ inventory, move: () => false, moveCosmetic: () => false, toggleCosmeticVisibility: () => false,
    upgradeLevel: () => 0, equipBest, itemInspection: { close() {}, open() {} } as any, inventorySlotsUnlocked: () => 0, gemBalance: () => 0n,
    destroyEquipment: async () => undefined, unlockInventorySlot: async () => undefined, showMessage() {} });
  controller.render();
  const count = document.getElementById("inventoryCount")!.textContent;
  expect([...document.querySelectorAll("#inventoryItems [data-item-id]")].map(item => item.getAttribute("data-item-id"))).toEqual([FROST_ARMOR, STARTER_BOW]);
  const tabs = [...document.querySelectorAll<HTMLButtonElement>(".inventory-filter")];
  tabs.find(tab => tab.textContent === "Armor")!.click();
  expect([...document.querySelectorAll("#inventoryItems [data-item-id]")].map(item => item.getAttribute("data-item-id"))).toEqual([FROST_ARMOR]);
  expect(document.getElementById("inventoryCount")!.textContent).toBe(count);
  const totalSlots = document.querySelectorAll("#inventoryItems .inventory-item").length;
  tabs.find(tab => tab.textContent === "Boots")!.click();
  expect(document.querySelectorAll("#inventoryItems [data-item-id]")).toHaveLength(0);
  expect(document.querySelectorAll("#inventoryItems .inventory-item")).toHaveLength(totalSlots);
  expect(document.querySelector(".inventory-filter-empty")?.textContent).toBe("No boots");
  expect(document.getElementById("inventoryCount")!.textContent).toBe(count);
  tabs.find(tab => tab.textContent === "All")!.click();
  expect(document.querySelectorAll("#inventoryItems [data-item-id]")).toHaveLength(2);
  document.querySelector<HTMLButtonElement>(".inventory-equip-best")!.click();
  expect(equipBest).toHaveBeenCalledTimes(1);
  document.getElementById("inventoryCosmeticsTab")!.click();
  expect(document.querySelector<HTMLButtonElement>(".inventory-equip-best")!.hidden).toBe(true);
});
