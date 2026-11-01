import { formatRunDelta, formatRunTime, latestSplit, runBests, runSplitName, type RunRecord } from "../../shared/run-timing";

/** The run under way as the coop session gives it (run-timing-service.ts runTimingWith). */
export type LiveRunTiming = {
  prestige: number; wholeRun: boolean; runPlayedMs: number; bossClears: readonly { mapId: string; playedMs: number }[];
} | null | undefined;
type FinishedRun = RunRecord & { endedAtMs: number };

export const currentRun = (timing: LiveRunTiming): RunRecord | null => timing
  ? { prestige: timing.prestige, playedMs: timing.runPlayedMs, wholeRun: timing.wholeRun, bossClears: timing.bossClears }
  : null;

/** The HUD's Run timer line: the run's time, and how far ahead or behind the best time to its latest boss. */
export function runTimerText(timing: LiveRunTiming, history: readonly RunRecord[]) {
  const run = currentRun(timing);
  if (!run) return null;
  const split = latestSplit(run, runBests(history));
  return `Run ${formatRunTime(run.playedMs)}${split?.deltaMs != null ? ` ${formatRunDelta(split.deltaMs)}` : ""}`;
}

/**
 * The Prestige window's Runs tab: this run's time and boss splits against the bests, then every finished run,
 * newest first, each opening to its splits. Times are active play, as the server keeps them (run-timing.ts).
 */
export function createPrestigeRunsTab(d: { container: HTMLElement; timing: () => LiveRunTiming; history: () => readonly FinishedRun[] }) {
  const doc = d.container.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  // The live part redraws each second; the past runs only when one is added, so an opened run stays open.
  const live = el("div", "prestige-runs-live"), past = el("div", "prestige-runs-past");
  d.container.append(live, past);
  let liveState = "", pastState = "";

  function splitList(run: RunRecord, bests: ReturnType<typeof runBests>, compare: boolean) {
    const list = el("ol", "prestige-splits");
    for (const clear of run.bossClears) {
      const row = el("li");
      const best = bests.splits.get(clear.mapId);
      const delta = compare && run.wholeRun && best !== undefined ? clear.playedMs - best : null;
      row.append(el("span", "prestige-split-name", runSplitName(clear.mapId)), el("span", "prestige-split-time", formatRunTime(clear.playedMs)),
        el("span", `prestige-split-delta${delta !== null && delta <= 0 ? " is-ahead" : ""}`, delta === null ? "" : formatRunDelta(delta)));
      list.append(row);
    }
    if (!run.bossClears.length) list.append(el("li", "prestige-split-none", "No bosses yet"));
    return list;
  }

  function renderLive(run: RunRecord | null, history: readonly FinishedRun[], bests: ReturnType<typeof runBests>) {
    const state = JSON.stringify([run && Math.floor(run.playedMs / 1_000), run?.bossClears, history.length]);
    if (state === liveState) return;
    liveState = state;
    const summary = el("dl", "prestige-summary");
    const fact = (label: string, value: string) => {
      const item = el("div");
      item.append(el("dt", "", label), el("dd", "", value));
      summary.append(item);
    };
    fact("This Run", run ? `${formatRunTime(run.playedMs)}${run.wholeRun ? "" : "*"}` : "—");
    fact("Best Run", bests.fastest ? formatRunTime(bests.fastest.playedMs) : "—");
    fact("Runs", String(history.length));
    live.replaceChildren(summary, el("h3", "prestige-runs-heading", run ? `Prestige ${run.prestige} Splits` : "This Run"));
    if (run) live.append(splitList(run, bests, true));
  }

  function renderPast(history: readonly FinishedRun[], bests: ReturnType<typeof runBests>) {
    const state = String(history.length);
    if (state === pastState) return;
    pastState = state;
    past.replaceChildren(el("h3", "prestige-runs-heading", "Past Runs"));
    if (!history.length) past.append(el("p", "prestige-runs-note", "Your runs show here after you prestige."));
    for (const run of [...history].reverse()) {
      const entry = el("details", "prestige-run"), head = el("summary"), best = run === bests.fastest;
      const delta = best ? "Best" : bests.fastest && run.wholeRun ? formatRunDelta(run.playedMs - bests.fastest.playedMs) : "";
      head.append(el("span", "prestige-split-name", `Prestige ${run.prestige}`), el("span", "prestige-split-time", `${formatRunTime(run.playedMs)}${run.wholeRun ? "" : "*"}`),
        el("span", `prestige-split-delta${best ? " is-ahead" : ""}`, delta));
      entry.append(head, splitList(run, bests, false));
      past.append(entry);
    }
    past.append(el("p", "prestige-runs-note", "Times count active play only. * Began before timing did, so it is not ranked. Turn on Run Timer in Settings to see it while you play."));
  }

  function render() {
    if (d.container.hidden) return;
    const history = d.history(), bests = runBests(history);
    renderLive(currentRun(d.timing()), history, bests);
    renderPast(history, bests);
  }

  window.setInterval(() => { if (!doc.hidden) render(); }, 1_000);
  return { render };
}
