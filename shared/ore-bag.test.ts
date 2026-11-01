import { describe, expect, it } from "vitest";
import { ARROW_IDS, isArrowId } from "./arrows";
import { ORE_ORDER, REFINE_ORE_ORDER, bagFullForOres, bagSlotsWithOres, oreDescription, oreKindsHeld, rockOreKinds, roomForOres } from "./ore-bag";
import { gearClaimSpace } from "./mailbox-equipment";
import { IRON_BOW, ITEM_DEFINITIONS, SAMURAI_HAT } from "./items";
import { REFINE_ORES, refineCost } from "./refine";
import { ARCANE_CRYSTAL, MATERIAL_NAMES, WOOD_IDS } from "./crafting";

// Ore stacks take a slot each in the bag, like any item.
const bag = (extraCopies: number, ores: Record<string, number> = {}, capacity = 5) =>
  ({ owned: [IRON_BOW, SAMURAI_HAT], equipped: [IRON_BOW], extraCopies, ores, capacity });

describe("ores in the bag", () => {
  it("take one slot a kind held, however many are in the stack", () => {
    expect(oreKindsHeld({ starshard: 1, copper_ore: 900, iron_ore: 0 })).toEqual(["copper_ore", "starshard"]);
    // The hat is one slot (the bow is worn), a kept copy one, and two kinds of ore two.
    expect(bagSlotsWithOres(bag(1, { copper_ore: 900, starshard: 1 }))).toBe(4);
    expect(REFINE_ORE_ORDER).toEqual(["copper_ore", "iron_ore", "mithril_ore", "adamant_ore", "starshard"]);
    // The crafting wood and crystal stack after the ores, then crafted arrows, one slot a kind as well.
    expect(ORE_ORDER).toEqual([...REFINE_ORE_ORDER, "pine_log", "oak_log", "yew_log", "elder_log", "arcane_crystal", ...ARROW_IDS]);
    expect(oreKindsHeld({ arcane_crystal: 2, pine_log: 5, copper_ore: 1 })).toEqual(["copper_ore", "pine_log", "arcane_crystal"]);
    expect(bagSlotsWithOres(bag(0, { pine_log: 40, oak_log: 3, arcane_crystal: 1 }))).toBe(4);
  });

  it("need a free slot for a kind not held yet, and none for more of a kind held", () => {
    expect(roomForOres(bag(3), ["copper_ore"])).toEqual({ needed: ["copper_ore"], room: true });
    expect(roomForOres(bag(4), ["copper_ore"])).toEqual({ needed: ["copper_ore"], room: false });
    expect(roomForOres(bag(3, { copper_ore: 2 }), ["copper_ore"])).toEqual({ needed: [], room: true });
    // A Mysterious rock can give a Starshard too: room for both, before it is broken.
    const mysterious = rockOreKinds({ ore: "iron_ore", kind: "mysterious" });
    expect(mysterious).toEqual(["iron_ore", "starshard"]);
    expect(roomForOres(bag(2), mysterious)).toEqual({ needed: ["iron_ore", "starshard"], room: true });
    expect(roomForOres(bag(3), mysterious).room).toBe(false);
    expect(rockOreKinds({ ore: "iron_ore", kind: "large" })).toEqual(["iron_ore"]);
    expect(rockOreKinds({ ore: "arcane_crystal", kind: "crystal" })).toEqual(["arcane_crystal"]);
  });

  it("say what to free when the bag is full", () => {
    expect(bagFullForOres(["iron_ore"])).toBe("Your bag is full. Free a slot for Iron Ore.");
    expect(bagFullForOres(["iron_ore", "starshard"])).toBe("Your bag is full. Free 2 slots for Iron Ore and Starshard.");
  });

  it("count toward a Mailbox gear claim's space too", () => {
    expect(gearClaimSpace([SAMURAI_HAT], [], [], [IRON_BOW], 2).slotsToFree).toBe(0);
    expect(gearClaimSpace([SAMURAI_HAT], [], [], [IRON_BOW], 2, 1).slotsToFree).toBe(1);
  });

  it("each say what they refine and where they come from", () => {
    expect(oreDescription("copper_ore").use).toBe("The Smith refines Crude to Fine gear with it, one a try.");
    expect(oreDescription("adamant_ore").use).toBe("The Smith refines Celestial to Eternal gear with it, one a try.");
    expect(oreDescription("starshard").from).toContain("Mysterious rock");
    expect(oreDescription("oak_log").from).toBe("Chopped from Oak Trees in Timberwood, west of Town.");
    expect(oreDescription("arcane_crystal").from).toContain("crystal rocks");
    expect(bagFullForOres(["pine_log"])).toBe("Your bag is full. Free a slot for Pine Log.");
  });
});

describe("the crafting materials", () => {
  it("are named as crafting names them, and never cost a refine or a card", () => {
    // Arrows are made, not crafted with: they have no material name.
    for (const id of ORE_ORDER.filter(id => !isArrowId(id))) expect(REFINE_ORES[id].name).toBe(MATERIAL_NAMES[id]);
    for (const id of [...WOOD_IDS, ARCANE_CRYSTAL]) expect(REFINE_ORES[id].grade).toBeNull();
    for (const itemId of Object.keys(ITEM_DEFINITIONS)) {
      for (const level of [1, 11, 20]) {
        const cost = refineCost(itemId, level);
        if (cost) for (const oreId of Object.keys(cost)) expect(REFINE_ORE_ORDER).toContain(oreId);
      }
    }
  });
});
