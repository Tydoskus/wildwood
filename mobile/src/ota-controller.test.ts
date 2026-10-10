import { describe, it, expect, vi } from 'vitest';
import { createOtaController, type OtaBridge } from './ota-controller';
import type { OtaManifest } from '../../shared/ota-update';
function fixture() {
  let manifest: OtaManifest = { schema: 1, channel: 'production', platform: 'ios', sequence: 100,
    runtime: 'test', saveFormat: 1, protocol: 106, minBuild: 743, maxBuild: 743,
    bundle: { id: 'test-one', url: 'https://example.com/one.zip', checksum: 'a'.repeat(64), signature: 'a'.repeat(128) } };
  const data = new Map<string, string>();
  const bridge = { ready: vi.fn(async () => ({ currentBundleId: null, previousBundleId: null, rollback: false })),
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
