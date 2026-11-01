import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { TOWN_FEET_OFFSET, TOWN_SMITH_POSITION } from "../../shared/town";
import { addOres, oreCount, refineLevelFor, setRefineLevel } from "./item-refine";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;

/** Beside the Smith, holding an Ion Bow (worn) and a Sky Bow, with ores to spend. */
function atBench() {
  const f = crystalFixture();
  f.patch("player", { mapId: "town", x: TOWN_SMITH_POSITION.x, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET });
  f.patch("playerProgress", { inventoryJson: JSON.stringify(["ion_bow", "sky_bow"]), equippedRightHand: "ion_bow" });
  addOres(f.ctx, f.ctx.sender, "adamant_ore", 50);
  addOres(f.ctx, f.ctx.sender, "iron_ore", 50);
  const refine = (itemId = "ion_bow", copyId = 0n, expectedLevel = refineLevelFor(f.ctx, f.ctx.sender, itemId, copyId)) =>
    f.run(server.refineItem, { itemId, copyId, expectedLevel });
  const rolls = (value: number) => { f.ctx.random = Object.assign(() => value, { integerInRange: (min: number) => min }) as any; };
  return { ...f, refine, rolls, level: (itemId = "ion_bow", copyId = 0n) => refineLevelFor(f.ctx, f.ctx.sender, itemId, copyId) };
}
const result = (f: Fixture) => f.db.playerRefineResult.identity.find(f.ctx.sender);

describe("a refine try", () => {
  it("is only taken at the Smith", () => {
    const f = atBench();
    f.patch("player", { mapId: "town", x: TOWN_SMITH_POSITION.x + 400, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET });
    expect(() => f.refine()).toThrow("Talk to the Smith first.");
    f.patch("player", { mapId: "crystal_hollows", x: TOWN_SMITH_POSITION.x, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET });
    expect(() => f.refine()).toThrow("Talk to the Smith first.");
    expect(oreCount(f.ctx, f.ctx.sender, "adamant_ore")).toBe(50);
  });

  it("needs an item that refines and that the player holds", () => {
    const f = atBench();
    expect(() => f.refine("starter_stone")).toThrow("cannot be refined");
    expect(() => f.refine("neon_bow")).toThrow("not in your inventory");
    expect(() => f.refine("nonsense")).toThrow("cannot be refined");
  });

  it("refuses a stale level or missing ore, and then spends nothing", () => {
    const f = atBench();
    expect(() => f.refine("ion_bow", 0n, 3)).toThrow("refine changed");
    f.db.playerOre.key.delete(`${f.ctx.sender.toHexString()}:adamant_ore`);
    expect(() => f.refine()).toThrow("You need 1 Adamant Ore");
    expect(f.level()).toBe(0);
    expect(result(f)).toBeFalsy();
  });

  it("always works up to the safe limit, one ore a try, whatever the roll", () => {
    const f = atBench();
    f.rolls(.999);
    for (let level = 1; level <= 4; level++) f.refine();
    expect(f.level()).toBe(4);
    expect(oreCount(f.ctx, f.ctx.sender, "adamant_ore")).toBe(46);
    expect(result(f)).toMatchObject({ itemId: "ion_bow", copyId: 0n, fromLevel: 3, toLevel: 4, succeeded: true, attempt: 4 });
  });

  it("past the safe limit works under the chance and keeps its level over it, spending the ore either way", () => {
    const f = atBench();
    setRefineLevel(f.ctx, f.ctx.sender, "ion_bow", 0n, 4);
    f.rolls(.999);
    f.refine();
    expect(f.level()).toBe(4);
    expect(result(f)).toMatchObject({ fromLevel: 4, toLevel: 4, succeeded: false });
    setRefineLevel(f.ctx, f.ctx.sender, "ion_bow", 0n, 4);
    f.rolls(0);
    f.refine();
    expect(f.level()).toBe(5);
    expect(oreCount(f.ctx, f.ctx.sender, "adamant_ore")).toBe(48);
  });

  it("counts fails in a row on that copy, rolls the next try against the raised chance, and starts over on a success", () => {
    const f = atBench();
    // Ion Bow +10 to +11: 2%, then 2.02%, 2.04%, ... with each fail in a row.
    setRefineLevel(f.ctx, f.ctx.sender, "ion_bow", 0n, 10);
    addOres(f.ctx, f.ctx.sender, "starshard", 50);
    f.rolls(.0201);
    f.refine();
    expect(f.level()).toBe(10);
    f.refine();
    expect(f.level()).toBe(11);
    // The next level starts from none.
    f.rolls(.999);
    f.refine();
    expect(f.db.playerRefinePity.key.find(`${f.ctx.sender.toHexString()}:ion_bow:0`)).toMatchObject({ level: 11, fails: 1 });
  });

  it("takes a Starshard as well from +11, goes past +20, and stops at +30", () => {
    const f = atBench();
    f.rolls(0);
    setRefineLevel(f.ctx, f.ctx.sender, "ion_bow", 0n, 10);
    expect(() => f.refine()).toThrow("You need 1 Adamant Ore and 1 Starshard");
    addOres(f.ctx, f.ctx.sender, "starshard", 1);
    f.refine();
    expect(f.level()).toBe(11);
    expect(oreCount(f.ctx, f.ctx.sender, "starshard")).toBe(0);
    setRefineLevel(f.ctx, f.ctx.sender, "ion_bow", 0n, 20);
    addOres(f.ctx, f.ctx.sender, "starshard", 1);
    f.refine();
    expect(f.level()).toBe(21);
    setRefineLevel(f.ctx, f.ctx.sender, "ion_bow", 0n, 30);
    expect(() => f.refine()).toThrow("already +30");
  });

  it("uses the item's own grade ore", () => {
    const f = atBench();
    f.refine("sky_bow");
    expect(f.level("sky_bow")).toBe(1);
    expect(oreCount(f.ctx, f.ctx.sender, "iron_ore")).toBe(49);
    expect(oreCount(f.ctx, f.ctx.sender, "adamant_ore")).toBe(50);
  });

  it("refines a kept copy on its own, and never someone else's", () => {
    const f = atBench();
    f.seed("playerEquipmentCopy", { id: 7n, identity: f.ctx.sender, itemId: "ion_bow", arrowStorm: 0, ricochet: 0, piercingShot: 0, acquiredAt: f.ctx.timestamp });
    f.seed("playerEquipmentCopy", { id: 8n, identity: identity("9"), itemId: "ion_bow", arrowStorm: 0, ricochet: 0, piercingShot: 0, acquiredAt: f.ctx.timestamp });
    f.refine("ion_bow", 7n);
    expect([f.level(), f.level("ion_bow", 7n)]).toEqual([0, 1]);
    expect(() => f.refine("ion_bow", 8n)).toThrow("copy is not in your inventory");
    expect(() => f.refine("sky_bow", 7n)).toThrow("copy is not in your inventory");
  });

  it("is not taken mid-duel", () => {
    const f = atBench();
    f.seed("duel", { id: 1n, challenger: f.ctx.sender, opponent: identity("8"), status: "active" });
    expect(() => f.refine()).toThrow("Finish your duel first.");
    expect(f.level()).toBe(0);
  });
});
