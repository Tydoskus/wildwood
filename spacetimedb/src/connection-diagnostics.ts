import { Range, table, t } from "spacetimedb/server";
import { Timestamp } from "spacetimedb";
import { CONNECTION_DIAGNOSTIC_BATCH_LIMIT, normalizeConnectionDiagnostic } from "../../shared/connection-diagnostics";

export const connectionDiagnosticTables = {
  connectionDiagnostic: table({ public: false, indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const },
    { accessor: "byReceivedAt", algorithm: "btree", columns: ["receivedAt"] as const }] }, {
    id: t.string().primaryKey(), identity: t.identity(), playerName: t.string(), kind: t.string(),
    mapId: t.string(), clientVersion: t.string(), occurredAt: t.timestamp(), receivedAt: t.timestamp(), detailsJson: t.string(),
  }),
  connectionDiagnosticRate: table({ public: false }, {
    identity: t.identity().primaryKey(), startedAt: t.timestamp(), count: t.u32(),
  }),
};
const RETENTION = 7n * 86400n * 1_000_000n;
export const CONNECTION_DIAGNOSTIC_CAP = 50_000;
export function recordConnectionDiagnostics(ctx: any, payload: string) {
  if (payload.length > 24_000) return;
  let input: unknown;
  try { input = JSON.parse(payload); } catch { return; }
  if (!Array.isArray(input)) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const previous = ctx.db.connectionDiagnosticRate.identity.find(ctx.sender);
  const rate = previous && now - previous.startedAt.microsSinceUnixEpoch < 60_000_000n
    ? { ...previous } : { identity: ctx.sender, startedAt: ctx.timestamp, count: 0 };
  for (const raw of input.slice(0, CONNECTION_DIAGNOSTIC_BATCH_LIMIT)) {
    if (rate.count >= 120) break;
    const sample = normalizeConnectionDiagnostic(raw);
    if (!sample) continue;
    const at = BigInt(sample.occurredAtMs) * 1000n;
    if (at < now - RETENTION || at > now + 300_000_000n) continue;
    const id = `${ctx.sender.toHexString()}:${sample.eventId}`;
    if (ctx.db.connectionDiagnostic.id.find(id)) continue;
    ctx.db.connectionDiagnostic.insert({ id, identity: ctx.sender,
      playerName: ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "Guest",
      kind: sample.kind, mapId: sample.mapId, clientVersion: sample.clientVersion,
      occurredAt: new Timestamp(at), receivedAt: ctx.timestamp, detailsJson: JSON.stringify(sample) });
    rate.count++;
  }
  if (previous) ctx.db.connectionDiagnosticRate.identity.update(rate);
  else ctx.db.connectionDiagnosticRate.insert(rate);
}
/** Drops rows past retention, then the oldest past the cap, read in order from the receivedAt index. */
export function cleanupConnectionDiagnostics(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const oldestFirst = (to: { tag: "unbounded" } | { tag: "excluded"; value: Timestamp }) =>
    ctx.db.connectionDiagnostic.byReceivedAt.filter(new Range({ tag: "unbounded" }, to)) as Iterable<{ id: string }>;
  const expired = [...oldestFirst({ tag: "excluded", value: new Timestamp(now - RETENTION) })].map(row => row.id);
  for (const id of expired) ctx.db.connectionDiagnostic.id.delete(id);
  let excess = Number(ctx.db.connectionDiagnostic.count()) - CONNECTION_DIAGNOSTIC_CAP;
  const overCap: string[] = [];
  if (excess > 0) for (const row of oldestFirst({ tag: "unbounded" })) { overCap.push(row.id); if (--excess <= 0) break; }
  for (const id of overCap) ctx.db.connectionDiagnostic.id.delete(id);
  for (const row of [...ctx.db.connectionDiagnosticRate.iter()]) {
    if (now - row.startedAt.microsSinceUnixEpoch >= 60_000_000n) ctx.db.connectionDiagnosticRate.identity.delete(row.identity);
  }
}
