import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createInventoryController, type KeptEquipmentCopy } from "./inventory-controller";
import type { ItemInspectionRequest } from "./item-inspection-controller";
import type { ConfirmRequest } from "./confirm-dialog";
import { IRON_BOW, SAMURAI_HAT, STARTER_STONE } from "../game/inventory";
afterEach(() => vi.unstubAllGlobals());

const ROLL = { arrowStorm: 0, ricochet: 3, piercingShot: 0 };

function bag(copies: KeptEquipmentCopy[] = [{ id: 5n, itemId: IRON_BOW, roll: ROLL }], answer = true) {
  const ids = ["inventoryPanel", "inventoryItems", "inventoryCount", "equippedHeadSlot", "equippedChestSlot", "equippedFeetSlot", "equippedRightHandSlot", "inventoryEquipmentTab", "inventoryCosmeticsTab", "inventoryContent"];
  const { document, window } = parseHTML(`<html><body>${ids.map(id => `<div id="${id}"></div>`).join("")}</body></html>`);
  vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("navigator", {});
  const inventory = { itemIds: [STARTER_STONE, IRON_BOW, SAMURAI_HAT], equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: "", equippedLeftHand: "", cosmeticHead: "", cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "", selectedItemId: "", selectedItemLocation: "" as const };
  const opened: ItemInspectionRequest[] = [];
  const asked: ConfirmRequest[] = [];
  const calls: string[] = [];
  const messages: string[] = [];
  const controller = createInventoryController({ inventory, toggleCosmeticVisibility: () => false,
    move: () => true, moveCosmetic: () => false, upgradeLevel: () => 0, inventorySlotsUnlocked: () => 0, gemBalance: () => 0n,
    itemInspection: { close() {}, open(request: ItemInspectionRequest) { opened.push(request); return true; } } as any,
    destroyEquipment: async itemId => { calls.push(`destroy ${itemId}`); inventory.itemIds = inventory.itemIds.filter(id => id !== itemId); return { ok: true }; },
    destroyEquipmentCopy: async (itemId, copyId) => { calls.push(`destroy ${itemId} copy ${copyId}`); return { ok: true }; },
    equipmentCopies: () => copies,
    confirmDestroy: async request => { asked.push(request); return answer; },
    unlockInventorySlot: async () => undefined, showMessage: message => { messages.push(message); } });
  controller.render();
  const panel = document.getElementById("inventoryPanel")!;
  const items = document.getElementById("inventoryItems")!;
  const slot = (itemId: string, copyId?: bigint) => [...items.querySelectorAll<HTMLElement>(`[data-item-id="${itemId}"]`)]
    .find(button => button.getAttribute("data-copy-id") === (copyId === undefined ? null : String(copyId)))!;
  const trash = document.querySelector<HTMLElement>(".inventory-delete-toggle")!;
  const cancel = document.querySelector<HTMLElement>(".inventory-delete-cancel")!;
  const equipBest = document.querySelector<HTMLElement>(".inventory-equip-best")!;
  return { panel, items, slot, trash, cancel, equipBest, opened, asked, calls, messages, controller };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

it("turns delete mode on from the trash button, which then says Delete", () => {
  const view = bag();
  expect(view.trash.textContent).toBe("");
  expect(view.trash.getAttribute("aria-label")).toBe("Select items to delete");
  view.trash.click();
  expect(view.trash.textContent).toBe("Delete");
  expect(view.panel.classList.contains("is-delete-mode")).toBe(true);
  expect(view.cancel.hidden).toBe(false);
  expect(view.equipBest.hidden).toBe(true);
});

it("picks bag items with a red highlight instead of opening them, and never starter gear", () => {
  const view = bag();
  view.trash.click();
  view.slot(SAMURAI_HAT).click();
  view.slot(IRON_BOW, 5n).click();
  expect(view.opened).toHaveLength(0);
  expect(view.slot(SAMURAI_HAT).classList.contains("is-delete-selected")).toBe(true);
  expect(view.slot(IRON_BOW, 5n).classList.contains("is-delete-selected")).toBe(true);
  expect(view.trash.textContent).toBe("Delete 2");
  // A second tap puts it back.
  view.slot(SAMURAI_HAT).click();
  expect(view.slot(SAMURAI_HAT).classList.contains("is-delete-selected")).toBe(false);
  expect(view.trash.textContent).toBe("Delete 1");
  view.slot(STARTER_STONE).click();
  expect(view.slot(STARTER_STONE).classList.contains("is-delete-locked")).toBe(true);
  expect(view.slot(STARTER_STONE).classList.contains("is-delete-selected")).toBe(false);
});

it("asks once, then deletes kept copies before the first copy, and leaves the mode", async () => {
  const view = bag();
  view.trash.click();
  view.slot(IRON_BOW).click();
  view.slot(IRON_BOW, 5n).click();
  view.slot(SAMURAI_HAT).click();
  view.trash.click();
  await flush();
  expect(view.asked).toHaveLength(1);
  expect(view.asked[0]).toMatchObject({ message: "Delete 3 selected items permanently?", confirmLabel: "Delete", danger: true });
  // The copy goes first, so the bow's first copy is its last and leaves the bag the usual way.
  expect(view.calls).toEqual([`destroy ${IRON_BOW} copy 5`, `destroy ${IRON_BOW}`, `destroy ${SAMURAI_HAT}`]);
  expect(view.messages).toContain("3 ITEMS DESTROYED");
  expect(view.panel.classList.contains("is-delete-mode")).toBe(false);
  expect(view.trash.textContent).toBe("");
  expect(view.equipBest.hidden).toBe(false);
});

it("deletes a first copy through the copy path while an unpicked copy remains", async () => {
  const view = bag();
  view.trash.click();
  view.slot(IRON_BOW).click();
  view.trash.click();
  await flush();
  expect(view.calls).toEqual([`destroy ${IRON_BOW} copy 0`]);
});

it("keeps the picks when the prompt is declined, and Cancel or an empty Delete leaves the mode", async () => {
  const view = bag(undefined, false);
  view.trash.click();
  view.slot(SAMURAI_HAT).click();
  view.trash.click();
  await flush();
  expect(view.calls).toEqual([]);
  expect(view.slot(SAMURAI_HAT).classList.contains("is-delete-selected")).toBe(true);
  view.cancel.click();
  expect(view.panel.classList.contains("is-delete-mode")).toBe(false);
  expect(view.slot(SAMURAI_HAT).classList.contains("is-delete-selected")).toBe(false);
  view.trash.click();
  view.trash.click();
  expect(view.panel.classList.contains("is-delete-mode")).toBe(false);
  // Out of the mode, a tap opens the item again.
  view.slot(SAMURAI_HAT).click();
  expect(view.opened).toHaveLength(1);
});

it("leaves the mode when the inventory reopens", () => {
  const view = bag();
  view.trash.click();
  view.slot(SAMURAI_HAT).click();
  view.controller.prepareOpen();
  expect(view.panel.classList.contains("is-delete-mode")).toBe(false);
  expect(view.trash.textContent).toBe("");
});
