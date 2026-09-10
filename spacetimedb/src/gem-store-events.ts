import { GEM_PACKS } from '../../shared/gem-packs';

export type StoreEvent = { eventId: string; eventHash: string; kind: string; owner: string; packId: string; reference: string; purchasedAtMs: number };
export type StoreReceipt = Omit<StoreEvent, 'eventId' | 'eventHash' | 'kind'> & { status: string; reservationId: string; reason: string };
export type EventStore = {
  eventHash: (id: string) => string | null;
  rememberEvent: (id: string, hash: string) => void;
  receipt: (reference: string) => StoreReceipt | null;
  saveReceipt: (receipt: StoreReceipt) => void;
  reservation: (owner: string, packId: string, day: bigint) => { id: string; createdAtMs: number; status: string } | null;
  fulfill: (id: string, owner: string, packId: string, reference: string) => void;
  balance: (owner: string) => bigint;
  debitRefund: (owner: string, amount: bigint, reference: string) => void;
  hold: (owner: string, reference: string, active: boolean) => void;
};
/** The webhook adapter has already authenticated RevenueCat. This layer runs
 * atomically with the existing wallet/ledger inside SpacetimeDB. */
export function ingestStoreEvent(store: EventStore, event: StoreEvent) {
  const pack = GEM_PACKS.find(p => p.id === event.packId);
  if (!pack || !/^[a-f0-9]{64}$/.test(event.owner) || !/^(apple|google):[A-Za-z0-9._:-]{1,240}$/.test(event.reference) ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(event.eventId) || !/^[a-f0-9]{64}$/.test(event.eventHash) ||
      !Number.isSafeInteger(event.purchasedAtMs) || event.purchasedAtMs <= 0 || !['purchase', 'refund'].includes(event.kind)) throw new Error('Invalid verified event');
  const seen = store.eventHash(event.eventId);
  if (seen && seen !== event.eventHash) throw new Error('Event ID conflict');
  const previous = store.receipt(event.reference);
  if (previous && (previous.owner !== event.owner || previous.packId !== event.packId || previous.purchasedAtMs !== event.purchasedAtMs)) throw new Error('Receipt ownership conflict');
  const receipt: StoreReceipt = previous ?? { owner: event.owner, packId: event.packId, reference: event.reference,
    purchasedAtMs: event.purchasedAtMs, status: 'received', reservationId: '', reason: '' };
  if (event.kind === 'refund') {
    if (receipt.status === 'fulfilled' || receipt.status === 'refund_review') {
      if (store.balance(event.owner) < BigInt(pack.gems)) {
        store.hold(event.owner, event.reference, true);
        store.saveReceipt({ ...receipt, status: 'refund_review', reason: 'Refunded Gems have already been spent; wallet spending held for reconciliation.' });
      } else {
        store.debitRefund(event.owner, BigInt(pack.gems), event.reference);
        store.hold(event.owner, event.reference, false);
        store.saveReceipt({ ...receipt, status: 'refunded', reason: '' });
      }
    } else if (receipt.status !== 'refunded') {
      // A refund arriving first is a durable tombstone. A delayed purchase must
      // never credit it, even when that event has a different event ID.
      store.saveReceipt({ ...receipt, status: 'refunded', reason: '' });
    }
  } else if (!['fulfilled', 'refunded', 'refund_review'].includes(receipt.status)) {
    const reservation = store.reservation(event.owner, event.packId, BigInt(event.purchasedAtMs) / 86_400_000n);
    if (!reservation || reservation.status !== 'pending' || reservation.createdAtMs > event.purchasedAtMs) {
      store.saveReceipt({ ...receipt, status: 'review', reason: 'No pending allowance predating payment on its UTC purchase day.' });
    } else {
      store.fulfill(reservation.id, event.owner, event.packId, event.reference);
      store.saveReceipt({ ...receipt, reservationId: reservation.id, status: 'fulfilled', reason: '' });
    }
  }
  if (!seen) store.rememberEvent(event.eventId, event.eventHash);
}
