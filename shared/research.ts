export const RESEARCH_STAGE_COUNT = 4;

export const RESEARCH_IDS = [
  "warcraft",
  "moveSpeed",
  "foraging",
  "vitality",
  "precision",
  "regeneration",
  "prosperity",
  "criticalChance",
  "criticalDamage",
] as const;
export type ResearchId = typeof RESEARCH_IDS[number];
export type ResearchRanks = Record<ResearchId, number>;

export type ResearchDefinition = {
  id: ResearchId;
  title: string;
  icon: string;
  ranksPerStage: number;
  maxRank: number;
  effect: string;
  valuePerRank: number;
  durationStartMs: number;
  /** Ranks required inside the same stage. */
  prerequisites?: Partial<Record<ResearchId, number>>;
};

function stagedDefinition(definition: Omit<ResearchDefinition, "maxRank">): ResearchDefinition {
  return { ...definition, maxRank: definition.ranksPerStage * RESEARCH_STAGE_COUNT };
}

export const RESEARCH_DEFINITIONS: Record<ResearchId, ResearchDefinition> = {
  foraging: stagedDefinition({
    id: "foraging", title: "FORAGING", icon: "✦", ranksPerStage: 5, effect: "STAT GAIN", valuePerRank: 1, durationStartMs: 15_000,
  }),
  warcraft: stagedDefinition({
    id: "warcraft", title: "WARCRAFT", icon: "⚔", ranksPerStage: 5, effect: "TOTAL DAMAGE", valuePerRank: 2, durationStartMs: 30_000,
    prerequisites: { foraging: 1 },
  }),
  moveSpeed: stagedDefinition({
    id: "moveSpeed", title: "MOVE SPEED", icon: "➜", ranksPerStage: 5, effect: "MOVE SPEED", valuePerRank: 2, durationStartMs: 30_000,
    prerequisites: { foraging: 1 },
  }),
  vitality: stagedDefinition({
    id: "vitality", title: "VITALITY", icon: "♥", ranksPerStage: 5, effect: "MAX HEALTH", valuePerRank: 2, durationStartMs: 45_000,
    prerequisites: { foraging: 3, warcraft: 3 },
  }),
  precision: stagedDefinition({
    id: "precision", title: "PRECISION", icon: "◈", ranksPerStage: 5, effect: "ARMOR", valuePerRank: 2, durationStartMs: 45_000,
    prerequisites: { foraging: 3, warcraft: 3 },
  }),
  regeneration: stagedDefinition({
    id: "regeneration", title: "REGENERATION", icon: "✚", ranksPerStage: 5, effect: "REGEN", valuePerRank: 2, durationStartMs: 60_000,
    prerequisites: { vitality: 3, precision: 3 },
  }),
  prosperity: stagedDefinition({
    id: "prosperity", title: "PROSPERITY", icon: "✧", ranksPerStage: 5, effect: "STAT GAIN", valuePerRank: 2, durationStartMs: 60_000,
    prerequisites: { vitality: 3, precision: 3 },
  }),
  criticalChance: stagedDefinition({
    id: "criticalChance", title: "CRITICAL CHANCE", icon: "✦", ranksPerStage: 5, effect: "CRITICAL CHANCE", valuePerRank: 1, durationStartMs: 120_000,
    prerequisites: { prosperity: 5 },
  }),
  criticalDamage: stagedDefinition({
    id: "criticalDamage", title: "CRITICAL DAMAGE", icon: "✹", ranksPerStage: 4, effect: "CRITICAL DAMAGE", valuePerRank: 5, durationStartMs: 120_000,
    prerequisites: { criticalChance: 5 },
  }),
};

export function createEmptyResearchRanks(): ResearchRanks {
  return Object.fromEntries(RESEARCH_IDS.map((id) => [id, 0])) as ResearchRanks;
}

const LEGACY_COMPLETE_RANKS: Partial<Record<ResearchId, number>> = {
  warcraft: 5,
  moveSpeed: 5,
  foraging: 5,
  vitality: 5,
  precision: 5,
  prosperity: 5,
  criticalChance: 5,
  criticalDamage: 4,
};

/** Preserves completion for players who maxed the tree before Regen existed. */
export function shouldBackfillLegacyRegeneration(ranks: ResearchRanks) {
  if (ranks.regeneration >= RESEARCH_DEFINITIONS.regeneration.ranksPerStage) return false;
  return Object.entries(LEGACY_COMPLETE_RANKS)
    .every(([id, requiredRank]) => ranks[id as ResearchId] >= Number(requiredRank));
}

export function researchStageStartRank(researchId: ResearchId, stageIndex: number) {
  return RESEARCH_DEFINITIONS[researchId].ranksPerStage * stageIndex;
}

export function researchStageEndRank(researchId: ResearchId, stageIndex: number) {
  return researchStageStartRank(researchId, stageIndex + 1);
}

export function researchStageIndex(researchId: ResearchId, completedRanks: number) {
  const definition = RESEARCH_DEFINITIONS[researchId];
  return Math.min(RESEARCH_STAGE_COUNT - 1, Math.floor(Math.max(0, completedRanks) / definition.ranksPerStage));
}

/** Resolves same-stage requirements into aggregate rank thresholds. */
export function researchPrerequisitesForNextRank(researchId: ResearchId, completedRanks: number) {
  const definition = RESEARCH_DEFINITIONS[researchId];
  const stageIndex = researchStageIndex(researchId, completedRanks);
  const requirements: Partial<Record<ResearchId, number>> = {};
  for (const [requiredId, requiredRank] of Object.entries(definition.prerequisites ?? {})) {
    const id = requiredId as ResearchId;
    requirements[id] = researchStageStartRank(id, stageIndex) + Number(requiredRank);
  }
  if (researchId === "foraging" && stageIndex > 0) {
    for (const id of RESEARCH_IDS) requirements[id] = researchStageEndRank(id, stageIndex - 1);
  }
  return requirements;
}

export function researchIsAvailable(researchId: ResearchId, ranks: ResearchRanks) {
  const definition = RESEARCH_DEFINITIONS[researchId];
  if (ranks[researchId] >= definition.maxRank) return false;
  return Object.entries(researchPrerequisitesForNextRank(researchId, ranks[researchId]))
    .every(([id, rank]) => ranks[id as ResearchId] >= Number(rank));
}

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
