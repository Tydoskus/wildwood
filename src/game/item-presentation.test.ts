import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FROST_ARMOR, FROST_BOW, STARTER_BOW, STARTER_STONE, WOODEN_ARMOR } from "../../shared/items";
import { itemArtMarkup, itemPresentation, projectileKindForWeapon } from "./item-presentation";

describe("item presentation", () => {
  it("renders weapon-specific inventory and inspection art", () => {
    expect(itemArtMarkup(STARTER_STONE)).toContain("stone.png");
    expect(itemArtMarkup(STARTER_BOW)).toContain("data:image/png;base64,");
    expect(itemArtMarkup(FROST_BOW)).toContain("player-parts/frost-bow.png");
    expect(itemArtMarkup(FROST_ARMOR)).toContain("player-parts/frost-armor.png");
    expect(itemArtMarkup(WOODEN_ARMOR)).toContain("data:image/png;base64,");
    expect(itemArtMarkup(STARTER_STONE)).not.toContain("boot-pixel-icon");
    expect(itemArtMarkup(STARTER_BOW)).not.toContain("boot-pixel-icon");
  });

  it("keeps Rock and Bow projectile visuals separate", () => {
    expect(projectileKindForWeapon(STARTER_STONE)).toBe("ROCK");
    expect(projectileKindForWeapon(STARTER_BOW)).toBe("ARROW");
    expect(projectileKindForWeapon(FROST_BOW)).toBe("ARROW");
  });

  it("renders the Bow slightly larger than its original player size", () => {
    const world = itemPresentation(STARTER_BOW)?.world;
    expect(world?.kind).toBe("SPRITE");
    if (world?.kind !== "SPRITE") return;
    expect(world.width).toBe(92);
    expect(world.height).toBe(50);
  });

  it("uses the exact transparent blue vendor bow asset at the established bow size", () => {
    const asset = readFileSync(new URL("../../public/assets/wildwood/player-parts/frost-bow.png", import.meta.url));
    expect(createHash("sha256").update(asset).digest("hex")).toBe("244285ca6bb7ea0908a776e9f5a8989ecaa4b31ceac4aa731552d2532c4479a2");
    const world = itemPresentation(FROST_BOW)?.world;
    expect(world).toMatchObject({
      kind: "SPRITE",
      source: "assets/wildwood/player-parts/frost-bow.png",
      width: 92,
      height: 50,
      top: 102,
      handAction: "BOW",
    });
  });

  it("uses the exact transparent FA_Chest_032_Blue vendor armor asset", () => {
    const asset = readFileSync(new URL("../../public/assets/wildwood/player-parts/frost-armor.png", import.meta.url));
    expect(createHash("sha256").update(asset).digest("hex")).toBe("8e106750b8acd754c4cbe3aa766f25b0da68bbdf8a5e4a8b858a6e7b72241081");
    expect(itemPresentation(FROST_ARMOR)?.world).toMatchObject({
      kind: "SPRITE",
      source: "assets/wildwood/player-parts/frost-armor.png",
      layer: "CHEST",
      width: 76,
      height: 68,
      top: 100,
    });
  });
});
