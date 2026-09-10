import { PRODUCT_CATEGORY, Purchases, type PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';

export type TestPurchaseConfig = { revenueCatTestApiKey: string; productIds: string[] };

/** Deliberately accepts only RevenueCat Test Store keys: no real charges in this lab. */
export function validateTestPurchaseConfig(value: unknown): TestPurchaseConfig {
  const config = value as Partial<TestPurchaseConfig> | null;
  if (!config || typeof config.revenueCatTestApiKey !== 'string' || !/^test_[A-Za-z0-9_-]+$/.test(config.revenueCatTestApiKey)) {
    throw new Error('Add a RevenueCat Test Store public key (test_…) to mobile/commerce.local.json and rebuild.');
  }
  if (!Array.isArray(config.productIds) || config.productIds.length === 0 || config.productIds.length > 10 ||
      config.productIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,150}$/.test(id)) ||
      new Set(config.productIds).size !== config.productIds.length) {
    throw new Error('Configure 1–10 unique Test Store product IDs in mobile/commerce.local.json.');
  }
  return { revenueCatTestApiKey: config.revenueCatTestApiKey, productIds: [...config.productIds] };
}

export function createTestPurchases(config: unknown) {
  let initialization: Promise<void> | undefined;
  let products: PurchasesStoreProduct[] = [];
  let busy = false;

  async function load() {
    const validated = validateTestPurchaseConfig(config);
    initialization ??= Purchases.configure({ apiKey: validated.revenueCatTestApiKey }).catch(error => {
      initialization = undefined;
      throw error;
    });
    await initialization;
    products = (await Purchases.getProducts({ productIdentifiers: validated.productIds, type: PRODUCT_CATEGORY.NON_SUBSCRIPTION })).products;
    return products.map(product => ({ id: product.identifier, title: product.title, price: product.priceString }));
  }

  async function buy(id: string) {
    if (busy) throw new Error('A test purchase is already open.');
    const product = products.find(candidate => candidate.identifier === id);
    if (!product) throw new Error('Load test products before purchasing.');
    busy = true;
    try {
      const result = await Purchases.purchaseStoreProduct({ product });
      // SDK success is diagnostic only. Never credit the game's live Gem wallet here.
      return { transactionId: result.transaction.transactionIdentifier, productId: result.productIdentifier };
    } finally {
      busy = false;
    }
  }

  return { load, buy };
}
