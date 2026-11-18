export type NativeUpdateState = { channel: 'production' | 'developer'; current: string; pending: string | null; message: string; busy: boolean; developer: boolean };
export type NativeUpdateBridge = {
  check(force?: boolean): Promise<void>; selectChannel(channel: 'production' | 'developer'): Promise<void>;
  rollback(): Promise<void>; setDeveloperAccess(value: boolean): void; snapshot(): NativeUpdateState;
  /** Restarts the app into the downloaded update. */
  applyNow?(): Promise<void>;
};
export type NativeOtaReloadHooks = {
  isPlaying: () => boolean;
  prepareReload: (target: string) => Promise<boolean>;
};
const HOOKS_KEY = Symbol.for('wildstat.native-ota-reload-hooks');
const URGENT_CHECK_KEY = Symbol.for('wildstat.native-ota-urgent-check-at');
export const NATIVE_URGENT_CHECK_MIN_MS = 30_000;

export function nativeUpdates(): NativeUpdateBridge | undefined {
  return (window as unknown as { wildstatUpdates?: NativeUpdateBridge }).wildstatUpdates;
}
export function signalNativeBootReady() { window.dispatchEvent(new Event('wildstat:boot-ready')); }

/** Shared across native-commerce.js, coop-client.js, and game.js via globalThis. */
export function setNativeOtaReloadHooks(hooks: NativeOtaReloadHooks | null) {
  const globals = globalThis as Record<symbol, unknown>;
  if (hooks) globals[HOOKS_KEY] = hooks;
  else delete globals[HOOKS_KEY];
}
export function getNativeOtaReloadHooks(): NativeOtaReloadHooks | undefined {
  return (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as NativeOtaReloadHooks | undefined;
}
/**
 * Asks the native OTA bridge to check for updates. Urgent checks (protocol refusal,
 * scheduled release completion, failed bundle load) bypass the 15-minute throttle,
 * rate-limited to at most once every 30 seconds across bundles.
 */
export function requestNativeUpdateCheck(urgent = false, now = Date.now()) {
  const api = nativeUpdates();
  if (!api) return false;
  if (!urgent) {
    void api.check(false).catch(() => {});
    return true;
  }
  const globals = globalThis as Record<symbol, unknown>;
  const last = Number(globals[URGENT_CHECK_KEY] ?? 0);
  if (Number.isFinite(last) && now - last < NATIVE_URGENT_CHECK_MIN_MS) return false;
  globals[URGENT_CHECK_KEY] = now;
  void api.check(true).catch(() => {});
  return true;
}
