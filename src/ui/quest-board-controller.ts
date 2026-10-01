import { GUILD_QUEST_BONUS_PER_POINT, questDay, questDayEndsAtMs, questOpen, questWeek, type DailyQuest } from "../../shared/daily-quests";

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
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** The guild's quest week, for the Guild window's Quests tab: its points, its bonus now and next week, and the ranking. */
export function guildQuestStanding(state: QuestState | null, ranking: RankingRow[]) {
  return {
    guild: state?.guildName
      ? { name: state.guildName, points: state.guildPoints, bonusNow: percent(Math.max(0, state.bonus - 1)),
        bonusNext: percent(state.guildPoints * GUILD_QUEST_BONUS_PER_POINT) }
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

/** The words on the board: one row a quest, and when new ones come. */
export function questBoardView(state: QuestState | null, nowMs: number, mapName: (mapId: string) => string) {
  const quests = (state?.quests ?? []).map(quest => ({
    title: `Defeat ${quest.target} ${quest.enemy}`,
    // A collected quest names the member it was taken from; a taken one, who took it.
    where: quest.from ? `${mapName(quest.mapId)} · For ${quest.from}` : quest.takenBy ? `Taken by ${quest.takenBy}` : mapName(quest.mapId),
    progress: `${Math.min(quest.progress, quest.target)}/${quest.target}`,
    share: quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 0,
    done: quest.progress >= quest.target,
    taken: Boolean(quest.takenBy) && quest.progress < quest.target,
  }));
  return { quests, resetsIn: state ? formatQuestReset(questDayEndsAtMs(state.day) - nowMs) : "" };
}

/** What the board in the courtyard shows: papers checked off, and how many are done. */
export function questBoardWorldStatus(state: QuestState | null) {
  if (!state?.quests.length) return null;
  const finished = state.quests.map(quest => !questOpen(quest));
  return { finished, timer: `${finished.filter(Boolean).length}/${finished.length} done` };
}

/** Home's Daily Quest board: a game window with today's quests and the guild race. */
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
  dialog.innerHTML = `<header class="farm-header"><h2 id="questBoardTitle" class="window-banner"><span>Daily Quests</span></h2></header>`
    // Everything between the banner and Back scrolls, so small screens reach it all.
    + `<div class="quest-body"><p class="farm-map quest-reset"></p><div class="quest-list" role="list" aria-label="Today's quests"></div>`
    + `<p class="quest-guild-hint">Each quest you finish is a point for your guild. See Guild → Quests.</p></div>`
    + `<footer class="farm-footer"><div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const reset = $(".quest-reset"), list = $(".quest-list"), back = $<HTMLButtonElement>(".window-back-button");
  let ticker = 0;

  function render() {
    const state = deps.source()?.dailyQuests?.() ?? null;
    const view = questBoardView(state, now(), deps.mapName);
    reset.textContent = state ? `New quests in ${view.resetsIn}` : "Pinning up today's quests…";
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
  // Each quest's count as last shown: never below the server's, never backwards.
  const shown = new Map<string, number>();
  let shownDay = -1;
  return {
    /** A regular enemy died: count it against today's quests at once, ahead of the server's report. */
    noteKill(mapId: string, enemy: string) {
      const state = deps.source()?.dailyQuests?.();
      if (!state) return;
      if (state.day !== shownDay) { shown.clear(); shownDay = state.day; }
      // Kills fill the first open quest for the enemy, the same order the server counts them.
      for (const [index, quest] of state.quests.entries()) {
        if (quest.mapId !== mapId || quest.enemy !== enemy || !questOpen(quest)) continue;
        const key = `${mapId}:${enemy}:${index}`, before = Math.max(shown.get(key) ?? 0, quest.progress);
        if (before >= quest.target) continue;
        shown.set(key, before + 1);
        deps.showProgress?.(enemy, before + 1, quest.target);
        return;
      }
    },
    board,
    worldStatus: () => questBoardWorldStatus(deps.source()?.dailyQuests?.() ?? null),
    refreshAtHome() {
      const source = deps.source();
      if (!deps.atHome() || !source?.isConnected?.()) return;
      const state = source.dailyQuests?.();
      const today = questDay(BigInt(Math.floor(source.serverNowMs?.() ?? Date.now())) * 1000n);
      if ((state && state.day === today) || performance.now() < refreshAt) return;
      refreshAt = performance.now() + 60_000;
      void source.refreshDailyQuests?.()?.catch?.(() => {});
    },
  };
}
