import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import type { ResearchNotification, ResearchNotificationBridge } from '../../src/app/native-research-notifications';

export const RESEARCH_NOTIFICATION_ID = 70401;
const PREFERENCE = 'wildstat.research-notifications.enabled';
const PROMPTED = 'wildstat.research-notifications.prompted';
const SNAPSHOT = 'wildstat.research-notifications.pending';
const CHANNEL = 'research-complete';
export function createResearchNotifications(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, platform: string) {
  let enabled = storage.getItem(PREFERENCE) === 'true';
  // An existing explicit ON/OFF choice counts as a response, including older installs.
  let prompted = storage.getItem(PROMPTED) === 'true' || storage.getItem(PREFERENCE) !== null;
  let desired: ResearchNotification | null = null;
  try { desired = JSON.parse(storage.getItem(SNAPSHOT) || 'null'); } catch {}
  let applied: string | undefined;
  let queue = Promise.resolve();
  let status = '';
  let onChange = () => {};
  function valid(value: ResearchNotification | null): value is ResearchNotification {
    return Boolean(value && typeof value.owner === 'string' && value.owner.length && typeof value.title === 'string' &&
      Number.isInteger(value.targetRank) && value.targetRank > 0 && Number.isFinite(value.completesAtMs));
  }
  function reconcile() {
    queue = queue.catch(() => {}).then(async () => {
      // Runs for newly started research and active research restored from the server.
      // Persist before awaiting the OS dialog so repeat updates cannot prompt twice.
      if (!prompted && valid(desired) && desired.completesAtMs > Date.now()) {
        prompted = true;
        storage.setItem(PROMPTED, 'true');
        const permission = await LocalNotifications.requestPermissions();
        enabled = permission.display === 'granted';
        storage.setItem(PREFERENCE, String(enabled));
        onChange();
      }
      const current = valid(desired) && enabled && desired.completesAtMs > Date.now() ? { ...desired } : null;
      const key = current ? JSON.stringify(current) : '';
      if (applied === key) return;
      await LocalNotifications.cancel({ notifications: [{ id: RESEARCH_NOTIFICATION_ID }] });
      if (current) {
        if ((await LocalNotifications.checkPermissions()).display !== 'granted') {
          status = 'Allow notifications in your phone settings.';
          applied = undefined;
          onChange();
          return;
        }
        if (platform === 'android') await LocalNotifications.createChannel({ id: CHANNEL, name: 'Research complete', importance: 3, visibility: 0 });
        await LocalNotifications.schedule({ notifications: [{
          id: RESEARCH_NOTIFICATION_ID, title: 'Research complete',
          body: `${current.title} rank ${current.targetRank} is ready in WildStat.`,
          schedule: { at: new Date(current.completesAtMs), allowWhileIdle: true },
          isExactNotification: false,
          channelId: CHANNEL, extra: { kind: 'research', owner: current.owner },
        }] });
      }
      applied = key;
      status = '';
      onChange();
    }).catch(() => { applied = undefined; status = 'Could not update notifications. Try again.'; onChange(); });
    return queue;
  }
  const controller = {
    sync(research: ResearchNotification | null) {
      desired = research;
      if (research) storage.setItem(SNAPSHOT, JSON.stringify(research));
      else storage.removeItem(SNAPSHOT);
      return reconcile();
    },
    async toggle() {
      prompted = true;
      storage.setItem(PROMPTED, 'true');
      if (!enabled) {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display !== 'granted') { status = 'Allow notifications in your phone settings.'; onChange(); return; }
      }
      enabled = !enabled;
      storage.setItem(PREFERENCE, String(enabled));
      applied = undefined;
      await reconcile();
      if (!enabled) await LocalNotifications.removeDeliveredNotificationsById({ ids: [RESEARCH_NOTIFICATION_ID] });
      onChange();
    },
    refresh() { applied = undefined; return reconcile(); },
    enabled: () => enabled,
    status: () => status,
    onChange(callback: () => void) { onChange = callback; },
  };
  return controller;
}

export function installResearchNotifications(platform: string) {
  const controller = createResearchNotifications(localStorage, platform);
  (window as unknown as { wildstatResearchNotifications: ResearchNotificationBridge }).wildstatResearchNotifications = controller;
  void controller.refresh();
  void App.addListener('appStateChange', ({ isActive }) => { if (isActive) void controller.refresh(); });
  function mount() {
    const settings = document.getElementById('settingsPanel');
    if (!settings) return;
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('span'); label.textContent = 'RESEARCH NOTIFICATIONS';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'setting-toggle';
    button.setAttribute('aria-label', 'Research completion notifications');
    const status = document.createElement('p'); status.className = 'account-status'; status.setAttribute('role', 'status');
    const render = () => {
      button.textContent = controller.enabled() ? 'ON' : 'OFF';
      button.setAttribute('aria-pressed', String(controller.enabled()));
      status.textContent = controller.status(); status.hidden = !status.textContent;
    };
    controller.onChange(render); render();
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await controller.toggle(); }
      catch { status.textContent = 'Could not update notifications. Try again.'; status.hidden = false; }
      finally { button.disabled = false; }
    });
    row.append(label, button);
    settings.querySelector('.account-row')?.before(row, status);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
