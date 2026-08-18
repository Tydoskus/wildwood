import { describe, expect, it } from "vitest";
import { RESEARCH_IDS } from "../../shared/research";
import { createTechTreeLayout } from "./tech-tree-layout";

describe("tech tree layout", () => {
  it("renders every technology once with cumulative progress", () => {
    const layout = createTechTreeLayout();
    expect(layout.nodes).toHaveLength(RESEARCH_IDS.length);
    expect(layout.nodes.map((node) => node.researchId).sort()).toEqual([...RESEARCH_IDS].sort());
    expect(new Set(layout.nodes.map((node) => node.id)).size).toBe(RESEARCH_IDS.length);
  });

  it("keeps one readable progression path", () => {
    const layout = createTechTreeLayout();
    expect(layout.paths).toContainEqual(["tech-foraging", "tech-warcraft"]);
    expect(layout.paths).toContainEqual(["tech-criticalChance", "tech-criticalDamage"]);
  });

  it("draws only real prerequisite branches", () => {
    const layout = createTechTreeLayout();
    expect(layout.paths).toContainEqual(["tech-vitality", "tech-regeneration"]);
    expect(layout.paths).toContainEqual(["tech-prosperity", "tech-criticalChance"]);
    expect(layout.paths).not.toContainEqual(["tech-moveSpeed", "tech-vitality"]);
    expect(layout.paths).not.toContainEqual(["tech-regeneration", "tech-criticalChance"]);
  });
});
