import { describe, expect, it } from "vitest";
import { RESEARCH_DEFINITIONS, RESEARCH_IDS, researchDurationMs, type ResearchId } from "./research";

describe("research timer curve", () => {
  it("grows each research by forty percent from its own starting timer", () => {
    expect(researchDurationMs("foraging", 0)).toBe(15_000);
    expect(researchDurationMs("foraging", 1)).toBe(21_000);
    expect(researchDurationMs("moveSpeed", 0)).toBe(30_000);
    expect(researchDurationMs("vitality", 0)).toBe(45_000);
    expect(researchDurationMs("precision", 0)).toBe(45_000);
    expect(researchDurationMs("criticalChance", 0)).toBe(120_000);
    expect(researchDurationMs("criticalChance", 50)).toBe(72 * 60 * 60 * 1_000);
  });

  it("places five normal Stat Gain levels before Critical Chance", () => {
    expect(RESEARCH_DEFINITIONS.prosperity).toMatchObject({ effect: "STAT GAIN", valuePerRank: 2, maxRank: 5, durationStartMs: 60_000 });
    expect(RESEARCH_DEFINITIONS.criticalChance.prerequisites).toEqual({ prosperity: 5 });
    expect(RESEARCH_DEFINITIONS.criticalDamage).toMatchObject({ valuePerRank: 5, maxRank: 4, prerequisites: { criticalChance: 5 } });
  });

  it("keeps every prerequisite valid, reachable, and acyclic", () => {
    const ids = new Set<string>(RESEARCH_IDS);
    const visiting = new Set<ResearchId>();
    const visited = new Set<ResearchId>();
    const visit = (id: ResearchId) => {
      expect(visiting.has(id), `research cycle at ${id}`).toBe(false);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const [requiredId, requiredRank] of Object.entries(RESEARCH_DEFINITIONS[id].prerequisites ?? {})) {
        expect(ids.has(requiredId), `${id} references missing ${requiredId}`).toBe(true);
        expect(requiredRank).toBeLessThanOrEqual(RESEARCH_DEFINITIONS[requiredId as ResearchId].maxRank);
        visit(requiredId as ResearchId);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of RESEARCH_IDS) visit(id);
  });
});
