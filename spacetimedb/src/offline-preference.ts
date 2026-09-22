import { table, t } from "spacetimedb/server";

/**
 * Whether an account wants its time away paid out.
 *
 * Its own table rather than a column on player_progress: adding a column to a
 * table every session reads forces every player to reload on publish, and this
 * is a preference almost nobody will set. A missing row means on, so existing
 * accounts need no migration and the default costs no storage.
 */
export const playerOfflinePreference = table({ name: "player_offline_preference", public: false }, {
  identity: t.identity().primaryKey(), enabled: t.bool(),
});

export function offlineProgressEnabled(ctx: { db: any }, identity: any) {
  return ctx.db.playerOfflinePreference.identity.find(identity)?.enabled ?? true;
}

export function writeOfflinePreference(ctx: { db: any; sender: any }, enabled: boolean) {
  const previous = ctx.db.playerOfflinePreference.identity.find(ctx.sender);
  if (previous?.enabled === enabled) return;
  const row = { identity: ctx.sender, enabled };
  if (previous) ctx.db.playerOfflinePreference.identity.update(row);
  else ctx.db.playerOfflinePreference.insert(row);
}
