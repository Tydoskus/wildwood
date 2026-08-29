import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartupController } from "./startup-controller";

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

describe("startup loading completion", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("emits final-stage completion once even when completion refreshes startup", () => {
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
      getLoadingStages: () => [["STARTING WILDWOOD", true, 100]],
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
      showMessage: () => {},
    });

    startup.refreshLoading();
    vi.advanceTimersByTime(200);

    expect(completions).toBe(1);
    expect(startup.isLoadingSequenceComplete()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    startup.refreshLoading();
    vi.runOnlyPendingTimers();
    expect(completions).toBe(1);
  });
});
