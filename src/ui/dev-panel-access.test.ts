import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameDocument } from "../../tests/helpers/game-document";
import { DEVELOPER_IDENTITY } from "../app/developer";
import { createDevPanelController } from "./dev-panel-controller";

afterEach(() => vi.unstubAllGlobals());

const emptyQueue = { reports: [], bugs: [], openReports: 0, openBugs: 0, serverNowMs: Date.now() };

function harness(reviewQueue: () => Promise<unknown>, identity = DEVELOPER_IDENTITY) {
  const document = createGameDocument();
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", document.defaultView);
  const showMessage = vi.fn();
  const review = {
    reviewQueue: vi.fn(reviewQueue), reviewReport: vi.fn(), reviewBug: vi.fn(), setChatMute: vi.fn(), suspend: vi.fn(),
    findPlayers: vi.fn(), playerHistory: vi.fn(), liftSuspension: vi.fn(),
  };
  const controller = createDevPanelController({
    teleportPlayer: async () => {}, simulateTimeAway: async () => true,
    balance: { load: vi.fn(), preview: vi.fn(), save: vi.fn(), restore: vi.fn() } as never,
    review: () => review as never, confirm: async () => true, localIdentity: () => identity,
    isDeveloper: () => identity === DEVELOPER_IDENTITY,
    getNameTagVisible: () => true, setNameTagVisible: () => undefined,
    getPresenceVisible: () => true, setPresenceVisible: () => undefined,
    getVirtualPlayerLoadTest: () => ({ phase: "idle", requested: 0, connected: 0, failures: 0, movementHz: 1, saveIntervalMs: 1_000 }),
    startVirtualPlayers: () => undefined, stopVirtualPlayers: () => undefined,
    loadModerationHistory: async () => ({ entries: [], beforeId: "0", hasMore: false }),
    getBugReports: () => [], deleteBugReport: () => undefined,
    loadAnalytics: async () => { throw new Error("unused"); },
    getMetrics: () => { throw new Error("unused"); },
    closeCompetingWindows: () => {}, showMessage,
  });
  controller.setDeveloperAccess(identity === DEVELOPER_IDENTITY);
  const element = (id: string) => document.getElementById(id) as unknown as HTMLElement;
  return { controller, review, showMessage, element };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("developer panel access", () => {
  it("renders nothing until the server confirms the developer, then opens on the pending reports", async () => {
    let answer!: (value: unknown) => void;
    const h = harness(() => new Promise(resolve => { answer = resolve; }));
    h.element("devAuditBtn").click();
    expect(h.element("devAudit").hidden).toBe(false);
    expect(h.element("devAuditTabs").hidden).toBe(true);
    expect(h.element("devReportsPanel").hidden).toBe(true);
    expect(h.element("devControlsPanel").hidden).toBe(true);
    expect(h.element("devAccessGate").textContent).toContain("Checking developer access");
    answer(emptyQueue);
    await settle();
    expect(h.element("devAuditTabs").hidden).toBe(false);
    expect(h.element("devReportsPanel").hidden).toBe(false);
    expect(h.element("devReportsTab").getAttribute("aria-selected")).toBe("true");
    expect(h.review.reviewQueue).toHaveBeenCalledTimes(1);
  });

  it("closes when the server refuses, whatever the client thought", async () => {
    const h = harness(async () => { throw new Error("Developer access required."); });
    h.element("devAuditBtn").click();
    await settle();
    expect(h.element("devAudit").hidden).toBe(true);
    expect(h.showMessage).toHaveBeenCalledWith("Developer access required.", expect.any(String));
    // A tab clicked on a manually unhidden panel still renders nothing.
    h.element("devAudit").hidden = false;
    h.element("devControlsTab").click();
    expect(h.element("devControlsPanel").hidden).toBe(true);
    expect(h.element("devAudit").hidden).toBe(true);
  });

  it("never shows the button or queries the server for another identity", () => {
    const h = harness(async () => emptyQueue, "ab".repeat(32));
    expect(h.element("devAuditBtn").hidden).toBe(true);
    h.element("devAuditBtn").click();
    expect(h.element("devAudit").hidden).toBe(true);
    expect(h.review.reviewQueue).not.toHaveBeenCalled();
  });
});
