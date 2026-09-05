import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartupController, loadingDescriptionCase } from "./startup-controller";

type FakeElement = {
  hidden: boolean; disabled: boolean; textContent: string; value: string;
  style: { display: string; width: string };
  classList: { add: () => void; remove: () => void; toggle: () => void };
  addEventListener: () => void;
};

function harness(initialStages: [string, boolean, number][]) {
  let stages = initialStages;
  const elements = new Map<string, FakeElement>();
  vi.stubGlobal("document", {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, {
        hidden: false, disabled: false, textContent: "", value: "",
        style: { display: "", width: "" },
        classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
      });
      return elements.get(id)!;
    },
  });
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  const completed = vi.fn(() => startup.refreshLoading());
  const startup = createStartupController({
    accountState: () => undefined, connected: () => true, knownCharacter: () => "",
    knownCharacterGender: () => 0, defaultPlayerName: () => "WANDERER",
    getLoadingStages: () => stages, onLoadingComplete: completed,
    onShowAccountChoice() {}, onShowConnecting() {}, acceptLegalTerms: async () => ({ ok: true }),
    onLegalAccepted() {}, onContinueGuest: () => ({}), onBeginAdventure() {},
    signIn: () => undefined, takeOverSession: () => undefined,
    onAccountActionStarted() {}, onAccountActionCompleted() {}, onAccountActionFailed() {},
    onRetryConnection() {}, showMessage() {},
  });
  return { startup, completed, elements, setStages: (next: typeof stages) => { stages = next; } };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("loading description case", () => {
  it("turns legacy all-caps notices into readable title case", () => {
    expect(loadingDescriptionCase("SIGNING OUT OTHER TAB…")).toBe("Signing Out Other Tab…");
    expect(loadingDescriptionCase("Loading Map Artwork")).toBe("Loading Map Artwork");
  });
});

describe("startup loading presentation", () => {
  it("shows every ready stage for 200ms, including the final fill, and completes once", () => {
    vi.useFakeTimers();
    const h = harness([["Connection", true, 12], ["Profile", true, 56], ["Starting", true, 100]]);
    h.startup.refreshLoading();
    for (const [label, percent] of [["Connection", 12], ["Profile", 56], ["Starting", 100]]) {
      expect(h.elements.get("loadingDetail")!.textContent).toBe(label);
      expect(h.elements.get("loadingFill")!.style.width).toBe(`${percent}%`);
      vi.advanceTimersByTime(199);
      h.startup.refreshLoading();
      expect(h.completed).not.toHaveBeenCalled();
      expect(h.elements.get("loadingDetail")!.textContent).toBe(label);
      vi.advanceTimersByTime(1);
    }
    expect(h.startup.isLoadingSequenceComplete()).toBe(true);
    h.startup.refreshLoading(); vi.runOnlyPendingTimers();
    expect(h.completed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for real readiness without adding another delay after a slow stage", () => {
    vi.useFakeTimers();
    const h = harness([["Connection", false, 12], ["Starting", true, 100]]);
    h.startup.refreshLoading(); vi.advanceTimersByTime(800);
    expect(h.completed).not.toHaveBeenCalled();
    expect(h.elements.get("loadingDetail")!.textContent).toBe("Connection");
    h.setStages([["Connection", true, 12], ["Starting", true, 100]]);
    h.startup.refreshLoading(); vi.advanceTimersByTime(0);
    expect(h.elements.get("loadingDetail")!.textContent).toBe("Starting");
    vi.advanceTimersByTime(200);
    expect(h.completed).toHaveBeenCalledTimes(1);
  });

  it("rechecks readiness when a pending stage timer fires", () => {
    vi.useFakeTimers();
    const h = harness([["Starting", true, 100]]);
    h.startup.refreshLoading();
    h.setStages([["Starting", false, 100]]);
    vi.advanceTimersByTime(200);
    expect(h.completed).not.toHaveBeenCalled();
    h.setStages([["Starting", true, 100]]);
    h.startup.refreshLoading(); vi.advanceTimersByTime(0);
    expect(h.completed).toHaveBeenCalledTimes(1);
  });

  it("cancels completion on failure and starts a fresh paced sequence on retry", () => {
    vi.useFakeTimers();
    const h = harness([["Starting", true, 100]]);
    h.startup.refreshLoading(); vi.advanceTimersByTime(100);
    h.startup.showConnectionFailure("World sync timed out");
    vi.advanceTimersByTime(500);
    expect(h.completed).not.toHaveBeenCalled();
    expect(h.elements.get("loadingDetail")!.textContent).toBe("World sync timed out");
    expect(h.elements.get("connectionRetryBtn")!.hidden).toBe(false);
    h.startup.showConnecting(); vi.advanceTimersByTime(199);
    expect(h.completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.completed).toHaveBeenCalledTimes(1);
  });

  it("does not spend visible stage time behind account choice", () => {
    vi.useFakeTimers();
    const h = harness([["Starting", true, 100]]);
    h.startup.refreshLoading(); vi.advanceTimersByTime(100);
    h.startup.showAccountChoice(); h.startup.refreshLoading(); vi.advanceTimersByTime(1000);
    expect(h.completed).not.toHaveBeenCalled();
    h.startup.showLoading(); vi.advanceTimersByTime(199);
    expect(h.completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.completed).toHaveBeenCalledTimes(1);
  });
});
