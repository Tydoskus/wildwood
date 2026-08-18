import { describe, expect, it } from "vitest";
import { RESEARCH_DEFINITIONS, RESEARCH_IDS } from "../../shared/research";
import {
  hasAvailableResearch,
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
  it("shows saved ranks cumulatively instead of resetting each loop", () => {
    expect(researchProgressLabel("criticalDamage", 4)).toBe("4 / 16");
  });

  it("reports an immediately researchable node", () => {
    expect(hasAvailableResearch(ranks())).toBe(true);
  });

  it("ignores unfinished nodes whose prerequisites are locked", () => {
    expect(researchIsAvailable("criticalDamage", ranks())).toBe(false);
  });

  it("does not let a player skip an unfinished technology between loops", () => {
    const firstStage = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].ranksPerStage]),
    ) as ResearchRanks);
    firstStage.moveSpeed -= 1;
    expect(researchIsAvailable("foraging", firstStage)).toBe(false);
    firstStage.moveSpeed += 1;
    expect(researchIsAvailable("foraging", firstStage)).toBe(true);
  });

  it("clears once every research is maxed", () => {
    const complete = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].maxRank]),
    ) as ResearchRanks);
    expect(hasAvailableResearch(complete)).toBe(false);
  });
});
