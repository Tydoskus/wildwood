import { beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  configure: vi.fn(), getProducts: vi.fn(), purchaseStoreProduct: vi.fn(),
  initialize: vi.fn(), prepareRewardVideoAd: vi.fn(), showRewardVideoAd: vi.fn(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock('@revenuecat/purchases-capacitor', () => ({
  PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' }, Purchases: sdk,
}));
vi.mock('@capacitor-community/admob', () => ({
  RewardAdPluginEvents: { Rewarded: 'reward', Dismissed: 'dismiss', FailedToShow: 'fail' },
  AdMob: { ...sdk, addListener: vi.fn(async (name, callback) => {
    sdk.listeners.set(name, callback);
    return { remove: async () => { sdk.listeners.delete(name); } };
  }) },
}));
import { createTestPurchases, validateTestPurchaseConfig } from './test-purchases';
import { createTestAds } from './test-ads';
const config = { revenueCatTestApiKey: 'test_example', productIds: ['gems_test'] };

beforeEach(() => {
  vi.clearAllMocks();
  sdk.listeners.clear();
  sdk.configure.mockResolvedValue(undefined);
  sdk.initialize.mockResolvedValue(undefined);
  sdk.prepareRewardVideoAd.mockResolvedValue({});
  sdk.showRewardVideoAd.mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('window', { addEventListener: vi.fn(), dispatchEvent: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn() });
});

describe('purchase preview boundaries', () => {
  it('rejects production and secret keys before touching the SDK', async () => {
    for (const key of ['appl_live', 'goog_live', 'sk_secret', '']) {
      await expect(createTestPurchases({ ...config, revenueCatTestApiKey: key }).load()).rejects.toThrow('Test Store');
    }
    expect(sdk.configure).not.toHaveBeenCalled();
    expect(() => validateTestPurchaseConfig({ ...config, productIds: ['same', 'same'] })).toThrow('unique');
  });
  it('blocks overlapping purchases and releases the lock after cancellation', async () => {
    sdk.getProducts.mockResolvedValue({ products: [{ identifier: 'gems_test', title: 'Gems', priceString: '$0.99' }] });
    const purchases = createTestPurchases(config);
    await purchases.load();
    let cancel!: (reason: unknown) => void;
    sdk.purchaseStoreProduct.mockImplementationOnce(() => new Promise((_resolve, reject) => { cancel = reject; }));
    const attempt = purchases.buy('gems_test');
    await expect(purchases.buy('gems_test')).rejects.toThrow('already open');
    cancel({ userCancelled: true });
    await expect(attempt).rejects.toEqual({ userCancelled: true });
    sdk.purchaseStoreProduct.mockResolvedValue({ transaction: { transactionIdentifier: 'txn-1' }, productIdentifier: 'gems_test' });
    await expect(purchases.buy('gems_test')).resolves.toEqual({ transactionId: 'txn-1', productId: 'gems_test' });
  });
});

describe('rewarded demo ads', () => {
  async function start() {
    const ads = createTestAds('android');
    await ads.isReady!('regular_enemy_respawn_2x');
    const playback = ads.show('regular_enemy_respawn_2x');
    await vi.waitFor(() => expect(sdk.showRewardVideoAd).toHaveBeenCalledOnce());
    return { playback, ads };
  }
  it('does not reward a dismissal without a reward callback', async () => {
    const { playback } = await start();
    sdk.listeners.get('dismiss')!();
    await expect(playback).resolves.toEqual({ rewarded: false });
    expect(sdk.listeners.size).toBe(0);
  });
  it('waits for dismissal after earning the reward and refuses concurrent playback', async () => {
    const { playback, ads } = await start();
    const resolved = vi.fn();
    void playback.then(resolved);
    sdk.listeners.get('reward')!();
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    await expect(ads.show('regular_enemy_respawn_2x')).resolves.toEqual({ rewarded: false });
    sdk.listeners.get('dismiss')!();
    await expect(playback).resolves.toEqual({ rewarded: true });
    expect(sdk.listeners.size).toBe(0);
  });
  it('handles SDK playback failure without a reward', async () => {
    sdk.showRewardVideoAd.mockRejectedValue(new Error('offline'));
    const ads = createTestAds('ios');
    await expect(ads.show('regular_enemy_respawn_2x')).resolves.toEqual({ rewarded: false });
    expect(sdk.listeners.size).toBe(0);
  });
});
