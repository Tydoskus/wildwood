export const RESEARCH_IDS = ["warcraft", "foraging", "frontierMastery", "vitality", "precision", "criticalChance"] as const;
export type ResearchId = typeof RESEARCH_IDS[number];

export type ResearchDefinition = {
  id: ResearchId;
  title: string;
  icon: string;
  maxRank: number;
  effect: string;
  valuePerRank: number;
  prerequisites?: Partial<Record<ResearchId, number>>;
};

export const RESEARCH_DEFINITIONS: Record<ResearchId, ResearchDefinition> = {
  warcraft: { id: "warcraft", title: "WARCRAFT", icon: "⚔", maxRank: 5, effect: "TOTAL DAMAGE", valuePerRank: 2, prerequisites: { foraging: 1 } },
  foraging: { id: "foraging", title: "FORAGING", icon: "✦", maxRank: 5, effect: "STAT GAIN", valuePerRank: 1 },
  frontierMastery: {
    id: "frontierMastery", title: "FRONTIER MASTERY", icon: "✧", maxRank: 1, effect: "TIER II ACCESS", valuePerRank: 0,
    prerequisites: { warcraft: 3, foraging: 3 },
  },
  vitality: {
    id: "vitality", title: "VITALITY", icon: "♥", maxRank: 5, effect: "MAX HEALTH", valuePerRank: 2,
    prerequisites: { frontierMastery: 1 },
  },
  precision: {
    id: "precision", title: "PRECISION", icon: "◈", maxRank: 5, effect: "ARMOR", valuePerRank: 2,
    prerequisites: { frontierMastery: 1 },
  },
  criticalChance: {
    id: "criticalChance", title: "CRITICAL CHANCE", icon: "✦", maxRank: 5, effect: "CRITICAL CHANCE", valuePerRank: 1,
    prerequisites: { frontierMastery: 1 },
  },
};

export const RESEARCH_DURATION_CAP_MS = 72 * 60 * 60 * 1_000;

/** Server timer curve: 15s, 27s, 49s … 50h, then 72h cap. */
export function researchDurationMs(completedResearchCount: number) {
  return Math.min(RESEARCH_DURATION_CAP_MS, Math.round(15_000 * 1.8 ** Math.max(0, completedResearchCount)));
}

export function isResearchId(value: string): value is ResearchId {
  return (RESEARCH_IDS as readonly string[]).includes(value);
}
