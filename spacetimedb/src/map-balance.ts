import { table, t, SenderError } from 'spacetimedb/server';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings, BALANCE_MAPS } from '../../shared/map-balance';
import type { BalanceEditorState, BalanceSettings, MapBalanceSnapshot } from '../../shared/map-balance-types';
import type { GameReducerContext } from './index';
import { MAP_IDS, REGULAR_ENEMY_RESPAWN_SECONDS } from '../../shared/rules';
import { isProceduralMap } from '../../shared/procedural-maps';
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

/**
 * Every pinned visit resolved again at its own revision and wire version, for
 * a release that changes what a map holds (0.901.47: new camps, rating rewards).
 * A visit kept its old snapshot would pay attack speed kills as the old
 * attacks a second, and know nothing of the new crit camps.
 */
export function repinMapBalances(ctx: Pick<Context, 'db'>) {
  for (const row of [...ctx.db.playerMapBalance.iter()] as any[]) {
    let old: MapBalanceSnapshot;
    try { old = JSON.parse(row.snapshotJson); } catch { continue; }
    const settings = storedSettings(ctx, old.revision) ?? defaultBalanceSettings();
    const snapshotJson = JSON.stringify(resolveMapBalance(row.mapId, settings, old.revision, old.configurationVersion ?? 1));
    if (snapshotJson !== row.snapshotJson) ctx.db.playerMapBalance.identity.update({ ...row, snapshotJson });
  }
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
  // A revision number is never reused, even when the head was moved back past it.
  let revision = current.revision + 1;
  while (ctx.db.mapBalanceVersion.revision.find(revision)) revision += 1;
  ctx.db.mapBalanceVersion.insert({ revision, settingsJson: JSON.stringify(settings), editor: ctx.sender, createdAt: ctx.timestamp });
  if (ctx.db.mapBalanceHead.id.find(0)) ctx.db.mapBalanceHead.id.update({ id: 0, revision });
  else ctx.db.mapBalanceHead.insert({ id: 0, revision });
  forgetBalanceCaches();
}
/**
 * A v2 snapshot resolved before 0.807 carries the respawn scaled from the old
 * 20-second base. Kept for the rest of the visit, it would hold the client and
 * the kill ceiling to the old clock until the player next travelled, so it is
 * re-pinned at the same revision instead.
 */
function respawnBaseIsStale(snapshot: MapBalanceSnapshot | null) {
  return snapshot?.configurationVersion === 2 && snapshot.regularRespawnBaseSeconds !== REGULAR_ENEMY_RESPAWN_SECONDS;
}
/** One small snapshot per player. Reconnects retain the same combat and rewards. */
export function pinMapBalance(ctx: Context, mapId: string, enable = false, requestedVersion?: 1 | 2) {
  const previous = ctx.db.playerMapBalance.identity.find(ctx.sender);
  const oldSnapshot: MapBalanceSnapshot | null = previous ? JSON.parse(previous.snapshotJson) : null;
  const version = requestedVersion ?? oldSnapshot?.configurationVersion ?? 1;
  const sameVisit = previous?.mapId === mapId && (oldSnapshot?.configurationVersion ?? 1) === version;
  if (sameVisit && !respawnBaseIsStale(oldSnapshot) && oldSnapshot?.enemyDamageVersion !== 1) {
    // Hotfix existing visits without changing their pinned health, rewards, or timers.
    const settings = storedSettings(ctx, oldSnapshot!.revision) ?? defaultBalanceSettings();
    const corrected = resolveMapBalance(mapId, settings, oldSnapshot!.revision, version);
    for (const [kind, row] of Object.entries(oldSnapshot!.enemies)) {
      if (corrected.enemies[kind]) row.damage = corrected.enemies[kind].damage;
    }
    for (const [lane, row] of Object.entries(oldSnapshot!.lanes)) {
      if (corrected.lanes[lane]) row.damage = corrected.lanes[lane].damage;
    }
    oldSnapshot!.enemyDamageVersion = 1;
    ctx.db.playerMapBalance.identity.update({ ...previous, snapshotJson: JSON.stringify(oldSnapshot) });
    return;
  }
  if ((sameVisit && !respawnBaseIsStale(oldSnapshot)) || (!previous && !enable)) return;
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

/**
 * Parsed snapshots by their JSON. Every player on a map at one revision pins
 * the same text, and each kill report read it, so the parse ran once a report.
 * Frozen, since one object now serves every reader; bounded, since a revision
 * change leaves the old texts behind.
 */
const parsedSnapshots = new Map<string, MapBalanceSnapshot>();
const PARSED_SNAPSHOT_LIMIT = 128;
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
export function parsedMapBalance(snapshotJson: string): MapBalanceSnapshot {
  let snapshot = parsedSnapshots.get(snapshotJson);
  if (!snapshot) {
    if (parsedSnapshots.size >= PARSED_SNAPSHOT_LIMIT) parsedSnapshots.clear();
    snapshot = deepFreeze(JSON.parse(snapshotJson) as MapBalanceSnapshot);
    parsedSnapshots.set(snapshotJson, snapshot);
  }
  return snapshot;
}
export function pinnedMapBalance(ctx: Pick<Context, 'db'>, identity: Context['sender'], mapId: string): MapBalanceSnapshot | null {
  const row = ctx.db.playerMapBalance.identity.find(identity);
  return row?.mapId === mapId ? parsedMapBalance(row.snapshotJson) : null;
}

/**
 * The balance a player would meet on a map right now: their pinned visit when
 * it is that map, otherwise what arriving there would pin (the head revision,
 * the current wire version). Offline farming reads it for maps the player is
 * not standing on, which used to fall back to the pre-resolver curves and pay
 * a sliver of what the same kill pays in play.
 */
/**
 * Any map's balance at the live revision, as the map window's Enemy Index
 * reads it for maps the player is not on: the same resolve, and the same
 * cache, a player arriving there would be pinned. Read only; the player's own
 * pin is untouched. Unknown maps are refused.
 */
export function mapBalanceForIndex(ctx: Pick<Context, 'db'>, mapId: string) {
  if (!(MAP_IDS as readonly string[]).includes(mapId) && !isProceduralMap(mapId)) throw new SenderError('Unknown map.');
  const head = balanceEditorState(ctx);
  return resolvedSnapshotJson(mapId, head, 2, Boolean(storedSettings(ctx, head.revision)));
}
export function liveMapBalance(ctx: Pick<Context, 'db'>, identity: Context['sender'], mapId: string): MapBalanceSnapshot {
  const pinned = pinnedMapBalance(ctx, identity, mapId);
  if (pinned) return pinned;
  const head = balanceEditorState(ctx);
  return parsedMapBalance(resolvedSnapshotJson(mapId, head, 2, Boolean(storedSettings(ctx, head.revision))));
}
