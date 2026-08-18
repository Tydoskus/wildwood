import { describe, expect, it } from "vitest";
import { RESEARCH_IDS, RESEARCH_STAGE_COUNT } from "../../shared/research";
import { createTechTreeLayout } from "./tech-tree-layout";

describe("tech tree layout", () => {
  it("renders every technology once in each of four stages", () => {
    const layout = createTechTreeLayout();
    expect(layout.nodes).toHaveLength(RESEARCH_IDS.length * RESEARCH_STAGE_COUNT);
    for (let stageIndex = 0; stageIndex < RESEARCH_STAGE_COUNT; stageIndex += 1) {
      expect(layout.nodes.filter((node) => node.stageIndex === stageIndex).map((node) => node.researchId).sort())
        .toEqual([...RESEARCH_IDS].sort());
    }
  });

  it("links each completed stage into the next foundation", () => {
    const layout = createTechTreeLayout();
    expect(layout.paths).toContainEqual(["stage-1-criticalDamage", "stage-2-foraging"]);
    expect(layout.paths).toContainEqual(["stage-3-criticalDamage", "stage-4-foraging"]);
  });

  it("draws only real same-stage prerequisite branches", () => {
    const layout = createTechTreeLayout(1);
    expect(layout.paths).toContainEqual(["stage-1-vitality", "stage-1-regeneration"]);
    expect(layout.paths).toContainEqual(["stage-1-prosperity", "stage-1-criticalChance"]);
    expect(layout.paths).not.toContainEqual(["stage-1-moveSpeed", "stage-1-vitality"]);
    expect(layout.paths).not.toContainEqual(["stage-1-regeneration", "stage-1-criticalChance"]);
  });
});
