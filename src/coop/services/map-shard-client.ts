import { DbConnection, tables } from "../../module_bindings";
import type { Identity } from "spacetimedb";
import { MAP_IDS, PROTOCOL_VERSION, TUTORIAL_FOREST_MAP_ID } from "../../../shared/rules";
import type { BaseSubscriptionHandlers } from "./base-subscription";
import type { ReducerPort } from "../ports";

const BOSSES = ["dragon", "spider", "frostclaw", "magmalisk", "gloomroot", "tidewyrm", "koiShogun", "tempestKirin", "miremaw", "prismshell", "ironhorn", "dreadreaper"];
const REGIONAL_HANDLERS = new Set(["player", "removePlayer", "motionIdentity", "removeMotionIdentity", "motionFrame", "mapFrame", "deathFrame", "bossHitResult"]);
type Route = { databaseName: string; mapId: string; generation: bigint; ready: boolean };
export function createMapShardClient(options: {
  host: string; tabId: () => string;
  root: () => DbConnection | null; port: ReducerPort; handlers: BaseSubscriptionHandlers;
  recoverSession: () => void;
  changed: () => void; resetWorld: () => void; worldReady: () => void;
}) {
  let region: DbConnection | null = null;
  let routed: DbConnection | null = null;
  let route: Route | null = null;
  let generation = 0;
  let hydrated = false;
  let failures = 0;
  let routeError: Error | null = null;
  let routeKnown = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attachedRoot: DbConnection | null = null;
  const mapWaiters = new Set<(error?: Error) => void>();
  function notifyMapWaiters(error?: Error) {
    for (const waiter of [...mapWaiters]) waiter(error);
  }
  function waitForMap(mapId: string, root: DbConnection, previousGeneration?: bigint) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error("Destination map connection timed out")), 30_000);
      const finish = (error?: Error) => {
        if (!error && mapId === "home_exterior" && !route) { clearTimeout(timeout); mapWaiters.delete(finish); resolve(); return; }
        if (!error && attachedRoot === root && (!hydrated || route?.mapId !== mapId || (previousGeneration !== undefined && route?.generation === previousGeneration))) return;
        clearTimeout(timeout);
        mapWaiters.delete(finish);
        if (error || attachedRoot !== root) reject(error ?? new Error("Map connection changed"));
        else resolve();
      };
      mapWaiters.add(finish);
      finish(routeError ?? undefined);
    });
  }
  function closeRegion() {
    generation++;
    hydrated = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
    const previous = region;
    region = routed = null;
    previous?.disconnect();
  }
  function connectRegion() {
    const wanted = route;
    const root = attachedRoot;
    if (!wanted?.ready || !root?.isActive || region || routeError) return;
    const attempt = ++generation;
    const current = () => attempt === generation && attachedRoot === root;
    const retry = (error?: unknown) => {
      if (!current()) return;
      const message = error instanceof Error ? error.message : "Map connection failed";
      closeRegion();
      options.resetWorld();
      failures++;
      if (failures >= 5 || /updated\. refresh|account identity|active in another tab/i.test(message)) {
        routeError = new Error(`${message}. Reconnect to restore the map session.`);
        notifyMapWaiters(routeError);
        options.port.handleFailure("map connection", routeError);
        // A refresh repairs a stale account/tab admission too. Rebuild that
        // connection automatically instead of opening the same shard forever.
        if (!/updated\. refresh|active in another tab/i.test(message)) options.recoverSession();
      } else timer = setTimeout(connectRegion, Math.min(5_000, 1_000 * failures));
      options.changed();
    };
    const conn = DbConnection.builder().withUri(options.host).withDatabaseName(wanted.databaseName).withToken(root.token)
      .onConnect(async connection => {
        if (!current()) { connection.disconnect(); return; }
        try {
          // Reuse the account connection's authenticated credentials. Reading
          // storage here can silently switch an active account to a guest after
          // token expiry, sign-in, or a change made in another browser tab.
          if (!connection.identity?.equals(root.identity!)) throw new Error("Map account identity differs from the active account");
          await connection.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
          if (!current() || !connection.isActive) return;
          await connection.reducers.enterWorld({ tabId: options.tabId() });
          if (!current() || !connection.isActive) return;
          // Account operations invoked by the presence service (portals/speed)
          // stay on the root; only regional work uses this connection.
          const reducers = new Proxy(connection.reducers, { get(target, key) {
            if (key === "changeMap") return async (args: Parameters<typeof root.reducers.changeMap>[0]) => {
              await root.reducers.changeMap(args);
              // The root commits before the destination shard is admitted and
              // hydrated. Keep the portal transition open through that handoff.
              await waitForMap(args.mapId, root);
            };
            const source = ["changeMap", "setSpeed", "recordPlayerDeath"].includes(String(key)) ? root.reducers : target;
            const value = Reflect.get(source, key);
            return typeof value === "function" ? value.bind(source) : value;
          } });
          routed = new Proxy(connection, { get(target, key) {
            if (key === "reducers") return reducers;
            const value = Reflect.get(target, key, target);
            return typeof value === "function" ? value.bind(target) : value;
          } });
          const h = options.handlers;
          const bind = (table: any, upsert: (row: any) => void, remove?: (row: any) => void) => {
            table.onInsert((_ctx: unknown, row: any) => { if (current()) upsert(row); });
            table.onUpdate?.((_ctx: unknown, _old: any, row: any) => { if (current()) upsert(row); });
            if (remove) table.onDelete((_ctx: unknown, row: any) => { if (current()) remove(row); });
          };
          bind(connection.db.player, h.player, h.removePlayer);
          bind(connection.db.playerMotionIdentity, h.motionIdentity, h.removeMotionIdentity);
          bind(connection.db.playerMotionDetailFrame, h.motionFrame);
          bind(connection.db.playerMapFrame, h.mapFrame);
          bind(connection.db.playerDeathFrame, h.deathFrame);
          bind(connection.db.bossHitResult, h.bossHitResult);
          const boss = BOSSES[MAP_IDS.indexOf(wanted.mapId)];
          const bossTable = (connection.db as any)[`${boss}Boss`];
          const resultTable = (connection.db as any)[`${boss}Result`];
          bind(bossTable, (h as any)[`${boss}Boss`]);
          bind(resultTable, (h as any)[`${boss}Result`]);
          const own = connection.identity!;
          connection.subscriptionBuilder().onApplied(() => {
            if (!current()) return;
            for (const row of connection.db.player.iter()) h.player(row);
            for (const row of connection.db.playerMotionIdentity.iter()) h.motionIdentity(row);
            for (const row of bossTable.iter()) (h as any)[`${boss}Boss`](row);
            for (const row of resultTable.iter()) (h as any)[`${boss}Result`](row);
            if (timer) clearTimeout(timer);
            timer = undefined;
            failures = 0;
            hydrated = true;
            options.worldReady();
            notifyMapWaiters();
            options.changed();
          }).onError(ctx => retry(ctx.event)).subscribe([
            tables.bossHitResult.where(row => row.identity.eq(own)),
            tables.player.where(row => row.identity.eq(own)),
            tables.playerMotionIdentity.where(row => row.identity.eq(own)),
            (tables as any)[`${boss}Boss`], (tables as any)[`${boss}Result`],
          ]);
        } catch (error) { retry(error); }
      }).onDisconnect((_ctx, error) => retry(error)).onConnectError((_ctx, error) => retry(error)).build();
    region = conn;
    timer = setTimeout(() => retry(new Error("Map connection timed out")), 12_000);
  }
  function update(next: Route | null) {
    if (route?.databaseName === next?.databaseName && route?.mapId === next?.mapId && route?.generation === next?.generation && route?.ready === next?.ready) return;
    closeRegion();
    route = next;
    failures = 0;
    routeError = null;
    options.resetWorld();
    connectRegion();
    if (!next) {
      for (const row of attachedRoot?.db.player.iter() ?? []) options.handlers.player(row);
      for (const row of attachedRoot?.db.playerMotionIdentity.iter() ?? []) options.handlers.motionIdentity(row);
      options.worldReady(); notifyMapWaiters();
    }
    options.changed();
  }
  const port: ReducerPort = {
    ...options.port,
    connection: () => !routeKnown ? null : route ? (hydrated && routed?.isActive ? routed : null) : options.root(),
    sendReducer(action, callback, rejected, accepted) {
      const connection = port.connection();
      if (!connection) { rejected?.(); return; }
      options.port.sendReducer(action, () => {
        if (connection !== port.connection() || !connection.isActive) throw new Error("Map connection changed");
        return callback(connection);
      }, rejected, accepted);
    },
  };
  return {
    port,
    prepareResetRoute() {
      const root = options.root();
      const previousGeneration = route?.generation;
      const wasSharded = Boolean(route);
      return async () => {
        if (!root || root !== options.root() || root !== attachedRoot) throw new Error("Reset committed, but the connection changed. Reconnect to finish.");
        if (!wasSharded && !route) return;
        await waitForMap(TUTORIAL_FOREST_MAP_ID, root, previousGeneration);
      };
    },
    async prepareDuelPosition(position: { x: number; y: number } | null) {
      if (route && position) await options.root()?.reducers.prepareWorldActionPosition(position);
    },
    presentDeath() {
      if (hydrated && region?.isActive) void region.reducers.recordPlayerDeath({}).catch(() => {});
    },
    enabled: () => route !== null,
    ready: () => routeKnown && (route === null || hydrated),
    rootHandlers: Object.fromEntries(Object.entries(options.handlers).map(([key, handler]) => [key,
      REGIONAL_HANDLERS.has(key) || /(?:Boss|Result)$/.test(key) ? (row: any) => { if (routeKnown && !route) (handler as (row: any) => void)(row); } : handler,
    ])) as BaseSubscriptionHandlers,
    attach(root: DbConnection, identity: Identity) {
      this.clear();
      attachedRoot = root;
      routeKnown = false;
      const apply = () => {
        if (attachedRoot !== root) return;
        const wasKnown = routeKnown;
        routeKnown = true;
        const next = root.db.myMapShardRoute.identity.find(identity) ?? null;
        update(next);
        if (!wasKnown && !next) {
          // Own/base rows can arrive before routing hydration. Replay them only
          // after the root is confirmed as the world authority.
          for (const row of root.db.player.iter()) options.handlers.player(row);
          for (const row of root.db.playerMotionIdentity.iter()) options.handlers.motionIdentity(row);
          for (const boss of BOSSES) {
            for (const row of (root.db as any)[`${boss}Boss`].iter()) (options.handlers as any)[`${boss}Boss`](row);
            for (const row of (root.db as any)[`${boss}Result`].iter()) (options.handlers as any)[`${boss}Result`](row);
          }
        }
        options.changed();
      };
      // A view update may delete its old row before inserting the replacement.
      // Observe the completed transaction, never its temporary missing route.
      const changed = () => queueMicrotask(apply);
      root.db.myMapShardRoute.onInsert(changed);
      root.db.myMapShardRoute.onUpdate(changed);
      root.db.myMapShardRoute.onDelete(changed);
      root.subscriptionBuilder().onApplied(apply).onError(() => { if (attachedRoot === root) options.port.handleFailure("map routing", new Error("Map route subscription failed")); })
        .subscribe(tables.myMapShardRoute);
    },
    clear() { failures = 0; routeError = null; attachedRoot = null; route = null; routeKnown = true; closeRegion(); notifyMapWaiters(new Error("Map connection closed")); },
  };
}
