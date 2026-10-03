import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { ANDROID_UPDATE_CHECK_MS, createAndroidUpdateController, type AndroidUpdateBridge } from './android-update-controller';
import { installClosedBetaInvite } from './closed-beta-invite';

/** Google Play decides availability for this tester and installed build. */
export function installAndroidUpdates() {
  const bridge = registerPlugin<AndroidUpdateBridge & { openTesting(): Promise<void> }>('WildStatUpdates');
  // The closed test's opt-in page: the store listing showed internal testers their own track.
  installClosedBetaInvite(() => bridge.openTesting());
  const mount = () => {
    const banner = document.createElement('section');
    banner.id = 'androidUpdateBanner'; banner.hidden = true;
    banner.setAttribute('aria-label', 'Android app update');
    const message = document.createElement('span');
    message.textContent = 'Update available'; message.setAttribute('role', 'status');
    const update = document.createElement('button');
    update.type = 'button'; update.textContent = 'Update';
    const later = document.createElement('button');
    later.type = 'button'; later.textContent = 'Later'; later.className = 'android-update-later';
    banner.append(message, update, later); document.body.append(banner);
    const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
    const controller = createAndroidUpdateController({ bridge, storage, show: version => { banner.hidden = version === null; if (version !== null) message.textContent = 'Update available'; } });
    later.addEventListener('click', controller.dismiss);
    update.addEventListener('click', async () => {
      if (update.disabled) return;
      update.disabled = true;
      try { await controller.openStore(); controller.dismiss(); }
      catch { message.textContent = 'Could not open Google Play'; }
      finally { update.disabled = false; }
    });
    let active = !document.hidden;
    const check = () => { if (active && !document.hidden) void controller.check(); };
    document.addEventListener('visibilitychange', check);
    void App.addListener('appStateChange', state => { active = state.isActive; check(); }).catch(() => {});
    setInterval(check, ANDROID_UPDATE_CHECK_MS);
    check();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
