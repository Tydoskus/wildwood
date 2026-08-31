import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DARK_METAL_HELMET, FIRE_METAL_BOW, FIRE_METAL_HELMET, FROST_ARMOR, FROST_BOW, IRON_BOW, LAVA_BOW, MAGMA_ARMOR, NIGHT_BOW, SNOW_BOW, STARTER_BOW, STARTER_STONE, WOOD_FULL_HELM, WOODEN_ARMOR } from "../../shared/items";
import { itemArtMarkup, itemPresentation, projectileKindForWeapon } from "./item-presentation";

describe("item presentation", () => {
  it("renders weapon-specific inventory and inspection art", () => {
    expect(itemArtMarkup(STARTER_STONE)).toContain("stone.png");
    expect(itemArtMarkup(STARTER_BOW)).toContain("data:image/png;base64,");
    expect(itemArtMarkup(FROST_BOW)).toContain("player-parts/frost-bow.png");
    expect(itemArtMarkup(FROST_ARMOR)).toContain("player-parts/frost-armor.png");
    expect(itemArtMarkup(IRON_BOW)).toContain("player-parts/iron-bow.png");
    expect(itemArtMarkup(WOOD_FULL_HELM)).toContain("player-parts/wood-full-helm.png");
    expect(itemArtMarkup(LAVA_BOW)).toContain("player-parts/lava-bow.png");
    expect(itemArtMarkup(MAGMA_ARMOR)).toContain("player-parts/magma-armor.png");
    expect(itemArtMarkup(FIRE_METAL_HELMET)).toContain("player-parts/fire-metal-helmet.png");
    expect(itemArtMarkup(DARK_METAL_HELMET)).toContain("player-parts/dark-metal-helmet.png");
    expect(itemArtMarkup(FIRE_METAL_BOW)).toContain("player-parts/fire-metal-bow.png");
    expect(itemArtMarkup(SNOW_BOW)).toContain("player-parts/snow-bow.png");
    expect(itemArtMarkup(NIGHT_BOW)).toContain("player-parts/night-bow.png");
    expect(itemArtMarkup(WOODEN_ARMOR)).toContain("data:image/png;base64,");
    expect(itemArtMarkup(STARTER_STONE)).not.toContain("boot-pixel-icon");
    expect(itemArtMarkup(STARTER_BOW)).not.toContain("boot-pixel-icon");
  });

  it("keeps Rock and Bow projectile visuals separate", () => {
    expect(projectileKindForWeapon(STARTER_STONE)).toBe("ROCK");
    expect(projectileKindForWeapon(STARTER_BOW)).toBe("ARROW");
    expect(projectileKindForWeapon(FROST_BOW)).toBe("ARROW");
    expect(projectileKindForWeapon(IRON_BOW)).toBe("ARROW");
    expect(projectileKindForWeapon(SNOW_BOW)).toBe("ARROW");
    expect(projectileKindForWeapon(NIGHT_BOW)).toBe("ARROW");
  });

  it("renders world bows twenty-five percent larger", () => {
    const world = itemPresentation(STARTER_BOW)?.world;
    expect(world?.kind).toBe("SPRITE");
    if (world?.kind !== "SPRITE") return;
    expect(world.width).toBe(115);
    expect(world.height).toBe(63);
  });

  it("uses the exact transparent blue vendor bow asset at the established bow size", () => {
    const asset = readFileSync(new URL("../../public/assets/wildstat/player-parts/frost-bow.png", import.meta.url));
    expect(createHash("sha256").update(asset).digest("hex")).toBe("a13a7ed71cfd8f6958f67133f4f16340449b27cb0645f38e3801b68ab14edf59");
    const world = itemPresentation(FROST_BOW)?.world;
    expect(world).toMatchObject({
      kind: "SPRITE",
      source: "assets/wildstat/player-parts/frost-bow.png",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    });
  });

  it("uses the requested Lava Bow and Magma Armor vendor assets", () => {
    const bow = readFileSync(new URL("../../public/assets/wildstat/player-parts/lava-bow.png", import.meta.url));
    const armor = readFileSync(new URL("../../public/assets/wildstat/player-parts/magma-armor.png", import.meta.url));
    expect(createHash("sha256").update(bow).digest("hex")).toBe("cf6a4cd3cd27c9350decd21c06e09bbd495505ad4348bf90a1cda0e0d4240e5d");
    expect(createHash("sha256").update(armor).digest("hex")).toBe("b7ebe48ca52241e5c08e818af101c6c632a3534464cdc50d7e558cfd69273b04");
  });

  it("uses the exact requested white and purple vendor bow assets", () => {
    const snowBow = readFileSync(new URL("../../public/assets/wildstat/player-parts/snow-bow.png", import.meta.url));
    const nightBow = readFileSync(new URL("../../public/assets/wildstat/player-parts/night-bow.png", import.meta.url));
    expect(createHash("sha256").update(snowBow).digest("hex")).toBe("0288a8475c0660fed7e213942925e44bd31b5d246aefcbb05f97962ac4a82005");
    expect(createHash("sha256").update(nightBow).digest("hex")).toBe("82953550acb76622ac525df884a09f949858362cbce2a80cd0dcbfb8e5ba04f5");
    expect(itemPresentation(SNOW_BOW)?.world).toMatchObject({ layer: "HAND", width: 115, height: 63, top: 106, handAction: "BOW" });
    expect(itemPresentation(NIGHT_BOW)?.world).toMatchObject({ layer: "HAND", width: 115, height: 63, top: 106, handAction: "BOW" });
  });

  it("uses the requested Wood Full Helm and Iron Bow vendor assets", () => {
    const helm = readFileSync(new URL("../../public/assets/wildstat/player-parts/wood-full-helm.png", import.meta.url));
    const bow = readFileSync(new URL("../../public/assets/wildstat/player-parts/iron-bow.png", import.meta.url));
    expect(createHash("sha256").update(helm).digest("hex")).toBe("cad2fa2a93856f96d6c33ef21bb08aa447570e80bc717abcd03eec8d3b2bb55c");
    expect(createHash("sha256").update(bow).digest("hex")).toBe("24fdf3237d34f38478f7d4fbf30798afb6f61f9baff0d8d3314183ff3f80fd88");
    expect(itemPresentation(WOOD_FULL_HELM)?.world).toMatchObject({
      kind: "SPRITE",
      source: "assets/wildstat/player-parts/wood-full-helm.png",
      layer: "HEAD",
      bottom: 144,
    });
    expect(itemPresentation(IRON_BOW)?.world).toMatchObject({
      kind: "SPRITE",
      source: "assets/wildstat/player-parts/iron-bow.png",
      layer: "HAND",
      width: 115,
      height: 63,
      top: 106,
      handAction: "BOW",
    });
  });

  it("uses the exact requested Fire Metal equipment assets", () => {
    const helmet = readFileSync(new URL("../../public/assets/wildstat/player-parts/fire-metal-helmet.png", import.meta.url));
    const bow = readFileSync(new URL("../../public/assets/wildstat/player-parts/fire-metal-bow.png", import.meta.url));
    expect(createHash("sha256").update(helmet).digest("hex")).toBe("3df17fa388f6273067c0320aeb00391730e67bfcc36d78e396a4c29edd300531");
    expect(createHash("sha256").update(bow).digest("hex")).toBe("6d9427c5ebc29dbf8df188f029215a2453e8afd67a6358fe01b74cab5cb06867");
    expect(itemPresentation(FIRE_METAL_HELMET)?.world).toMatchObject({ layer: "HEAD", bottom: 144 });
    expect(itemPresentation(FIRE_METAL_BOW)?.world).toMatchObject({ layer: "HAND", width: 115, height: 63, top: 106, handAction: "BOW" });
  });

  it("uses the requested dark horned helmet asset", () => {
    const helmet = readFileSync(new URL("../../public/assets/wildstat/player-parts/dark-metal-helmet.png", import.meta.url));
    expect(createHash("sha256").update(helmet).digest("hex")).toBe("6417507209ab4d6e43564c5003c720992f4d07974640964f9007ef6334d31f65");
    expect(itemPresentation(DARK_METAL_HELMET)?.world).toMatchObject({
      kind: "SPRITE",
      source: "assets/wildstat/player-parts/dark-metal-helmet.png",
      layer: "HEAD",
      bottom: 144,
    });
  });

  it("uses the exact transparent FA_Chest_032_Blue vendor armor asset", () => {
    const asset = readFileSync(new URL("../../public/assets/wildstat/player-parts/frost-armor.png", import.meta.url));
    expect(createHash("sha256").update(asset).digest("hex")).toBe("8e106750b8acd754c4cbe3aa766f25b0da68bbdf8a5e4a8b858a6e7b72241081");
    expect(itemPresentation(FROST_ARMOR)?.world).toMatchObject({
      kind: "SPRITE",
      source: "assets/wildstat/player-parts/frost-armor.png",
      layer: "CHEST",
      width: 76,
      height: 68,
      top: 100,
    });
  });
});
