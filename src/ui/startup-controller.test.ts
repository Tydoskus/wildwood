import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartupController, loadingDescriptionCase } from "./startup-controller";

type FakeElement = {
  hidden: boolean;
  disabled: boolean;
  textContent: string;
  value: string;
  style: { display: string; width: string };
  classList: { add: () => void; remove: () => void };
  addEventListener: () => void;
};

function fakeElement(): FakeElement {
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    style: { display: "", width: "" },
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
  };
}

describe("loading description case", () => {
  it("turns legacy all-caps notices into readable title case", () => {
    expect(loadingDescriptionCase("SIGNING OUT OTHER TAB…")).toBe("Signing Out Other Tab…");
    expect(loadingDescriptionCase("Loading Map Artwork")).toBe("Loading Map Artwork");
  });
});

describe("startup loading completion", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips per-stage delays and emits completion only once", () => {
    vi.useFakeTimers();
    const elements = new Map<string, FakeElement>();
    vi.stubGlobal("document", {
      getElementById(id: string) {
        const existing = elements.get(id);
        if (existing) return existing;
        const element = fakeElement();
        elements.set(id, element);
        return element;
      },
    });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });

    let completions = 0;
    let startup: ReturnType<typeof createStartupController>;
    startup = createStartupController({
      accountState: () => undefined,
      connected: () => true,
      knownCharacter: () => "",
      knownCharacterGender: () => 0,
      defaultPlayerName: () => "WANDERER",
      isSignInScreenReady: () => true,
      getLoadingStages: () => [["Starting Wildstat", true, 100]],
      onLoadingComplete: () => {
        completions += 1;
        startup.refreshLoading();
      },
      onShowAccountChoice: () => {},
      onShowConnecting: () => {},
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      onLegalAccepted: () => {},
      onContinueGuest: () => {},
      onBeginAdventure: () => {},
      signIn: () => undefined,
      takeOverSession: () => undefined,
      retryConnection: () => true,
      showMessage: () => {},
    });

    startup.refreshLoading();
    expect(startup.isLoadingSequenceComplete()).toBe(false);
    expect(completions).toBe(0);
    vi.advanceTimersByTime(0);
    expect(startup.isLoadingSequenceComplete()).toBe(true);
    expect(completions).toBe(1);
    expect(startup.isLoadingSequenceComplete()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    startup.refreshLoading();
    vi.runOnlyPendingTimers();
    expect(completions).toBe(1);
  });

  it("surfaces a retryable connection failure instead of an indefinite loading label", () => {
    const elements = new Map<string, FakeElement>();
    vi.stubGlobal("document", {
      getElementById(id: string) {
        const existing = elements.get(id);
        if (existing) return existing;
        const element = fakeElement();
        elements.set(id, element);
        return element;
      },
    });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });

    const startup = createStartupController({
      accountState: () => ({ connectionIssue: { message: "World sync timed out" } }),
      connected: () => false,
      knownCharacter: () => "",
      knownCharacterGender: () => 0,
      defaultPlayerName: () => "WANDERER",
      isSignInScreenReady: () => true,
      getLoadingStages: () => [["Loading Connection", false, 12]],
      onLoadingComplete: () => {},
      onShowAccountChoice: () => {},
      onShowConnecting: () => {},
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      onLegalAccepted: () => {},
      onContinueGuest: () => {},
      onBeginAdventure: () => {},
      signIn: () => undefined,
      takeOverSession: () => undefined,
      retryConnection: () => true,
      showMessage: () => {},
    });
    elements.get("connectionRetryBtn")!.hidden = true;

    startup.refreshLoading();

    expect(elements.get("loadingDetail")!.textContent).toBe("World sync timed out");
    expect(elements.get("loadingFill")!.style.width).toBe("12%");
    expect(elements.get("connectionRetryBtn")!.hidden).toBe(false);
  });
});
