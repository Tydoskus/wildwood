import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRewardedGemAdController } from "./rewarded-gem-ad-controller";
import { AD_GEM_COOLDOWN_MS, utcDayKey, type AdGemRewardRecord } from "../../shared/ad-gem-reward";

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

function stubWindow() {
  const runtime = Object.assign(new EventTarget(), {
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
    setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
  });
  vi.stubGlobal("window", runtime);
  return runtime;
}

function fakeElements() {
  return {
    button: fakeElement(true), status: fakeElement(), countdown: fakeElement(true),
    prompt: fakeElement(true), confirmButton: fakeElement(), cancelButton: fakeElement(),
    browserAd: fakeElement(true), browserAdTimer: fakeElement(),
  };
}

type Elements = ReturnType<typeof fakeElements>;
const NOON = Date.UTC(2026, 8, 23, 12, 0, 0);

/**
 * A controller against a fake server row. `claim` stands in for the reducer:
 * by default it pays, and writes the row the way the server would.
 */
function harness(options: {
  record?: AdGemRewardRecord | null;
  bridge?: unknown;
  supporter?: boolean;
  claim?: () => Promise<{ ok: boolean; error?: string }>;
  showWaitTimer?: () => boolean;
} = {}) {
  const elements = fakeElements();
  let clock = NOON;
  const server = { record: options.record ?? null };
  const claimAdGems = vi.fn(options.claim ?? (async () => {
    const dayKey = utcDayKey(clock);
    const claimsToday = server.record?.dayKey === dayKey ? server.record.claimsToday + 1 : 1;
    server.record = { lastClaimAtMs: clock, dayKey, claimsToday };
    return { ok: true };
  }));
  const showMessage = vi.fn();
  const showGemReward = vi.fn();
  const setPromptActive = vi.fn();
  const setAdPlaybackActive = vi.fn();
  const controller = createRewardedGemAdController(elements as unknown as Parameters<typeof createRewardedGemAdController>[0], {
    getNativeBridge: () => options.bridge ?? null,
    isSupporter: () => options.supporter ?? false,
    adGemReward: () => server.record,
    claimAdGems, showGemReward, showMessage, setPromptActive, setAdPlaybackActive,
    now: () => clock,
    showWaitTimer: options.showWaitTimer,
  });
  return {
    elements, server, controller, claimAdGems, showMessage, showGemReward, setPromptActive, setAdPlaybackActive,
    advance(ms: number) { clock += ms; },
  };
}

const click = (element: EventTarget) => element.dispatchEvent(new Event("click"));

function expectCountdown(elements: Elements, text: string) {
  expect(elements.button.hidden).toBe(false);
  expect(elements.button.disabled).toBe(true);
  expect(elements.countdown.hidden).toBe(false);
  expect(elements.countdown.textContent).toBe(text);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rewarded gem ad", () => {
  it("is ready with the Gem label when the account has no claim yet", () => {
    stubWindow();
    const { elements, controller } = harness();
    controller.init();
    expect(elements.button.dataset.state).toBe("browser");
    expect(elements.button.disabled).toBe(false);
    expect(elements.countdown.hidden).toBe(true);
    expect(elements.button.getAttribute("aria-label")).toBe("Watch ad · +10 Gems · 4 left today");
    controller.destroy();
  });

  it("confirms, plays the browser ad, then claims and shows +10 GEMS", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOON);
    stubWindow();
    const h = harness();
    h.controller.init();
    click(h.elements.button);
    expect(h.elements.prompt.hidden).toBe(false);
    expect(h.setPromptActive).toHaveBeenLastCalledWith(true);
    expect(h.claimAdGems).not.toHaveBeenCalled();

    click(h.elements.confirmButton);
    expect(h.elements.browserAd.hidden).toBe(false);
    expect(h.setAdPlaybackActive).toHaveBeenLastCalledWith(true);
    expect(h.claimAdGems).not.toHaveBeenCalled();

    // The placeholder's timer fires through window.setTimeout; run its tick at the end.
    vi.setSystemTime(NOON + 30_000);
    const tick = (window.setTimeout as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as () => void;
    tick();

    await vi.waitFor(() => expect(h.claimAdGems).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(h.showMessage).toHaveBeenCalledWith("+10 GEMS", expect.any(String)));
    expect(h.showGemReward).toHaveBeenCalledWith(10);
    expect(h.elements.browserAd.hidden).toBe(true);
    expect(h.setAdPlaybackActive).toHaveBeenLastCalledWith(false);
    await vi.waitFor(() => expectCountdown(h.elements, "Ad in 30:00\n3 left today"));
    h.controller.destroy();
  });

  it("counts a cooldown down each second from the server's row, disabled, then is ready again", async () => {
    stubWindow();
    const h = harness({ record: { lastClaimAtMs: NOON - 48_000, dayKey: utcDayKey(NOON), claimsToday: 1 } });
    h.controller.init();
    expectCountdown(h.elements, "Ad in 29:12\n3 left today");
    expect(h.elements.button.title).toBe("Next ad in 29:12");
    click(h.elements.button);
    expect(h.elements.prompt.hidden).toBe(true);

    h.advance(1_000);
    h.controller.sync();
    expect(h.elements.countdown.textContent).toBe("Ad in 29:11\n3 left today");

    h.advance(AD_GEM_COOLDOWN_MS);
    h.controller.sync();
    await vi.waitFor(() => expect(h.elements.button.dataset.state).toBe("browser"));
    expect(h.elements.button.disabled).toBe(false);
    expect(h.elements.countdown.hidden).toBe(true);
    h.controller.destroy();
  });

  it("hides the button during the wait when the ad timer is off, and shows it once an ad is ready", async () => {
    stubWindow();
    let timerShown = false;
    const h = harness({ record: { lastClaimAtMs: NOON - 48_000, dayKey: utcDayKey(NOON), claimsToday: 1 }, showWaitTimer: () => timerShown });
    h.controller.init();
    expect(h.elements.button.hidden).toBe(true);
    timerShown = true;
    h.advance(1_000);
    h.controller.sync();
    expectCountdown(h.elements, "Ad in 29:11\n3 left today");
    timerShown = false;
    h.advance(AD_GEM_COOLDOWN_MS);
    h.controller.sync();
    await vi.waitFor(() => expect(h.elements.button.dataset.state).toBe("browser"));
    expect(h.elements.button.hidden).toBe(false);
    h.controller.destroy();
  });

  it("waits for the UTC reset once four ads are claimed today", () => {
    stubWindow();
    const h = harness({ record: { lastClaimAtMs: NOON - 2 * 3_600_000, dayKey: utcDayKey(NOON), claimsToday: 4 } });
    h.controller.init();
    expectCountdown(h.elements, "Ad in 12:00:00\n0 left today");
    expect(h.elements.button.dataset.state).toBe("limit");
    expect(h.elements.button.title).toBe("No more ads today · resets in 12:00:00");
    h.controller.destroy();
  });

  it("picks up a claim made on another device without being clicked", () => {
    stubWindow();
    const h = harness();
    h.controller.init();
    expect(h.elements.button.dataset.state).toBe("browser");
    h.server.record = { lastClaimAtMs: NOON, dayKey: utcDayKey(NOON), claimsToday: 2 };
    h.controller.sync();
    expectCountdown(h.elements, "Ad in 30:00\n2 left today");
    h.controller.destroy();
  });

  it("lets a supporter claim with one tap: no prompt, no ad, same cooldown", async () => {
    stubWindow();
    const show = vi.fn(async () => ({ rewarded: true }));
    const h = harness({ supporter: true, bridge: { platform: "ios", rewardedAds: { isReady: vi.fn(async () => true), show } } });
    h.controller.init();
    await vi.waitFor(() => expect(h.elements.status.textContent).toBe("CLAIM +10 GEMS"));
    expect(h.elements.button.disabled).toBe(false);

    click(h.elements.button);
    expect(h.elements.prompt.hidden).toBe(true);
    expect(show).not.toHaveBeenCalled();
    expect(h.setAdPlaybackActive).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(h.claimAdGems).toHaveBeenCalledOnce());
    await vi.waitFor(() => expectCountdown(h.elements, "Ad in 30:00\n3 left today"));
    expect(h.showMessage).toHaveBeenCalledWith("+10 GEMS", expect.any(String));
    h.controller.destroy();
  });

  it("shows a failed claim's error and lets the watched ad be claimed without another", async () => {
    stubWindow();
    const show = vi.fn(async () => ({ rewarded: true }));
    const h = harness({
      bridge: { platform: "android", rewardedAds: { isReady: vi.fn(async () => true), show } },
      claim: async () => ({ ok: false, error: "NOT CONNECTED" }),
    });
    h.controller.init();
    await vi.waitFor(() => expect(h.elements.status.textContent).toBe("WATCH AD"));
    click(h.elements.button);
    click(h.elements.confirmButton);
    await vi.waitFor(() => expect(h.showMessage).toHaveBeenCalledWith("NOT CONNECTED", expect.any(String)));
    expect(show).toHaveBeenCalledOnce();
    expect(h.showGemReward).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(h.elements.status.textContent).toBe("CLAIM +10 GEMS"));

    // Back online: the next tap claims the ad already watched.
    h.claimAdGems.mockImplementationOnce(async () => ({ ok: true }));
    click(h.elements.button);
    expect(h.elements.prompt.hidden).toBe(true);
    await vi.waitFor(() => expect(h.claimAdGems).toHaveBeenCalledTimes(2));
    expect(show).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(h.showMessage).toHaveBeenLastCalledWith("+10 GEMS", expect.any(String)));
    h.controller.destroy();
  });

  it("shows the server's refusal when a claim is turned down", async () => {
    stubWindow();
    const h = harness({ supporter: true, claim: async () => ({ ok: false, error: "Next ad in 12:34" }) });
    h.controller.init();
    click(h.elements.button);
    await vi.waitFor(() => expect(h.showMessage).toHaveBeenCalledWith("NEXT AD IN 12:34", expect.any(String)));
    expect(h.showGemReward).not.toHaveBeenCalled();
    h.controller.destroy();
  });

  it.each(["rejected", "unavailable"])("allows retry after a %s native load and refreshes when back online", async (failure) => {
    const runtime = stubWindow();
    const isReady = failure === "rejected"
      ? vi.fn().mockRejectedValueOnce(new Error("Wi-Fi blocked"))
      : vi.fn().mockResolvedValueOnce(false);
    isReady.mockResolvedValue(true);
    const show = vi.fn(async () => ({ rewarded: false }));
    const h = harness({ bridge: { platform: "ios", rewardedAds: { isReady, show } } });
    h.controller.init();
    await vi.waitFor(() => expect(h.elements.status.textContent).toBe("RETRY AD"));
    expect(h.elements.button.disabled).toBe(false);
    click(h.elements.button);
    expect(h.elements.prompt.hidden).toBe(false);
    expect(h.elements.confirmButton.textContent).toBe("Retry Ad");
    click(h.elements.confirmButton);
    await vi.waitFor(() => expect(h.elements.status.textContent).toBe("WATCH AD"));
    expect(show).toHaveBeenCalledOnce();
    expect(h.claimAdGems).not.toHaveBeenCalled();
    expect(h.showMessage).toHaveBeenCalledWith("AD NOT COMPLETED", expect.any(String));
    runtime.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(isReady).toHaveBeenCalledTimes(3));
    h.controller.destroy();
    runtime.dispatchEvent(new Event("online"));
    expect(isReady).toHaveBeenCalledTimes(3);
  });
});

describe("the 2× respawn boost is gone", () => {
  it("has no bank switch, timer or copy left in the page", () => {
    const html = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
    expect(html).not.toMatch(/enemyRespawnBoost|respawn-boost|2[x×] (?:enemy )?respawn/i);
    expect(html).toContain("Watch ad · +10 Gems");
    const css = readFileSync(new URL("../../public/assets/wildstat/game.css", import.meta.url), "utf8");
    expect(css).not.toContain("respawn-boost");
  });

  it("has no respawn-boost code or storage left in the client", () => {
    const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    const settings = readFileSync(new URL("../game/runtime/game-settings.ts", import.meta.url), "utf8");
    const elements = readFileSync(new URL("./game-elements.ts", import.meta.url), "utf8");
    for (const source of [main, settings, elements]) {
      expect(source).not.toMatch(/RespawnBoost|respawnBoost|REWARDED_RESPAWN/);
    }
  });
});
