import { describe, expect, it } from "vitest";
import { FROST_ARMOR, STARTER_BOW } from "../game/inventory";
import { inventoryDragDestination } from "./inventory-drag";

describe("inventory drag destinations", () => {
  it("equips bag items only in compatible slots", () => {
    expect(inventoryDragDestination(STARTER_BOW, "BAG", "RIGHT_HAND")).toBe("RIGHT_HAND");
    expect(inventoryDragDestination(STARTER_BOW, "BAG", "LEFT_HAND")).toBe("LEFT_HAND");
    expect(inventoryDragDestination(STARTER_BOW, "BAG", "CHEST")).toBeNull();
    expect(inventoryDragDestination(FROST_ARMOR, "BAG", "CHEST")).toBe("CHEST");
  });

  it("unequips to the bag and supports switching hands", () => {
    expect(inventoryDragDestination(STARTER_BOW, "RIGHT_HAND", "BAG")).toBe("BAG");
    expect(inventoryDragDestination(STARTER_BOW, "RIGHT_HAND", "LEFT_HAND")).toBe("LEFT_HAND");
  });

  it("treats same-location and bag-to-bag drops as no-ops", () => {
    expect(inventoryDragDestination(STARTER_BOW, "RIGHT_HAND", "RIGHT_HAND")).toBeNull();
    expect(inventoryDragDestination(STARTER_BOW, "BAG", "BAG")).toBeNull();
    expect(inventoryDragDestination("", "BAG", "RIGHT_HAND")).toBeNull();
  });
});
