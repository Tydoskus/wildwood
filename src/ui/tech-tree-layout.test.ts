import { describe, expect, it } from "vitest";
import { RESEARCH_IDS, RESEARCH_RANK_BAND_COUNT } from "../../shared/research";
import { createTechTreeLayout } from "./tech-tree-layout";

describe("tech tree layout", () => {
  it("renders every technology in four cumulative rank bands", () => {
    const layout = createTechTreeLayout();
    expect(layout.nodes).toHaveLength(RESEARCH_IDS.length * RESEARCH_RANK_BAND_COUNT);
    for (const researchId of RESEARCH_IDS) {
      expect(layout.nodes.filter((node) => node.researchId === researchId)).toHaveLength(RESEARCH_RANK_BAND_COUNT);
    }
    expect(new Set(layout.nodes.map((node) => node.id)).size).toBe(layout.nodes.length);
  });

  it("keeps one readable progression path", () => {
    const layout = createTechTreeLayout();
    expect(layout.paths).toContainEqual(["tech-1-foraging", "tech-1-warcraft"]);
    expect(layout.paths).toContainEqual(["tech-1-criticalChance", "tech-1-criticalDamage"]);
  });

  it("draws only real prerequisite branches", () => {
    const layout = createTechTreeLayout();
    expect(layout.paths).toContainEqual(["tech-1-vitality", "tech-1-regeneration"]);
    expect(layout.paths).toContainEqual(["tech-1-prosperity", "tech-1-criticalChance"]);
    expect(layout.paths).not.toContainEqual(["tech-1-moveSpeed", "tech-1-vitality"]);
    expect(layout.paths).not.toContainEqual(["tech-1-regeneration", "tech-1-criticalChance"]);
  });
});
