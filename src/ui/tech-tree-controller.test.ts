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
    expect(researchProgressLabel(4, 4)).toBe("4 / 4");
    expect(researchProgressLabel(4, 8)).toBe("4 / 8");
    expect(researchProgressLabel(9, 8)).toBe("8 / 8");
  });

  it("reports an immediately researchable node", () => {
    expect(hasAvailableResearch(ranks())).toBe(true);
  });

  it("ignores unfinished nodes whose prerequisites are locked", () => {
    expect(researchIsAvailable("criticalDamage", ranks())).toBe(false);
  });

  it("lets an unlocked technology continue through later rank bands", () => {
    const firstBand = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].ranksPerBand]),
    ) as ResearchRanks);
    firstBand.moveSpeed = 0;
    expect(researchIsAvailable("foraging", firstBand)).toBe(true);
    firstBand.warcraft = RESEARCH_DEFINITIONS.warcraft.maxRank - 1;
    expect(researchIsAvailable("warcraft", firstBand)).toBe(true);
  });

  it("clears once every research is maxed", () => {
    const complete = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].maxRank]),
    ) as ResearchRanks);
    expect(hasAvailableResearch(complete)).toBe(false);
  });
});
