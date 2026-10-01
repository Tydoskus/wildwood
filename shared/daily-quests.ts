import { CAMPAIGN_MAPS } from "./campaign-registry";
import { enemyDefeatDefinition } from "./enemy-defeats";
import { ENEMY_TYPES } from "./enemy-definitions";

/**
 * Weekly quests (0.853; daily from 0.847): fifteen a week, each "kill 50 to
 * 100 of one regular campaign enemy", three on the board at a time. Finishing
 * one brings the next, so a player can clear all fifteen in a day or spread
 * them over the week. Every completed quest is a point for the player's guild
 * that week, and next week the whole guild's stat rewards grow by 0.1% for
 * each point (a full 20-member week, 300 points, is +30%). Weeks begin on
 * Monday at 00:00 UTC.
 */
export const WEEKLY_QUEST_COUNT = 15;
/** Quests on the board at once; kills count toward these only. */
export const QUEST_ACTIVE_COUNT = 3;
export const DAILY_QUEST_MIN_KILLS = 50;
export const DAILY_QUEST_MAX_KILLS = 100;
export const GUILD_QUEST_BONUS_PER_POINT = .001;
/**
 * Without a guild, each quest a player finishes is +1% stat gains next week:
 * fifteen quests, +15%, half of what a full guild's week can earn.
 */
export const SOLO_QUEST_BONUS_PER_QUEST = .01;

export type DailyQuest = {
  mapId: string; enemy: string; target: number; progress: number;
  /** On a leader's board: the member this quest was collected from. */
  from?: string;
  /** On a member's board: the leader who collected it. It no longer counts here. */
  takenBy?: string;
};

/**
 * Any member may collect this many of other members' unfinished quests a
 * week, once their own fifteen are done, so a member who misses the week does
 * not cost the guild its points.
 */
export const GUILD_QUEST_COLLECT_LIMIT = 15;

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
/** When the quest week holding this day ends (Monday 00:00 UTC), in milliseconds since the epoch. */
export function questWeekEndsAtMs(day: number) { return ((questWeek(day) + 1) * 7 - 3) * 86_400_000; }

/** Next week's stat reward multiplier for a guildless player who finished this many quests this week. */
export function soloQuestBonus(lastWeekQuests: number) {
  return 1 + Math.min(WEEKLY_QUEST_COUNT, Math.max(0, Number.isFinite(lastWeekQuests) ? Math.floor(lastWeekQuests) : 0)) * SOLO_QUEST_BONUS_PER_QUEST;
}

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

/**
 * A player's fifteen quests for a week, from the maps they can reach. Every
 * enemy comes up once before any repeats, so a new player with one map open
 * still gets a full week.
 */
export function weeklyQuestsFor(identityHex: string, week: number, progress: UnlockSource): DailyQuest[] {
  const candidates = dailyQuestCandidates(progress);
  let pool = [...candidates];
  const random = seededRandom(`${identityHex.replace(/^0x/i, "").toLowerCase()}:week:${week}`);
  const quests: DailyQuest[] = [];
  while (quests.length < WEEKLY_QUEST_COUNT && candidates.length) {
    if (!pool.length) pool = [...candidates];
    const [pick] = pool.splice(Math.floor(random() * pool.length), 1);
    const target = DAILY_QUEST_MIN_KILLS + Math.floor(random() * (DAILY_QUEST_MAX_KILLS - DAILY_QUEST_MIN_KILLS + 1));
    quests.push({ ...pick, target, progress: 0 });
  }
  return quests;
}

/**
 * The quests on the board: the first three still open, in list order. The
 * player's own come first and collected ones follow, since collecting waits
 * until a player's own fifteen are done.
 */
export function activeQuestIndices(quests: readonly DailyQuest[]) {
  const active: number[] = [];
  for (let index = 0; index < quests.length && active.length < QUEST_ACTIVE_COUNT; index++) if (questOpen(quests[index])) active.push(index);
  return active;
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
  // Only the quests on the board move; the rest wait their turn.
  const active = new Set(activeQuestIndices(quests));
  const next = quests.map((quest, index) => {
    if (!active.has(index) || quest.mapId !== mapId) return quest;
    const count = Math.min(left.get(quest.enemy) ?? 0, quest.target - quest.progress);
    if (count <= 0) return quest;
    left.set(quest.enemy, (left.get(quest.enemy) ?? 0) - count);
    const progress = quest.progress + count;
    if (progress >= quest.target) completed += 1;
    return { ...quest, progress };
  });
  return { quests: next, completed };
}
