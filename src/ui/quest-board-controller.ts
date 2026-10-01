import { GUILD_QUEST_BONUS_PER_POINT, questDay, questDayEndsAtMs, questWeek, type DailyQuest } from "../../shared/daily-quests";

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

/** The words on the board: one row a quest, the guild's week, and the ranking. */
export function questBoardView(state: QuestState | null, ranking: RankingRow[], nowMs: number, mapName: (mapId: string) => string) {
  const quests = (state?.quests ?? []).map(quest => ({
    title: `Defeat ${quest.target} ${quest.enemy}`,
    where: mapName(quest.mapId),
    progress: `${Math.min(quest.progress, quest.target)}/${quest.target}`,
    share: quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 0,
    done: quest.progress >= quest.target,
  }));
  const guild = state?.guildName
    ? { name: state.guildName, points: state.guildPoints, bonusNow: percent(Math.max(0, state.bonus - 1)),
      bonusNext: percent(state.guildPoints * GUILD_QUEST_BONUS_PER_POINT) }
    : null;
  return {
    quests,
    resetsIn: state ? formatQuestReset(questDayEndsAtMs(state.day) - nowMs) : "",
    guild,
    ranking: ranking.slice(0, RANKING_ROWS).map((row, index) => ({ place: index + 1, name: row.guildName, points: row.points, mine: row.guildName === state?.guildName })),
  };
}

/** What the board in the courtyard shows: papers checked off, and how many are done. */
export function questBoardWorldStatus(state: QuestState | null) {
  if (!state?.quests.length) return null;
  const finished = state.quests.map(quest => quest.progress >= quest.target);
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
    + `<p class="farm-map quest-reset"></p><div class="quest-list" role="list" aria-label="Today's quests"></div>`
    + `<section class="quest-guild" aria-label="Guild quest points"><h3 class="quest-guild-title"></h3><p class="quest-guild-line"></p>`
    + `<p class="quest-guild-line quest-guild-next"></p><ol class="quest-ranking"></ol></section>`
    + `<footer class="farm-footer"><div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const reset = $(".quest-reset"), list = $(".quest-list"), guildTitle = $(".quest-guild-title");
  const [guildLine, guildNext] = [...dialog.querySelectorAll<HTMLElement>(".quest-guild-line")];
  const ranking = $(".quest-ranking"), back = $<HTMLButtonElement>(".window-back-button");
  let ticker = 0;

  function render() {
    const source = deps.source();
    const state = source?.dailyQuests?.() ?? null;
    const week = state ? questWeek(state.day) : 0;
    const view = questBoardView(state, state ? source?.guildQuestRanking?.(week) ?? [] : [], now(), deps.mapName);
    reset.textContent = state ? `New quests in ${view.resetsIn}` : "Pinning up today's quests…";
    list.replaceChildren(...view.quests.map(quest => {
      const row = document.createElement("div");
      row.className = "quest-row"; row.setAttribute("role", "listitem");
      row.classList.toggle("is-done", quest.done);
      row.innerHTML = `<span class="quest-check" aria-hidden="true">✓</span><span class="quest-copy"><strong></strong><span class="quest-where"></span>`
        + `<span class="quest-bar" aria-hidden="true"><span></span></span></span><span class="quest-count"></span>`;
      row.querySelector("strong")!.textContent = quest.title;
      row.querySelector(".quest-where")!.textContent = quest.where;
      row.querySelector<HTMLElement>(".quest-bar span")!.style.width = `${Math.round(quest.share * 100)}%`;
      row.querySelector(".quest-count")!.textContent = quest.done ? "Done" : quest.progress;
      return row;
    }));
    if (view.guild) {
      guildTitle.textContent = `${view.guild.name} · ${view.guild.points} point${view.guild.points === 1 ? "" : "s"} this week`;
      guildLine.textContent = `Guild bonus now: +${view.guild.bonusNow} stat gains`;
      guildNext.textContent = `Next week: +${view.guild.bonusNext} (each quest anyone finishes adds 0.25%)`;
    } else {
      guildTitle.textContent = "No guild";
      guildLine.textContent = "Join a guild: each quest you finish is a point for it, and its points become a stat bonus for the whole guild next week.";
      guildNext.textContent = "";
    }
    ranking.replaceChildren(...view.ranking.map(row => {
      const item = document.createElement("li");
      item.classList.toggle("is-mine", row.mine);
      item.innerHTML = `<span class="quest-place"></span><span class="quest-name"></span><span class="quest-points"></span>`;
      item.querySelector(".quest-place")!.textContent = String(row.place);
      item.querySelector(".quest-name")!.textContent = row.name;
      item.querySelector(".quest-points")!.textContent = String(row.points);
      return item;
    }));
    ranking.hidden = !view.ranking.length;
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
export function createQuestBoardRuntime(deps: Parameters<typeof createQuestBoardController>[0]) {
  const board = createQuestBoardController(deps);
  let refreshAt = 0;
  return {
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
