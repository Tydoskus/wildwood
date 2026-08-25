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
};

export type TechTreeLayout = {
  rows: TechTreeNode[][];
  nodes: TechTreeNode[];
  paths: Array<[string, string]>;
};

const TECH_TREE_ROWS: ResearchId[][] = [
  ["foraging"],
  [
    "warcraft",
    "moveSpeed",
  ],
  ["vitality"],
  [
    "precision",
    "regeneration",
  ],
  ["prosperity"],
  [
    "criticalChance",
    "criticalDamage",
  ],
];

function nodeId(researchId: ResearchId, rankBandIndex: number) {
  return `tech-${rankBandIndex + 1}-${researchId}`;
}

export function createTechTreeLayout(): TechTreeLayout {
  const rows: TechTreeNode[][] = [];
  const paths: Array<[string, string]> = [];
  for (let rankBandIndex = 0; rankBandIndex < RESEARCH_RANK_BAND_COUNT; rankBandIndex += 1) {
    rows.push(...TECH_TREE_ROWS.map((row) => row.map((researchId) => ({
      id: nodeId(researchId, rankBandIndex),
      researchId,
      rankBandIndex,
      startRank: researchRankBandStart(researchId, rankBandIndex),
      endRank: researchRankBandEnd(researchId, rankBandIndex),
    }))));
    const path = (from: ResearchId, to: ResearchId) => paths.push([
      nodeId(from, rankBandIndex),
      nodeId(to, rankBandIndex),
    ]);
    path("foraging", "warcraft");
    path("foraging", "moveSpeed");
    path("warcraft", "vitality");
    path("moveSpeed", "vitality");
    path("vitality", "precision");
    path("vitality", "regeneration");
    path("precision", "prosperity");
    path("regeneration", "prosperity");
    path("prosperity", "criticalChance");
    path("prosperity", "criticalDamage");
    if (rankBandIndex > 0) {
      paths.push(
        [nodeId("criticalChance", rankBandIndex - 1), nodeId("foraging", rankBandIndex)],
        [nodeId("criticalDamage", rankBandIndex - 1), nodeId("foraging", rankBandIndex)],
      );
    }
  }

  return { rows, nodes: rows.flat(), paths };
}
