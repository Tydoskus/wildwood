import { verifyOtaEnvelope } from './ota-signature';
import { App } from '@capacitor/app';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { applyAtLaunch, clearBootFailure, createOtaController, recordBootFailure } from './ota-controller';
import { OTA_RUNTIME, OTA_SAVE_FORMAT, type SignedOtaManifest } from '../../shared/ota-update';
import { whenAccountRenewalSettled } from '../../src/app/account-renewal-flag';
import { getNativeOtaReloadHooks, type NativeUpdateBridge } from '../../src/app/native-updates';
import publicKey from '../ota/public-key.json';
const RESTARTED_FOR = 'wildstat.ota.restartedFor';
const MANIFEST_TIMEOUT_MS = 15_000;
export function installNativeUpdates(platform: 'ios' | 'android') {
  let bootReady = false, gameStarting = false, recovering = false, restarting = false, bootFailed = false;
  const launchedAt = Date.now();
  /** Restarts into the downloaded update after draining gameplay saves and any SpacetimeAuth token renewal. */
  async function applyNow() {
    if (restarting) return;
    const pending = controller?.snapshot().pending;
    if (!pending) return;
    restarting = true;
    try {
      const hooks = getNativeOtaReloadHooks();
      if (hooks) {
        const ready = await hooks.prepareReload(pending).catch(() => false);
        if (!ready) return;
      }
      // Never reload mid-renewal: that loses the replacement refresh token SpacetimeAuth just issued.
      await whenAccountRenewalSettled();
      try { localStorage.setItem(RESTARTED_FOR, pending); } catch { /* Still restart. */ }
      await LiveUpdate.reload();
    } finally {
      restarting = false;
    }
  }
  async function recoverFailedBoot() {
    if (!controller || recovering) return;
    recovering = true;
    try {
      const current = await LiveUpdate.getCurrentBundle();
      if (!current.bundleId) return; // Never reload-loop the installed store app.
      const shouldBlock = recordBootFailure(localStorage, current.bundleId);
      if (shouldBlock) {
        if (!await controller.startupFailed()) return;
        clearBootFailure(localStorage);
      }
      await whenAccountRenewalSettled();
      await LiveUpdate.reload();
    } catch {
      /* Leave the existing startup error visible if native recovery fails. */
    } finally {
      recovering = false;
    }
  }
  window.addEventListener('wildstat:game-boot-start', () => { gameStarting = true; });
  window.addEventListener('wildstat:game-boot-ready', () => { gameStarting = false; clearBootFailure(localStorage); });
  window.addEventListener('wildstat:game-boot-failed', () => { bootFailed = true; void recoverFailedBoot(); });
  window.addEventListener('error', event => {
    // Resource requests and auth/network failures are not evidence of bad game code.
    if (gameStarting && event instanceof ErrorEvent && event.error) { bootFailed = true; void recoverFailedBoot(); }
  });
  let controller: ReturnType<typeof createOtaController> | undefined;
  window.addEventListener('wildstat:boot-ready', () => { bootReady = true; void confirmReady(); });
  async function confirmReady() {
    if (!controller || !bootReady) return;
    try { await controller.ready(); await controller.check(); } catch { /* Native timeout retains its rollback protection. */ }
    // An update found while still on the start/loading screen restarts at once; once playing, the banner asks instead.
    let restartedFor: string | null = null;
    try { restartedFor = localStorage.getItem(RESTARTED_FOR); } catch { /* Treated as never restarted. */ }
    const playing = Boolean(getNativeOtaReloadHooks()?.isPlaying());
    if (controller && applyAtLaunch(controller.snapshot(), launchedAt, Date.now(), restartedFor, playing)) void applyNow().catch(() => {});
  }
  void App.getInfo().then(info => {
    controller = createOtaController({ bridge: LiveUpdate, storage: localStorage, platform, build: Number(info.build),
      runtime: OTA_RUNTIME, saveFormat: OTA_SAVE_FORMAT,
      verify: envelope => verifyOtaEnvelope(envelope, publicKey.pem),
      fetchManifest: async channel => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), MANIFEST_TIMEOUT_MS);
        try {
          const response = await fetch(`https://wildstatmmo.com/ota/${channel}-${platform}.json?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
            signal: abort.signal,
          });
          if (response.status === 404) return null;
          if (!response.ok) throw new Error('Update check unavailable; game continues.');
          const data = await response.text();
          if (data.length > 20000) throw new Error('Update announcement too large.');
          return JSON.parse(data) as SignedOtaManifest;
        } finally {
          clearTimeout(timer);
        }
      },
      changed: () => window.dispatchEvent(new Event('wildstat:ota-changed')),
    });
    (window as unknown as { wildstatUpdates: NativeUpdateBridge }).wildstatUpdates = { ...controller, applyNow };
    window.dispatchEvent(new Event('wildstat:ota-available'));
    if (bootFailed) void recoverFailedBoot(); else void confirmReady();
    // No polling while playing, and no reload on resume. Only a throttled check.
    void App.addListener('appStateChange', ({ isActive }) => { if (isActive) void controller?.check(); });
  }).catch(() => {});
}
