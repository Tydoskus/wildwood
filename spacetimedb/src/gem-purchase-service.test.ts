import { describe, expect, it } from 'vitest';
import { createGemPurchaseService, type Purchase } from './gem-purchase-service';

const id = (n: number) => `reservation_${String(n).padStart(24, '0')}`;
const DAY = 86_400_000_000n;
function setup() {
  const orders = new Map<string, Purchase>(), slots = new Map<string, string>();
  const receipts = new Set<string>();
  let balance = 0n;
  const service = createGemPurchaseService({
    get: key => orders.get(key) ?? null,
    slot: key => slots.get(key) ?? null,
    save: purchase => { orders.set(purchase.reservationId, purchase); },
    lock: (key, reservation) => { slots.set(key, reservation); },
    unlock: key => { slots.delete(key); },
    credit: (_purchase, gems, receipt) => {
      if (receipts.has(receipt)) throw new Error('Store receipt already used.');
      receipts.add(receipt); balance += gems;
    },
  });
  return { service, balance: () => balance, orders };
}

describe('Gem pack purchase allowances and fulfillment', () => {
  it('blocks a second reservation for the same account, pack and UTC day', () => {
    const { service } = setup();
    service.reserve('alice', 'gems_60', id(1), DAY);
    expect(() => service.reserve('alice', 'gems_60', id(2), DAY + 1n)).toThrow('already purchased or pending');
    expect(() => service.reserve('alice', 'gems_220', id(3), DAY)).not.toThrow();
    expect(() => service.reserve('bob', 'gems_60', id(4), DAY)).not.toThrow();
    expect(() => service.reserve('alice', 'gems_60', id(5), DAY * 2n)).not.toThrow();
  });
  it('makes retries idempotent without granting a second allowance', () => {
    const { service, balance } = setup();
    service.reserve('alice', 'gems_60', id(1), DAY);
    service.reserve('alice', 'gems_60', id(1), DAY);
    service.fulfill(id(1), 'alice', 'gems_60', 'apple:transaction1');
    service.fulfill(id(1), 'alice', 'gems_60', 'apple:transaction1');
    expect(balance()).toBe(60n);
    expect(() => service.reserve('alice', 'gems_60', id(2), DAY)).toThrow();
    expect(() => service.fulfill(id(1), 'alice', 'gems_60', 'apple:transaction2')).toThrow();
  });
  it('rejects wrong accounts, products, unknown packs and test receipts', () => {
    const { service, balance } = setup();
    service.reserve('alice', 'gems_60', id(1), DAY);
    expect(() => service.fulfill(id(1), 'bob', 'gems_60', 'apple:one')).toThrow();
    expect(() => service.fulfill(id(1), 'alice', 'gems_3300', 'apple:one')).toThrow();
    expect(() => service.fulfill(id(1), 'alice', 'gems_60', 'test:one')).toThrow();
    expect(() => service.reserve('alice', 'free_gems', id(2), DAY)).toThrow();
    expect(balance()).toBe(0n);
  });
  it('releases only canceled orders and rejects their delayed fulfillment', () => {
    const { service } = setup();
    service.reserve('alice', 'gems_60', id(1), DAY);
    service.cancel(id(1)); service.cancel(id(1));
    service.reserve('alice', 'gems_60', id(2), DAY);
    expect(() => service.fulfill(id(1), 'alice', 'gems_60', 'apple:one')).toThrow();
    service.fulfill(id(2), 'alice', 'gems_60', 'apple:two');
    expect(() => service.cancel(id(2))).toThrow();
  });
  it('does not fulfill a second order with a reused receipt', () => {
    const { service, orders, balance } = setup();
    service.reserve('alice', 'gems_60', id(1), DAY);
    service.fulfill(id(1), 'alice', 'gems_60', 'apple:one');
    service.reserve('alice', 'gems_60', id(2), DAY * 2n);
    expect(() => service.fulfill(id(2), 'alice', 'gems_60', 'apple:one')).toThrow();
    expect(orders.get(id(2))?.status).toBe('pending');
    expect(balance()).toBe(60n);
  });
  it('uses the server catalog quantity for every pack', () => {
    const { service, balance } = setup();
    ['gems_60', 'gems_220', 'gems_800', 'gems_3300'].forEach((pack, i) => {
      service.reserve('alice', pack, id(i), DAY);
      service.fulfill(id(i), 'alice', pack, `google:receipt${i}`);
    });
    expect(balance()).toBe(4380n);
  });
});
