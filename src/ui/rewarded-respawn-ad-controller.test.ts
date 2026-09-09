import { afterEach, describe, expect, it, vi } from "vitest";
import { createRewardedRespawnAdController, formatRespawnBoostRemaining } from "./rewarded-respawn-ad-controller";

function fakeElement(hidden = false) {
  const attributes = new Map<string, string>();
  return Object.assign(new EventTarget(), {
    hidden,
    disabled: false,
    dataset: {} as Record<string, string>,
    textContent: "",
    title: "",
    focus: vi.fn(),
    setAttribute(name: string, value: string) { attributes.set(name, value); },
    getAttribute(name: string) { return attributes.get(name) ?? null; },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rewarded respawn countdown", () => {
  it.each(["rejected", "unavailable"])("allows retry after a %s native load and refreshes when back online", async (failure) => {
    const runtime = Object.assign(new EventTarget(), {
      requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
      setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
    });
    vi.stubGlobal("window", runtime);
    const elements = {
      button: fakeElement(true), status: fakeElement(), activeStatus: fakeElement(true),
      activeTimer: fakeElement(), prompt: fakeElement(true), confirmButton: fakeElement(),
      cancelButton: fakeElement(), browserAd: fakeElement(true), browserAdTimer: fakeElement(),
    };
    const isReady = failure === "rejected"
      ? vi.fn().mockRejectedValueOnce(new Error("Wi-Fi blocked"))
      : vi.fn().mockResolvedValueOnce(false);
    isReady.mockResolvedValue(true);
    const show = vi.fn(async () => ({ rewarded: false }));
    const activateBoost = vi.fn(() => true);
    const controller = createRewardedRespawnAdController(elements as unknown as Parameters<typeof createRewardedRespawnAdController>[0], {
      getNativeBridge: () => ({ platform: "ios", rewardedAds: { isReady, show } }),
      activateBoost, isBoostActive: () => false, boostRemainingMs: () => 0,
      onBoostExpired: vi.fn(), setPromptActive: vi.fn(), setAdPlaybackActive: vi.fn(), showMessage: vi.fn(),
    });
    controller.init();
    await vi.waitFor(() => expect(elements.status.textContent).toBe("RETRY AD"));
    expect(elements.button.disabled).toBe(false);
    elements.button.dispatchEvent(new Event("click"));
    expect(elements.prompt.hidden).toBe(false);
    expect(elements.confirmButton.textContent).toBe("Retry Ad");
    elements.confirmButton.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(elements.status.textContent).toBe("WATCH AD"));
    expect(show).toHaveBeenCalledOnce();
    expect(activateBoost).not.toHaveBeenCalled();
    runtime.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(isReady).toHaveBeenCalledTimes(3));
    controller.destroy();
    runtime.dispatchEvent(new Event("online"));
    expect(isReady).toHaveBeenCalledTimes(3);
  });
  it("formats the full 30-minute reward and final second", () => {
    expect(formatRespawnBoostRemaining(30 * 60 * 1_000)).toBe("30:00");
    expect(formatRespawnBoostRemaining(1)).toBe("0:01");
    expect(formatRespawnBoostRemaining(0)).toBe("0:00");
  });

  it("rounds partial seconds up so the timer never displays early", () => {
    expect(formatRespawnBoostRemaining(29 * 60 * 1_000 + 1)).toBe("29:01");
  });

  it("opens a confirmation prompt before starting the browser ad", () => {
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    });

    const button = fakeElement(true);
    const prompt = fakeElement(true);
    const confirmButton = fakeElement();
    const cancelButton = fakeElement();
    const browserAd = fakeElement(true);
    const setPromptActive = vi.fn();
    const setAdPlaybackActive = vi.fn();
    const activateBoost = vi.fn(() => true);
    const controller = createRewardedRespawnAdController({
      button,
      status: fakeElement(),
      activeStatus: fakeElement(true),
      activeTimer: fakeElement(),
      prompt,
      confirmButton,
      cancelButton,
      browserAd,
      browserAdTimer: fakeElement(),
    } as unknown as Parameters<typeof createRewardedRespawnAdController>[0], {
      getNativeBridge: () => null,
      activateBoost,
      isBoostActive: () => false,
      boostRemainingMs: () => 0,
      onBoostExpired: vi.fn(),
      setPromptActive,
      setAdPlaybackActive,
      showMessage: vi.fn(),
    });

    controller.init();
    button.dispatchEvent(new Event("click"));

    expect(prompt.hidden).toBe(false);
    expect(confirmButton.focus).toHaveBeenCalledOnce();
    expect(setPromptActive).toHaveBeenLastCalledWith(true);
    expect(setAdPlaybackActive).not.toHaveBeenCalled();
    expect(activateBoost).not.toHaveBeenCalled();

    confirmButton.dispatchEvent(new Event("click"));

    expect(prompt.hidden).toBe(true);
    expect(browserAd.hidden).toBe(false);
    expect(setPromptActive).toHaveBeenLastCalledWith(false);
    expect(setAdPlaybackActive).toHaveBeenCalledWith(true);
    expect(activateBoost).not.toHaveBeenCalled();
    controller.destroy();
  });
});
