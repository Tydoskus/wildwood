import { describe, expect, it } from "vitest";
import { RESEARCH_DEFINITIONS, RESEARCH_IDS } from "../../shared/research";
import {
  hasAvailableResearch,
  researchElapsedRatio,
  researchIsAvailable,
  researchProgressLabel,
  type ResearchRanks,
} from "./tech-tree-controller";

function ranks(overrides: Partial<ResearchRanks> = {}): ResearchRanks {
  return {
    ...Object.fromEntries(RESEARCH_IDS.map((id) => [id, 0])) as ResearchRanks,
    ...overrides,
  };
}

describe("hasAvailableResearch", () => {
  it("fills active research from empty to full as elapsed time increases", () => {
    expect(researchElapsedRatio(1_000, 5_000, 1_000)).toBe(0);
    expect(researchElapsedRatio(1_000, 5_000, 3_000)).toBe(.5);
    expect(researchElapsedRatio(1_000, 5_000, 5_000)).toBe(1);
  });

  it("splits a saved cumulative rank without losing any completed levels", () => {
    expect([0, 1, 2, 3].map((band) => researchProgressLabel("warcraft", 17, band))).toEqual([
      "5 / 5",
      "5 / 5",
      "5 / 5",
      "2 / 5",
    ]);
  });

  it("reports an immediately researchable node", () => {
    expect(hasAvailableResearch(ranks())).toBe(true);
  });

  it("ignores unfinished nodes whose prerequisites are locked", () => {
    expect(researchIsAvailable("criticalDamage", ranks())).toBe(false);
  });

  it("opens the next tier only after every preceding five-rank node", () => {
    const firstBand = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].ranksPerBand]),
    ) as ResearchRanks);
    expect(researchIsAvailable("foraging", firstBand)).toBe(true);
    expect(researchIsAvailable("warcraft", firstBand)).toBe(false);
    firstBand.foraging += 1;
    expect(researchIsAvailable("warcraft", firstBand)).toBe(true);
  });

  it("clears once every research is maxed", () => {
    const complete = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].maxRank]),
    ) as ResearchRanks);
    expect(hasAvailableResearch(complete)).toBe(false);
  });
});
