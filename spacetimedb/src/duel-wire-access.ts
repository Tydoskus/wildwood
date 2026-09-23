import { table, t } from "spacetimedb/server";
import { COMPATIBLE_PROTOCOL_VERSIONS } from "../../shared/rules";
import { DUEL_COMBAT_VERSION } from "../../shared/duel-combat";

// Only supported clients with the expanded duel decoder may receive these rows.
// Visibility filters apply to both subscriptions and SQL.
// RLS join lookups must be public and indexed in SpacetimeDB. This table holds
// only already-public identity IDs and decoder format numbers, never secrets.
export const duelWireAccess = table({ public: true,
  indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
}, { key: t.string().primaryKey(), identity: t.identity(), combatVersion: t.u8().index("btree") });

export function syncDuelWireAccess(ctx: any, protocol: number) {
  // Every version up to the current one, derived rather than listed: a duel
  // written at a version nobody is granted is invisible to both duellists, and
  // a hardcoded list silently stops covering the newest fight on every bump.
  const wanted = new Set<number>();
  if (protocol >= 105 && COMPATIBLE_PROTOCOL_VERSIONS.includes(protocol)) {
    for (let combatVersion = 0; combatVersion <= DUEL_COMBAT_VERSION; combatVersion++) wanted.add(combatVersion);
  }
  // This public table feeds every client's duel filter; a reconnect with the
  // same grant must not delete and re-insert it.
  for (const row of [...ctx.db.duelWireAccess.byIdentity.filter(ctx.sender)] as any[]) {
    if (!wanted.delete(row.combatVersion)) ctx.db.duelWireAccess.key.delete(row.key);
  }
  for (const combatVersion of wanted) ctx.db.duelWireAccess.insert({
    key: `${ctx.sender.toHexString()}:${combatVersion}`, identity: ctx.sender, combatVersion,
  });
}

export const DUEL_WIRE_FILTER = "SELECT duel.* FROM duel JOIN duel_wire_access ON duel.combat_version = duel_wire_access.combat_version WHERE duel_wire_access.identity = :sender";
export const DUEL_REPLAY_WIRE_FILTER = "SELECT duel_replay.* FROM duel_replay JOIN duel_wire_access ON duel_replay.combat_version = duel_wire_access.combat_version WHERE duel_wire_access.identity = :sender";
