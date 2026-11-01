import { table, t } from "spacetimedb/server";

/**
 * Which host each account's client was served from (wildstatmmo.com, the GitHub Pages mirror, the app),
 * for hosting and support stats. One row per account and host. The register_client_host reducer is in index.ts.
 */
export const playerClientHost = table(
  {
    name: "player_client_host",
    public: false,
    indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    host: t.string(),
    firstSeenAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
  },
);

const HOST = /^[a-z0-9.-]{1,100}(?::\d{1,5})?$/;

export function recordClientHost(ctx: any, host: string) {
  const name = host.trim().toLowerCase();
  if (!HOST.test(name)) return;
  const seen = [...ctx.db.playerClientHost.byIdentity.filter(ctx.sender)].find((row: any) => row.host === name);
  if (seen) ctx.db.playerClientHost.id.update({ ...seen, lastSeenAt: ctx.timestamp });
  else ctx.db.playerClientHost.insert({ id: 0n, identity: ctx.sender, host: name, firstSeenAt: ctx.timestamp, lastSeenAt: ctx.timestamp });
}
