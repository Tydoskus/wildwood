import { GUILD_QUEST_BONUS_PER_POINT, SOLO_QUEST_BONUS_PER_QUEST, WEEKLY_QUEST_COUNT, activeQuestIndices, ownQuest, questDay, questDone, questOpen, questWeek, questWeekEndsAtMs, type DailyQuest } from "../../shared/daily-quests";

type QuestState = { day: number; quests: DailyQuest[]; bonus: number; guildPoints: number; guildName: string };
type RankingRow = { guildId: string; guildName: string; points: number };

/** Only what the board reads from the coop session. */
export type QuestBoardSource = {
  dailyQuests?: () => QuestState | null;
  guildQuestRanking?: (week: number) => RankingRow[];
  refreshDailyQuests?: () => Promise<unknown>;
  isConnected?: () => boolean;
  serverNowMs?: () => number;
} | null | undefined;

const RANKING_ROWS = 8;
const percent = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;

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
      ? { name: state.guildName, points: state.guildPoints, bonusNow: percent(Math.max(0, state.bonus - 1)),
        bonusNext: percent(state.guildPoints * GUILD_QUEST_BONUS_PER_POINT) }
      : null,
    solo: state && !state.guildName
      ? { quests, bonusNow: percent(Math.max(0, state.bonus - 1)), bonusNext: percent(quests * SOLO_QUEST_BONUS_PER_QUEST),
        bonusMax: percent(WEEKLY_QUEST_COUNT * SOLO_QUEST_BONUS_PER_QUEST) }
      : null,
    ranking: ranking.slice(0, RANKING_ROWS).map((row, index) => ({ place: index + 1, name: row.guildName, points: row.points, mine: row.guildName === state?.guildName })),
  };
}
export type GuildQuestStanding = ReturnType<typeof guildQuestStanding>;

/** The standing from the coop session, for this week. */
export function guildQuestStandingFrom(source: QuestBoardSource) {
  const state = source?.dailyQuests?.() ?? null;
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
    title: `Defeat ${quest.target} ${quest.enemy}`,
    // A collected quest names the member it was taken from; a taken one, who took it.
    where: quest.from ? `${mapName(quest.mapId)} · For ${quest.from}` : quest.takenBy ? `Taken by ${quest.takenBy}` : mapName(quest.mapId),
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
export function questTrackerView(state: QuestState | null, mapId: string, mapName: (mapId: string) => string, shownCount: (key: string) => number | undefined = () => undefined) {
  if (!state?.quests.length) return null;
  const active = activeQuestIndices(state.quests);
  if (!active.length) return null;
  const own = state.quests.filter(ownQuest);
  return {
    done: own.filter(questDone).length, total: own.length || WEEKLY_QUEST_COUNT,
    items: active.map(index => {
      const quest = state.quests[index];
      const count = Math.min(quest.target, Math.max(quest.progress, shownCount(`${quest.mapId}:${quest.enemy}:${index}`) ?? 0));
      return { key: `${index}:${quest.mapId}:${quest.enemy}`, enemy: quest.enemy, where: mapName(quest.mapId), from: quest.from ?? "",
        onMap: quest.mapId === mapId, count, target: quest.target, share: quest.target > 0 ? count / quest.target : 0 };
    })
      // Quests on this map first: they are the ones the player is working on now.
      .sort((a, b) => Number(b.onMap) - Number(a.onMap)),
  };
}
export type QuestTrackerView = NonNullable<ReturnType<typeof questTrackerView>>;

/** What the board in the courtyard shows: three papers, ticked once the week's quests run out, and the week's count. */
export function questBoardWorldStatus(state: QuestState | null) {
  if (!state?.quests.length) return null;
  const open = activeQuestIndices(state.quests).length;
  const own = state.quests.filter(ownQuest);
  return { finished: [0, 1, 2].map(paper => paper >= open), timer: `${own.filter(questDone).length}/${own.length} done` };
}

/** Home's Quest Board: a game window with the week's quests, three at a time. */
export function createQuestBoardController(deps: {
  source: () => QuestBoardSource;
  atHome: () => boolean;
  pause: (paused: boolean) => void;
  clearInput?: () => void;
  mapName: (mapId: string) => string;
  nowMs?: () => number;
}) {
  const now = () => deps.nowMs?.() ?? Date.now();
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet";
  dialog.setAttribute("aria-labelledby", "questBoardTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="questBoardTitle" class="window-banner"><span>Weekly Quests</span></h2></header>`
    // Everything between the banner and Back scrolls, so small screens reach it all.
    + `<div class="quest-body"><p class="farm-map quest-reset"></p><div class="quest-week" aria-hidden="true"></div><div class="quest-list" role="list" aria-label="Quests in play"></div>`
    + `<p class="quest-guild-hint"></p></div>`
    + `<footer class="farm-footer"><div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const reset = $(".quest-reset"), list = $(".quest-list"), week = $(".quest-week"), hint = $(".quest-guild-hint"), back = $<HTMLButtonElement>(".window-back-button");
  let ticker = 0;

  function render() {
    const state = deps.source()?.dailyQuests?.() ?? null;
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
      ? `On your own: +${solo.bonusNext} stat gains next week (+${Math.round(SOLO_QUEST_BONUS_PER_QUEST * 100)}% a quest, up to +${solo.bonusMax}). Bonus now: +${solo.bonusNow}.`
      : view.finished ? "All done this week. New quests on Monday."
      : "Each quest you finish is a point for your guild. See Guild → Quests.";
    list.replaceChildren(...view.quests.map(quest => {
      const row = document.createElement("div");
      row.className = "quest-row"; row.setAttribute("role", "listitem");
      row.classList.toggle("is-done", quest.done);
      row.classList.toggle("is-taken", quest.taken);
      row.innerHTML = `<span class="quest-check" aria-hidden="true">✓</span><span class="quest-copy"><strong></strong><span class="quest-where"></span>`
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
    void deps.source()?.refreshDailyQuests?.()?.catch?.(() => {});
    render();
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
    const state = source.dailyQuests?.();
    const today = questDay(BigInt(Math.floor(source.serverNowMs?.() ?? Date.now())) * 1000n);
    if ((state && questWeek(state.day) === questWeek(today)) || performance.now() < refreshAt) return;
    refreshAt = performance.now() + 60_000;
    void source.refreshDailyQuests?.()?.catch?.(() => {});
  }
  // Each quest's count as last shown: never below the server's, never backwards.
  const shown = new Map<string, number>();
  let shownDay = -1;
  return {
    /** A regular enemy died: count it against the quests in play at once, ahead of the server's report. */
    noteKill(mapId: string, enemy: string) {
      const state = deps.source()?.dailyQuests?.();
      if (!state) return;
      if (state.day !== shownDay) { shown.clear(); shownDay = state.day; }
      // Kills fill the first quest in play for the enemy, the same order the server counts them.
      for (const index of activeQuestIndices(state.quests)) {
        const quest = state.quests[index];
        if (quest.mapId !== mapId || quest.enemy !== enemy) continue;
        const key = `${mapId}:${enemy}:${index}`, before = Math.max(shown.get(key) ?? 0, quest.progress);
        if (before >= quest.target) continue;
        shown.set(key, before + 1);
        deps.showProgress?.(enemy, before + 1, quest.target);
        return;
      }
    },
    board,
    /**
     * The quests in play for the HUD tracker, counted as far as the kill
     * pop-ups have shown, so the two never disagree.
     */
    trackerView(mapId: string) {
      const state = deps.source()?.dailyQuests?.() ?? null;
      if (state && state.day !== shownDay) { shown.clear(); shownDay = state.day; }
      return questTrackerView(state, mapId, deps.mapName, (key) => shown.get(key));
    },
    worldStatus: () => questBoardWorldStatus(deps.source()?.dailyQuests?.() ?? null),
    refreshAtHome() { if (deps.atHome()) refresh(); },
    refresh,
  };
}
