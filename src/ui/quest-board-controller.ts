import { renderBooleanSetting } from "./settings";
import { MAP_IDS } from "../../shared/rules";
import { formatMultiplierChange } from "./number-format";
import { ENEMY_TYPES, rewardStatLabel, type EnemyKind, type RewardType } from "../game/enemies";
import { GUILD_QUEST_BONUS_PER_POINT, SOLO_QUEST_BONUS_PER_QUEST, WEEKLY_QUEST_COUNT, activeQuestIndices, applyQuestKills, ownQuest, questDay, questTarget, questDone, questOpen, questWeek, questWeekEndsAtMs, type WeeklyQuest } from "../../shared/weekly-quests";

type QuestState = { day: number; quests: WeeklyQuest[]; bonus: number; guildPoints: number; guildName: string };
type RankingRow = { guildId: string; guildName: string; points: number };

/** Only what the board reads from the coop session. */
export type QuestBoardSource = {
  weeklyQuests?: () => QuestState | null;
  guildQuestRanking?: (week: number) => RankingRow[];
  refreshWeeklyQuests?: () => Promise<unknown>;
  /** Whether this account has opened the board (null while unknown), and the call that records it. */
  questBoardSeen?: () => boolean | null;
  markQuestBoardSeen?: () => void;
  isConnected?: () => boolean;
  serverNowMs?: () => number;
  /** Kills on a map the server has not taken yet (the kill report queue). */
  pendingQuestKills?: (mapId: string) => readonly { enemy: string; count: number }[];
} | null | undefined;

const RANKING_ROWS = 8;
/** A stat gain bonus as the multiplier it pays: 3.7% → ×1.04. */
const bonusMultiplier = (fraction: number) => formatMultiplierChange(1 + fraction);

export function formatQuestReset(msLeft: number) {
  const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
  const hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/**
 * The quest week for the Guild window's Quests tab: the guild's points and its
 * bonus now and next week, or, without a guild, the player's own solo week
 * (their row's points are their own quests then), and the ranking.
 */
export function guildQuestStanding(state: QuestState | null, ranking: RankingRow[]) {
  const quests = Math.min(WEEKLY_QUEST_COUNT, state?.guildPoints ?? 0);
  return {
    guild: state?.guildName
      ? { name: state.guildName, points: state.guildPoints, bonusNow: bonusMultiplier(Math.max(0, state.bonus - 1)),
        bonusNext: bonusMultiplier(state.guildPoints * GUILD_QUEST_BONUS_PER_POINT) }
      : null,
    solo: state && !state.guildName
      ? { quests, bonusNow: bonusMultiplier(Math.max(0, state.bonus - 1)), bonusNext: bonusMultiplier(quests * SOLO_QUEST_BONUS_PER_QUEST),
        bonusMax: bonusMultiplier(WEEKLY_QUEST_COUNT * SOLO_QUEST_BONUS_PER_QUEST) }
      : null,
    ranking: ranking.slice(0, RANKING_ROWS).map((row, index) => ({ place: index + 1, name: row.guildName, points: row.points, mine: row.guildName === state?.guildName })),
  };
}
export type GuildQuestStanding = ReturnType<typeof guildQuestStanding>;

/** The standing from the coop session, for this week. */
export function guildQuestStandingFrom(source: QuestBoardSource) {
  const state = source?.weeklyQuests?.() ?? null;
  return guildQuestStanding(state, state ? source?.guildQuestRanking?.(questWeek(state.day)) ?? [] : []);
}

/**
 * The words on the board: the three quests in play, how many of the week's
 * fifteen are done, and when the next fifteen come.
 */
export function questBoardView(state: QuestState | null, nowMs: number, mapName: (mapId: string) => string) {
  const all = state?.quests ?? [];
  const own = all.filter(ownQuest);
  const quests = activeQuestIndices(all).map(index => all[index]).map(quest => ({
    title: quest.stat ? `Defeat ${quest.target} ${rewardStatLabel({ type: quest.stat, amount: 0 })} Enemies` : `Defeat ${quest.target} ${quest.enemy}`,
    // A collected quest names the member it was taken from; a taken one, who took it.
    where: quest.takenBy ? `Taken by ${quest.takenBy}` : mapName(quest.mapId),
    progress: `${Math.min(quest.progress, quest.target)}/${quest.target}`,
    share: quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 0,
    done: quest.progress >= quest.target,
    taken: Boolean(quest.takenBy) && quest.progress < quest.target,
  }));
  const extra = all.filter(quest => !ownQuest(quest));
  return { quests, resetsIn: state ? formatQuestReset(questWeekEndsAtMs(state.day) - nowMs) : "",
    done: own.filter(questDone).length, total: own.length || WEEKLY_QUEST_COUNT,
    collected: extra.length ? `${extra.filter(questDone).length}/${extra.length} collected` : "",
    finished: own.length > 0 && !all.some(questOpen) };
}

/**
 * The HUD tracker's rows: the three quests in play, each with its count and
 * whether it is on the map the player is on, and the week's count for the
 * header. Null when there is nothing to track: no quests yet, or all done.
 */
export function questTrackerView(state: QuestState | null, mapId: string, mapName: (mapId: string) => string) {
  if (!state?.quests.length) return null;
  const active = activeQuestIndices(state.quests);
  if (!active.length) return null;
  return {
    ...weekCount(state.quests),
    // Later campaign areas first; stable ties keep quests in their original order.
    items: [...active].sort((a, b) => MAP_IDS.indexOf(state.quests[b].mapId) - MAP_IDS.indexOf(state.quests[a].mapId)).map(index => {
      const quest = state.quests[index];
      const count = Math.min(quest.target, quest.progress);
      // The stat a kill pays, so the tracker says what the quest is farming.
      // A stat quest names its stat alone; an older one, its enemy and the stat that enemy gives.
      const stat: RewardType | null = quest.stat ?? ENEMY_TYPES[quest.enemy as EnemyKind]?.reward.type ?? null;
      return { key: `${index}:${quest.mapId}:${questTarget(quest)}`, enemy: quest.enemy ?? "", stat, where: mapName(quest.mapId), from: quest.from ?? "",
        onMap: quest.mapId === mapId, count, target: quest.target, share: quest.target > 0 ? count / quest.target : 0 };
    }),
  };
}
export type QuestTrackerView = NonNullable<ReturnType<typeof questTrackerView>>;

/**
 * The week's count on the tracker and the courtyard board: a player's own fifteen and every quest collected from the
 * guild's pool, so collecting more goes past 15/15 (20/30). A quest someone else took no longer counts here.
 */
function weekCount(quests: readonly WeeklyQuest[]) {
  const own = quests.filter(ownQuest), collected = quests.filter(quest => !ownQuest(quest));
  return { done: [...own, ...collected].filter(questDone).length, total: (own.length || WEEKLY_QUEST_COUNT) + collected.length };
}

/** What the board in the courtyard shows: three papers, ticked once the week's quests run out, and the week's count. */
export function questBoardWorldStatus(state: QuestState | null) {
  if (!state?.quests.length) return null;
  const open = activeQuestIndices(state.quests).length;
  const week = weekCount(state.quests);
  return { finished: [0, 1, 2].map(paper => paper >= open), timer: `${week.done}/${week.total} done` };
}

/** Home's Quest Board: a game window with the week's quests, three at a time. */
export function createQuestBoardController(deps: {
  source: () => QuestBoardSource;
  atHome: () => boolean;
  pause: (paused: boolean) => void;
  clearInput?: () => void;
  mapName: (mapId: string) => string;
  nowMs?: () => number;
  /** The HUD quest tracker's switch, which lives on the board. */
  tracker?: { enabled: () => boolean; set: (enabled: boolean) => void };
}) {
  const now = () => deps.nowMs?.() ?? Date.now();
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet";
  dialog.setAttribute("aria-labelledby", "questBoardTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="questBoardTitle" class="window-banner"><span>Weekly Quests</span></h2></header>`
    // Everything between the banner and Back scrolls, so small screens reach it all.
    + `<div class="quest-body"><p class="farm-map quest-reset"></p><div class="quest-week" aria-hidden="true"></div><div class="quest-list" role="list" aria-label="Quests in play"></div>`
    + `<p class="quest-guild-hint"></p>`
    + `<div class="quest-tracker-setting"><span>Track quests on the HUD</span><button type="button" class="setting-toggle quest-tracker-switch"></button></div></div>`
    + `<footer class="farm-footer"><div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const reset = $(".quest-reset"), list = $(".quest-list"), week = $(".quest-week"), hint = $(".quest-guild-hint"), back = $<HTMLButtonElement>(".window-back-button");
  const trackerRow = $(".quest-tracker-setting"), trackerSwitch = $<HTMLButtonElement>(".quest-tracker-switch");
  trackerRow.hidden = !deps.tracker;
  trackerSwitch.setAttribute("aria-label", "Track quests on the HUD");
  const paintTracker = () => renderBooleanSetting(trackerSwitch, deps.tracker?.enabled() ?? true);
  trackerSwitch.addEventListener("click", () => { deps.tracker?.set(!deps.tracker.enabled()); paintTracker(); });
  paintTracker();
  let ticker = 0;

  function render() {
    const state = deps.source()?.weeklyQuests?.() ?? null;
    const view = questBoardView(state, now(), deps.mapName);
    // The week's count, then when the next fifteen come on a line of its own.
    if (state) reset.replaceChildren(`${view.done}/${view.total} done this week${view.collected ? ` · ${view.collected}` : ""}`, document.createElement("br"), `New quests in ${view.resetsIn}`);
    else reset.textContent = "Pinning up this week's quests…";
    // One bar for the week's fifteen, so it is clear the three on the board are not all.
    week.replaceChildren(...Array.from({ length: view.total }, (_, index) => {
      const step = document.createElement("span");
      step.className = `quest-week-step${index < view.done ? " is-done" : ""}`;
      return step;
    }));
    const solo = guildQuestStanding(state, []).solo;
    hint.textContent = solo
      // Without a guild, the board says what the week is worth so far and what the bonus is now.
      ? `On your own: ${solo.bonusNext} stat gains next week (+${Math.round(SOLO_QUEST_BONUS_PER_QUEST * 100)}% a quest, up to ${solo.bonusMax}). Bonus now: ${solo.bonusNow}.`
      : view.finished ? "All done this week. New quests on Monday."
      : "Each quest you finish is a point for your guild. See Guild → Quests.";
    list.replaceChildren(...view.quests.map(quest => {
      const row = document.createElement("div");
      row.className = "quest-row"; row.setAttribute("role", "listitem");
      row.classList.toggle("is-done", quest.done);
      row.classList.toggle("is-taken", quest.taken);
      row.innerHTML = `<span class="quest-check" aria-hidden="true">✓</span><span class="quest-copy"><span class="quest-where"></span><strong></strong>`
        + `<span class="quest-bar" aria-hidden="true"><span></span></span></span><span class="quest-count"></span>`;
      row.querySelector("strong")!.textContent = quest.title;
      row.querySelector(".quest-where")!.textContent = quest.where;
      row.querySelector<HTMLElement>(".quest-bar span")!.style.width = `${Math.round(quest.share * 100)}%`;
      row.querySelector(".quest-count")!.textContent = quest.done ? "Done" : quest.taken ? "Taken" : quest.progress;
      return row;
    }));
  }

  function close() {
    if (!dialog.open) return false;
    dialog.close();
    window.clearInterval(ticker); ticker = 0;
    deps.clearInput?.();
    deps.pause(false);
    return true;
  }

  function open() {
    if (!deps.atHome() || dialog.open) return;
    // Draws today's quests on the server the first time anyone looks.
    void deps.source()?.refreshWeeklyQuests?.()?.catch?.(() => {});
    // From the first visit on, the HUD tracker shows the quests.
    deps.source()?.markQuestBoardSeen?.();
    render(); paintTracker();
    deps.clearInput?.();
    deps.pause(true);
    dialog.showModal();
    back.focus();
    ticker = window.setInterval(render, 1_000);
  }

  back.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return { open, close, isOpen: () => dialog.open, render, destroy() { close(); dialog.remove(); } };
}

/**
 * The board as main.ts uses it: the window, its courtyard status, and a
 * refresh that, while the player is home, asks the server once a minute to
 * draw today's quests until they arrive.
 */
export function createQuestBoardRuntime(deps: Parameters<typeof createQuestBoardController>[0] & {
  /** Shows a quest enemy's pop-up: its name and the quest's count. */
  showProgress?: (enemy: string, count: number, target: number) => void;
}) {
  const board = createQuestBoardController(deps);
  let refreshAt = 0;
  /** Asks the server to draw this week's quests until they arrive, at most once a minute; the tracker calls it away from home. */
  function refresh() {
    const source = deps.source();
    if (!source?.isConnected?.()) return;
    const state = source.weeklyQuests?.();
    const today = questDay(BigInt(Math.floor(source.serverNowMs?.() ?? Date.now())) * 1000n);
    if ((state && questWeek(state.day) === questWeek(today)) || performance.now() < refreshAt) return;
    refreshAt = performance.now() + 60_000;
    void source.refreshWeeklyQuests?.()?.catch?.(() => {});
  }
  // The server's counts with the kills it has not taken yet, counted as it will count them. Kills it refused are in
  // neither, so the tracker and the board never show more than the server will pay.
  const pendingOn = (mapId: string) => [...(deps.source()?.pendingQuestKills?.(mapId) ?? [])];
  const withPending = (quests: WeeklyQuest[], mapId: string, pending: { enemy: string; count: number }[]) =>
    pending.length ? applyQuestKills(quests, mapId, pending).quests : quests;
  return {
    /** A regular enemy died (already queued for the server): pop up the quest it counts for, ahead of the report. */
    noteKill(mapId: string, enemy: string) {
      const state = deps.source()?.weeklyQuests?.();
      if (!state) return;
      const queued = pendingOn(mapId);
      if (!queued.some(kill => kill.enemy === enemy && kill.count > 0)) queued.push({ enemy, count: 1 });
      const at = queued.findIndex(kill => kill.enemy === enemy && kill.count > 0);
      const before = withPending(state.quests, mapId, queued.map((kill, index) => index === at ? { ...kill, count: kill.count - 1 } : kill));
      const after = withPending(state.quests, mapId, queued);
      const index = after.findIndex((quest, at) => quest.progress > before[at].progress);
      if (index < 0) return;
      const quest = after[index];
      deps.showProgress?.(quest.stat ? rewardStatLabel({ type: quest.stat, amount: 0 }) : enemy, Math.min(quest.progress, quest.target), quest.target);
    },
    board,
    /**
     * The quests in play for the HUD tracker: the server's counts and this map's kills it has not taken yet, the
     * same as the kill pop-ups.
     */
    trackerView(mapId: string) {
      // Nothing on the HUD until the player has found the board in Town.
      if (deps.source()?.questBoardSeen?.() !== true) return null;
      const state = deps.source()?.weeklyQuests?.() ?? null;
      return questTrackerView(state && { ...state, quests: withPending(state.quests, mapId, pendingOn(mapId)) }, mapId, deps.mapName);
    },
    worldStatus: () => questBoardWorldStatus(deps.source()?.weeklyQuests?.() ?? null),
    refreshAtHome() { if (deps.atHome()) refresh(); },
    refresh,
  };
}
