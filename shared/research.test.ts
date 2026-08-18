import { describe, expect, it } from "vitest";
import {
  RESEARCH_DEFINITIONS,
  RESEARCH_IDS,
  RESEARCH_STAGE_COUNT,
  createEmptyResearchRanks,
  researchDurationMs,
  researchIsAvailable,
  researchPrerequisitesForNextRank,
  type ResearchId,
} from "./research";

describe("research timer curve", () => {
  it("grows each research by forty percent from its own starting timer", () => {
    expect(researchDurationMs("foraging", 0)).toBe(15_000);
    expect(researchDurationMs("foraging", 1)).toBe(21_000);
    expect(researchDurationMs("moveSpeed", 0)).toBe(30_000);
    expect(researchDurationMs("vitality", 0)).toBe(45_000);
    expect(researchDurationMs("precision", 0)).toBe(45_000);
    expect(researchDurationMs("regeneration", 0)).toBe(60_000);
    expect(researchDurationMs("criticalChance", 0)).toBe(120_000);
    expect(researchDurationMs("criticalChance", 50)).toBe(72 * 60 * 60 * 1_000);
  });

  it("repeats every technology through four complete stages", () => {
    expect(RESEARCH_STAGE_COUNT).toBe(4);
    expect(RESEARCH_DEFINITIONS.regeneration).toMatchObject({
      effect: "REGEN",
      valuePerRank: 2,
      ranksPerStage: 5,
      maxRank: 20,
    });
    expect(RESEARCH_DEFINITIONS.prosperity).toMatchObject({
      effect: "STAT GAIN",
      valuePerRank: 2,
      ranksPerStage: 5,
      maxRank: 20,
    });
    expect(RESEARCH_DEFINITIONS.criticalDamage).toMatchObject({
      valuePerRank: 5,
      ranksPerStage: 4,
      maxRank: 16,
    });
  });

  it("requires every prior-stage technology before opening the next stage", () => {
    const requirements = researchPrerequisitesForNextRank("foraging", 5);
    for (const id of RESEARCH_IDS) {
      expect(requirements[id]).toBe(RESEARCH_DEFINITIONS[id].ranksPerStage);
    }

    const ranks = createEmptyResearchRanks();
    for (const id of RESEARCH_IDS) ranks[id] = RESEARCH_DEFINITIONS[id].ranksPerStage;
    ranks.regeneration -= 1;
    expect(researchIsAvailable("foraging", ranks)).toBe(false);
    ranks.regeneration += 1;
    expect(researchIsAvailable("foraging", ranks)).toBe(true);
  });

  it("offsets prerequisites into the active repeated stage", () => {
    expect(researchPrerequisitesForNextRank("warcraft", 5)).toEqual({ foraging: 6 });
    expect(researchPrerequisitesForNextRank("regeneration", 5)).toEqual({ vitality: 8, precision: 8 });
  });

  it("preserves existing first-stage unlock requirements during migration", () => {
    expect(RESEARCH_DEFINITIONS.vitality.prerequisites).toEqual({ foraging: 3, warcraft: 3 });
    expect(RESEARCH_DEFINITIONS.precision.prerequisites).toEqual({ foraging: 3, warcraft: 3 });
    expect(RESEARCH_DEFINITIONS.prosperity.prerequisites).toEqual({ vitality: 3, precision: 3 });
  });

  it("keeps every same-stage prerequisite valid, reachable, and acyclic", () => {
    const ids = new Set<string>(RESEARCH_IDS);
    const visiting = new Set<ResearchId>();
    const visited = new Set<ResearchId>();
    const visit = (id: ResearchId) => {
      expect(visiting.has(id), `research cycle at ${id}`).toBe(false);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const [requiredId, requiredRank] of Object.entries(RESEARCH_DEFINITIONS[id].prerequisites ?? {})) {
        expect(ids.has(requiredId), `${id} references missing ${requiredId}`).toBe(true);
        expect(requiredRank).toBeLessThanOrEqual(RESEARCH_DEFINITIONS[requiredId as ResearchId].ranksPerStage);
        visit(requiredId as ResearchId);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of RESEARCH_IDS) visit(id);
  });
});
