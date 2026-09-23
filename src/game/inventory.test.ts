import { describe, expect, it } from "vitest";
import { cosmeticInventoryStacks, bagInventoryStacks, BASIC_PAPER_HAT, DARK_METAL_HELMET, equipmentAppearance, FIRE_METAL_BOW, FROST_ARMOR, FROST_BOW, HIDDEN_COSMETIC_ITEM_ID, inventoryFromSave, inventoryItemQuantity, IRON_BOW, LEGENDARY_WHITE_GOLD_ARMOR, moveCosmeticInventoryItem, moveInventoryItem, NIGHT_BOW, normaliseInventory, serialiseInventory, setInventoryItemQuantity, SNOW_BOW, STARTER_BOW, STARTER_STONE, SUPERIOR_GOLDEN_HELMET, toggleCosmeticEquipmentVisibility, WOOD_FULL_HELM, WOODEN_ARMOR } from "./inventory";

const emptyCosmetics = {
  cosmeticItemIds: [],
  cosmeticHead: "",
  cosmeticChest: "",
  cosmeticFeet: "",
  cosmeticRightHand: "",
  cosmeticLeftHand: "",
};

describe("inventory rules", () => {
  it("keeps a converted look selectable after its original item is lost", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([STARTER_BOW]), "", "", "", false, false,
      STARTER_BOW, "", "", "", "", "", "", JSON.stringify([STARTER_BOW]),
    );
    expect(inventory.itemIds).toContain(STARTER_BOW);
    expect(inventory.cosmeticItemIds).toEqual([STARTER_BOW]);
    expect(setInventoryItemQuantity(inventory, STARTER_BOW, 0)).toBe(true);
    expect(inventory.itemIds).not.toContain(STARTER_BOW);
    expect(cosmeticInventoryStacks(inventory)).toContainEqual({ itemId: STARTER_BOW, quantity: 1 });
    expect(moveCosmeticInventoryItem(inventory, STARTER_BOW, "RIGHT_HAND")).toBe(true);
    expect(inventory.cosmeticRightHand).toBe(STARTER_BOW);
    expect(inventory.equippedRightHand).toBe("");
  });

  it("rejects malformed inventory and starts a new player with only the stone", () => {
    // Nobody is given boots or a paper hat now: the boots are gone and the hat
    // is a one-in-a-hundred forest drop.
    expect(inventoryFromSave("not json", "", undefined, undefined, false)).toEqual({ itemIds: [STARTER_STONE], equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_STONE, equippedLeftHand: "", ...emptyCosmetics });
    expect(normaliseInventory([], "", "", undefined, false)).toEqual({ itemIds: [STARTER_STONE], equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: STARTER_STONE, equippedLeftHand: "", ...emptyCosmetics });
  });

  it("keeps a paper hat that was actually found, and refuses one that was not", () => {
    // It carries no stats, so it lives in the cosmetic slot rather than the
    // equipment one, exactly as it did when everyone was given it.
    const found = inventoryFromSave(JSON.stringify([BASIC_PAPER_HAT]), "", BASIC_PAPER_HAT, "", false);
    expect(found.itemIds).toContain(BASIC_PAPER_HAT);
    expect(found.cosmeticHead).toBe(BASIC_PAPER_HAT);
    // A save naming a hat the account never found leaves the head bare.
    const claimed = inventoryFromSave("[]", "", BASIC_PAPER_HAT, "", false);
    expect(claimed.itemIds).not.toContain(BASIC_PAPER_HAT);
    expect(claimed.cosmeticHead).toBe("");
  });

  it("keeps the developer-only golden helmet cosmetic available and equipable", () => {
    expect(inventoryFromSave("[]", "", SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR, false, true)).toEqual({
      itemIds: [STARTER_STONE, "wooden_sword", SUPERIOR_GOLDEN_HELMET, LEGENDARY_WHITE_GOLD_ARMOR],
      equippedHead: "",
      equippedChest: "",
      equippedFeet: "",
      equippedRightHand: STARTER_STONE,
      equippedLeftHand: "",
      ...emptyCosmetics,
      cosmeticHead: SUPERIOR_GOLDEN_HELMET,
      cosmeticChest: LEGENDARY_WHITE_GOLD_ARMOR,
    });
  });

  it("preserves intentional empty head and hand slots", () => {
    expect(inventoryFromSave(
      JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE]),
      "",
      "",
      "",
      false,
      false,
      "",
      "",
    )).toEqual({
      itemIds: [STARTER_STONE, BASIC_PAPER_HAT],
      equippedHead: "",
      equippedChest: "",
      equippedFeet: "",
      equippedRightHand: "",
      equippedLeftHand: "",
      ...emptyCosmetics,
    });
  });

  it("round-trips hat removal and a right-to-left weapon switch", () => {
    const inventory = normaliseInventory(
      [BASIC_PAPER_HAT, STARTER_STONE],
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      STARTER_STONE,
      "",
    );

    expect(moveCosmeticInventoryItem(inventory, BASIC_PAPER_HAT, "BAG")).toBe(true);
    expect(moveInventoryItem(inventory, STARTER_STONE, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedHead).toBe("");
    expect(inventory.equippedRightHand).toBe("");
    expect(inventory.equippedLeftHand).toBe(STARTER_STONE);

    expect(inventoryFromSave(
      serialiseInventory(inventory),
      inventory.equippedFeet,
      inventory.equippedHead,
      inventory.equippedChest,
      false,
      false,
      inventory.equippedRightHand,
      inventory.equippedLeftHand,
    )).toEqual(inventory);
  });

  it("migrates duplicate Bows to one unique item without replacing Rock", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE, STARTER_BOW, STARTER_BOW]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      STARTER_STONE,
      "",
    );
    expect(inventory.itemIds).toContain(STARTER_STONE);
    expect(inventoryItemQuantity(inventory, STARTER_BOW)).toBe(1);
    expect(moveInventoryItem(inventory, STARTER_BOW, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedRightHand).toBe("");
    expect(inventory.equippedLeftHand).toBe(STARTER_BOW);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(STARTER_BOW);
  });

  it("clamps legacy forest duplicates and keeps equipped items out of the bag", () => {
    const inventory = normaliseInventory(
      [STARTER_BOW, STARTER_BOW, STARTER_BOW, WOODEN_ARMOR, WOODEN_ARMOR],
      "",
      BASIC_PAPER_HAT,
      WOODEN_ARMOR,
      false,
      false,
      STARTER_BOW,
      "",
    );

    expect(bagInventoryStacks(inventory)).toEqual([{ itemId: STARTER_STONE, quantity: 1 }]);
    expect(setInventoryItemQuantity(inventory, STARTER_BOW, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, STARTER_BOW)).toBe(1);
    expect(JSON.parse(serialiseInventory(inventory)).filter((itemId: string) => itemId === STARTER_BOW)).toHaveLength(1);
  });

  it("migrates Frost Bow stacks into one unique equipable item", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([FROST_BOW, FROST_BOW, FROST_BOW]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      FROST_BOW,
      "",
    );

    expect(inventoryItemQuantity(inventory, FROST_BOW)).toBe(1);
    expect(inventory.equippedRightHand).toBe(FROST_BOW);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_BOW);
    expect(moveInventoryItem(inventory, FROST_BOW, "LEFT_HAND")).toBe(true);
    expect(inventory.equippedLeftHand).toBe(FROST_BOW);
    expect(setInventoryItemQuantity(inventory, FROST_BOW, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_BOW)).toBe(1);
    expect(inventoryFromSave(
      serialiseInventory(inventory),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      "",
      FROST_BOW,
    ).equippedLeftHand).toBe(FROST_BOW);
  });

  it("migrates Frost Armor stacks into one unique equipped item", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([FROST_ARMOR, FROST_ARMOR, FROST_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      FROST_ARMOR,
      false,
    );
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(1);
    expect(inventory.equippedChest).toBe(FROST_ARMOR);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_ARMOR);
    expect(setInventoryItemQuantity(inventory, FROST_ARMOR, 4)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(1);
  });

  it("restores and equips unique desert drops", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([WOOD_FULL_HELM, IRON_BOW]),
      "",
      WOOD_FULL_HELM,
      "",
      false,
      false,
      IRON_BOW,
      "",
    );
    expect(inventory.equippedHead).toBe(WOOD_FULL_HELM);
    expect(inventory.equippedRightHand).toBe(IRON_BOW);
    expect(inventoryItemQuantity(inventory, WOOD_FULL_HELM)).toBe(1);
    expect(inventoryItemQuantity(inventory, IRON_BOW)).toBe(1);
  });

  it("restores and equips unique Night Forest drops", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([DARK_METAL_HELMET, NIGHT_BOW, FIRE_METAL_BOW]),
      "",
      DARK_METAL_HELMET,
      "",
      false,
      false,
      FIRE_METAL_BOW,
      "",
    );
    expect(inventory.equippedHead).toBe(DARK_METAL_HELMET);
    expect(inventory.equippedRightHand).toBe(FIRE_METAL_BOW);
    expect(inventoryItemQuantity(inventory, DARK_METAL_HELMET)).toBe(1);
    expect(inventoryItemQuantity(inventory, FIRE_METAL_BOW)).toBe(1);
    expect(inventoryItemQuantity(inventory, NIGHT_BOW)).toBe(1);
  });

  it("restores and equips the regular Snowlands bow", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([SNOW_BOW]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      SNOW_BOW,
      "",
    );
    expect(inventory.equippedRightHand).toBe(SNOW_BOW);
    expect(inventoryItemQuantity(inventory, SNOW_BOW)).toBe(1);
  });

  it("separates cosmetic-only ownership and rejects stat gear as a new cosmetic", () => {
    const inventory = inventoryFromSave(JSON.stringify([STARTER_BOW, WOODEN_ARMOR, SUPERIOR_GOLDEN_HELMET, BASIC_PAPER_HAT]),
      "", BASIC_PAPER_HAT, WOODEN_ARMOR, false, false, STARTER_STONE);
    expect(cosmeticInventoryStacks(inventory).map(item => item.itemId)).toEqual([SUPERIOR_GOLDEN_HELMET, BASIC_PAPER_HAT]);
    expect(bagInventoryStacks(inventory).map(item => item.itemId)).toEqual([STARTER_BOW]);
    expect(moveCosmeticInventoryItem(inventory, STARTER_BOW, "RIGHT_HAND")).toBe(false);
    expect(moveInventoryItem(inventory, SUPERIOR_GOLDEN_HELMET, "HEAD")).toBe(false);
    expect(moveCosmeticInventoryItem(inventory, SUPERIOR_GOLDEN_HELMET, "HEAD")).toBe(true);
    expect(inventory.equippedChest).toBe(WOODEN_ARMOR);
    expect(inventory.equippedRightHand).toBe(STARTER_STONE);
    expect(equipmentAppearance(inventory).headItem).toBe(SUPERIOR_GOLDEN_HELMET);
    expect(cosmeticInventoryStacks(inventory)).toHaveLength(2);
  });

  it("toggles inherited equipment art to nothing without changing stat equipment", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([WOODEN_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      WOODEN_ARMOR,
      false,
      false,
      STARTER_STONE,
      "",
    );

    expect(toggleCosmeticEquipmentVisibility(inventory, "CHEST")).toBe("HIDDEN");
    expect(inventory.cosmeticChest).toBe(HIDDEN_COSMETIC_ITEM_ID);
    expect(inventory.equippedChest).toBe(WOODEN_ARMOR);
    expect(equipmentAppearance(inventory).chestItem).toBe("");
    expect(toggleCosmeticEquipmentVisibility(inventory, "CHEST")).toBe("EQUIPMENT");
    expect(equipmentAppearance(inventory).chestItem).toBe(WOODEN_ARMOR);

    expect(toggleCosmeticEquipmentVisibility(inventory, "RIGHT_HAND")).toBe("HIDDEN");
    expect(equipmentAppearance(inventory)).toMatchObject({ rightHandItem: "", leftHandItem: "" });
    expect(inventory.equippedRightHand).toBe(STARTER_STONE);
  });

  it("round-trips the reserved nothing-over-equipment cosmetic value", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([WOODEN_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      WOODEN_ARMOR,
      false,
      false,
      STARTER_STONE,
      "",
      HIDDEN_COSMETIC_ITEM_ID,
      HIDDEN_COSMETIC_ITEM_ID,
      "",
      HIDDEN_COSMETIC_ITEM_ID,
      "",
    );

    expect(inventory).toMatchObject({
      equippedHead: "",
      equippedChest: WOODEN_ARMOR,
      equippedRightHand: STARTER_STONE,
      cosmeticHead: HIDDEN_COSMETIC_ITEM_ID,
      cosmeticChest: HIDDEN_COSMETIC_ITEM_ID,
      cosmeticRightHand: HIDDEN_COSMETIC_ITEM_ID,
    });
    expect(equipmentAppearance(inventory)).toMatchObject({ headItem: "", chestItem: "", rightHandItem: "", leftHandItem: "" });
    expect(bagInventoryStacks(inventory)).toEqual([]);
  });

  it("preserves legacy gear appearances and lets the player remove them", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([FROST_ARMOR]),
      "",
      BASIC_PAPER_HAT,
      FROST_ARMOR,
      false,
      false,
      "",
      "",
      "",
      FROST_ARMOR,
    );

    expect(inventory.cosmeticChest).toBe(FROST_ARMOR);
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "CHEST")).toBe(false);
    expect(bagInventoryStacks(inventory).map(({ itemId }) => itemId)).not.toContain(FROST_ARMOR);

    expect(setInventoryItemQuantity(inventory, FROST_ARMOR, 2)).toBe(true);
    expect(inventoryItemQuantity(inventory, FROST_ARMOR)).toBe(1);
    expect(inventory.cosmeticChest).toBe(FROST_ARMOR);
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "CHEST")).toBe(false);

    expect(moveInventoryItem(inventory, FROST_ARMOR, "BAG")).toBe(true);
    expect(inventory.cosmeticChest).toBe(FROST_ARMOR);
    expect(bagInventoryStacks(inventory)).toContainEqual({ itemId: FROST_ARMOR, quantity: 1 });
    expect(moveCosmeticInventoryItem(inventory, FROST_ARMOR, "BAG")).toBe(true);
    expect(bagInventoryStacks(inventory)).toContainEqual({ itemId: FROST_ARMOR, quantity: 1 });
  });

  it("round-trips cosmetic slots and rejects unowned or incompatible overrides", () => {
    const inventory = inventoryFromSave(
      JSON.stringify([STARTER_BOW, FROST_ARMOR, BASIC_PAPER_HAT]),
      "",
      BASIC_PAPER_HAT,
      "",
      false,
      false,
      STARTER_STONE,
      "",
      FROST_ARMOR,
      FROST_ARMOR,
      STARTER_BOW,
      "",
      STARTER_BOW,
    );

    expect(inventory.cosmeticHead).toBe(BASIC_PAPER_HAT);
    expect(inventory.cosmeticChest).toBe(FROST_ARMOR);
    expect(inventory.cosmeticFeet).toBe("");
    expect(inventory.cosmeticLeftHand).toBe(STARTER_BOW);
    expect(inventoryFromSave(
      serialiseInventory(inventory),
      inventory.equippedFeet,
      inventory.equippedHead,
      inventory.equippedChest,
      false,
      false,
      inventory.equippedRightHand,
      inventory.equippedLeftHand,
      inventory.cosmeticHead,
      inventory.cosmeticChest,
      inventory.cosmeticFeet,
      inventory.cosmeticRightHand,
      inventory.cosmeticLeftHand,
    )).toEqual(inventory);
  });
});
