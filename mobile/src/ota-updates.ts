import { verifyOtaEnvelope } from './ota-signature';
import { App } from '@capacitor/app';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { createOtaController } from './ota-controller';
import { OTA_RUNTIME, OTA_SAVE_FORMAT, type SignedOtaManifest } from '../../shared/ota-update';
import type { NativeUpdateBridge } from '../../src/app/native-updates';
import publicKey from '../ota/public-key.json';
export function installNativeUpdates(platform: 'ios' | 'android') {
  let bootReady = false, gameStarting = false, recovering = false, bootFailed = false;
  async function recoverFailedBoot() {
    if (!controller || recovering) return;
    recovering = true;
    try { if (await controller.startupFailed()) await LiveUpdate.reload(); }
    catch { /* Leave the existing startup error visible if native recovery fails. */ }
  }
  window.addEventListener('wildstat:game-boot-start', () => { gameStarting = true; });
  window.addEventListener('wildstat:game-boot-ready', () => { gameStarting = false; });
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
  }
  void App.getInfo().then(info => {
    controller = createOtaController({ bridge: LiveUpdate, storage: localStorage, platform, build: Number(info.build),
      runtime: OTA_RUNTIME, saveFormat: OTA_SAVE_FORMAT,
      verify: envelope => verifyOtaEnvelope(envelope, publicKey.pem),
      fetchManifest: async channel => {
        const response = await fetch(`https://wildstatmmo.com/ota/${channel}-${platform}.json`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Update check unavailable; game continues.');
        const data = await response.text();
        if (data.length > 20000) throw new Error('Update announcement too large.');
        return JSON.parse(data) as SignedOtaManifest;
      },
      changed: () => window.dispatchEvent(new Event('wildstat:ota-changed')),
    });
    (window as unknown as { wildstatUpdates: NativeUpdateBridge }).wildstatUpdates = controller;
    window.dispatchEvent(new Event('wildstat:ota-available'));
    if (bootFailed) void recoverFailedBoot(); else void confirmReady();
    // No polling while playing, and no reload on resume. Only a throttled check.
    void App.addListener('appStateChange', ({ isActive }) => { if (isActive) void controller?.check(); });
  }).catch(() => {});
}
