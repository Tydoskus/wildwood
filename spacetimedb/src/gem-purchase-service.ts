import { GEM_PACKS } from '../../shared/gem-packs';

export type Purchase = {
  reservationId: string; owner: string; packId: string; day: bigint;
  status: string; externalReference: string;
};
export type PurchaseStore = {
  get: (id: string) => Purchase | null;
  slot: (key: string) => string | null;
  save: (purchase: Purchase) => void;
  lock: (key: string, id: string) => void;
  unlock: (key: string) => void;
  credit: (purchase: Purchase, gems: bigint, reference: string) => void;
};
const DAY_MICROS = 86_400_000_000n;
const slotKey = (p: Pick<Purchase, 'owner' | 'packId' | 'day'>) => `${p.owner}:${p.packId}:${p.day}`;
function pack(id: string) {
  const value = GEM_PACKS.find(item => item.id === id);
  if (!value) throw new Error('Unknown Gem pack.');
  return value;
}
/** All methods run inside one database transaction. Never expire a payment lock
 * from a client timer: delayed store approvals can still become paid receipts. */
export function createGemPurchaseService(store: PurchaseStore) {
  return {
    reserve(owner: string, packId: string, reservationId: string, nowMicros: bigint) {
      pack(packId);
      if (!/^[A-Za-z0-9_-]{24,80}$/.test(reservationId)) throw new Error('Invalid purchase reservation.');
      const previous = store.get(reservationId);
      if (previous) {
        if (previous.owner !== owner || previous.packId !== packId) throw new Error('Reservation conflict.');
        if (previous.status !== 'pending') throw new Error('Reservation already completed.');
        return previous;
      }
      const purchase: Purchase = { owner, packId, reservationId, day: nowMicros / DAY_MICROS, status: 'pending', externalReference: '' };
      if (store.slot(slotKey(purchase))) throw new Error('This pack is already purchased or pending today.');
      store.lock(slotKey(purchase), reservationId);
      store.save(purchase);
      return purchase;
    },
    fulfill(reservationId: string, owner: string, packId: string, reference: string) {
      if (!/^(apple|google|stripe):[A-Za-z0-9._:-]{1,240}$/.test(reference)) throw new Error('Invalid store transaction reference.');
      const purchase = store.get(reservationId);
      if (!purchase || purchase.owner !== owner || purchase.packId !== packId) throw new Error('Verified purchase does not match reservation.');
      if (purchase.status === 'fulfilled' && purchase.externalReference === reference) return;
      if (purchase.status !== 'pending') throw new Error('Reservation is not pending.');
      if (store.slot(slotKey(purchase)) !== reservationId) throw new Error('Purchase allowance missing.');
      store.credit(purchase, BigInt(pack(packId).gems), reference);
      store.save({ ...purchase, status: 'fulfilled', externalReference: reference });
    },
    cancel(reservationId: string) {
      const purchase = store.get(reservationId);
      if (!purchase) throw new Error('Unknown purchase reservation.');
      if (purchase.status === 'canceled') return;
      if (purchase.status !== 'pending') throw new Error('Paid purchases cannot be canceled.');
      if (store.slot(slotKey(purchase)) === reservationId) store.unlock(slotKey(purchase));
      store.save({ ...purchase, status: 'canceled' });
    },
  };
}
