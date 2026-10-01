import { CAMPAIGN_MAPS } from "./campaign-registry";
import { enemyDefeatDefinition } from "./enemy-defeats";
import { ENEMY_TYPES } from "./enemy-definitions";

/**
 * Daily quests (0.847): three a day, each "kill 50 to 100 of one regular
 * campaign enemy". Every completed quest is a point for the player's guild that
 * week, and next week the whole guild's stat rewards grow by 0.25% for each
 * point (a full 20-member week, 420 points, is +105%). Days turn at 00:00 UTC;
 * weeks begin on Monday.
 */
export const DAILY_QUEST_COUNT = 3;
export const DAILY_QUEST_MIN_KILLS = 50;
export const DAILY_QUEST_MAX_KILLS = 100;
export const GUILD_QUEST_BONUS_PER_POINT = .0025;

export type DailyQuest = {
  mapId: string; enemy: string; target: number; progress: number;
  /** On a leader's board: the member this quest was collected from. */
  from?: string;
  /** On a member's board: the leader who collected it. It no longer counts here. */
  takenBy?: string;
};

/**
 * The President and Vice President may each collect this many of their
 * members' unfinished quests a day, once their own three are done, so one
 * member missing a day does not cost the guild its points.
 */
export const GUILD_QUEST_COLLECT_LIMIT = 3;

/** A quest of the player's own draw, not one they collected; a collected-away one still counts as theirs. */
export const ownQuest = (quest: DailyQuest) => !quest.from;
export const questDone = (quest: DailyQuest) => quest.progress >= quest.target;
/** Unfinished and still the player's to finish. */
export const questOpen = (quest: DailyQuest) => !questDone(quest) && !quest.takenBy;

const DAY_MICROS = 86_400_000_000n;
export function questDay(micros: bigint) { return Number(micros / DAY_MICROS); }
/** Day 0 (1970-01-01) was a Thursday, so weeks counted from Monday are offset by three days. */
export function questWeek(day: number) { return Math.floor((day + 3) / 7); }
/** When the given quest day ends, in milliseconds since the epoch. */
export function questDayEndsAtMs(day: number) { return (day + 1) * 86_400_000; }

/** Next week's stat reward multiplier for a guild that earned these points this week. */
export function guildQuestBonus(lastWeekPoints: number) {
  return 1 + Math.max(0, Number.isFinite(lastWeekPoints) ? Math.floor(lastWeekPoints) : 0) * GUILD_QUEST_BONUS_PER_POINT;
}

type UnlockSource = Record<string, unknown>;
/** Every regular (non-elite) enemy on the campaign maps this player can reach. */
export function dailyQuestCandidates(progress: UnlockSource) {
  const candidates: { mapId: string; enemy: string }[] = [];
  for (const map of CAMPAIGN_MAPS) {
    if (map.unlockField && progress[map.unlockField] !== true) continue;
    for (const enemy of Object.keys(ENEMY_TYPES)) {
      if ((ENEMY_TYPES as Record<string, { elite?: boolean }>)[enemy].elite) continue;
      if (enemyDefeatDefinition(map.id, enemy)) candidates.push({ mapId: map.id, enemy });
    }
  }
  return candidates;
}

/** FNV-1a then mulberry32: the same player on the same day always draws the same quests. */
function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's quests for a player: three different enemies from the maps they can reach. */
export function dailyQuestsFor(identityHex: string, day: number, progress: UnlockSource): DailyQuest[] {
  const pool = dailyQuestCandidates(progress);
  const random = seededRandom(`${identityHex.replace(/^0x/i, "").toLowerCase()}:${day}`);
  const quests: DailyQuest[] = [];
  while (quests.length < DAILY_QUEST_COUNT && pool.length) {
    const [pick] = pool.splice(Math.floor(random() * pool.length), 1);
    const target = DAILY_QUEST_MIN_KILLS + Math.floor(random() * (DAILY_QUEST_MAX_KILLS - DAILY_QUEST_MIN_KILLS + 1));
    quests.push({ ...pick, target, progress: 0 });
  }
  return quests;
}

/** Reads a stored quest list, dropping anything malformed. */
export function parseDailyQuests(json: string): DailyQuest[] {
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return [];
    return list.filter(quest => quest && typeof quest.mapId === "string" && typeof quest.enemy === "string"
      && Number.isFinite(quest.target) && Number.isFinite(quest.progress))
      .map(quest => ({ mapId: quest.mapId, enemy: quest.enemy, target: quest.target, progress: quest.progress,
        ...(typeof quest.from === "string" && quest.from ? { from: quest.from } : {}),
        ...(typeof quest.takenBy === "string" && quest.takenBy ? { takenBy: quest.takenBy } : {}) }));
  } catch { return []; }
}

/**
 * Applies a kill report to the quests. Each kill counts toward one quest: the
 * first open one for that enemy fills before the next, so a leader holding
 * two collected quests for the same enemy kills for both. Returns the new list
 * and how many quests this report finished, each of which is a guild point.
 */
export function applyQuestKills(quests: DailyQuest[], mapId: string, kills: { enemy: string; count: number }[]) {
  let completed = 0;
  const left = new Map<string, number>();
  for (const kill of kills) left.set(kill.enemy, (left.get(kill.enemy) ?? 0) + Math.max(0, Math.floor(kill.count)));
  const next = quests.map(quest => {
    if (!questOpen(quest) || quest.mapId !== mapId) return quest;
    const count = Math.min(left.get(quest.enemy) ?? 0, quest.target - quest.progress);
    if (count <= 0) return quest;
    left.set(quest.enemy, (left.get(quest.enemy) ?? 0) - count);
    const progress = quest.progress + count;
    if (progress >= quest.target) completed += 1;
    return { ...quest, progress };
  });
  return { quests: next, completed };
}
