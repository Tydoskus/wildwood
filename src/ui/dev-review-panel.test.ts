import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import type { DevReportEntry, DevReviewQueue } from "../../shared/dev-review";
import { createDevReviewPanel, type DevReviewApi } from "./dev-review-panel";
import { relativeTime, remainingLabel, isAccessDenied } from "./dev-review-format";

afterEach(() => vi.unstubAllGlobals());

const NOW = 1_700_000_000_000;

function report(key: string, status: DevReportEntry["status"], reportedAtMs: number, extra: Partial<DevReportEntry> = {}): DevReportEntry {
  return {
    key, status, channel: "world", reporterIdentity: "aa", reporterName: "Reporter", targetIdentity: "bb", targetName: "Rude",
    reason: "harassment", text: `text ${key}`, reportedAtMs, canRemoveMessage: true, messageRemoved: false, decisions: [], ...extra,
  };
}

function queue(): DevReviewQueue {
  return {
    reports: [
      report("chat:1", "open", NOW - 60_000),
      report("chat:2", "open", NOW - 3_600_000, { channel: "profile", canRemoveMessage: false }),
      report("chat:3", "dismissed", NOW - 7_200_000, { decisions: [{ decision: "dismissed", note: "fine", reviewerName: "Ryan", reviewedAtMs: NOW - 1_000 }] }),
    ],
    bugs: [{ id: "4", status: "open", reporterIdentity: "cc", reporterName: "Bugfinder", protocolVersion: 90, message: "door stuck", reportedAtMs: NOW - 5_000, decisions: [] }],
    openReports: 2, openBugs: 1, serverNowMs: NOW,
  };
}

function harness(overrides: Partial<DevReviewApi> = {}) {
  const { document } = parseHTML("<html><body><section id=r></section><section id=b></section></body></html>");
  vi.stubGlobal("document", document);
  const api: DevReviewApi = {
    reviewQueue: vi.fn(async () => queue()),
    reviewReport: vi.fn(async () => ({ ok: true })),
    reviewBug: vi.fn(async () => ({ ok: true })),
    setChatMute: vi.fn(async () => ({ ok: true })),
    suspend: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
  const confirm = vi.fn(async () => true);
  const counts = vi.fn();
  const openPlayer = vi.fn();
  const reports = document.getElementById("r") as unknown as HTMLElement;
  const bugs = document.getElementById("b") as unknown as HTMLElement;
  const panel = createDevReviewPanel({ reports, bugs }, {
    api: () => api, deleteBug: vi.fn(async () => ({ ok: true })), confirm, showMessage: vi.fn(), onCounts: counts, openPlayer,
  });
  const button = (root: HTMLElement, label: string, index = 0) =>
    [...root.querySelectorAll("button")].filter(element => element.textContent === label)[index] as HTMLButtonElement;
  return { panel, api, confirm, counts, openPlayer, reports, bugs, button };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("developer review panel", () => {
  it("shows only open reports by default, in the server's order, with counts for the tabs", async () => {
    const h = harness();
    expect(await h.panel.load()).toEqual({ state: "ok" });
    const cards = [...h.reports.querySelectorAll(".dev-review-card")];
    expect(cards.map(card => (card as HTMLElement).dataset.key)).toEqual(["chat:1", "chat:2"]);
    expect(h.counts).toHaveBeenCalledWith({ reports: 2, bugs: 1 });
    expect(h.reports.querySelector(".dev-review-count")?.textContent).toBe("2 open · oldest first");
    // A profile report has no message to remove.
    expect(cards[1].textContent).not.toContain("Remove message");
    const filter = h.reports.querySelector("input[type=checkbox]") as HTMLInputElement;
    filter.checked = false;
    filter.dispatchEvent(new (filter.ownerDocument.defaultView as any).Event("change"));
    expect(h.reports.querySelectorAll(".dev-review-card").length).toBe(3);
    expect(h.reports.textContent).toContain("Dismissed · Ryan");
  });

  it("removes a message, then mutes through the chat mute before recording the decision", async () => {
    const h = harness();
    await h.panel.load();
    h.button(h.reports, "Remove message").click();
    await settle();
    expect(h.api.reviewReport).toHaveBeenCalledWith("chat:1", "removed", "");
    h.button(h.reports, "Mute 24h").click();
    await settle();
    expect(h.api.setChatMute).toHaveBeenCalledWith("bb", 1_440);
    expect(h.api.reviewReport).toHaveBeenLastCalledWith("chat:1", "muted_24h", "");
  });

  it("asks before banning and does nothing when the answer is no", async () => {
    const h = harness();
    await h.panel.load();
    h.button(h.reports, "Ban…").click();
    h.confirm.mockResolvedValueOnce(false);
    h.button(h.reports, "Ban 7d").click();
    await settle();
    expect(h.api.suspend).not.toHaveBeenCalled();
    h.button(h.reports, "Ban permanently").click();
    await settle(); await settle();
    expect(h.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ danger: true }));
    expect(h.api.suspend).toHaveBeenCalledWith("bb", "Rude", 0, expect.stringContaining("harassment"));
    expect(h.api.reviewReport).toHaveBeenLastCalledWith("chat:1", "banned", "Ban permanently");
  });

  it("opens the reported player's history and reviews bugs", async () => {
    const h = harness();
    await h.panel.load();
    h.button(h.reports, "History").click();
    expect(h.openPlayer).toHaveBeenCalledWith("bb", "Rude");
    h.button(h.bugs, "Won't fix").click();
    await settle();
    expect(h.api.reviewBug).toHaveBeenCalledWith("4", "wont_fix", "");
    expect(h.bugs.textContent).toContain("protocol 90");
  });

  it("reports an access refusal instead of rendering", async () => {
    const h = harness({ reviewQueue: vi.fn(async () => { throw new Error("Developer access required."); }) });
    expect(await h.panel.load()).toEqual({ state: "denied" });
    expect(h.reports.querySelectorAll(".dev-review-card").length).toBe(0);
  });
});

describe("review formatting", () => {
  it("says how long ago and how long is left", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
    expect(remainingLabel(NOW + 42 * 60_000, NOW)).toBe("42m");
    expect(remainingLabel(NOW + 3 * 86_400_000, NOW)).toBe("3d 0h");
    expect(isAccessDenied(new Error("Database owner required."))).toBe(true);
    expect(isAccessDenied(new Error("Report not found."))).toBe(false);
  });
});
