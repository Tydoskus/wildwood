import { describe, expect, it } from "vitest";
import { PORTAL_CUTSCENES, portalCutsceneBit, unlockedPortalCutsceneMask } from "./portal-cutscenes";

describe("portal cutscene migration", () => {
  it("does not skip new characters' first unlock scenes", () => {
    expect(unlockedPortalCutsceneMask(null)).toBe(0);
    expect(unlockedPortalCutsceneMask({})).toBe(0);
  });
  it("backfills only already unlocked scenes for old characters", () => {
    expect(unlockedPortalCutsceneMask({ desertUnlocked: true })).toBe(1);
    expect(unlockedPortalCutsceneMask({ lavaUnlocked: true })).toBe(7);
    expect(unlockedPortalCutsceneMask({ waterUnlocked: true })).toBe(31);
    expect(unlockedPortalCutsceneMask({ samuraiUnlocked: true })).toBe(63);
    expect(unlockedPortalCutsceneMask({ moonfenUnlocked: true })).toBe(63);
  });
  it("has one stable bit per scene and rejects unknown IDs", () => {
    expect(PORTAL_CUTSCENES.map((scene) => portalCutsceneBit(scene.id))).toEqual([1, 2, 4, 8, 16, 32]);
    expect(portalCutsceneBit("invalid")).toBe(0);
  });
});
