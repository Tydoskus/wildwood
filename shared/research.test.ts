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

  it("repeats every technology through four complete rank bands", () => {
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
      ranksPerBand: 4,
      maxRank: 16,
    });
  });

  it("keeps a technology unlocked after one predecessor rank", () => {
    const ranks = createEmptyResearchRanks();
    expect(researchIsAvailable("warcraft", ranks)).toBe(false);
    ranks.foraging = 1;
    expect(researchIsAvailable("warcraft", ranks)).toBe(true);
    ranks.warcraft = RESEARCH_DEFINITIONS.warcraft.maxRank - 1;
    expect(researchIsAvailable("warcraft", ranks)).toBe(true);
  });

  it("does not raise unlock requirements in later rank bands", () => {
    expect(researchPrerequisitesForNextRank("warcraft", 0)).toEqual({ foraging: 1 });
    expect(researchPrerequisitesForNextRank("warcraft", 19)).toEqual({ foraging: 1 });
    expect(researchPrerequisitesForNextRank("regeneration", 15)).toEqual({ vitality: 1, precision: 1 });
  });

  it("uses one-rank predecessor unlocks throughout the tree", () => {
    expect(RESEARCH_DEFINITIONS.vitality.prerequisites).toEqual({ warcraft: 1 });
    expect(RESEARCH_DEFINITIONS.precision.prerequisites).toEqual({ warcraft: 1 });
    expect(RESEARCH_DEFINITIONS.prosperity.prerequisites).toEqual({ vitality: 1, precision: 1 });
    expect(RESEARCH_DEFINITIONS.criticalDamage.prerequisites).toEqual({ criticalChance: 1 });
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
