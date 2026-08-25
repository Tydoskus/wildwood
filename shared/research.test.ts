import { describe, expect, it } from "vitest";
import {
  RESEARCH_DEFINITIONS,
  RESEARCH_IDS,
  RESEARCH_RANK_BAND_COUNT,
  createEmptyResearchRanks,
  researchDurationMs,
  researchIsAvailable,
  researchPrerequisitesForNextRank,
  researchStatRewardMultiplier,
  shouldBackfillLegacyRegeneration,
  type ResearchId,
} from "./research";

describe("research timer curve", () => {
  it("combines Foraging and Prosperity into one stat-reward multiplier", () => {
    expect(researchStatRewardMultiplier(null)).toBe(1);
    expect(researchStatRewardMultiplier({ foraging: 5, prosperity: 4 })).toBeCloseTo(1.13);
  });

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

  it("repeats every technology through four five-rank bands", () => {
    expect(RESEARCH_RANK_BAND_COUNT).toBe(4);
    expect(RESEARCH_DEFINITIONS.regeneration).toMatchObject({
      effect: "REGEN",
      valuePerRank: 2,
      ranksPerBand: 5,
      maxRank: 20,
    });
    expect(RESEARCH_DEFINITIONS.prosperity).toMatchObject({
      effect: "STAT GAIN",
      valuePerRank: 2,
      ranksPerBand: 5,
      maxRank: 20,
    });
    expect(RESEARCH_DEFINITIONS.criticalDamage).toMatchObject({
      valuePerRank: 5,
      ranksPerBand: 5,
      maxRank: 20,
    });
  });

  it("unlocks connected technologies inside the current rank band", () => {
    const ranks = createEmptyResearchRanks();
    expect(researchIsAvailable("warcraft", ranks)).toBe(false);
    ranks.foraging = 1;
    expect(researchIsAvailable("warcraft", ranks)).toBe(true);
    ranks.warcraft = 5;
    expect(researchIsAvailable("warcraft", ranks)).toBe(false);
    ranks.foraging = 6;
    expect(researchIsAvailable("warcraft", ranks)).toBe(true);
  });

  it("translates each node line into the matching cumulative tier requirement", () => {
    expect(researchPrerequisitesForNextRank("warcraft", 0)).toEqual({ foraging: 1 });
    expect(researchPrerequisitesForNextRank("warcraft", 19)).toEqual({ foraging: 16 });
    expect(researchPrerequisitesForNextRank("vitality", 15)).toEqual({ warcraft: 16, moveSpeed: 16 });
    expect(researchPrerequisitesForNextRank("regeneration", 15)).toEqual({ vitality: 16 });
    expect(researchPrerequisitesForNextRank("prosperity", 15)).toEqual({ precision: 16, regeneration: 16 });
    expect(researchPrerequisitesForNextRank("criticalDamage", 15)).toEqual({ prosperity: 16 });
  });

  it("requires a complete tier before its next foundation node", () => {
    const previousTier = Object.fromEntries(RESEARCH_IDS.map((id) => [id, 5]));
    expect(researchPrerequisitesForNextRank("foraging", 5)).toEqual(previousTier);

    const incomplete = { ...createEmptyResearchRanks(), ...previousTier, regeneration: 4 };
    expect(researchIsAvailable("foraging", incomplete)).toBe(false);
    incomplete.regeneration = 5;
    expect(researchIsAvailable("foraging", incomplete)).toBe(true);
  });

  it("uses the alternating one-to-two prerequisite graph", () => {
    expect(RESEARCH_DEFINITIONS.vitality.prerequisites).toEqual({ warcraft: 1, moveSpeed: 1 });
    expect(RESEARCH_DEFINITIONS.precision.prerequisites).toEqual({ vitality: 1 });
    expect(RESEARCH_DEFINITIONS.regeneration.prerequisites).toEqual({ vitality: 1 });
    expect(RESEARCH_DEFINITIONS.prosperity.prerequisites).toEqual({ precision: 1, regeneration: 1 });
    expect(RESEARCH_DEFINITIONS.criticalChance.prerequisites).toEqual({ prosperity: 1 });
    expect(RESEARCH_DEFINITIONS.criticalDamage.prerequisites).toEqual({ prosperity: 1 });
  });

  it("recognizes only players who completed the tree before Regen existed", () => {
    const ranks = createEmptyResearchRanks();
    for (const id of RESEARCH_IDS) ranks[id] = RESEARCH_DEFINITIONS[id].ranksPerBand;
    ranks.regeneration = 0;
    expect(shouldBackfillLegacyRegeneration(ranks)).toBe(true);

    ranks.criticalDamage = 3;
    expect(shouldBackfillLegacyRegeneration(ranks)).toBe(false);
    ranks.criticalDamage = 4;
    ranks.regeneration = 5;
    expect(shouldBackfillLegacyRegeneration(ranks)).toBe(false);
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
        expect(requiredRank).toBe(1);
        visit(requiredId as ResearchId);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of RESEARCH_IDS) visit(id);
  });
});
