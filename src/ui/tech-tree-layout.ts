import {
  RESEARCH_RANK_BAND_COUNT,
  researchRankBandEnd,
  researchRankBandStart,
  type ResearchId,
} from "../../shared/research";

export type TechTreeNode = {
  id: string;
  researchId: ResearchId;
  rankBandIndex: number;
  startRank: number;
  endRank: number;
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

function nodeId(researchId: ResearchId, rankBandIndex: number) {
  return `tech-${rankBandIndex + 1}-${researchId}`;
}

export function createTechTreeLayout(): TechTreeLayout {
  const rows: TechTreeNode[][] = [];
  const paths: Array<[string, string]> = [];
  for (let rankBandIndex = 0; rankBandIndex < RESEARCH_RANK_BAND_COUNT; rankBandIndex += 1) {
    rows.push(...TECH_TREE_ROWS.map((row) => row.map(({ researchId, category }) => {
      const startRank = researchRankBandStart(researchId, rankBandIndex);
      const endRank = researchRankBandEnd(researchId, rankBandIndex);
      return {
        id: nodeId(researchId, rankBandIndex),
        researchId,
        rankBandIndex,
        startRank,
        endRank,
        category: `RANKS ${startRank + 1}–${endRank} · ${category}`,
      };
    })));
    const path = (from: ResearchId, to: ResearchId) => paths.push([
      nodeId(from, rankBandIndex),
      nodeId(to, rankBandIndex),
    ]);
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
  }

  return { rows, nodes: rows.flat(), paths };
}
