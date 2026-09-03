import { describe, expect, it } from "vitest";
import { RESEARCH_DEFINITIONS, RESEARCH_IDS } from "../../shared/research";
import {
  hasAvailableResearch,
  centerResearchNode,
  researchFocusNode,
  researchElapsedRatio,
  researchIsAvailable,
  researchProgressLabel,
  type ResearchRanks,
} from "./tech-tree-controller";
import { createTechTreeLayout } from "./tech-tree-layout";

function ranks(overrides: Partial<ResearchRanks> = {}): ResearchRanks {
  return {
    ...Object.fromEntries(RESEARCH_IDS.map((id) => [id, 0])) as ResearchRanks,
    ...overrides,
  };
}

describe("hasAvailableResearch", () => {
  it("centers the active rank band ahead of any available earlier node", () => {
    const { nodes } = createTechTreeLayout();
    expect(researchFocusNode(nodes, ranks(), {
      researchId: "warcraft", targetRank: 6, startedAtMs: 1, completesAtMs: 2,
    })?.id).toBe("tech-2-warcraft");
    expect(researchFocusNode(nodes, ranks(), {
      researchId: "warcraft", targetRank: 5, startedAtMs: 1, completesAtMs: 2,
    })?.id).toBe("tech-1-warcraft");
  });

  it("chooses the first available node in tree order and advances past completed bands", () => {
    const { nodes } = createTechTreeLayout();
    expect(researchFocusNode(nodes, ranks(), null)?.id).toBe("tech-1-foraging");
    expect(researchFocusNode(nodes, ranks({ foraging: 5 }), null)?.id).toBe("tech-1-warcraft");
    const nextBand = ranks(Object.fromEntries(RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].ranksPerBand])) as ResearchRanks);
    expect(researchFocusNode(nodes, nextBand, null)?.id).toBe("tech-2-foraging");
    const complete = ranks(Object.fromEntries(RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].maxRank])) as ResearchRanks);
    expect(researchFocusNode(nodes, complete, null)).toBe(nodes.at(-1));
  });

  it("centers using viewport-relative bounds, not a nested tier's offsetTop", () => {
    const viewport = {
      scrollTop: 900, scrollLeft: 20, scrollHeight: 4000, scrollWidth: 600,
      clientHeight: 400, clientWidth: 300, clientTop: 2, clientLeft: 2,
      getBoundingClientRect: () => ({ top: 100, left: 10 }),
    };
    const node = { offsetTop: 28, getBoundingClientRect: () => ({ top: 702, left: 202, height: 112, width: 112 }) };
    centerResearchNode(viewport as HTMLElement, node as unknown as HTMLElement);
    expect(viewport.scrollTop).toBe(1356);
    expect(viewport.scrollLeft).toBe(116);
    node.getBoundingClientRect = () => ({ top: -5000, left: -5000, height: 112, width: 112 });
    centerResearchNode(viewport as HTMLElement, node as unknown as HTMLElement);
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.scrollLeft).toBe(0);
  });

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
