import { table, t } from "spacetimedb/server";

// Retired in 0.856. It fed row-level-security filters that kept clients older
// than protocol 105 from receiving duel rows they could not decode; only the
// current protocol connects now, so the filters and per-connect grants are
// gone. Migration 50 emptied it; the table stays until it can be dropped.
// RLS join lookups must be public and indexed in SpacetimeDB. This table holds
// only already-public identity IDs and decoder format numbers, never secrets.
export const duelWireAccess = table({ public: true,
  indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
}, { key: t.string().primaryKey(), identity: t.identity(), combatVersion: t.u8().index("btree") });
