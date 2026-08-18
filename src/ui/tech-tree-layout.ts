import type { ResearchId } from "../../shared/research";

export type TechTreeNode = {
  id: string;
  researchId: ResearchId;
  category: string;
};

export type TechTreeLayout = {
  rows: TechTreeNode[][];
  nodes: TechTreeNode[];
  paths: Array<[string, string]>;
};

const TECH_TREE_ROWS: Array<Array<{ researchId: ResearchId; category: string }>> = [
  [{ researchId: "foraging", category: "FOUNDATION" }],
  [
    { researchId: "warcraft", category: "COMBAT" },
    { researchId: "moveSpeed", category: "MOBILITY" },
  ],
  [
    { researchId: "vitality", category: "SURVIVAL" },
    { researchId: "precision", category: "DEFENSE" },
  ],
  [
    { researchId: "regeneration", category: "RECOVERY" },
    { researchId: "prosperity", category: "PROSPERITY" },
  ],
  [{ researchId: "criticalChance", category: "OFFENSE" }],
  [{ researchId: "criticalDamage", category: "OFFENSE" }],
];

function nodeId(researchId: ResearchId) {
  return `tech-${researchId}`;
}

export function createTechTreeLayout(): TechTreeLayout {
  const rows = TECH_TREE_ROWS.map((row) => row.map(({ researchId, category }) => ({
    id: nodeId(researchId),
    researchId,
    category,
  })));
  const paths: Array<[string, string]> = [];
  const path = (from: ResearchId, to: ResearchId) => paths.push([nodeId(from), nodeId(to)]);
  path("foraging", "warcraft");
  path("foraging", "moveSpeed");
  path("warcraft", "vitality");
  path("warcraft", "precision");
  path("vitality", "regeneration");
  path("precision", "regeneration");
  path("vitality", "prosperity");
  path("precision", "prosperity");
  path("prosperity", "criticalChance");
  path("criticalChance", "criticalDamage");

  return { rows, nodes: rows.flat(), paths };
}
