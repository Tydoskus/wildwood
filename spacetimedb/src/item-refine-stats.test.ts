import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { TOWN_FEET_OFFSET, TOWN_SMITH_POSITION } from "../../shared/town";
import { equipmentDamageMultiplierBonus, itemDamageMultiplierBonus, itemMaxHealthMultiplierBonus, itemStats } from "../../shared/items";
import { equipComparisonPower } from "../../shared/equip-best";
import { addOres, setRefineLevel } from "./item-refine";
import { effectivePowerForProgress, researchedDamage } from "./player-power";
import { itemLevelFor, maxHealthForProgress } from "./progress-helpers";
import { readPlayerProgress } from "./wide-stats";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("what a refine does to an item", () => {
  it("multiplies the item's stat, on top of its slot tier", () => {
    const base = itemDamageMultiplierBonus("ion_bow");
    expect(base).toBeCloseTo(.8, 9);
    expect(itemDamageMultiplierBonus("ion_bow", { refine: 10 })).toBeCloseTo(1.2, 9);
    expect(itemDamageMultiplierBonus("ion_bow", { tier: 10, refine: 10 })).toBeCloseTo(.8 * 1.4 * 1.5, 9);
    // A bare number is still the slot tier alone, as every caller passed before refining.
    expect(itemDamageMultiplierBonus("ion_bow", 10)).toBeCloseTo(.8 * 1.4, 9);
    expect(itemMaxHealthMultiplierBonus("ion_armor", { refine: 4 })).toBeCloseTo(itemMaxHealthMultiplierBonus("ion_armor") * 1.2, 9);
    expect(itemStats("ion_bow", { refine: 10 })).toEqual(["DAMAGE ×2.2"]);
  });

  it("lets Equip best prefer a refined bow over a stronger one left plain", () => {
    // Neon Bow (Tier 13) +10 against an unrefined Ion Bow (Tier 15).
    const stats = { maxHp: 100, damage: 100, attackRate: 1, armor: 0, regen: 1 };
    const level = (itemId: string) => (itemId === "neon_bow" ? { refine: 10 } : 0);
    const neon = equipComparisonPower({ ...stats, equippedRightHand: "neon_bow" } as any, null, level);
    const ion = equipComparisonPower({ ...stats, equippedRightHand: "ion_bow" } as any, null, level);
    expect(equipmentDamageMultiplierBonus("neon_bow", "", "", { refine: 10 })).toBeGreaterThan(equipmentDamageMultiplierBonus("ion_bow", "", ""));
    expect(neon).toBeGreaterThan(ion);
  });
});

describe("on the server", () => {
  // Tier 1 gear: anything higher gives no stats until its map is reached (equipment-access.ts).
  function wearing() {
    const f = crystalFixture();
    f.patch("playerProgress", { inventoryJson: JSON.stringify(["starter_bow", "wooden_armor"]), equippedRightHand: "starter_bow", equippedChest: "wooden_armor" });
    return f;
  }

  it("reads the worn first copy's refine with its slot tier", () => {
    const f = wearing();
    setRefineLevel(f.ctx, f.ctx.sender, "starter_bow", 0n, 6);
    expect(itemLevelFor(f.ctx, f.ctx.sender, "starter_bow")).toEqual({ tier: 0, refine: 6 });
    expect(itemLevelFor(f.ctx, f.ctx.sender, "")).toEqual({ tier: 0, refine: 0 });
  });

  it("raises worn damage, health and power, and a refined copy in the bag changes nothing", () => {
    const f = wearing();
    const progress = () => readPlayerProgress(f.ctx, f.ctx.sender);
    const before = { damage: researchedDamage(f.ctx, f.ctx.sender, 100), health: maxHealthForProgress(f.ctx, f.ctx.sender, progress()), power: effectivePowerForProgress(f.ctx, progress()) };
    expect(before.damage).toBeCloseTo(105, 6);
    setRefineLevel(f.ctx, f.ctx.sender, "starter_bow", 99n, 10);
    expect(researchedDamage(f.ctx, f.ctx.sender, 100)).toBeCloseTo(before.damage, 9);
    setRefineLevel(f.ctx, f.ctx.sender, "starter_bow", 0n, 10);
    setRefineLevel(f.ctx, f.ctx.sender, "wooden_armor", 0n, 4);
    expect(researchedDamage(f.ctx, f.ctx.sender, 100)).toBeCloseTo(100 * (1 + .05 * 1.5), 6);
    expect(maxHealthForProgress(f.ctx, f.ctx.sender, progress())).toBeGreaterThan(before.health);
    expect(effectivePowerForProgress(f.ctx, progress())).toBeGreaterThan(before.power);
  });

  it("refreshes the player's shown power when the worn item's refine changes", () => {
    const f = wearing();
    f.patch("player", { mapId: "town", x: TOWN_SMITH_POSITION.x, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET });
    addOres(f.ctx, f.ctx.sender, "copper_ore", 3);
    const before = f.db.player.identity.find(f.ctx.sender).powerLevel;
    f.run(server.refineItem, { itemId: "starter_bow", copyId: 0n, expectedLevel: 0 });
    expect(f.db.player.identity.find(f.ctx.sender).powerLevel).toBeGreaterThan(before);
  });
});
