import { describe, expect, it } from 'vitest';
import { ingestStoreEvent, type StoreReceipt, type StoreEvent, type EventStore } from './gem-store-events';
import { createGemPurchaseService, type Purchase } from './gem-purchase-service';
const owner = 'a'.repeat(64), day = 20000n, purchasedAtMs = Number(day * 86_400_000n) + 10000;
const event = (overrides: Partial<StoreEvent> = {}): StoreEvent => ({ eventId: 'event-one', eventHash: 'a'.repeat(64), kind: 'purchase', owner, packId: 'gems_60', reference: 'apple:one', purchasedAtMs, ...overrides });
function setup() {
  const receipts = new Map<string, StoreReceipt>(), events = new Map<string, string>(), holds = new Set<string>();
  const orders = new Map<string, Purchase>(), slots = new Map<string, string>(), ledger = new Set<string>();
  let balance = 0n;
  const purchases = createGemPurchaseService({
    get: id => orders.get(id) ?? null, slot: key => slots.get(key) ?? null,
    save: p => { orders.set(p.reservationId, p); }, lock: (key, id) => { slots.set(key, id); }, unlock: key => { slots.delete(key); },
    credit: (_p, amount, ref) => { if (ledger.has(ref)) throw new Error('duplicate'); ledger.add(ref); balance += amount; },
  });
  const store: EventStore = {
    eventHash: id => events.get(id) ?? null, rememberEvent: (id, hash) => { events.set(id, hash); },
    receipt: ref => receipts.get(ref) ?? null, saveReceipt: r => { receipts.set(r.reference, r); },
    reservation: (owner, pack, day) => {
      const id = slots.get(`${owner}:${pack}:${day}`), order = id && orders.get(id);
      return order ? { id: order.reservationId, status: order.status, createdAtMs: purchasedAtMs - 1000 } : null;
    },
    fulfill: purchases.fulfill, balance: () => balance,
    debitRefund: (_owner, amount, ref) => { if (ledger.has(`refund:${ref}`)) throw new Error('duplicate refund'); ledger.add(`refund:${ref}`); balance -= amount; },
    hold: (_owner, ref, active) => { if (active) holds.add(ref); else holds.delete(ref); },
  };
  const reserve = () => purchases.reserve(owner, 'gems_60', 'reservation_12345678901234567890', BigInt(purchasedAtMs - 1000) * 1000n);
  return { store, reserve, receipts, events, holds, balance: () => balance, setBalance: (n: bigint) => { balance = n; } };
}
describe('atomic store event fulfillment', () => {
  it('credits one reserved pack once across event and receipt retries', () => {
    const h = setup(); h.reserve();
    ingestStoreEvent(h.store, event()); ingestStoreEvent(h.store, event());
    ingestStoreEvent(h.store, event({ eventId: 'another-event', eventHash: 'b'.repeat(64) }));
    expect(h.balance()).toBe(60n);
    expect(h.receipts.get('apple:one')?.status).toBe('fulfilled');
  });
  it('rejects reused event IDs and ownership changes', () => {
    const h = setup(); h.reserve(); ingestStoreEvent(h.store, event());
    expect(() => ingestStoreEvent(h.store, event({ eventHash: 'b'.repeat(64) }))).toThrow('Event ID conflict');
    expect(() => ingestStoreEvent(h.store, event({ eventId: 'two', owner: 'b'.repeat(64) }))).toThrow('ownership');
    expect(h.balance()).toBe(60n);
  });
  it('persists unmatched or second paid transactions for review without a credit', () => {
    const h = setup(); ingestStoreEvent(h.store, event());
    expect(h.receipts.get('apple:one')?.status).toBe('review');
    expect(h.balance()).toBe(0n);
    h.reserve(); ingestStoreEvent(h.store, event());
    ingestStoreEvent(h.store, event({ eventId: 'two', reference: 'apple:two', eventHash: 'b'.repeat(64) }));
    expect(h.receipts.get('apple:two')?.status).toBe('review');
    expect(h.balance()).toBe(60n);
  });
  it('never matches a later reservation or a different UTC payment day', () => {
    const h = setup(); h.reserve();
    const late = { ...h.store, reservation: () => ({ id: 'id', status: 'pending', createdAtMs: purchasedAtMs + 1 }) };
    ingestStoreEvent(late, event());
    expect(h.balance()).toBe(0n);
    ingestStoreEvent(h.store, event({ eventId: 'two', reference: 'apple:two', purchasedAtMs: purchasedAtMs + 86_400_000 }));
    expect(h.balance()).toBe(0n);
  });
  it('keeps a refund tombstone when the refund arrives before the purchase', () => {
    const h = setup(); h.reserve();
    ingestStoreEvent(h.store, event({ kind: 'refund' }));
    ingestStoreEvent(h.store, event({ eventId: 'purchase-late', eventHash: 'b'.repeat(64) }));
    expect(h.balance()).toBe(0n);
    expect(h.receipts.get('apple:one')?.status).toBe('refunded');
  });
  it('reverses unspent Gems once without reopening the daily allowance', () => {
    const h = setup(); h.reserve(); ingestStoreEvent(h.store, event());
    const refund = event({ kind: 'refund', eventId: 'refund-one', eventHash: 'b'.repeat(64) });
    ingestStoreEvent(h.store, refund); ingestStoreEvent(h.store, refund);
    expect(h.balance()).toBe(0n); expect(h.holds.size).toBe(0);
    expect(() => h.reserve()).toThrow();
  });
  it('holds spent refunds for reconciliation and permits safe retry after funding', () => {
    const h = setup(); h.reserve(); ingestStoreEvent(h.store, event()); h.setBalance(10n);
    const refund = event({ kind: 'refund', eventId: 'refund', eventHash: 'b'.repeat(64) });
    ingestStoreEvent(h.store, refund);
    expect(h.balance()).toBe(10n); expect(h.holds.has('apple:one')).toBe(true);
    expect(h.receipts.get('apple:one')?.status).toBe('refund_review');
    h.setBalance(70n); ingestStoreEvent(h.store, refund);
    expect(h.balance()).toBe(10n); expect(h.holds.size).toBe(0);
  });
  it('does not acknowledge a failed credit', () => {
    const h = setup(); h.reserve();
    const store = { ...h.store, fulfill: () => { throw new Error('wallet unavailable'); } };
    expect(() => ingestStoreEvent(store, event())).toThrow();
    expect(h.events.size).toBe(0); expect(h.receipts.size).toBe(0);
  });
});
