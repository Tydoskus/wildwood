import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createInventoryController, type KeptEquipmentCopy } from "./inventory-controller";
import type { ItemInspectionRequest } from "./item-inspection-controller";
import { IRON_BOW, SAMURAI_HAT, STARTER_STONE } from "../game/inventory";
afterEach(() => vi.unstubAllGlobals());

const A = { arrowStorm: 2, ricochet: 0, piercingShot: 0 };
const B = { arrowStorm: 0, ricochet: 3, piercingShot: 0 };

function bag(equippedRightHand = IRON_BOW, copies: KeptEquipmentCopy[] = [{ id: 5n, itemId: IRON_BOW, roll: B }], equippedHead = "") {
  const ids = ["inventoryPanel", "inventoryItems", "inventoryCount", "equippedHeadSlot", "equippedChestSlot", "equippedFeetSlot", "equippedRightHandSlot", "inventoryEquipmentTab", "inventoryCosmeticsTab", "inventoryContent"];
  const { document, window } = parseHTML(`<html><body>${ids.map(id => `<div id="${id}"></div>`).join("")}</body></html>`);
  vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("navigator", {});
  const inventory = { itemIds: [STARTER_STONE, IRON_BOW, SAMURAI_HAT], equippedHead, equippedChest: "", equippedFeet: "", equippedRightHand, equippedLeftHand: "", cosmeticHead: "", cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "", selectedItemId: "", selectedItemLocation: "" as const };
  const opened: ItemInspectionRequest[] = [];
  const calls: string[] = [];
  const controller = createInventoryController({ inventory, toggleCosmeticVisibility: () => false,
    move: (itemId, destination) => { calls.push(`move ${itemId} ${destination}`); inventory.equippedRightHand = itemId; return true; },
    moveCosmetic: () => false, upgradeLevel: () => 0, inventorySlotsUnlocked: () => 0, gemBalance: () => 0n,
    itemInspection: { close() {}, open(request: ItemInspectionRequest) { opened.push(request); return true; } } as any,
    destroyEquipment: async itemId => { calls.push(`destroy ${itemId}`); return { ok: true }; },
    destroyEquipmentCopy: async (itemId, copyId) => { calls.push(`destroy ${itemId} copy ${copyId}`); return { ok: true }; },
    selectEquipmentCopy: async copyId => { calls.push(`select ${copyId}`); return { ok: true }; },
    equipmentCopies: () => copies,
    confirmDestroy: async () => true,
    unlockInventorySlot: async () => undefined, showMessage() {} });
  controller.render();
  const items = document.getElementById("inventoryItems")!;
  const entry = (copyId?: bigint) => [...items.querySelectorAll<HTMLElement>(`[data-item-id="${IRON_BOW}"]`)]
    .find(button => button.getAttribute("data-copy-id") === (copyId === undefined ? null : String(copyId)))!;
  const action = (request: ItemInspectionRequest, label: string) => request.actions!.find(candidate => candidate.label === label)!;
  return { document, items, entry, opened, calls, action, controller };
}

it("gives each kept copy its own bag slot, counted against the bag, beside the item", () => {
  const view = bag(IRON_BOW, [{ id: 5n, itemId: IRON_BOW, roll: B }, { id: 6n, itemId: SAMURAI_HAT, roll: A }, { id: 7n, itemId: "night_bow", roll: A }]);
  const filled = [...view.items.querySelectorAll<HTMLElement>("[data-item-id]")];
  // The equipped bow is in its slot; its kept copy, the hat and the hat's copy fill the bag.
  // A copy of an item the bag no longer holds is not shown.
  expect(filled.map(button => [button.getAttribute("data-item-id"), button.getAttribute("data-copy-id")]))
    .toEqual(expect.arrayContaining([[IRON_BOW, "5"], [SAMURAI_HAT, null], [SAMURAI_HAT, "6"]]));
  expect(filled.some(button => button.getAttribute("data-item-id") === "night_bow")).toBe(false);
  expect(view.document.getElementById("inventoryCount")!.textContent).toBe(`${filled.length} / 30 Items`);
});

it("inspects a kept copy with its own roll, equips it through the server, and destroys only it", async () => {
  const view = bag("");
  view.entry(5n).click();
  const request = view.opened.at(-1)!;
  expect(request.skills).toEqual(B);
  expect(request.context).toBe("Copy 2 of 2");
  await view.action(request, "EQUIP").onActivate();
  expect(view.calls).toEqual(["select 5", `move ${IRON_BOW} RIGHT_HAND`]);
  await request.actions!.find(candidate => candidate.kind === "DESTROY")!.onActivate();
  expect(view.calls.at(-1)).toBe(`destroy ${IRON_BOW} copy 5`);
});

it("destroys the first copy through the copy-aware path while other copies are kept", async () => {
  const view = bag("");
  view.entry().click();
  const request = view.opened.at(-1)!;
  expect(request.skills).toBeUndefined();
  expect(request.context).toBe("Copy 1 of 2");
  await request.actions!.find(candidate => candidate.kind === "DESTROY")!.onActivate();
  expect(view.calls).toEqual([`destroy ${IRON_BOW} copy 0`]);
  // The last copy still goes the old way, which also drops it from the local bag.
  const alone = bag("", []);
  alone.entry().click();
  await alone.opened.at(-1)!.actions!.find(candidate => candidate.kind === "DESTROY")!.onActivate();
  expect(alone.calls).toEqual([`destroy ${IRON_BOW}`]);
});

it("swaps a bow copy into the hand that already holds the bow without moving anything", async () => {
  const view = bag(IRON_BOW);
  view.entry(5n).click();
  await view.action(view.opened.at(-1)!, "EQUIP").onActivate();
  expect(view.calls).toEqual(["select 5"]);
});

it("does not offer to equip an identical copy of equipment already worn", () => {
  const worn = bag(IRON_BOW, [{ id: 6n, itemId: SAMURAI_HAT, roll: A }], SAMURAI_HAT);
  (worn.items.querySelector(`[data-copy-id="6"]`) as HTMLElement).click();
  expect(worn.action(worn.opened.at(-1)!, "SAME AS EQUIPPED").disabled).toBe(true);
  // With the hat itself in the bag, equipping a copy of it is an ordinary equip.
  const loose = bag(IRON_BOW, [{ id: 6n, itemId: SAMURAI_HAT, roll: A }]);
  (loose.items.querySelector(`[data-copy-id="6"]`) as HTMLElement).click();
  expect(loose.action(loose.opened.at(-1)!, "EQUIP").disabled).toBe(false);
});
