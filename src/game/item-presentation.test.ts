import { describe, expect, it } from "vitest";
import { STARTER_BOW, STARTER_STONE, WOODEN_ARMOR } from "../../shared/items";
import { itemArtMarkup, itemPresentation, projectileKindForWeapon } from "./item-presentation";

describe("item presentation", () => {
  it("renders weapon-specific inventory and inspection art", () => {
    expect(itemArtMarkup(STARTER_STONE)).toContain("stone.png");
    expect(itemArtMarkup(STARTER_BOW)).toContain("data:image/png;base64,");
    expect(itemArtMarkup(WOODEN_ARMOR)).toContain("data:image/png;base64,");
    expect(itemArtMarkup(STARTER_STONE)).not.toContain("boot-pixel-icon");
    expect(itemArtMarkup(STARTER_BOW)).not.toContain("boot-pixel-icon");
  });

  it("keeps Rock and Bow projectile visuals separate", () => {
    expect(projectileKindForWeapon(STARTER_STONE)).toBe("ROCK");
    expect(projectileKindForWeapon(STARTER_BOW)).toBe("ARROW");
  });

  it("renders the Bow at its full source size on players", () => {
    const world = itemPresentation(STARTER_BOW)?.world;
    expect(world?.kind).toBe("SPRITE");
    if (world?.kind !== "SPRITE") return;
    expect(world.width).toBe(130);
    expect(world.height).toBe(71);
  });
});
