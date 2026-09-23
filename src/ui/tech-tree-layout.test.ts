import { describe, expect, it } from "vitest";
import { POWER_RESEARCH_IDS, UTILITY_RESEARCH_IDS, RESEARCH_RANK_BAND_COUNT, RESEARCH_DEFINITIONS } from "../../shared/research";
import { createTechTreeLayout } from "./tech-tree-layout";

describe("tech tree layout", () => {
  it("renders every technology as four separate five-rank nodes", () => {
    const layout = createTechTreeLayout();
    expect(layout.nodes).toHaveLength(POWER_RESEARCH_IDS.length * RESEARCH_RANK_BAND_COUNT);
    for (const researchId of POWER_RESEARCH_IDS) {
      const nodes = layout.nodes.filter((node) => node.researchId === researchId);
      expect(nodes).toHaveLength(RESEARCH_RANK_BAND_COUNT);
      expect(nodes.map((node) => node.endRank - node.startRank)).toEqual([5, 5, 5, 5]);
    }
    expect(new Set(layout.nodes.map((node) => node.id)).size).toBe(layout.nodes.length);
  });

  it("shows each utility technology once with its own rank cap", () => {
    const layout = createTechTreeLayout("utility");
    expect(layout.nodes.map(node => node.researchId)).toEqual([...UTILITY_RESEARCH_IDS]);
    expect(layout.rows.map(row => row.length)).toEqual([1, 2, 1, 2]);
    expect(layout.nodes.map(node => node.endRank)).toEqual(UTILITY_RESEARCH_IDS.map(id => RESEARCH_DEFINITIONS[id].maxRank));
    expect(layout.paths).toEqual([
      ["tech-utility-researchSpeed", "tech-utility-slotUpgradeSpeed"],
      ["tech-utility-researchSpeed", "tech-utility-enemyRespawn"],
      ["tech-utility-slotUpgradeSpeed", "tech-utility-bossRespawn"],
      ["tech-utility-enemyRespawn", "tech-utility-bossRespawn"],
      ["tech-utility-bossRespawn", "tech-utility-offlineWindow"],
      ["tech-utility-bossRespawn", "tech-utility-utilityMoveSpeed"],
    ]);
  });

  it("alternates one and two nodes through every tier", () => {
    const layout = createTechTreeLayout();
    expect(layout.rows.map((row) => row.length)).toEqual(
      Array.from({ length: RESEARCH_RANK_BAND_COUNT }, () => [1, 2, 1, 2, 1, 2]).flat(),
    );
  });

  it("connects every one-to-two and two-to-one adjacent row", () => {
    const layout = createTechTreeLayout();
    expect(layout.paths).toContainEqual(["tech-1-foraging", "tech-1-warcraft"]);
    expect(layout.paths).toContainEqual(["tech-1-foraging", "tech-1-moveSpeed"]);
    expect(layout.paths).toContainEqual(["tech-1-warcraft", "tech-1-vitality"]);
    expect(layout.paths).toContainEqual(["tech-1-moveSpeed", "tech-1-vitality"]);
    expect(layout.paths).toContainEqual(["tech-1-prosperity", "tech-1-criticalChance"]);
    expect(layout.paths).toContainEqual(["tech-1-prosperity", "tech-1-criticalDamage"]);
    expect(layout.paths).toContainEqual(["tech-1-criticalChance", "tech-2-foraging"]);
    expect(layout.paths).toContainEqual(["tech-1-criticalDamage", "tech-2-foraging"]);

    const rowByNode = new Map(layout.rows.flatMap((row, index) => row.map((node) => [node.id, index] as const)));
    for (const [from, to] of layout.paths) expect(rowByNode.get(to)).toBe((rowByNode.get(from) ?? -1) + 1);
  });
});
