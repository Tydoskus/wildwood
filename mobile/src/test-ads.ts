import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
import type { WildstatNativeBridge } from '../../src/app/native-ads';

// Google's public demo inventory. This preview never loads production ad units.
const DEMO_REWARDED = {
  ios: 'ca-app-pub-3940256099942544/1712485313',
  android: 'ca-app-pub-3940256099942544/5224354917',
};

export function createTestAds(platform: 'ios' | 'android'): WildstatNativeBridge['rewardedAds'] {
  let initialization: Promise<void> | undefined;
  let preparing: Promise<boolean> | undefined;
  let ready = false;
  let showing = false;
  const changed = () => window.dispatchEvent(new Event('wildstat:native-rewarded-ads-changed'));

  async function prepare(): Promise<boolean> {
    if (showing) return false;
    if (ready) return true;
    if (preparing) return preparing;
    preparing = (async () => {
      try {
        initialization ??= AdMob.initialize({ initializeForTesting: true }).catch(error => {
          initialization = undefined;
          throw error;
        });
        await initialization;
        await AdMob.prepareRewardVideoAd({ adId: DEMO_REWARDED[platform], isTesting: true });
        ready = true;
        return true;
      } finally {
        preparing = undefined;
      }
    })();
    return preparing;
  }

  // Returning only after dismissal keeps gameplay paused while the ad is visible.
  // The SDK's show promise can resolve at reward time, before the close button.
  async function show(placement: string) {
    if (placement !== 'regular_enemy_respawn_2x' || showing) return { rewarded: false };
    if (!await prepare() || showing) return { rewarded: false };
    showing = true;
    ready = false;
    let earned = false;
    const listeners: Array<{ remove(): Promise<void> }> = [];
    try {
      let finish!: (value: { rewarded: boolean }) => void;
      const dismissed = new Promise<{ rewarded: boolean }>(resolve => { finish = resolve; });
      listeners.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }));
      listeners.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish({ rewarded: earned })));
      listeners.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish({ rewarded: false })));
      void AdMob.showRewardVideoAd({ adId: DEMO_REWARDED[platform] }).catch(() => finish({ rewarded: false }));
      return await dismissed;
    } finally {
      await Promise.allSettled(listeners.map(listener => listener.remove()));
      showing = false;
      void prepare().then(changed).catch(() => { /* Retry on the next availability request. */ });
    }
  }

  window.addEventListener('online', () => { void prepare().then(changed).catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !showing) void prepare().then(changed).catch(() => {});
  });
  return {
    isReady: placement => placement === 'regular_enemy_respawn_2x' ? prepare() : false,
    show,
  };
}
