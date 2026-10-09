import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVELOPER_ITEM_IDS, GALAXY_ARMOR, GALAXY_BOOTS, GALAXY_BOW, GALAXY_HELMET, isCosmeticOnlyItem, isWeaponItem, itemDefinition,
} from "../../shared/items";
import { galaxyFinishFrame } from "./galaxy-finish";
import { itemArtMarkup, itemHasGalaxyFinish, itemPresentation } from "./item-presentation";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "./player-appearance";

const GALAXY_SET = [GALAXY_HELMET, GALAXY_ARMOR, GALAXY_BOOTS, GALAXY_BOW];

/** A 2D context that accepts every call; reads that callers depend on get a usable answer. */
function fakeContext(owner: { width: number; height: number }, draws?: unknown[]) {
  const pixels = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "canvas") return owner;
      if (key === "drawImage") return (source: unknown) => { draws?.push(source); };
      if (key === "getImageData") return (_x: number, _y: number, width: number, height: number) => pixels(width, height);
      if (key === "createImageData") return (width: number, height: number) => pixels(width, height);
      if (key === "createPattern") return () => ({});
      return () => ({ addColorStop() {} });
    },
    set(target, key, value) { target[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas() {
  const canvas = { width: 300, height: 150, toDataURL: () => "data:image/jpeg;base64,", getContext: () => context };
  const context = fakeContext(canvas);
  return canvas;
}

const image = (name: string, width = 40, height = 40) =>
  ({ complete: true, naturalWidth: width, naturalHeight: height, width, height, name }) as unknown as HTMLImageElement;

describe("Galaxy set catalogue", () => {
  it("is four developer-granted cosmetics, one per visible slot, with no stats", () => {
    expect(GALAXY_SET.map(id => itemDefinition(id)?.slot)).toEqual(["HEAD", "CHEST", "FEET", "HAND"]);
    for (const id of GALAXY_SET) {
      expect(isCosmeticOnlyItem(id), id).toBe(true);
      expect(DEVELOPER_ITEM_IDS, id).toContain(id);
      expect(itemDefinition(id)?.stats, id).toEqual(["COSMETIC · NO STATS"]);
      expect(itemHasGalaxyFinish(id), id).toBe(true);
    }
    // A look only: the bow never becomes a weapon of its own.
    expect(isWeaponItem(GALAXY_BOW)).toBe(false);
  });

  it("borrows the Ion Sovereign silhouettes and has boots of its own", () => {
    expect(itemPresentation(GALAXY_HELMET)?.world).toEqual(itemPresentation("ion_helmet")?.world);
    expect(itemPresentation(GALAXY_ARMOR)?.world).toEqual(itemPresentation("ion_armor")?.world);
    expect(itemPresentation(GALAXY_BOW)?.world).toEqual(itemPresentation("ion_bow")?.world);
    expect(itemPresentation(GALAXY_BOW)?.projectile).toBe("ARROW");
    const boots = itemPresentation(GALAXY_BOOTS)?.world;
    expect(boots).toMatchObject({ kind: "LEGS", width: 26, height: 22 });
    if (boots?.kind !== "LEGS") return;
    expect(boots.frontSource).toMatch(/^data:image\/png;base64,/);
    expect(boots.backSource).not.toBe(boots.frontSource);
    expect(itemHasGalaxyFinish("ion_armor")).toBe(false);
  });

  it("marks inventory art for the CSS galaxy mask, with the art's url inline", () => {
    const markup = itemArtMarkup(GALAXY_ARMOR);
    expect(markup).toContain('class="inventory-item-art has-galaxy-finish"');
    expect(markup).toContain("mask-image: url(assets/wildstat/player-parts/ion-armor.webp)");
    expect(markup).toContain("var(--galaxy-art-texture,");
    expect(itemArtMarkup("ion_armor")).not.toContain("has-galaxy-finish");
  });
});

describe("galaxy finish rendering", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("cannot paint without a document, so callers keep the plain art", () => {
    expect(galaxyFinishFrame(image("plain"))).toBeNull();
  });

  it("shares one frame per piece, repainted at most thirty times a second", () => {
    vi.stubGlobal("document", { createElement: fakeCanvas });
    const sprite = image("chest", 76, 68);
    const frame = galaxyFinishFrame(sprite, undefined, 1_000);
    expect(frame).toMatchObject({ width: 152, height: 136 });
    expect(galaxyFinishFrame(sprite, undefined, 1_010)).toBe(frame);
    // The size is the drawn one, so large source art does not shrink the sky's grain.
    expect(galaxyFinishFrame(image("boot", 104, 88), { width: 26, height: 22 }, 1_000)).toMatchObject({ width: 52, height: 44 });
  });

  it("draws live pieces in body order around the cached halves of the body", () => {
    vi.stubGlobal("document", { createElement: fakeCanvas });
    const sprites = { head: image("helmet", 118, 106), chest: image("chest", 76, 68), bow: image("bow", 130, 71), front: image("boot-front", 104, 88), back: image("boot-back", 104, 88) };
    const assets: PlayerAppearanceAssets = {
      basicFrontLeg: image("front-leg"), basicBackLeg: image("back-leg"),
      equipment: {
        [GALAXY_HELMET]: { sprite: sprites.head }, [GALAXY_ARMOR]: { sprite: sprites.chest }, [GALAXY_BOW]: { sprite: sprites.bow },
        [GALAXY_BOOTS]: { frontLeg: sprites.front, backLeg: sprites.back },
      },
    };
    const draws: unknown[] = [];
    const owner = { width: 800, height: 600 };
    drawStartingPlayer(fakeContext(owner, draws), assets, {
      x: 0, y: 0, facing: 0, gameTime: 0,
      headItem: GALAXY_HELMET, chestItem: GALAXY_ARMOR, feetItem: GALAXY_BOOTS, rightHandItem: GALAXY_BOW,
    });
    const frameOf = (sprite: HTMLImageElement) => galaxyFinishFrame(sprite);
    const isBodyCache = (source: unknown) => (source as { width?: number }).width === 180;
    const order = draws.map(source => source === frameOf(sprites.back) ? "back-boot"
      : source === frameOf(sprites.front) ? "front-boot"
        : source === frameOf(sprites.chest) ? "chest"
          : source === frameOf(sprites.head) ? "helmet"
            : source === frameOf(sprites.bow) ? "bow"
              : isBodyCache(source) ? "cached-body" : "other");
    expect(order).toEqual(["back-boot", "front-boot", "cached-body", "chest", "cached-body", "helmet", "bow"]);
  });
});
