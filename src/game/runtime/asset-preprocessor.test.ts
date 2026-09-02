import { afterEach, describe, expect, it, vi } from "vitest";
import { DUEL_PLATFORM_ART_SOURCE, DUEL_SPACE_BACKGROUND_SOURCE } from "../duel";
import { PORTAL_SWIRL_SOURCE } from "../portal-presentation";
import { TUTORIAL_FOREST_MAP_ID } from "../world";
import { createAssetPreprocessor } from "./asset-preprocessor";
import { SCORPION_SPRITE } from "./scorpion-sprite";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("map-scoped image preprocessing", () => {
  it("requests only core and current-map art during startup", () => {
    const requests: string[] = [];
    class FakeImage extends EventTarget {
      decoding = "auto";
      private source = "";

      get src() { return this.source; }
      set src(value: string) {
        this.source = value;
        requests.push(value);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("document", {
      createElement: (tagName: string) => tagName === "canvas"
        ? { getContext: () => ({}) }
        : {},
    });

    const assets = createAssetPreprocessor(() => {});
    expect(requests).toEqual([
      "assets/wildstat/stone-portal-arch.png",
      PORTAL_SWIRL_SOURCE,
    ]);
    expect(requests).not.toContain(DUEL_SPACE_BACKGROUND_SOURCE);
    expect(requests).not.toContain(DUEL_PLATFORM_ART_SOURCE);

    void assets.ensureMapAssets(TUTORIAL_FOREST_MAP_ID);
    expect(requests).toContain("assets/wildstat/dragon_boss_spritesheet.png");
    expect(requests).toContain("assets/wildstat/tree-spritesheet-v1.png");
    expect(requests).not.toContain(SCORPION_SPRITE.source);
    expect(requests).not.toContain("assets/wildstat/frostclaw-boss-spritesheet.png");
    expect(requests).not.toContain("assets/wildstat/lava/lava-pool-1.png");
    expect(requests).not.toContain("assets/wildstat/night-tree-spritesheet-v1.png");
    expect(requests).not.toContain(DUEL_SPACE_BACKGROUND_SOURCE);
    expect(requests).not.toContain(DUEL_PLATFORM_ART_SOURCE);
  });

  it("starts duel-only art only when the duel scene asks for it", () => {
    const requests: string[] = [];
    class FakeImage extends EventTarget {
      decoding = "auto";
      private source = "";

      get src() { return this.source; }
      set src(value: string) {
        this.source = value;
        requests.push(value);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("document", {
      createElement: (tagName: string) => tagName === "canvas"
        ? { getContext: () => ({}) }
        : {},
    });

    const assets = createAssetPreprocessor(() => {});
    expect(assets.duelAssetsReady()).toBe(false);
    void assets.ensureDuelAssets();
    expect(requests).toContain(DUEL_SPACE_BACKGROUND_SOURCE);
    expect(requests).toContain(DUEL_PLATFORM_ART_SOURCE);
  });

  it("marks exhausted current-map retries without blocking the fallback", () => {
    vi.useFakeTimers();
    const images: FakeImage[] = [];
    class FakeImage extends EventTarget {
      decoding = "auto";
      naturalWidth = 0;
      naturalHeight = 0;
      src = "";

      constructor() {
        super();
        images.push(this);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("document", {
      createElement: (tagName: string) => tagName === "canvas"
        ? { getContext: () => ({}) }
        : {},
    });

    const assets = createAssetPreprocessor(() => {});
    void assets.ensureMapAssets(TUTORIAL_FOREST_MAP_ID);
    const dragon = images.find((image) => image.src === "assets/wildstat/dragon_boss_spritesheet.png");
    expect(dragon).toBeDefined();
    expect(assets.mapAssetLoadFailed(TUTORIAL_FOREST_MAP_ID)).toBe(false);

    dragon!.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(500);
    dragon!.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(1_000);
    dragon!.dispatchEvent(new Event("error"));

    expect(assets.mapAssetLoadFailed(TUTORIAL_FOREST_MAP_ID)).toBe(true);
  });
});
