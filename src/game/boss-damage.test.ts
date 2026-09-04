import {describe, expect, it} from "vitest";

import {BOSS_DAMAGE_PROFILES, BOSS_DAMAGE_REFERENCE} from "./boss-damage";

describe("boss damage progression", () => {
  it("keeps a readable strongest hit and smaller overlapping attacks", () => {
    for (const [boss, profile] of Object.entries(BOSS_DAMAGE_PROFILES)) {
      expect(Math.max(...Object.values(profile))).toBe(BOSS_DAMAGE_REFERENCE[boss as keyof typeof BOSS_DAMAGE_REFERENCE]);
      expect(profile.contact).toBeLessThan(BOSS_DAMAGE_REFERENCE[boss as keyof typeof BOSS_DAMAGE_REFERENCE]);
    }
  });

  it("keeps overlapping late-boss hazards below the heavy strike", () => {
    for (const boss of ["koiShogun", "tempestKirin", "miremaw", "prismshell"] as const) {
      const [heavy, area, contact] = Object.values(BOSS_DAMAGE_PROFILES[boss]);
      expect(area / heavy).toBeCloseTo(.7);
      expect(contact / heavy).toBeCloseTo(.5);
    }
  });
});
