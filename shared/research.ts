export const RESEARCH_IDS = ["warcraft", "moveSpeed", "foraging", "vitality", "precision", "prosperity", "criticalChance", "criticalDamage"] as const;
export type ResearchId = typeof RESEARCH_IDS[number];

export type ResearchDefinition = {
  id: ResearchId;
  title: string;
  icon: string;
  maxRank: number;
  effect: string;
  valuePerRank: number;
  durationStartMs: number;
  prerequisites?: Partial<Record<ResearchId, number>>;
};

export const RESEARCH_DEFINITIONS: Record<ResearchId, ResearchDefinition> = {
  warcraft: { id: "warcraft", title: "WARCRAFT", icon: "⚔", maxRank: 5, effect: "TOTAL DAMAGE", valuePerRank: 2, durationStartMs: 30_000, prerequisites: { foraging: 1 } },
  moveSpeed: { id: "moveSpeed", title: "MOVE SPEED", icon: "➜", maxRank: 5, effect: "MOVE SPEED", valuePerRank: 2, durationStartMs: 30_000, prerequisites: { foraging: 1 } },
  foraging: { id: "foraging", title: "FORAGING", icon: "✦", maxRank: 5, effect: "STAT GAIN", valuePerRank: 1, durationStartMs: 15_000 },
  prosperity: {
    id: "prosperity", title: "PROSPERITY", icon: "✧", maxRank: 5, effect: "STAT GAIN", valuePerRank: 2, durationStartMs: 60_000,
    prerequisites: { vitality: 3, precision: 3 },
  },
  vitality: {
    id: "vitality", title: "VITALITY", icon: "♥", maxRank: 5, effect: "MAX HEALTH", valuePerRank: 2, durationStartMs: 45_000,
    prerequisites: { warcraft: 3, foraging: 3 },
  },
  precision: {
    id: "precision", title: "PRECISION", icon: "◈", maxRank: 5, effect: "ARMOR", valuePerRank: 2, durationStartMs: 45_000,
    prerequisites: { warcraft: 3, foraging: 3 },
  },
  criticalChance: {
    id: "criticalChance", title: "CRITICAL CHANCE", icon: "✦", maxRank: 5, effect: "CRITICAL CHANCE", valuePerRank: 1, durationStartMs: 120_000,
    prerequisites: { prosperity: 5 },
  },
  criticalDamage: {
    id: "criticalDamage", title: "CRITICAL DAMAGE", icon: "✹", maxRank: 4, effect: "CRITICAL DAMAGE", valuePerRank: 5, durationStartMs: 120_000,
    prerequisites: { criticalChance: 5 },
  },
};

export const RESEARCH_DURATION_CAP_MS = 72 * 60 * 60 * 1_000;

/** Every research grows 40% per rank; deeper nodes start at longer server timers. */
export function researchDurationMs(researchId: ResearchId, completedRanks: number) {
  return Math.min(
    RESEARCH_DURATION_CAP_MS,
    Math.round(RESEARCH_DEFINITIONS[researchId].durationStartMs * 1.4 ** Math.max(0, completedRanks)),
  );
}

export function isResearchId(value: string): value is ResearchId {
  return (RESEARCH_IDS as readonly string[]).includes(value);
}
