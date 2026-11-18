import { validateOtaManifest, type OtaChannel, type SignedOtaManifest } from '../../shared/ota-update';
export type OtaBridge = {
  ready(): Promise<{ currentBundleId: string | null; previousBundleId: string | null; rollback: boolean }>;
  getBlockedBundles(): Promise<{ bundleIds: string[] }>;
  getCurrentBundle(): Promise<{ bundleId: string | null }>;
  getBundles(): Promise<{ bundleIds: string[] }>;
  downloadBundle(options: { bundleId: string; url: string; checksum: string; signature: string }): Promise<void>;
  setNextBundle(options: { bundleId: string | null }): Promise<void>;
};
export type OtaState = { channel: OtaChannel; current: string; pending: string | null; message: string; busy: boolean; developer: boolean };
/** How soon after launch a downloaded update restarts the app by itself: the player has only just opened it. */
export const OTA_APPLY_AT_LAUNCH_MS = 60_000;
/** Normal interval between automatic update checks after a successful check. */
export const OTA_CHECK_INTERVAL_MS = 15 * 60_000;
/** Short backoff after a failed check or download so transient offline/network blips recover promptly. */
export const OTA_RETRY_BACKOFF_MS = 30_000;
/** Consecutive startup failures for the same bundle before permanently blocking and rolling back. */
export const OTA_BOOT_FAILURES_BEFORE_BLOCK = 2;
const BOOT_FAIL_KEY = 'wildstat.ota.bootFail';
/**
 * Whether to restart into a downloaded update now: a production update found within a minute of launch,
 * while the player is not yet in active gameplay, and not one this phone already restarted for
 * (a restart that did not take must not loop).
 */
export function applyAtLaunch(state: OtaState, launchedAt: number, now: number, restartedFor: string | null, gamePlaying = false) {
  return !gamePlaying && state.channel === 'production' && !state.busy && Boolean(state.pending) && state.pending !== 'Installed app'
    && state.pending !== state.current && state.pending !== restartedFor && now - launchedAt <= OTA_APPLY_AT_LAUNCH_MS;
}
/**
 * Records a startup failure for `bundleId` and returns whether it has failed enough consecutive
 * times to permanently block and roll back (rather than trying one clean reload first).
 */
export function recordBootFailure(storage: Pick<Storage, 'getItem' | 'setItem'>, bundleId: string): boolean {
  let count = 0;
  try {
    const parsed = JSON.parse(storage.getItem(BOOT_FAIL_KEY) || '{}') as { id?: string; count?: number };
    if (parsed.id === bundleId && typeof parsed.count === 'number' && Number.isFinite(parsed.count)) count = parsed.count;
  } catch { /* Treat corrupt metadata as first failure. */ }
  count += 1;
  try { storage.setItem(BOOT_FAIL_KEY, JSON.stringify({ id: bundleId, count })); }
  catch { return true; }
  return count >= OTA_BOOT_FAILURES_BEFORE_BLOCK;
}
export function clearBootFailure(storage: Pick<Storage, 'removeItem'>) {
  try { storage.removeItem(BOOT_FAIL_KEY); } catch { /* Optional cleanup. */ }
}
export function createOtaController(options: {
  bridge: OtaBridge; storage: Pick<Storage, 'getItem' | 'setItem'>;
  platform: 'ios' | 'android'; build: number; runtime: string; saveFormat: number;
  fetchManifest: (channel: OtaChannel) => Promise<SignedOtaManifest | null>;
  verify: (envelope: SignedOtaManifest) => Promise<unknown>; changed: (state: OtaState) => void;
}) {
  const prefix = `wildstat.ota.${options.platform}.${options.build}.`;
  const read = (key: string) => { try { return options.storage.getItem(prefix + key); } catch { return null; } };
  const write = (key: string, value: string) => options.storage.setItem(prefix + key, value);
  const preferredChannel = read('channel');
  const state: OtaState = { channel: preferredChannel === 'developer' ? 'developer' : 'production', current: 'Installed app', pending: null, message: 'Updates apply on the next app launch.', busy: false, developer: false };
  let healthy = false, generation = 0, nextCheckAt = 0, hold = false;
  let readyPromise: Promise<void> | undefined;
  // Serialize native changes: revoking test access must always cancel a queued test bundle.
  let mutation: Promise<void> = Promise.resolve();
  const setNext = (id: string | null) => {
    mutation = mutation.catch(() => {}).then(() => options.bridge.setNextBundle({ bundleId: id }));
    return mutation;
  };
  const emit = () => options.changed({ ...state });
  const blocked = new Set<string>();
  try { const saved = JSON.parse(read('blocked') || '[]'); if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') blocked.add(id); } catch { /* Corrupt optional metadata must not prevent startup. */ }
  const reportError = (error: unknown) => { state.message = error instanceof Error ? error.message : 'Update unavailable; game continues.'; };
  function ready() {
    return readyPromise ??= (async () => {
      const result = await options.bridge.ready();
      healthy = true; state.current = result.currentBundleId ?? 'Installed app';
      if (result.rollback && result.previousBundleId) {
        blocked.add(result.previousBundleId); write('blocked', JSON.stringify([...blocked]));
        state.message = 'Recovered to the installed app after an update failed to start.';
      }
      emit();
    })();
  }
  async function check(force = false) {
    if (!healthy || hold || state.busy || (state.channel === 'developer' && !state.developer)
      || (!force && Date.now() < nextCheckAt)) return;
    const attempt = generation, channel = state.channel;
    const cancelled = () => attempt !== generation || channel !== state.channel;
    nextCheckAt = Date.now() + OTA_RETRY_BACKOFF_MS;
    state.busy = true; state.message = 'Checking for updates…'; emit();
    try {
      const envelope = await options.fetchManifest(channel);
      if (cancelled()) return;
      if (!envelope) {
        nextCheckAt = Date.now() + OTA_CHECK_INTERVAL_MS;
        state.message = 'No update published to this channel.';
        return;
      }
      const manifest = validateOtaManifest(await options.verify(envelope), { ...options, channel });
      if (cancelled()) return;
      const previous = Number(read(`sequence.${channel}`) || 0);
      if (manifest.sequence < previous) throw new Error('Ignored an outdated update announcement.');
      if (manifest.bundle) {
        const b = manifest.bundle;
        const nativeBlocked = await options.bridge.getBlockedBundles();
        if (blocked.has(b.id) || nativeBlocked.bundleIds.includes(b.id)) throw new Error('This update previously failed. Waiting for a corrected version.');
        const current = await options.bridge.getCurrentBundle();
        if (cancelled()) return;
        if (b.id === current.bundleId) {
          // Cancel a pending downgrade (e.g. leaving developer channel while already on latest production).
          if (state.pending !== null) {
            await setNext(b.id);
            if (cancelled()) return;
            state.pending = null;
          }
          write(`sequence.${channel}`, String(manifest.sequence));
          nextCheckAt = Date.now() + OTA_CHECK_INTERVAL_MS;
          state.message = 'Up to date.'; return;
        }
        if (state.pending === b.id) {
          write(`sequence.${channel}`, String(manifest.sequence));
          nextCheckAt = Date.now() + OTA_CHECK_INTERVAL_MS;
          state.message = 'Update ready for the next app launch.'; return;
        }
        const existing = await options.bridge.getBundles();
        if (cancelled()) return;
        // Only reuse a download verified by this native build, with the same immutable digest.
        if (existing.bundleIds.includes(b.id)) {
          if (read(`verified.${b.id}`) !== b.checksum) throw new Error('Bundle ID reused with different contents. Publish a new bundle ID.');
        } else {
          state.message = 'Downloading update…'; emit();
          await options.bridge.downloadBundle({ bundleId: b.id, url: b.url, checksum: b.checksum, signature: b.signature });
          write(`verified.${b.id}`, b.checksum);
        }
      }
      if (cancelled()) return;
      await setNext(manifest.bundle?.id ?? null);
      if (cancelled()) return;
      state.pending = manifest.bundle?.id ?? 'Installed app';
      write(`sequence.${channel}`, String(manifest.sequence));
      nextCheckAt = Date.now() + OTA_CHECK_INTERVAL_MS;
      state.message = 'Ready. Fully close and reopen WildStat to apply.';
    } catch (error) { if (!cancelled()) reportError(error); }
    finally { state.busy = false; emit(); }
  }
  async function selectChannel(channel: OtaChannel) {
    if (channel === 'developer' && !state.developer) throw new Error('Developer access required.');
    if (state.busy) throw new Error('Wait for the current update check.');
    const attempt = ++generation; state.busy = true; emit();
    try {
      // Leaving testing returns to the store app unless a production bundle replaces it.
      const current = await options.bridge.getCurrentBundle();
      if (attempt !== generation) return;
      await setNext(channel === 'production' ? null : current.bundleId);
      if (attempt !== generation) return;
      state.pending = channel === 'production' ? 'Installed app' : null;
      state.channel = channel; write('channel', channel); nextCheckAt = 0; hold = false;
    } finally { state.busy = false; emit(); }
    await check(true);
  }
  async function rollback() {
    if (!state.developer) throw new Error('Developer access required.');
    if (state.busy) throw new Error('Wait for the current update check.');
    generation++; hold = true; state.busy = true; emit();
    try {
      const current = await options.bridge.getCurrentBundle();
      if (current.bundleId) { blocked.add(current.bundleId); write('blocked', JSON.stringify([...blocked])); }
      await setNext(null);
      state.pending = 'Installed app'; state.message = 'Installed app will return on next launch. Account data is kept.';
    } finally { state.busy = false; emit(); }
  }
  async function startupFailed() {
    // Only called before the first game frame. Never use this for network/login errors.
    generation++; hold = true;
    const current = await options.bridge.getCurrentBundle();
    if (!current.bundleId) return false; // The installed app is the final fallback, never reload-loop it.
    blocked.add(current.bundleId);
    try { write('blocked', JSON.stringify([...blocked])); } catch { /* Still recover if optional storage is unavailable. */ }
    await setNext(null);
    return true;
  }
  return { ready, check, selectChannel, rollback, startupFailed, snapshot: () => ({ ...state }),
    setDeveloperAccess(enabled: boolean) {
      if (state.developer === enabled && (enabled || state.channel !== 'developer')) return;
      state.developer = enabled;
      if (!enabled) generation++;
      if (!enabled && state.channel === 'developer') {
        state.channel = 'production'; state.pending = 'Installed app'; nextCheckAt = 0;
        write('channel', 'production');
        void setNext(null).catch(reportError).finally(emit);
      }
      emit();
    },
  };
}
