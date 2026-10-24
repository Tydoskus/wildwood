import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { MINING_NODES } from "../../shared/mining";
import { gatherRespawnMs } from "../../shared/gather-respawn";
import { installMysteriousOreTimer } from "./mysterious-ore-timer";

const rocks = MINING_NODES.filter(node => node.kind === "mysterious");
const enabledKey = "wildstat-mysterious-ore-timer-enabled-v1";
const positionKey = "wildstat-mysterious-ore-timer-position-v1";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(saved = false, deniedStorage = false) {
  vi.useFakeTimers();
  const { window, document } = parseHTML(`<html><body><div id="hud"></div>
    <details><div class="setting-row"><button id="statTrackerToggle"></button></div></details></body></html>`);
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  Object.assign(window, { innerWidth: 800, innerHeight: 600 });
  const values = new Map([[enabledKey, String(saved)], [positionKey, JSON.stringify({ x: 25, y: 35 })]]);
  Object.defineProperty(window, "localStorage", { configurable: true, get() {
    if (deniedStorage) throw new Error("Storage disabled");
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  } });
  let now = 1_000_000, connected = true, rank = 0;
  const breaks = new Map<number, number>();
  const read = vi.fn((id: number) => breaks.get(id) ?? null);
  installMysteriousOreTimer({ connected: () => connected, source: () => ({ minedNodeAt: read,
    serverNowMs: () => now, research: () => ({ resourceRespawn: rank }) }) });
  const toggle = document.getElementById("mysteriousOreTimerToggle")!;
  const text = () => document.querySelector(".mysterious-ore-timer-handle")?.textContent;
  return { document, window, toggle, text, values, breaks, read,
    setNow: (value: number) => { now = value; }, setRank: (value: number) => { rank = value; },
    connect: (value: boolean) => { connected = value; } };
}

it("is off by default, creates its chip lazily, and stops polling when disabled", () => {
  const s = setup();
  expect(s.toggle.getAttribute("aria-pressed")).toBe("false");
  expect(s.text()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  s.toggle.click();
  expect(s.values.get(enabledKey)).toBe("true");
  expect(s.text()).toBe(`Mysterious: ${rocks.length}/${rocks.length} · All ready`);
  expect(vi.getTimerCount()).toBe(1);
  s.toggle.click();
  s.read.mockClear();
  vi.advanceTimersByTime(5000);
  expect(s.read).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(s.document.querySelector<HTMLElement>(".mysterious-ore-timer")!.hidden).toBe(true);
});

it("shows ready count, earliest respawn and latest respawn using the server clock", () => {
  const s = setup(true);
  s.breaks.set(rocks[0].id, 1_000_000 - 900_000 + 89_000);
  s.breaks.set(rocks[1].id, 1_000_000 - 900_000 + 129_000);
  vi.advanceTimersByTime(1000);
  expect(s.text()).toBe(`Mysterious: ${rocks.length - 2}/${rocks.length} · Next 1:29 · All 2:09`);
  s.setNow(1_129_000);
  vi.advanceTimersByTime(1000);
  expect(s.text()).toBe(`Mysterious: ${rocks.length}/${rocks.length} · All ready`);
});

it("applies Resource Respawn research and rounds partial seconds up", () => {
  const s = setup(true);
  s.setRank(10);
  const duration = gatherRespawnMs(900, 10);
  s.breaks.set(rocks[0].id, 1_000_000 - duration + 1500);
  vi.advanceTimersByTime(1000);
  expect(s.text()).toContain("Next 0:02 · All 0:02");
});

it("does not report rocks ready while disconnected, and refreshes after reconnect", () => {
  const s = setup(true);
  s.connect(false);
  vi.advanceTimersByTime(1000);
  expect(s.text()).toBe("Mysterious: Connecting…");
  s.connect(true);
  vi.advanceTimersByTime(1000);
  expect(s.text()).toContain("All ready");
});

it("skips background polling and catches up immediately on visibility change", () => {
  const s = setup(true);
  Object.defineProperty(s.document, "hidden", { value: true, configurable: true });
  s.read.mockClear();
  vi.advanceTimersByTime(3000);
  expect(s.read).not.toHaveBeenCalled();
  Object.defineProperty(s.document, "hidden", { value: false, configurable: true });
  s.document.dispatchEvent(new s.window.Event("visibilitychange"));
  expect(s.read).toHaveBeenCalledTimes(rocks.length);
});

it("keeps the setting usable without browser storage", () => {
  const s = setup(false, true);
  expect(() => s.toggle.click()).not.toThrow();
  expect(s.text()).toContain("All ready");
});

it("restores the saved position and keeps keyboard moves persistent", () => {
  const s = setup(true);
  const panel = s.document.querySelector<HTMLElement>(".mysterious-ore-timer")!;
  const handle = panel.querySelector("button")!;
  Object.assign(panel, { offsetWidth: 250, offsetHeight: 28,
    getBoundingClientRect: () => ({ left: 25, top: 35 }) });
  s.window.dispatchEvent(new s.window.Event("resize"));
  expect(panel.style.left).toBe("25px");
  expect(panel.style.top).toBe("35px");
  handle.dispatchEvent(Object.assign(new s.window.Event("keydown"), { key: "ArrowRight" }));
  expect(JSON.parse(s.values.get(positionKey)!)).toEqual({ x: 35, y: 35 });
  expect(s.toggle.closest("details")).not.toBeNull();
});
