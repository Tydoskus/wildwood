import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import type { DevConsole } from "../../shared/dev-console";
import { createDevConsolePanels, type DevConsoleApi } from "./dev-console-panels";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const NOW = 1_700_000_000_000;

function harness() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const { document } = parseHTML("<html><body><section id=m></section><section id=b></section></body></html>");
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", globalThis);
  const data: DevConsole = {
    overview: { pendingReports: 1, openBugs: 2, muted: 2, banned: 2 },
    muted: [
      { identity: "aa", displayName: "Soon", mutedUntilMs: NOW + 3_000, startedAtMs: NOW - 60_000, muteCount: 1, source: "automatic", reason: "3 filtered" },
      { identity: "bb", displayName: "Later", mutedUntilMs: NOW + 90 * 60_000, startedAtMs: NOW - 60_000, muteCount: 2, source: "developer", reason: "" },
    ],
    banned: [
      { identity: "cc", displayName: "Timed", bannedUntilMs: NOW + 3_600_000, permanent: false, startedAtMs: NOW, reason: "spam", by: "Ryan" },
      { identity: "dd", displayName: "Forever", bannedUntilMs: 0, permanent: true, startedAtMs: NOW, reason: "cheating", by: "Automatic" },
    ],
    serverNowMs: NOW,
  };
  const api: DevConsoleApi = {
    console: vi.fn(async () => data), serverNow: () => Date.now(),
    setChatMute: vi.fn(async () => ({ ok: true })), suspend: vi.fn(async () => ({ ok: true })), liftSuspension: vi.fn(async () => ({ ok: true })),
  };
  const confirm = vi.fn(async () => true);
  const overview = vi.fn();
  const openPlayer = vi.fn();
  const muted = document.getElementById("m") as unknown as HTMLElement;
  const banned = document.getElementById("b") as unknown as HTMLElement;
  const panels = createDevConsolePanels({ muted, banned }, {
    api: () => api, confirm, showMessage: vi.fn(), openPlayer, onOverview: overview, onAccessDenied: vi.fn(),
  });
  const button = (root: HTMLElement, label: string, index = 0) =>
    [...root.querySelectorAll("button")].filter(element => element.textContent === label)[index] as HTMLButtonElement;
  return { panels, api, confirm, overview, openPlayer, muted, banned, button };
}

describe("muted and banned tabs", () => {
  it("counts down each second and drops a mute the moment it ends", async () => {
    const h = harness();
    h.panels.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect([...h.muted.querySelectorAll(".dev-console-name")].map(node => node.textContent)).toEqual(["Soon", "Later"]);
    expect(h.muted.textContent).toContain("Automatic");
    expect(h.banned.textContent).toContain("Permanent");
    expect(h.overview).toHaveBeenLastCalledWith({ pendingReports: 1, openBugs: 2, muted: 2, banned: 2 });
    await vi.advanceTimersByTimeAsync(3_000);
    expect([...h.muted.querySelectorAll(".dev-console-name")].map(node => node.textContent)).toEqual(["Later"]);
    expect(h.overview).toHaveBeenLastCalledWith({ pendingReports: 1, openBugs: 2, muted: 1, banned: 2 });
    h.panels.setActive(false);
  });

  it("unmutes after a confirm, extends by the time left plus the step, and opens the player", async () => {
    const h = harness();
    await h.panels.load();
    h.button(h.muted, "Unmute", 1).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.confirm).toHaveBeenCalled();
    expect(h.api.setChatMute).toHaveBeenLastCalledWith("bb", 0);
    h.button(h.muted, "+1h", 1).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.api.setChatMute).toHaveBeenLastCalledWith("bb", 150);
    h.button(h.banned, "Player").click();
    expect(h.openPlayer).toHaveBeenCalledWith("cc", "Timed");
    expect(h.button(h.banned, "+24h", 1).disabled).toBe(true);
  });
});
