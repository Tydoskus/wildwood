import { DbConnection, tables } from "../../module_bindings";
import type { Identity } from "spacetimedb";
import {
  VIRTUAL_PLAYER_COUNT_OPTIONS,
  VIRTUAL_PLAYER_MOVEMENT_HZ,
  VIRTUAL_PLAYER_SAVE_INTERVAL_MS,
} from "../../../shared/virtual-player-load-test";
import {
  BASIC_PAPER_HAT,
  DEFAULT_ATTACK_INTERVAL,
  DEFAULT_ATTACK_RANGE,
  PLAYER_BASE_HP,
  PLAYER_PROJECTILE_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PROTOCOL_VERSION,
  STARTER_STONE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../../shared/rules";

export { VIRTUAL_PLAYER_COUNT_OPTIONS } from "../../../shared/virtual-player-load-test";

const MOVEMENT_HZ = VIRTUAL_PLAYER_MOVEMENT_HZ;
const MOVEMENT_INTERVAL_MS = 1_000 / MOVEMENT_HZ;
const SAVE_INTERVAL_MS = VIRTUAL_PLAYER_SAVE_INTERVAL_MS;
const MAP_ZONE_SIZE = 1_000;
const MAP_ZONE_RADIUS = 2;
const MAX_ZONE_X = Math.floor((WORLD_WIDTH - 1) / MAP_ZONE_SIZE);
const MAX_ZONE_Y = Math.floor((WORLD_HEIGHT - 1) / MAP_ZONE_SIZE);
const CONNECT_TIMEOUT_MS = 12_000;
const SPAWN_RAMP_MS = 35;

export type VirtualPlayerLoadTestPhase = "idle" | "starting" | "running" | "stopping";

export type VirtualPlayerLoadTestState = {
  phase: VirtualPlayerLoadTestPhase;
  requested: number;
  connected: number;
  failures: number;
  movementHz: number;
  saveIntervalMs: number;
};

export type VirtualPlayerMotion = {
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  nextTurnAt: number;
};

type Subscription = { unsubscribe: () => void };

type VirtualBot = VirtualPlayerMotion & {
  index: number;
  connection: DbConnection | null;
  subscriptions: Subscription[];
  identity: Identity | null;
  sequence: number;
  ready: boolean;
  failed: boolean;
  nextSaveAt: number;
  enemyKills: number;
  zoneKey: string;
  nearbySubscription: Subscription | null;
};

type VirtualPlayerLoadTestDependencies = {
  host: string;
  databaseName: string;
  spawnContext: () => { mapId: string; x: number; y: number };
  authorize: (identity: Identity, mapId: string, x: number, y: number) => Promise<void>;
  clearServerPlayers: () => Promise<void>;
  onStateChange: () => void;
};

/** Pure random-walk step shared by runtime and boundary tests. */
export function advanceVirtualPlayerMotion(
  current: VirtualPlayerMotion,
  elapsedSeconds: number,
  now: number,
  random: () => number = Math.random,
): VirtualPlayerMotion {
  let { x, y, facing, moving, nextTurnAt } = current;
  if (now >= nextTurnAt) {
    facing = random() * Math.PI * 2;
    moving = random() >= .16;
    nextTurnAt = now + (moving ? 700 + random() * 2_300 : 300 + random() * 800);
  }

  if (moving) {
    const distance = PLAYER_SPEED * Math.max(0, Math.min(.15, elapsedSeconds));
    let nextX = x + Math.cos(facing) * distance;
    let nextY = y + Math.sin(facing) * distance;
    if (nextX < PLAYER_RADIUS || nextX > WORLD_WIDTH - PLAYER_RADIUS) {
      facing = Math.PI - facing;
      nextX = x + Math.cos(facing) * distance;
    }
    if (nextY < PLAYER_RADIUS || nextY > WORLD_HEIGHT - PLAYER_RADIUS) {
      facing = -facing;
      nextY = y + Math.sin(facing) * distance;
    }
    x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, nextX));
    y = Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, nextY));
  }

  return { x, y, facing, moving, nextTurnAt };
}

/**
 * Runs real anonymous SpacetimeDB clients. Each bot follows normal protocol,
 * subscription, movement, and save paths; only lifecycle cleanup is special.
 */
export function createVirtualPlayerLoadTest(dependencies: VirtualPlayerLoadTestDependencies) {
  let phase: VirtualPlayerLoadTestPhase = "idle";
  let requested = 0;
  let connected = 0;
  let failures = 0;
  let generation = 0;
  let bots: VirtualBot[] = [];
  let movementTimer: number | null = null;
  let lastMovementAt = performance.now();

  function state(): VirtualPlayerLoadTestState {
    return { phase, requested, connected, failures, movementHz: MOVEMENT_HZ, saveIntervalMs: SAVE_INTERVAL_MS };
  }

  function notify() {
    dependencies.onStateChange();
  }

  function spawnPoint(origin: { x: number; y: number }, index: number, count: number) {
    const ring = 100 + Math.floor(index / 8) * 95;
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.random() * .3;
    return {
      x: Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, origin.x + Math.cos(angle) * ring)),
      y: Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, origin.y + Math.sin(angle) * ring)),
    };
  }

  function createBot(origin: { x: number; y: number }, index: number, count: number): VirtualBot {
    const spawn = spawnPoint(origin, index, count);
    return {
      index,
      connection: null,
      subscriptions: [],
      identity: null,
      sequence: 0,
      ready: false,
      failed: false,
      x: spawn.x,
      y: spawn.y,
      facing: Math.random() * Math.PI * 2,
      moving: true,
      nextTurnAt: performance.now() + Math.random() * 1_500,
      nextSaveAt: performance.now() + 800 + Math.random() * SAVE_INTERVAL_MS,
      enemyKills: 0,
      zoneKey: "",
      nearbySubscription: null,
    };
  }

  function removeSubscription(bot: VirtualBot, subscription: Subscription | null) {
    if (!subscription) return;
    const index = bot.subscriptions.indexOf(subscription);
    if (index >= 0) bot.subscriptions.splice(index, 1);
    try { subscription.unsubscribe(); } catch {}
  }

  function installNearbySubscription(bot: VirtualBot, mapId: string, force = false) {
    const conn = bot.connection;
    if (!conn?.isActive) return;
    const zoneX = Math.floor(bot.x / MAP_ZONE_SIZE);
    const zoneY = Math.floor(bot.y / MAP_ZONE_SIZE);
    const minZoneX = Math.max(0, zoneX - MAP_ZONE_RADIUS);
    const maxZoneX = Math.min(MAX_ZONE_X, zoneX + MAP_ZONE_RADIUS);
    const minZoneY = Math.max(0, zoneY - MAP_ZONE_RADIUS);
    const maxZoneY = Math.min(MAX_ZONE_Y, zoneY + MAP_ZONE_RADIUS);
    const zoneKey = `${mapId}:${minZoneX}:${maxZoneX}:${minZoneY}:${maxZoneY}`;
    if (!force && bot.zoneKey === zoneKey) return;
    bot.zoneKey = zoneKey;

    const previous = bot.nearbySubscription;
    let next: Subscription | null = null;
    next = conn.subscriptionBuilder()
      .onApplied(() => {
        if (bot.nearbySubscription !== next) return;
        removeSubscription(bot, previous);
      })
      .onError(() => {
        if (bot.nearbySubscription === next) bot.nearbySubscription = previous;
        removeSubscription(bot, next);
      })
      .subscribe([tables.player.where((row) => row
        .mapId.eq(mapId)
        .and(row.isVisible.eq(true))
        .and(row.zoneX.gte(minZoneX))
        .and(row.zoneX.lte(maxZoneX))
        .and(row.zoneY.gte(minZoneY))
        .and(row.zoneY.lte(maxZoneY)))]) as Subscription;
    bot.nearbySubscription = next;
    bot.subscriptions.push(next);
  }

  function installSubscriptions(bot: VirtualBot, identity: Identity, mapId: string) {
    const conn = bot.connection;
    if (!conn) return;
    const core = conn.subscriptionBuilder().subscribe([
      tables.player.where((row) => row.identity.eq(identity)),
      tables.playerProfile,
      tables.playerAccountStatus,
      tables.worldStatus,
      tables.localMovementDemand,
      tables.playerProgress.where((row) => row.identity.eq(identity)),
      tables.playerResearch.where((row) => row.identity.eq(identity)),
      tables.activeResearch.where((row) => row.identity.eq(identity)),
      tables.playerLifetime.where((row) => row.identity.eq(identity)),
      tables.dragonBoss,
      tables.dragonResult,
      tables.spiderBoss,
      tables.spiderResult,
      tables.chatMessage,
      tables.duel.where((row) => row.challenger.eq(identity)),
    ]) as Subscription;
    bot.subscriptions.push(core);

    const markers = conn.subscriptionBuilder().subscribe([
      tables.playerMapMarker.where((row) => row.mapId.eq(mapId).and(row.isVisible.eq(true))),
    ]) as Subscription;
    bot.subscriptions.push(markers);
    installNearbySubscription(bot, mapId, true);

    // Real clients load one ranking snapshot after spawn, then release it.
    let leaderboard: Subscription | null = null;
    leaderboard = conn.subscriptionBuilder()
      .onApplied(() => queueMicrotask(() => {
        removeSubscription(bot, leaderboard);
        leaderboard = null;
      }))
      .onError(() => {
        removeSubscription(bot, leaderboard);
        leaderboard = null;
      })
      .subscribe([tables.leaderboardEntry]) as Subscription;
    bot.subscriptions.push(leaderboard);
  }

  function disconnectBot(bot: VirtualBot) {
    bot.ready = false;
    for (const subscription of [...bot.subscriptions]) removeSubscription(bot, subscription);
    bot.nearbySubscription = null;
    const conn = bot.connection;
    bot.connection = null;
    if (conn) {
      try { conn.disconnect(); } catch {}
    }
  }

  function failBot(bot: VirtualBot, runGeneration: number) {
    if (generation !== runGeneration || (phase !== "starting" && phase !== "running")) {
      disconnectBot(bot);
      return;
    }
    if (bot.failed) return;
    bot.failed = true;
    if (bot.ready) connected = Math.max(0, connected - 1);
    failures += 1;
    disconnectBot(bot);
    notify();
  }

  function startTimers(runGeneration: number, mapId: string) {
    if (movementTimer !== null) window.clearInterval(movementTimer);
    lastMovementAt = performance.now();
    movementTimer = window.setInterval(() => {
      if (generation !== runGeneration || (phase !== "starting" && phase !== "running")) return;
      const now = performance.now();
      const elapsedSeconds = (now - lastMovementAt) / 1_000;
      lastMovementAt = now;

      for (const bot of bots) {
        const conn = bot.connection;
        if (!bot.ready || bot.failed || !conn?.isActive) continue;
        Object.assign(bot, advanceVirtualPlayerMotion(bot, elapsedSeconds, now));
        installNearbySubscription(bot, mapId);
        const sequence = ++bot.sequence;
        void conn.reducers.syncPosition({
          x: bot.x,
          y: bot.y,
          facing: bot.facing,
          moving: bot.moving,
          sequence,
        }).catch(() => failBot(bot, runGeneration));

        if (now < bot.nextSaveAt) continue;
        bot.nextSaveAt = now + SAVE_INTERVAL_MS * (.75 + Math.random() * .5);
        bot.enemyKills += 1;
        void conn.reducers.savePlayerProgress({
          maxHp: PLAYER_BASE_HP,
          damage: 4,
          attackRate: DEFAULT_ATTACK_INTERVAL,
          projectileSpeed: PLAYER_PROJECTILE_SPEED,
          projectileCount: 1,
          attackRange: DEFAULT_ATTACK_RANGE,
          armor: 0,
          regen: 0,
          speed: PLAYER_SPEED,
          bootsCollected: false,
          inventoryJson: JSON.stringify([STARTER_STONE]),
          equippedHead: BASIC_PAPER_HAT,
          equippedChest: "",
          equippedFeet: "",
          enemyKills: bot.enemyKills,
          equippedRightHand: STARTER_STONE,
          equippedLeftHand: "",
        }).catch(() => failBot(bot, runGeneration));
      }
    }, MOVEMENT_INTERVAL_MS);
  }

  function connectBot(bot: VirtualBot, runGeneration: number, mapId: string) {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeout = 0;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(ready);
      };
      timeout = window.setTimeout(() => {
        failBot(bot, runGeneration);
        finish(false);
      }, CONNECT_TIMEOUT_MS);

      try {
        bot.connection = DbConnection.builder()
          .withUri(dependencies.host)
          .withDatabaseName(dependencies.databaseName)
          .onConnect((conn, identity) => {
            if (settled || bot.failed || generation !== runGeneration) {
              conn.disconnect();
              return;
            }
            bot.connection = conn;
            bot.identity = identity;
            void (async () => {
              try {
                await conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
                if (generation !== runGeneration) throw new Error("Virtual-player start cancelled");
                await dependencies.authorize(identity, mapId, bot.x, bot.y);
                if (generation !== runGeneration) throw new Error("Virtual-player start cancelled");
                await conn.reducers.enterWorld({ tabId: `load-test-${runGeneration}-${bot.index}` });
                await Promise.all([
                  conn.reducers.setSkinTone({ skinTone: Math.floor(Math.random() * 20) }),
                  conn.reducers.setPlayerSprite({ playerSprite: Math.floor(Math.random() * 4) }),
                  conn.reducers.beginAdventure({}),
                ]);
                if (generation !== runGeneration) throw new Error("Virtual-player start cancelled");
                installSubscriptions(bot, identity, mapId);
                bot.ready = true;
                connected += 1;
                notify();
                finish(true);
              } catch {
                failBot(bot, runGeneration);
                finish(false);
              }
            })();
          })
          .onDisconnect(() => {
            bot.connection = null;
            bot.subscriptions = [];
            bot.nearbySubscription = null;
            if (bot.ready) {
              bot.ready = false;
              connected = Math.max(0, connected - 1);
            }
            if (!bot.failed && (phase === "starting" || phase === "running")) {
              bot.failed = true;
              failures += 1;
            }
            notify();
            finish(false);
          })
          .onConnectError(() => {
            failBot(bot, runGeneration);
            finish(false);
          })
          .build();
      } catch {
        failBot(bot, runGeneration);
        finish(false);
      }
    });
  }

  async function start(count: number) {
    if (phase !== "idle") return { ok: false, error: "VIRTUAL PLAYERS ALREADY ACTIVE" };
    const normalizedCount = VIRTUAL_PLAYER_COUNT_OPTIONS.includes(count as (typeof VIRTUAL_PLAYER_COUNT_OPTIONS)[number])
      ? count
      : VIRTUAL_PLAYER_COUNT_OPTIONS[0];
    phase = "starting";
    requested = normalizedCount;
    connected = 0;
    failures = 0;
    const runGeneration = ++generation;
    const spawn = dependencies.spawnContext();
    notify();

    try {
      await dependencies.clearServerPlayers();
    } catch (error) {
      phase = "idle";
      requested = 0;
      notify();
      return { ok: false, error: error instanceof Error ? error.message : "VIRTUAL PLAYER CLEANUP FAILED" };
    }
    if (generation !== runGeneration) return { ok: false, error: "VIRTUAL PLAYER START CANCELLED" };

    bots = Array.from({ length: normalizedCount }, (_, index) => createBot(spawn, index, normalizedCount));
    startTimers(runGeneration, spawn.mapId);
    const pending: Promise<boolean>[] = [];
    for (const bot of bots) {
      if (generation !== runGeneration) break;
      pending.push(connectBot(bot, runGeneration, spawn.mapId));
      await new Promise((resolve) => window.setTimeout(resolve, SPAWN_RAMP_MS));
    }
    await Promise.all(pending);
    if (generation !== runGeneration) return { ok: false, error: "VIRTUAL PLAYER START CANCELLED" };

    phase = connected > 0 ? "running" : "idle";
    if (phase === "idle") {
      requested = 0;
      if (movementTimer !== null) window.clearInterval(movementTimer);
      movementTimer = null;
      try { await dependencies.clearServerPlayers(); } catch {}
    }
    notify();
    return connected > 0
      ? { ok: true, connected, requested: normalizedCount }
      : { ok: false, error: "NO VIRTUAL PLAYERS CONNECTED" };
  }

  async function stop(clearServer = true) {
    if (phase === "idle" && bots.length === 0) {
      if (clearServer) await dependencies.clearServerPlayers();
      return { ok: true };
    }
    phase = "stopping";
    generation += 1;
    notify();
    if (movementTimer !== null) window.clearInterval(movementTimer);
    movementTimer = null;
    for (const bot of bots) disconnectBot(bot);
    bots = [];
    connected = 0;

    let error = "";
    if (clearServer) {
      try { await dependencies.clearServerPlayers(); }
      catch (cause) { error = cause instanceof Error ? cause.message : "VIRTUAL PLAYER CLEANUP FAILED"; }
    }
    phase = "idle";
    requested = 0;
    failures = 0;
    notify();
    return error ? { ok: false, error } : { ok: true };
  }

  function disconnectLocal() {
    generation += 1;
    if (movementTimer !== null) window.clearInterval(movementTimer);
    movementTimer = null;
    for (const bot of bots) disconnectBot(bot);
    bots = [];
    phase = "idle";
    requested = 0;
    connected = 0;
    failures = 0;
  }

  return { state, start, stop, disconnectLocal };
}
