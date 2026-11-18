import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { installAppUpdateNotice } from "./app-update-notice";
import {
  NATIVE_URGENT_CHECK_MIN_MS,
  requestNativeUpdateCheck,
  setNativeOtaReloadHooks,
  getNativeOtaReloadHooks,
  type NativeUpdateBridge,
  type NativeUpdateState,
} from "./native-updates";

const URGENT_CHECK_KEY = Symbol.for("wildstat.native-ota-urgent-check-at");
const originalWindow = globalThis.window;

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[URGENT_CHECK_KEY];
  setNativeOtaReloadHooks(null);
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
});

function setupDom(state: NativeUpdateState, overrides: Partial<NativeUpdateBridge> = {}) {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  const bridge: NativeUpdateBridge = {
    check: vi.fn(async () => {}),
    selectChannel: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    setDeveloperAccess: vi.fn(),
    snapshot: () => state,
    applyNow: vi.fn(async () => {}),
    ...overrides,
  };
  (window as unknown as { wildstatUpdates?: NativeUpdateBridge }).wildstatUpdates = bridge;
  (globalThis as { window?: unknown }).window = window;
  return { window, document: document as unknown as Document, bridge };
}

describe("app update notice and native OTA bridge helpers", () => {
  it("installs once per document even when called from both startup and game bundles, and guards Restart against double-taps", async () => {
    let finishApply!: () => void;
    const applyNow = vi.fn(() => new Promise<void>(resolve => { finishApply = resolve; }));
    const { document } = setupDom({
      channel: "production",
      current: "Installed app",
      pending: "android-0.920.0-abc",
      message: "Ready.",
      busy: false,
      developer: false,
    }, { applyNow });

    installAppUpdateNotice(document);
    installAppUpdateNotice(document);

    const banners = document.querySelectorAll("#appUpdateReadyBanner");
    expect(banners).toHaveLength(1);
    const restartBtn = banners[0]!.querySelector("button") as HTMLButtonElement;
    restartBtn.click();
    restartBtn.click();
    expect(applyNow).toHaveBeenCalledTimes(1);
    expect(restartBtn.disabled).toBe(true);

    finishApply();
    await Promise.resolve();
    await Promise.resolve();
    expect(restartBtn.disabled).toBe(false);
  });

  it("rate-limits urgent native update checks across callers while allowing non-urgent checks", () => {
    const { bridge } = setupDom({
      channel: "production",
      current: "Installed app",
      pending: null,
      message: "Up to date.",
      busy: false,
      developer: false,
    });

    expect(requestNativeUpdateCheck(false, 1_000)).toBe(true);
    expect(bridge.check).toHaveBeenLastCalledWith(false);

    expect(requestNativeUpdateCheck(true, 100_000)).toBe(true);
    expect(bridge.check).toHaveBeenLastCalledWith(true);
    expect(requestNativeUpdateCheck(true, 100_000 + NATIVE_URGENT_CHECK_MIN_MS - 1)).toBe(false);
    expect(bridge.check).toHaveBeenCalledTimes(2);

    expect(requestNativeUpdateCheck(true, 100_000 + NATIVE_URGENT_CHECK_MIN_MS)).toBe(true);
    expect(bridge.check).toHaveBeenCalledTimes(3);
  });

  it("shares native OTA reload hooks through globalThis across bundles", () => {
    const hooks = { isPlaying: () => true, prepareReload: async () => true };
    setNativeOtaReloadHooks(hooks);
    expect(getNativeOtaReloadHooks()).toBe(hooks);
    setNativeOtaReloadHooks(null);
    expect(getNativeOtaReloadHooks()).toBeUndefined();
  });
});
