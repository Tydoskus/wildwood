import { describe, it, expect, vi } from 'vitest';
import {
  applyAtLaunch,
  clearBootFailure,
  createOtaController,
  OTA_APPLY_AT_LAUNCH_MS,
  OTA_BOOT_FAILURES_BEFORE_BLOCK,
  OTA_CHECK_INTERVAL_MS,
  OTA_RETRY_BACKOFF_MS,
  recordBootFailure,
  type OtaBridge,
  type OtaState,
} from './ota-controller';
import type { OtaManifest } from '../../shared/ota-update';
function fixture() {
  let manifest: OtaManifest = { schema: 1, channel: 'production', platform: 'ios', sequence: 100,
    runtime: 'test', saveFormat: 1, protocol: 106, minBuild: 743, maxBuild: 743,
    bundle: { id: 'test-one', url: 'https://example.com/one.zip', checksum: 'a'.repeat(64), signature: 'a'.repeat(128) } };
  const data = new Map<string, string>();
  const bridge = { ready: vi.fn(async () => ({ currentBundleId: null as string | null, previousBundleId: null as string | null, rollback: false })),
    getCurrentBundle: vi.fn(async () => ({ bundleId: null as string | null })),
    getBlockedBundles: vi.fn(async () => ({ bundleIds: [] as string[] })), getBundles: vi.fn(async () => ({ bundleIds: [] as string[] })),
    downloadBundle: vi.fn(async (_: unknown) => {}), setNextBundle: vi.fn(async (_: unknown) => {}),
  } satisfies OtaBridge;
  const verify = vi.fn(async () => manifest);
  const fetchManifest = vi.fn(async () => ({ payload: '{}', signature: 'signature' }));
  const options = { bridge, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } },
    platform: 'ios' as const, build: 743, runtime: 'test', saveFormat: 1, verify, fetchManifest, changed: vi.fn() };
  return { controller: createOtaController(options), bridge, options, data, verify, fetchManifest, manifest };
}
describe('controlled OTA', () => {
  it('does nothing until startup is healthy; stages but never reloads the game', async () => {
    const f = fixture(); await f.controller.check(true); expect(f.fetchManifest).not.toHaveBeenCalled();
    await Promise.all([f.controller.ready(), f.controller.ready()]); expect(f.bridge.ready).toHaveBeenCalledTimes(1);
    await f.controller.check(true); expect(f.bridge.downloadBundle).toHaveBeenCalledTimes(1);
    expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: 'test-one' });
    expect(f.controller.snapshot().pending).toBe('test-one');
  });
  it.each(['platform', 'runtime', 'saveFormat', 'minBuild', 'maxBuild'] as const)('rejects incompatible %s', async key => {
    const f = fixture(); Object.assign(f.manifest, { [key]: key === 'minBuild' ? 744 : key === 'maxBuild' ? 742 : 'wrong' });
    await f.controller.ready(); await f.controller.check(true);
    expect(f.bridge.downloadBundle).not.toHaveBeenCalled(); expect(f.bridge.setNextBundle).not.toHaveBeenCalled();
  });
  it('accepts a bundle with a newer protocol: the bundle brings its own game code', async () => {
    const f = fixture(); f.manifest.protocol = 999; await f.controller.ready(); await f.controller.check(true);
    expect(f.bridge.downloadBundle).toHaveBeenCalledTimes(1);
    expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: 'test-one' });
  });
  it.each([740, 743, 750])('serves every build in the announced range (build %i)', async build => {
    const f = fixture(); f.manifest.minBuild = 740; f.manifest.maxBuild = 750;
    const c = createOtaController({ ...f.options, build }); await c.ready(); await c.check(true);
    expect(f.bridge.downloadBundle).toHaveBeenCalledTimes(1);
  });
  it.each([739, 751])('ignores a build just outside the range (build %i)', async build => {
    const f = fixture(); f.manifest.minBuild = 740; f.manifest.maxBuild = 750;
    const c = createOtaController({ ...f.options, build }); await c.ready(); await c.check(true);
    expect(f.bridge.downloadBundle).not.toHaveBeenCalled();
  });
  it('rejects a forged announcement without downloading', async () => {
    const f = fixture(); f.verify.mockRejectedValue(new Error('Bad signature')); await f.controller.ready(); await f.controller.check(true);
    expect(f.bridge.downloadBundle).not.toHaveBeenCalled();
  });
  it('keeps the current app if downloading or checksum verification fails; retries safely', async () => {
    const f = fixture(); f.bridge.downloadBundle.mockRejectedValueOnce(new Error('Checksum mismatch'));
    await f.controller.ready(); await f.controller.check(true); expect(f.bridge.setNextBundle).not.toHaveBeenCalled();
    await f.controller.check(true); expect(f.bridge.setNextBundle).toHaveBeenCalledTimes(1);
  });
  it('rejects failed bundle IDs and outdated manifests', async () => {
    const f = fixture(); await f.controller.ready();
    f.bridge.getBlockedBundles.mockResolvedValueOnce({ bundleIds: ['test-one'] }); await f.controller.check(true);
    expect(f.bridge.downloadBundle).not.toHaveBeenCalled();
    await f.controller.check(true); f.manifest.sequence = 99; f.manifest.bundle!.id = 'older'; await f.controller.check(true);
    expect(f.bridge.downloadBundle).toHaveBeenCalledTimes(1);
  });
  it('requires developer access and cancels queued testing when switching to production', async () => {
    const f = fixture(); await f.controller.ready();
    await expect(f.controller.selectChannel('developer')).rejects.toThrow('Developer');
    f.controller.setDeveloperAccess(true); f.manifest.channel = 'developer';
    await f.controller.selectChannel('developer'); expect(f.controller.snapshot().pending).toBe('test-one');
    f.fetchManifest.mockResolvedValueOnce(null as any);
    await f.controller.selectChannel('production'); expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: null });
  });
  it('does not leave a test bundle queued if developer access is revoked during download', async () => {
    const f = fixture(); let finish!: () => void;
    f.bridge.downloadBundle.mockImplementationOnce(() => new Promise<void>(r => { finish = r; }));
    await f.controller.ready(); f.controller.setDeveloperAccess(true); f.manifest.channel = 'developer';
    const work = f.controller.selectChannel('developer'); await vi.waitFor(() => expect(finish).toBeDefined());
    f.controller.setDeveloperAccess(false); finish(); await work;
    expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: null });
    expect(f.bridge.setNextBundle).not.toHaveBeenCalledWith({ bundleId: 'test-one' });
  });
  it('does not let resume overwrite a manual rollback; leaves account storage untouched', async () => {
    const f = fixture(); f.data.set('auth-token', 'keep'); f.data.set('player-save', 'keep');
    await f.controller.ready(); f.controller.setDeveloperAccess(true); await f.controller.rollback(); await f.controller.check(true);
    expect(f.fetchManifest).not.toHaveBeenCalled(); expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: null });
    expect(f.data.get('auth-token')).toBe('keep'); expect(f.data.get('player-save')).toBe('keep');
  });
  it('recovers corrupt metadata and waits for authorization before checking a saved developer channel', async () => {
    const f = fixture(); f.data.set('wildstat.ota.ios.743.blocked', 'broken'); f.data.set('wildstat.ota.ios.743.channel', 'developer');
    const c = createOtaController(f.options); await c.ready(); await c.check(true); expect(f.fetchManifest).not.toHaveBeenCalled();
    c.setDeveloperAccess(true); f.manifest.channel = 'developer'; await c.check(true); expect(f.fetchManifest).toHaveBeenCalledWith('developer');
  });
  it('reuses a verified downloaded bundle without another download', async () => {
    const f = fixture(); await f.controller.ready(); await f.controller.check(true);
    f.bridge.getBundles.mockResolvedValue({ bundleIds: ['test-one'] });
    const c = createOtaController(f.options); await c.ready(); await c.check(true);
    expect(f.bridge.downloadBundle).toHaveBeenCalledTimes(1);
  });
  it('allows a signed rollback only with a new sequence', async () => {
    const f = fixture(); await f.controller.ready(); await f.controller.check(true);
    f.manifest.bundle = null; f.manifest.sequence++; await f.controller.check(true);
    expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: null });
  });
});
it('recovers a broken game bootstrap once, never resets account data or loops on the installed app', async () => {
  const f = fixture(); await f.controller.ready();
  expect(await f.controller.startupFailed()).toBe(false);
  expect(f.bridge.setNextBundle).not.toHaveBeenCalled();
  f.bridge.getCurrentBundle.mockResolvedValue({ bundleId: 'broken' });
  expect(await f.controller.startupFailed()).toBe(true);
  expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: null });
  expect(JSON.parse(f.data.get('wildstat.ota.ios.743.blocked')!)).toContain('broken');
});
it('cancels a channel switch if developer access disappears during the native lookup', async () => {
  const f = fixture(); await f.controller.ready(); f.controller.setDeveloperAccess(true);
  let finish!: (value: { bundleId: string | null }) => void;
  f.bridge.getCurrentBundle.mockImplementationOnce(() => new Promise(r => { finish = r; }));
  const switching = f.controller.selectChannel('developer'); await vi.waitFor(() => expect(finish).toBeDefined());
  f.controller.setDeveloperAccess(false); finish({ bundleId: 'old' }); await switching;
  expect(f.controller.snapshot().channel).toBe('production');
  expect(f.bridge.setNextBundle).not.toHaveBeenCalledWith({ bundleId: 'old' });
});
it('rejects announcements when the installed native build cannot be identified', async () => {
  const f = fixture(); const c = createOtaController({ ...f.options, build: NaN });
  await c.ready(); await c.check(true);
  expect(f.bridge.downloadBundle).not.toHaveBeenCalled(); expect(f.bridge.setNextBundle).not.toHaveBeenCalled();
});

describe('restarting into an update found at launch', () => {
  const ready: OtaState = { channel: 'production', current: 'android-0.914.4-a', pending: 'android-0.914.5-b', message: 'Ready.', busy: false, developer: false };
  it('restarts into it within a minute of opening, once', () => {
    expect(applyAtLaunch(ready, 0, 5_000, null)).toBe(true);
    expect(applyAtLaunch(ready, 0, OTA_APPLY_AT_LAUNCH_MS + 1, null)).toBe(false);
    // A restart that did not take is not repeated.
    expect(applyAtLaunch(ready, 0, 5_000, 'android-0.914.5-b')).toBe(false);
    expect(applyAtLaunch(ready, 0, 5_000, 'android-0.914.4-a')).toBe(true);
  });
  it('never for the installed app, the developer channel, mid-download, or active gameplay', () => {
    expect(applyAtLaunch({ ...ready, pending: 'Installed app' }, 0, 5_000, null)).toBe(false);
    expect(applyAtLaunch({ ...ready, pending: null }, 0, 5_000, null)).toBe(false);
    expect(applyAtLaunch({ ...ready, channel: 'developer' }, 0, 5_000, null)).toBe(false);
    expect(applyAtLaunch({ ...ready, busy: true }, 0, 5_000, null)).toBe(false);
    expect(applyAtLaunch({ ...ready, current: 'android-0.914.5-b' }, 0, 5_000, null)).toBe(false);
    expect(applyAtLaunch(ready, 0, 5_000, null, true)).toBe(false);
  });
});

describe('OTA retry, channel switch, and startup failure recovery', () => {
  it('retries failed checks after the short backoff instead of locking out for 15 minutes', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
      const f = fixture();
      await f.controller.ready();
      f.fetchManifest.mockRejectedValueOnce(new Error('Offline'));
      await f.controller.check();
      expect(f.fetchManifest).toHaveBeenCalledTimes(1);

      // Inside retry backoff: throttled.
      vi.advanceTimersByTime(OTA_RETRY_BACKOFF_MS - 1_000);
      await f.controller.check();
      expect(f.fetchManifest).toHaveBeenCalledTimes(1);

      // Past retry backoff (still well inside 15m): retries and succeeds.
      vi.advanceTimersByTime(2_000);
      await f.controller.check();
      expect(f.fetchManifest).toHaveBeenCalledTimes(2);
      expect(f.controller.snapshot().pending).toBe('test-one');

      // After a successful check: throttled for the full 15-minute interval.
      vi.advanceTimersByTime(OTA_RETRY_BACKOFF_MS + 1_000);
      await f.controller.check();
      expect(f.fetchManifest).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(OTA_CHECK_INTERVAL_MS);
      await f.controller.check();
      expect(f.fetchManifest).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the pending Installed app downgrade when returning to production while already on the latest production bundle', async () => {
    const f = fixture();
    f.bridge.ready.mockResolvedValue({ currentBundleId: 'test-one', previousBundleId: null, rollback: false });
    f.bridge.getCurrentBundle.mockResolvedValue({ bundleId: 'test-one' });
    await f.controller.ready();
    f.controller.setDeveloperAccess(true);
    f.manifest.channel = 'developer';
    await f.controller.selectChannel('developer');

    // Switch back to production: selectChannel queues Installed app (null), then check(true) sees
    // production also serves 'test-one' (our current bundle) and cancels the downgrade.
    f.manifest.channel = 'production';
    await f.controller.selectChannel('production');
    expect(f.bridge.setNextBundle).toHaveBeenLastCalledWith({ bundleId: 'test-one' });
    expect(f.controller.snapshot().pending).toBeNull();
  });

  it('allows one clean retry on a transient boot error before blocking on the second consecutive failure', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
    expect(OTA_BOOT_FAILURES_BEFORE_BLOCK).toBe(2);
    // First failure retries without blocking; second consecutive failure blocks and rolls back.
    expect(recordBootFailure(storage, 'bundle-a')).toBe(false);
    expect(recordBootFailure(storage, 'bundle-a')).toBe(true);
    // A healthy boot clears the counter.
    clearBootFailure(storage);
    expect(recordBootFailure(storage, 'bundle-a')).toBe(false);
    // A different bundle starts fresh.
    expect(recordBootFailure(storage, 'bundle-b')).toBe(false);
    expect(recordBootFailure(storage, 'bundle-b')).toBe(true);
    // If storage cannot persist the counter, block immediately rather than reload-looping.
    const brokenStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceeded'); },
    };
    expect(recordBootFailure(brokenStorage, 'bundle-c')).toBe(true);
  });
});
