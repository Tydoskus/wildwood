import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createLeaderboardController } from "./leaderboard-controller";
import { LEADERBOARD_STATS, type PrestigeLeaderboardPage } from "../../shared/leaderboard-window";
import type { LeaderboardEntry } from "../coop/contracts";

afterEach(() => vi.unstubAllGlobals());
type LeaderboardPage<Entry> = Omit<PrestigeLeaderboardPage<Entry>, "prestige" | "levels"> & Partial<PrestigeLeaderboardPage<Entry>>;
function fixture(options: { prestige?: () => number } = {}) {
  const { document } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  const element = () => document.createElement("div");
  const elements = { button: element(), overlay: element(), closeButton: element(), valueHeading: element(), podium: element(), rows: element(), loading: element(), empty: element(),
    prestigeChips: element(), prestigeHeading: element(),
    tabs: Object.fromEntries(LEADERBOARD_STATS.map(stat => [stat, element()])) as unknown as Record<typeof LEADERBOARD_STATS[number], HTMLElement> };
  elements.rows.scrollTop = 0;
  Object.defineProperty(elements.rows, "clientHeight", { value: 320 });
  Object.defineProperty(elements.rows, "scrollHeight", { get: () => elements.rows.children.length * 40 });
  document.defaultView!.HTMLElement.prototype.getBoundingClientRect = function () {
    const index = [...elements.rows.children].indexOf(this);
    const top = index < 0 ? 0 : index * 40 - elements.rows.scrollTop;
    return { top, bottom: top + (index < 0 ? 320 : 40), height: index < 0 ? 320 : 40, left: 0, right: 400, width: 400, x: 0, y: top, toJSON() {} };
  };
  const pending: Array<{ resolve: (rows: LeaderboardEntry[], levels?: number[]) => void; resolvePage: (page: LeaderboardPage<LeaderboardEntry>) => void; reject: (error: Error) => void }> = [];
  const loadPage = vi.fn((_stat: string, prestige: number) => new Promise<PrestigeLeaderboardPage<LeaderboardEntry>>((resolve, reject) => pending.push({
    resolve: (entries, levels = [0]) => {
      const localRank = entries.find(row => row.identity === "me")?.rank ?? 0;
      const startRank = Math.min(...entries.filter(row => row.rank! > 3).map(row => row.rank!), 1_000_000);
      const total = Math.max(0, ...entries.map(row => row.rank!));
      resolve({ entries, localRank, startRank: startRank === 1_000_000 ? 1 : startRank, endRank: total, total, prestige, levels });
    }, resolvePage: page => resolve({ prestige, levels: [0], ...page }), reject,
  })));
  let identity = "me";
  const openProfile = vi.fn();
  const drawPodiumCharacter = vi.fn();
  const controller = createLeaderboardController(elements, { loadPage, localPrestige: options.prestige ?? (() => 0),
    localIdentity: () => identity, isDeveloper: () => false, paintProfileIcon: vi.fn(), drawPodiumCharacter, openProfile, beforeOpen: vi.fn() });
  return { elements, pending, loadPage, openProfile, drawPodiumCharacter, controller, identity: (value: string) => { identity = value; } };
}
const entry = (rank: number, name: string) => ({ rank, identity: name, name, gender: 0, power: 1, damage: 1, maxHp: 1, armor: 1, regen: 1, playedSeconds: 1 } as LeaderboardEntry);
it("discards old tab responses and displays true ranks instead of renumbering the subset", async () => {
  const f = fixture();
  const first = f.controller.open();
  const second = f.controller.select("damage");
  f.pending[1].resolve([entry(1, "Winner"), entry(50000, "Near me")]);
  await second;
  expect(f.elements.rows.textContent).toContain("#50000");
  f.pending[0].resolve([entry(1, "Stale power")]);
  await first;
  expect(f.elements.rows.textContent).not.toContain("Stale power");
  expect(f.elements.loading.hidden).toBe(true);
  f.identity("someone else");
  f.controller.drawPodium();
  expect(f.elements.overlay.hidden).toBe(true);
});
it("shows errors, allows retry, and ignores responses after closing", async () => {
  const f = fixture();
  const first = f.controller.open();
  f.pending[0].reject(new Error("Network unavailable"));
  await first;
  expect(f.elements.empty.textContent).toBe("Network unavailable");
  const retry = f.controller.select("power");
  f.controller.close();
  f.pending[1].resolve([entry(1, "Late")]);
  await retry;
  expect(f.elements.overlay.hidden).toBe(true);
  expect(f.elements.rows.textContent).not.toContain("Late");
});

it("keeps the preview mounted during a stat fetch and reuses cached tab results", async () => {
  const f = fixture();
  const opening = f.controller.open();
  expect(f.elements.podium.hidden).toBe(false);
  expect(f.elements.podium.children).toHaveLength(3);
  f.pending[0].resolve([entry(1, "Power winner")]);
  await opening;
  const previousPlayer = f.elements.podium.firstElementChild;
  const switching = f.controller.select("health");
  expect(f.elements.podium.hidden).toBe(false);
  expect(f.elements.podium.getAttribute("aria-busy")).toBe("true");
  expect(f.elements.podium.firstElementChild).toBe(previousPlayer);
  expect(f.elements.podium.textContent).toContain("Power winner");
  f.pending[1].resolve([entry(1, "Health winner")]);
  await switching;
  expect(f.elements.podium.getAttribute("aria-busy")).toBe("false");
  expect(f.elements.podium.textContent).toContain("Health winner");
  await f.controller.select("power");
  expect(f.loadPage).toHaveBeenCalledTimes(2);
  expect(f.elements.podium.hidden).toBe(false);
  expect(f.elements.podium.textContent).toContain("Power winner");
  const failed = f.controller.select("regen");
  f.pending[2].reject(new Error("Offline"));
  await failed;
  expect(f.elements.podium.hidden).toBe(false);
  expect(f.elements.podium.textContent).not.toContain("Power winner");
});

const page = (startRank: number, endRank: number, localRank = 500, total = 1000): LeaderboardPage<LeaderboardEntry> => ({
  startRank, endRank, localRank, total,
  entries: Array.from({ length: endRank - startRank + 1 }, (_, n) => entry(startRank + n, startRank + n === localRank ? "me" : `Player ${startRank + n}`)),
});
it("centers the local rank and preserves its visual position while inserting 100 above", async () => {
  const f = fixture(), opening = f.controller.open();
  f.pending[0].resolvePage({ ...page(450, 550), entries: [entry(1, "Top"), ...page(450, 550).entries] });
  await opening;
  const local = () => f.elements.rows.querySelector<HTMLElement>(".is-local")!;
  expect(local().getBoundingClientRect().top + 20).toBe(160);
  expect(f.elements.rows.textContent).not.toContain("Top");
  expect(f.elements.podium.textContent).toContain("Top");
  f.elements.rows.scrollTop = 60;
  const before = f.elements.rows.querySelector<HTMLElement>('[data-rank="451"]')!.getBoundingClientRect().top;
  const loading = f.controller.loadMore("above");
  expect(f.loadPage).toHaveBeenLastCalledWith("power", 0, 350, 100);
  expect(f.elements.rows.querySelector('[data-direction="above"] .leaderboard-spinner')).not.toBeNull();
  await f.controller.loadMore("above");
  expect(f.loadPage).toHaveBeenCalledTimes(2);
  f.pending[1].resolvePage(page(350, 449)); await loading;
  expect(f.elements.rows.querySelector<HTMLElement>('[data-rank="451"]')!.getBoundingClientRect().top).toBe(before);
  expect(f.elements.rows.querySelectorAll(".leaderboard-row")).toHaveLength(201);
  expect(f.elements.rows.querySelector(".leaderboard-spinner")).toBeNull();
});
it("loads 100 below, keeps rows through an error, and stops at the last rank", async () => {
  const f = fixture(), opening = f.controller.open(); f.pending[0].resolvePage(page(450, 550)); await opening;
  const next = f.controller.loadMore("below");
  expect(f.loadPage).toHaveBeenLastCalledWith("power", 0, 551, 100);
  f.pending[1].reject(new Error("Offline")); await next;
  expect(f.elements.rows.querySelectorAll(".leaderboard-row")).toHaveLength(101);
  expect(f.elements.rows.textContent).toContain("Retry");
  const retry = f.controller.loadMore("below"); f.pending[2].resolvePage(page(551, 560, 500, 560)); await retry;
  expect(f.elements.rows.querySelectorAll(".leaderboard-row")).toHaveLength(111);
  await f.controller.loadMore("below");
  expect(f.loadPage).toHaveBeenCalledTimes(3);
});
it("caps mounted rows while allowing discarded ranges to be loaded again", async () => {
  const f = fixture(), opening = f.controller.open(); f.pending[0].resolvePage(page(450, 550, 500, 100_000)); await opening;
  for (let i = 0; i < 5; i++) {
    const next = f.controller.loadMore("below");
    f.pending[i + 1].resolvePage(page(551 + i * 100, 650 + i * 100, 500, 100_000)); await next;
  }
  expect(f.elements.rows.querySelectorAll(".leaderboard-row")).toHaveLength(501);
  const back = f.controller.loadMore("above");
  expect(f.loadPage).toHaveBeenLastCalledWith("power", 0, 450, 100);
  f.pending[6].resolvePage(page(450, 549, 500, 100_000)); await back;
  expect(f.elements.rows.querySelector(".is-local")).not.toBeNull();
});

it("reuses ranking data for a minute across closes and then refreshes", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
  try {
    const f = fixture();
    const opening = f.controller.open(); f.pending[0].resolvePage(page(450, 550)); await opening;
    f.controller.close();
    now.mockReturnValue(60_999);
    await f.controller.open();
    expect(f.loadPage).toHaveBeenCalledTimes(1);
    f.controller.close(); now.mockReturnValue(61_001);
    const refresh = f.controller.open();
    expect(f.loadPage).toHaveBeenCalledTimes(2);
    f.pending[1].resolvePage(page(460, 560)); await refresh;
    f.controller.close(); f.identity("someone else");
    const other = f.controller.open();
    expect(f.loadPage).toHaveBeenCalledTimes(3);
    f.pending[2].resolvePage(page(1, 50)); await other;
  } finally { now.mockRestore(); }
});

it("keeps the leaderboard and scroll position when inspecting a player", async () => {
  const f = fixture();
  const opening = f.controller.open();
  f.pending[0].resolve([entry(1, "Winner"), entry(50, "Nearby")]);
  await opening;
  f.elements.rows.scrollTop = 120;
  f.elements.rows.querySelector<HTMLElement>(".leaderboard-name")!.click();
  expect(f.openProfile).toHaveBeenCalled();
  expect(f.elements.overlay.hidden).toBe(false);
  expect(f.elements.rows.scrollTop).toBe(120);
  expect(f.loadPage).toHaveBeenCalledTimes(1);
});

it("keeps static podium canvases between frames and redraws on resize", async () => {
  let resize: () => void = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
  });
  const f = fixture();
  const opening = f.controller.open();
  f.pending[0].resolve([entry(1, "First"), entry(2, "Second"), entry(3, "Third")]);
  await opening;
  expect(f.drawPodiumCharacter).toHaveBeenCalledTimes(3);
  for (let frame = 0; frame < 120; frame++) f.controller.drawPodium();
  expect(f.drawPodiumCharacter).toHaveBeenCalledTimes(3);
  resize();
  f.controller.drawPodium();
  expect(f.drawPodiumCharacter).toHaveBeenCalledTimes(6);
  f.controller.close();
  resize();
  f.controller.drawPodium();
  expect(f.drawPodiumCharacter).toHaveBeenCalledTimes(6);
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
describe("prestige boards", () => {
  const chips = (f: ReturnType<typeof fixture>) => [...f.elements.prestigeChips.querySelectorAll<HTMLElement>(".leaderboard-prestige-chip")];
  const chip = (f: ReturnType<typeof fixture>, level: number) => chips(f).find(button => button.dataset.prestige === String(level))!;

  it("opens a new player on the No prestige board", async () => {
    const f = fixture();
    const opening = f.controller.open();
    expect(f.loadPage).toHaveBeenLastCalledWith("power", 0);
    f.pending[0].resolve([entry(1, "Fresh winner")], [0, 1, 2]);
    await opening;
    expect(chips(f).map(button => button.textContent)).toEqual(["No prestigeYou", "Prestige 1", "Prestige 2"]);
    expect(chip(f, 0).classList.contains("is-active")).toBe(true);
    expect(f.elements.prestigeHeading.textContent).toContain("No prestige leaderboard");
  });

  it("opens a Prestige 2 player on Prestige 2, marks their chip and shows their rank", async () => {
    const f = fixture({ prestige: () => 2 });
    const opening = f.controller.open();
    expect(f.loadPage).toHaveBeenLastCalledWith("power", 2);
    f.pending[0].resolve([entry(1, "Top two"), entry(7, "me")], [0, 1, 2]);
    await opening;
    expect(chip(f, 2).classList.contains("is-active")).toBe(true);
    expect(chip(f, 2).getAttribute("aria-selected")).toBe("true");
    expect(chip(f, 2).querySelector(".leaderboard-prestige-you")?.textContent).toBe("You");
    expect(chips(f).filter(button => button.querySelector(".leaderboard-prestige-you"))).toHaveLength(1);
    expect(f.elements.prestigeHeading.textContent).toBe("Prestige 2 leaderboardYou're #7");
    expect(f.elements.rows.querySelector(".is-local")?.getAttribute("data-rank")).toBe("7");
  });

  it("lists every level up to the highest with players, and the viewer's own even before it is ranked", async () => {
    const f = fixture({ prestige: () => 5 });
    const opening = f.controller.open();
    f.pending[0].resolve([], [0, 1, 3]);
    await opening;
    expect(chips(f).map(button => button.dataset.prestige)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(f.elements.prestigeHeading.textContent).toBe("Prestige 5 leaderboardNot ranked yet");
  });

  it("keeps a manual switch for the session, across stats and closes", async () => {
    let level = 2;
    const f = fixture({ prestige: () => level });
    const opening = f.controller.open(); f.pending[0].resolve([entry(1, "P2 winner")], [0, 1, 2]); await opening;
    chip(f, 1).click();
    expect(f.loadPage).toHaveBeenLastCalledWith("power", 1);
    f.pending[1].resolve([entry(1, "P1 winner")], [0, 1, 2]); await flush();
    expect(f.controller.prestigeLevel()).toBe(1);
    const health = f.controller.select("health");
    expect(f.loadPage).toHaveBeenLastCalledWith("health", 1);
    f.pending[2].resolve([entry(1, "P1 healthiest")], [0, 1, 2]); await health;
    f.controller.close();
    level = 3;
    const again = f.controller.open();
    expect(f.controller.prestigeLevel()).toBe(1);
    await again;
    expect(chip(f, 1).classList.contains("is-active")).toBe(true);
    expect(chip(f, 3).querySelector(".leaderboard-prestige-you")).not.toBeNull();
  });

  it("follows the viewer to their new level after a prestige when nothing else was picked", async () => {
    let level = 1;
    const f = fixture({ prestige: () => level });
    const opening = f.controller.open(); f.pending[0].resolve([entry(1, "P1 winner")], [0, 1]); await opening;
    f.controller.close();
    level = 2;
    const again = f.controller.open();
    expect(f.loadPage).toHaveBeenLastCalledWith("power", 2);
    f.pending[1].resolve([entry(1, "P2 winner")], [0, 1, 2]); await again;
    expect(f.controller.prestigeLevel()).toBe(2);
    // Picking their own level again is the same as never picking.
    chip(f, 0).click(); f.pending[2].resolve([], [0, 1, 2]);
    chip(f, 2).click();
    level = 3;
    f.controller.drawPodium();
    expect(f.loadPage).toHaveBeenLastCalledWith("power", 3);
  });

  it("puts only the selected level's top three on the podium", async () => {
    const f = fixture({ prestige: () => 2 });
    const opening = f.controller.open();
    f.pending[0].resolve([entry(1, "P2 first"), entry(2, "P2 second"), entry(3, "P2 third")], [0, 1, 2]);
    await opening;
    expect(f.elements.podium.textContent).toContain("P2 first");
    expect(f.elements.podium.getAttribute("aria-label")).toBe("Top three Prestige 2 players");
    chip(f, 1).click();
    // While Prestige 1 loads, Prestige 2's players leave the stage.
    expect(f.elements.podium.textContent).not.toContain("P2 first");
    expect(f.elements.podium.querySelectorAll(".leaderboard-podium-player.is-empty")).toHaveLength(3);
    f.pending[1].resolve([entry(1, "P1 first"), entry(2, "P1 second"), entry(3, "P1 third")], [0, 1, 2]);
    await flush();
    expect(f.elements.podium.textContent).toContain("P1 first");
    expect(f.elements.podium.textContent).not.toContain("P2");
    expect(f.drawPodiumCharacter).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ name: "P1 second" }), 2);
    // Back to the cached Prestige 2 board without another request.
    chip(f, 2).click();
    expect(f.loadPage).toHaveBeenCalledTimes(2);
    expect(f.elements.podium.textContent).toContain("P2 first");
  });

  it("leaves empty podium places on a level with fewer than three players", async () => {
    const f = fixture({ prestige: () => 4 });
    const opening = f.controller.open();
    f.pending[0].resolve([entry(1, "me")], [0, 4]);
    await opening;
    const places = [...f.elements.podium.querySelectorAll<HTMLElement>(".leaderboard-podium-player")];
    expect(places.map(place => place.dataset.rank)).toEqual(["3", "1", "2"]);
    expect(places.filter(place => place.classList.contains("is-empty")).map(place => place.dataset.rank)).toEqual(["3", "2"]);
    expect(f.elements.podium.textContent).toContain("me");
    expect(f.drawPodiumCharacter).toHaveBeenCalledTimes(1);
    chip(f, 3).click();
    f.pending[1].resolve([], [0, 4]); await flush();
    expect(f.elements.podium.querySelectorAll(".leaderboard-podium-player.is-empty")).toHaveLength(3);
    expect(f.elements.empty.hidden).toBe(false);
  });

  it("forgets a pick when another account opens the board", async () => {
    const f = fixture({ prestige: () => 2 });
    const opening = f.controller.open(); f.pending[0].resolve([], [0, 1, 2]); await opening;
    chip(f, 0).click(); f.pending[1].resolve([], [0, 1, 2]); await flush();
    f.controller.close(); f.identity("someone else");
    void f.controller.open();
    expect(f.loadPage).toHaveBeenLastCalledWith("power", 2);
  });
});
