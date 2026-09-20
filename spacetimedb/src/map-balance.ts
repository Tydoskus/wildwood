import { table, t, SenderError } from 'spacetimedb/server';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings, BALANCE_MAPS } from '../../shared/map-balance';
import type { BalanceEditorState, BalanceSettings, MapBalanceSnapshot } from '../../shared/map-balance-types';
import type { GameReducerContext } from './index';
export const mapBalanceVersion = table({ name: 'map_balance_version' }, {
  revision: t.u32().primaryKey(), settingsJson: t.string(), editor: t.identity(), createdAt: t.timestamp(),
});
export const mapBalanceHead = table({ name: 'map_balance_head' }, { id: t.u8().primaryKey(), revision: t.u32() });
export const playerMapBalance = table({ name: 'player_map_balance' }, {
  identity: t.identity().primaryKey(), mapId: t.string(), snapshotJson: t.string(),
});
type Context = Pick<GameReducerContext, 'db' | 'sender' | 'timestamp'>;

// A saved revision is never rewritten, so the settings it holds can be read
// once instead of on every visit. Every map change used to load, parse and
// revalidate the whole configuration before it could pin a snapshot.
let parsedSettings: { revision: number; settings: BalanceSettings } | null = null;
// Keyed by revision and map, the pinned snapshot is identical for every player,
// so the resolve and the stringify are shared too. Bounded like the generated
// map cache in shared/enemy-defeats.ts; a miss only costs the original work.
const resolvedSnapshots = new Map<string, string>();
const RESOLVED_SNAPSHOT_LIMIT = 32;

/** Stored settings for a revision, or null when that revision has no row. */
function storedSettings(ctx: Pick<Context, 'db'>, revision: number): BalanceSettings | null {
  if (parsedSettings?.revision === revision) return parsedSettings.settings;
  const row = ctx.db.mapBalanceVersion.revision.find(revision);
  if (!row) return null;
  const settings = validateBalanceSettings(JSON.parse(row.settingsJson));
  parsedSettings = { revision, settings };
  return settings;
}

/**
 * Forget the caches when a revision lands, so the next read sees the save.
 * Exported for tests: one module instance serves a single database in
 * production, but a test process builds many fixtures behind the same module.
 */
export function forgetBalanceCaches() {
  parsedSettings = null;
  resolvedSnapshots.clear();
}

export function balanceEditorState(ctx: Pick<Context, 'db'>): BalanceEditorState {
  const revision = ctx.db.mapBalanceHead.id.find(0)?.revision ?? 0;
  return { revision, settings: storedSettings(ctx, revision) ?? defaultBalanceSettings(), previousRevision: revision > 0 ? revision - 1 : null };
}
export function saveMapBalance(ctx: Context, expectedRevision: number, json: string) {
  const current = balanceEditorState(ctx);
  if (current.revision !== expectedRevision) throw new SenderError('Balance changed in another editor. Reload before saving.');
  if (json.length > 20_000) throw new SenderError('Balance configuration too large.');
  let settings;
  try {
    settings = validateBalanceSettings(JSON.parse(json));
    for (const [map] of BALANCE_MAPS) resolveMapBalance(map === 'endless' ? 'endless_1001' : map, settings, 0);
  } catch (error) { throw new SenderError(error instanceof Error ? error.message : 'Invalid balance.'); }
  // Revision zero is a real backup of the defaults that were live at first edit.
  if (!ctx.db.mapBalanceVersion.revision.find(0)) ctx.db.mapBalanceVersion.insert({ revision: 0, settingsJson: JSON.stringify(current.settings), editor: ctx.sender, createdAt: ctx.timestamp });
  const revision = current.revision + 1;
  ctx.db.mapBalanceVersion.insert({ revision, settingsJson: JSON.stringify(settings), editor: ctx.sender, createdAt: ctx.timestamp });
  if (ctx.db.mapBalanceHead.id.find(0)) ctx.db.mapBalanceHead.id.update({ id: 0, revision });
  else ctx.db.mapBalanceHead.insert({ id: 0, revision });
  forgetBalanceCaches();
}
/** One small snapshot per player. Reconnects retain the same combat and rewards. */
export function pinMapBalance(ctx: Context, mapId: string, enable = false, requestedVersion?: 1 | 2) {
  const previous = ctx.db.playerMapBalance.identity.find(ctx.sender);
  const oldSnapshot: MapBalanceSnapshot | null = previous ? JSON.parse(previous.snapshotJson) : null;
  const version = requestedVersion ?? oldSnapshot?.configurationVersion ?? 1;
  if ((previous?.mapId === mapId && (oldSnapshot?.configurationVersion ?? 1) === version) || (!previous && !enable)) return;
  let head = balanceEditorState(ctx);
  let fromStore = Boolean(storedSettings(ctx, head.revision));
  // Changing client capability on reconnect keeps the visit's balance revision.
  if (previous?.mapId === mapId && oldSnapshot) {
    const stored = storedSettings(ctx, oldSnapshot.revision);
    fromStore = Boolean(stored);
    head = { ...head, revision: oldSnapshot.revision, settings: stored ?? defaultBalanceSettings() };
  }
  const row = { identity: ctx.sender, mapId, snapshotJson: resolvedSnapshotJson(mapId, head, version, fromStore) };
  if (previous) ctx.db.playerMapBalance.identity.update(row); else ctx.db.playerMapBalance.insert(row);
}
/**
 * The snapshot depends only on the map, the revision and the wire version, so
 * players arriving on the same map share one resolve. A revision with no stored
 * row falls back to the authored defaults and is not cached, because the row
 * may still be written.
 */
function resolvedSnapshotJson(mapId: string, head: BalanceEditorState, version: 1 | 2, fromStore: boolean) {
  const resolve = () => JSON.stringify(resolveMapBalance(mapId, head.settings, head.revision, version));
  if (!fromStore) return resolve();
  const key = `${head.revision}:${version}:${mapId}`;
  let json = resolvedSnapshots.get(key);
  if (json === undefined) {
    if (resolvedSnapshots.size >= RESOLVED_SNAPSHOT_LIMIT) resolvedSnapshots.delete(resolvedSnapshots.keys().next().value!);
    json = resolve();
    resolvedSnapshots.set(key, json);
  }
  return json;
}

export function pinnedMapBalance(ctx: Pick<Context, 'db'>, identity: Context['sender'], mapId: string): MapBalanceSnapshot | null {
  const row = ctx.db.playerMapBalance.identity.find(identity);
  return row?.mapId === mapId ? JSON.parse(row.snapshotJson) : null;
}
export function pinnedBossReward(ctx: Pick<Context, 'db'>, identity: Context['sender'], mapId: string, stat: string, fallback: number) {
  return pinnedMapBalance(ctx, identity, mapId)?.boss?.rewards[stat] ?? fallback;
}
