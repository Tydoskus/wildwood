import { RESEARCH_STAGE_COUNT, type ResearchId } from "../../shared/research";

export type TechTreeNode = {
  id: string;
  researchId: ResearchId;
  stageIndex: number;
  category: string;
};

export type TechTreeLayout = {
  rows: TechTreeNode[][];
  nodes: TechTreeNode[];
  paths: Array<[string, string]>;
};

const STAGE_ROWS: Array<Array<{ researchId: ResearchId; category: string }>> = [
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

function nodeId(stageIndex: number, researchId: ResearchId) {
  return `stage-${stageIndex + 1}-${researchId}`;
}

export function createTechTreeLayout(stageCount = RESEARCH_STAGE_COUNT): TechTreeLayout {
  const rows: TechTreeNode[][] = [];
  const paths: Array<[string, string]> = [];

  for (let stageIndex = 0; stageIndex < stageCount; stageIndex += 1) {
    const stageRows = STAGE_ROWS.map((row) => row.map(({ researchId, category }) => ({
      id: nodeId(stageIndex, researchId),
      researchId,
      stageIndex,
      category: `STAGE ${stageIndex + 1} · ${category}`,
    })));
    rows.push(...stageRows);

    const path = (from: ResearchId, to: ResearchId) => paths.push([nodeId(stageIndex, from), nodeId(stageIndex, to)]);
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
    if (stageIndex > 0) {
      paths.push([
        nodeId(stageIndex - 1, "criticalDamage"),
        nodeId(stageIndex, "foraging"),
      ]);
    }
  }

  return { rows, nodes: rows.flat(), paths };
}
