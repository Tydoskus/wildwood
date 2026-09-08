/** Preview-only store transport. Real checkout requires verified server fulfillment. */
export type NativeTestPurchases = {
  mode: 'test';
  load: () => Promise<Array<{ id: string; title: string; price: string }>>;
  buy: (id: string) => Promise<{ transactionId: string; productId: string }>;
};
export function nativeTestPurchases(): NativeTestPurchases | undefined {
  const runtime = window as unknown as { WILDSTAT_NATIVE_PREVIEW?: boolean; wildstatTestPurchases?: NativeTestPurchases };
  return runtime.WILDSTAT_NATIVE_PREVIEW === true && runtime.wildstatTestPurchases?.mode === 'test'
    ? runtime.wildstatTestPurchases : undefined;
}
