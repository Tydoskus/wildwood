import { describe, expect, it } from "vitest";
import { STARTER_BOW, STARTER_STONE } from "../../shared/items";
import { itemArtMarkup, projectileKindForWeapon } from "./item-presentation";

describe("item presentation", () => {
  it("renders weapon-specific inventory and inspection art", () => {
    expect(itemArtMarkup(STARTER_STONE)).toContain("stone.png");
    expect(itemArtMarkup(STARTER_BOW)).toContain("data:image/png;base64,");
    expect(itemArtMarkup(STARTER_STONE)).not.toContain("boot-pixel-icon");
    expect(itemArtMarkup(STARTER_BOW)).not.toContain("boot-pixel-icon");
  });

  it("keeps Rock and Bow projectile visuals separate", () => {
    expect(projectileKindForWeapon(STARTER_STONE)).toBe("ROCK");
    expect(projectileKindForWeapon(STARTER_BOW)).toBe("ARROW");
  });
});
