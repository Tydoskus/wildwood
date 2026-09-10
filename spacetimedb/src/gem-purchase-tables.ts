import { table, t } from 'spacetimedb/server';

export const gemPurchaseTables = {
  gemStoreEvent: table({ name: 'gem_store_event', public: false }, {
    eventId: t.string().primaryKey(), eventHash: t.string(), receivedAt: t.timestamp(),
  }),
  gemStoreReceipt: table({ name: 'gem_store_receipt', public: false }, {
    reference: t.string().primaryKey(), owner: t.string(), packId: t.string(), purchasedAtMs: t.f64(),
    status: t.string(), reservationId: t.string(), reason: t.string(), updatedAt: t.timestamp(),
  }),
  gemCommerceHold: table({ name: 'gem_commerce_hold', public: false,
    indexes: [{ accessor: 'byIdentity', algorithm: 'btree', columns: ['identity'] as const }],
  }, { reference: t.string().primaryKey(), identity: t.identity() }),
  gemCommerceConfig: table({ name: 'gem_commerce_config', public: false }, {
    id: t.u8().primaryKey(), verifier: t.identity(), enabled: t.bool(),
  }),
  gemPurchase: table({ name: 'gem_purchase', public: false,
    indexes: [{ accessor: 'byIdentity', algorithm: 'btree', columns: ['identity'] as const }],
  }, {
    reservationId: t.string().primaryKey(), identity: t.identity(), packId: t.string(),
    day: t.u64(), status: t.string(), externalReference: t.string(),
    createdAt: t.timestamp(), updatedAt: t.timestamp(),
  }),
  // One active or settled reservation per account/product/day, across stores.
  gemPurchaseSlot: table({ name: 'gem_purchase_slot', public: false }, {
    key: t.string().primaryKey(), reservationId: t.string(),
  }),
};
