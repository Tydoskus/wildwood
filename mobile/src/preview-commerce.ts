import { installResearchNotifications } from './research-notifications';
import { installNativeAuth } from './native-auth';
import { Capacitor } from '@capacitor/core';
import { createTestAds } from './test-ads';
import { createTestPurchases } from './test-purchases';
import type { NativeTestPurchases } from '../../src/app/native-purchases';
import type { WildstatNativeBridge } from '../../src/app/native-ads';

declare const __TEST_PURCHASE_CONFIG__: unknown;
const platform = Capacitor.getPlatform();
if (platform === 'ios' || platform === 'android') {
  installNativeAuth();
  installResearchNotifications(platform);
  (window as unknown as { wildstatTestPurchases: NativeTestPurchases }).wildstatTestPurchases = { mode: 'test', ...createTestPurchases(__TEST_PURCHASE_CONFIG__) };
  const runtime = window as unknown as { wildstatNative: WildstatNativeBridge };
  runtime.wildstatNative = { platform, rewardedAds: createTestAds(platform) };
  window.dispatchEvent(new Event('wildstat:native-rewarded-ads-changed'));
}
