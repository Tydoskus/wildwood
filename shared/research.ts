export const RESEARCH_RANK_BAND_COUNT = 4;

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
  ranksPerBand: number;
  maxRank: number;
  effect: string;
  valuePerRank: number;
  durationStartMs: number;
  /** One-time rank requirements that permanently unlock this technology. */
  prerequisites?: Partial<Record<ResearchId, number>>;
};

function repeatedDefinition(definition: Omit<ResearchDefinition, "maxRank">): ResearchDefinition {
  return { ...definition, maxRank: definition.ranksPerBand * RESEARCH_RANK_BAND_COUNT };
}

export const RESEARCH_DEFINITIONS: Record<ResearchId, ResearchDefinition> = {
  foraging: repeatedDefinition({
    id: "foraging", title: "FORAGING", icon: "✦", ranksPerBand: 5, effect: "STAT GAIN", valuePerRank: 1, durationStartMs: 15_000,
  }),
  warcraft: repeatedDefinition({
    id: "warcraft", title: "WARCRAFT", icon: "⚔", ranksPerBand: 5, effect: "TOTAL DAMAGE", valuePerRank: 2, durationStartMs: 30_000,
    prerequisites: { foraging: 1 },
  }),
  moveSpeed: repeatedDefinition({
    id: "moveSpeed", title: "MOVE SPEED", icon: "➜", ranksPerBand: 5, effect: "MOVE SPEED", valuePerRank: 2, durationStartMs: 30_000,
    prerequisites: { foraging: 1 },
  }),
  vitality: repeatedDefinition({
    id: "vitality", title: "VITALITY", icon: "♥", ranksPerBand: 5, effect: "MAX HEALTH", valuePerRank: 2, durationStartMs: 45_000,
    prerequisites: { warcraft: 1 },
  }),
  precision: repeatedDefinition({
    id: "precision", title: "PRECISION", icon: "◈", ranksPerBand: 5, effect: "ARMOR", valuePerRank: 2, durationStartMs: 45_000,
    prerequisites: { warcraft: 1 },
  }),
  regeneration: repeatedDefinition({
    id: "regeneration", title: "REGENERATION", icon: "✚", ranksPerBand: 5, effect: "REGEN", valuePerRank: 2, durationStartMs: 60_000,
    prerequisites: { vitality: 1, precision: 1 },
  }),
  prosperity: repeatedDefinition({
    id: "prosperity", title: "PROSPERITY", icon: "✧", ranksPerBand: 5, effect: "STAT GAIN", valuePerRank: 2, durationStartMs: 60_000,
    prerequisites: { vitality: 1, precision: 1 },
  }),
  criticalChance: repeatedDefinition({
    id: "criticalChance", title: "CRITICAL CHANCE", icon: "✦", ranksPerBand: 5, effect: "CRITICAL CHANCE", valuePerRank: 1, durationStartMs: 120_000,
    prerequisites: { prosperity: 1 },
  }),
  criticalDamage: repeatedDefinition({
    id: "criticalDamage", title: "CRITICAL DAMAGE", icon: "✹", ranksPerBand: 4, effect: "CRITICAL DAMAGE", valuePerRank: 5, durationStartMs: 120_000,
    prerequisites: { criticalChance: 1 },
  }),
};

export function createEmptyResearchRanks(): ResearchRanks {
  return Object.fromEntries(RESEARCH_IDS.map((id) => [id, 0])) as ResearchRanks;
}

function normalizedResearchRank(rank: unknown) {
  return Number.isFinite(rank) ? Math.max(0, Math.floor(Number(rank))) : 0;
}

/** Foraging adds 1% and Prosperity adds 2% to every permanent stat reward. */
export function researchStatRewardMultiplier(
  ranks: Pick<ResearchRanks, "foraging" | "prosperity"> | null | undefined,
) {
  return 1 + normalizedResearchRank(ranks?.foraging) * .01 + normalizedResearchRank(ranks?.prosperity) * .02;
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
  if (ranks.regeneration >= RESEARCH_DEFINITIONS.regeneration.ranksPerBand) return false;
  return Object.entries(LEGACY_COMPLETE_RANKS)
    .every(([id, requiredRank]) => ranks[id as ResearchId] >= Number(requiredRank));
}

export function researchRankBandStart(researchId: ResearchId, rankBandIndex: number) {
  return RESEARCH_DEFINITIONS[researchId].ranksPerBand * rankBandIndex;
}

export function researchRankBandEnd(researchId: ResearchId, rankBandIndex: number) {
  return researchRankBandStart(researchId, rankBandIndex + 1);
}

export function researchRankBandIndex(researchId: ResearchId, completedRanks: number) {
  const definition = RESEARCH_DEFINITIONS[researchId];
  return Math.min(RESEARCH_RANK_BAND_COUNT - 1, Math.floor(Math.max(0, completedRanks) / definition.ranksPerBand));
}

/** One predecessor rank unlocks a technology for every remaining rank. */
export function researchPrerequisitesForNextRank(researchId: ResearchId, _completedRanks: number) {
  return { ...(RESEARCH_DEFINITIONS[researchId].prerequisites ?? {}) };
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
