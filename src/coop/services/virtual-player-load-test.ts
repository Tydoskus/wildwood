import { DbConnection, tables } from "../../module_bindings";
import type { SubscriptionHandle } from "../../module_bindings";
import type { Identity } from "spacetimedb";
import {
  BROWSER_VIRTUAL_PLAYER_LIMIT,
  VIRTUAL_PLAYER_MOVEMENT_HZ,
  VIRTUAL_PLAYER_SAVE_INTERVAL_MS,
  VIRTUAL_PLAYER_TICKET_BYTES,
  normalizeVirtualPlayerCount,
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
import {
  movementUpdateReason,
  normalizeMovementVector,
  type SentMovementState,
} from "./sparse-movement";
import {
  startAfterSubscriptionEnds,
  unsubscribeIfActive,
} from "./subscription-handoff";

const MOVEMENT_HZ = VIRTUAL_PLAYER_MOVEMENT_HZ;
const LOCAL_SIMULATION_HZ = 10;
const MOVEMENT_INTERVAL_MS = 1_000 / LOCAL_SIMULATION_HZ;
const SAVE_INTERVAL_MS = VIRTUAL_PLAYER_SAVE_INTERVAL_MS;
const MAP_ZONE_SIZE = 1_000;
const MAP_ZONE_RADIUS = 2;
const MAX_ZONE_X = Math.floor((WORLD_WIDTH - 1) / MAP_ZONE_SIZE);
const MAX_ZONE_Y = Math.floor((WORLD_HEIGHT - 1) / MAP_ZONE_SIZE);
const CONNECT_TIMEOUT_MS = 12_000;
const SUBSCRIPTION_READY_TIMEOUT_MS = 8_000;
const BOOTSTRAP_MAX_ATTEMPTS = 3;
const BOOTSTRAP_RETRY_BASE_MS = 250;
const MAX_CONCURRENT_BOOTSTRAPS = 16;
const SPAWN_RAMP_MIN_MS = 75;
const SPAWN_RAMP_MAX_MS = 750;

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

type VirtualBot = VirtualPlayerMotion & {
  index: number;
  connection: DbConnection | null;
  subscriptions: SubscriptionHandle[];
  identity: Identity | null;
  sequence: number;
  lastSentMovement: SentMovementState | null;
  ready: boolean;
  failed: boolean;
  nextSaveAt: number;
  enemyKills: number;
  zoneKey: string;
  nearbySubscription: SubscriptionHandle | null;
  nearbyRefreshPending: boolean;
};

type VirtualPlayerLoadTestDependencies = {
  host: string;
  databaseName: string;
  spawnContext: () => { mapId: string; x: number; y: number };
  ownerIdentity: () => Identity | undefined;
  beginServerRun: (ticket: string, maxCount: number) => Promise<void>;
  clearServerPlayers: () => Promise<void>;
  onProtocolMismatch: (error: unknown) => void;
  onStateChange: () => void;
};

export function isVirtualPlayerProtocolMismatch(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /wildwood updated\. refresh to continue\./i.test(message);
}

export function virtualPlayerTicketFromBytes(bytes: Uint8Array) {
  if (bytes.length !== VIRTUAL_PLAYER_TICKET_BYTES) throw new Error("Unexpected virtual-player ticket length");
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function virtualPlayerRampDelayMs(bootstrapMs: number, consecutiveFailures: number) {
  const safeBootstrapMs = Number.isFinite(bootstrapMs) ? Math.max(0, bootstrapMs) : 0;
  const safeFailures = Number.isFinite(consecutiveFailures) ? Math.max(0, Math.floor(consecutiveFailures)) : 0;
  const latencyDelay = Math.max(SPAWN_RAMP_MIN_MS, Math.min(SPAWN_RAMP_MAX_MS, Math.round(safeBootstrapMs * .35)));
  const failureDelay = safeFailures > 0
    ? Math.min(2_000, BOOTSTRAP_RETRY_BASE_MS * (2 ** Math.min(3, safeFailures - 1)))
    : 0;
  return Math.max(latencyDelay, failureDelay);
}

export function virtualPlayerStartupConcurrency(count: number) {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  return Math.min(MAX_CONCURRENT_BOOTSTRAPS, safeCount);
}

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

function createVirtualPlayerTicket() {
  const bytes = new Uint8Array(VIRTUAL_PLAYER_TICKET_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return virtualPlayerTicketFromBytes(bytes);
}

function waitForLoadTestRamp(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
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
  let protocolMismatchReported = false;

  function state(): VirtualPlayerLoadTestState {
    return { phase, requested, connected, failures, movementHz: MOVEMENT_HZ, saveIntervalMs: SAVE_INTERVAL_MS };
  }

  function notify() {
    dependencies.onStateChange();
  }

  function reportProtocolMismatch(error: unknown) {
    if (protocolMismatchReported || !isVirtualPlayerProtocolMismatch(error)) return;
    protocolMismatchReported = true;
    dependencies.onProtocolMismatch(error);
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
      lastSentMovement: null,
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
      nearbyRefreshPending: false,
    };
  }

  function untrackSubscription(bot: VirtualBot, subscription: SubscriptionHandle | null) {
    if (!subscription) return;
    const index = bot.subscriptions.indexOf(subscription);
    if (index >= 0) bot.subscriptions.splice(index, 1);
  }

  function installNearbySubscription(bot: VirtualBot, mapId: string, force = false, onSettled?: (ready: boolean) => void) {
    const conn = bot.connection;
    const identity = bot.identity;
    if (!conn?.isActive || !identity) {
      onSettled?.(false);
      return;
    }
    const zoneX = Math.floor(bot.x / MAP_ZONE_SIZE);
    const zoneY = Math.floor(bot.y / MAP_ZONE_SIZE);
    const minZoneX = Math.max(0, zoneX - MAP_ZONE_RADIUS);
    const maxZoneX = Math.min(MAX_ZONE_X, zoneX + MAP_ZONE_RADIUS);
    const minZoneY = Math.max(0, zoneY - MAP_ZONE_RADIUS);
    const maxZoneY = Math.min(MAX_ZONE_Y, zoneY + MAP_ZONE_RADIUS);
    const zoneKey = `${mapId}:${minZoneX}:${maxZoneX}:${minZoneY}:${maxZoneY}`;
    if (!force && bot.zoneKey === zoneKey) {
      onSettled?.(true);
      return;
    }
    if (bot.nearbyRefreshPending) return;
    bot.nearbyRefreshPending = true;

    const previous = bot.nearbySubscription;
    let next: SubscriptionHandle | null = null;
    const settle = (ready: boolean) => {
      bot.nearbyRefreshPending = false;
      onSettled?.(ready);
    };
    const subscribeNext = () => {
      untrackSubscription(bot, previous);
      if (bot.nearbySubscription === previous) bot.nearbySubscription = null;
      if (bot.connection !== conn || !conn.isActive || bot.failed) {
        settle(false);
        return;
      }
      try {
        next = conn.subscriptionBuilder()
          .onApplied(() => {
            if (bot.connection !== conn || bot.nearbySubscription !== next) {
              unsubscribeIfActive(next);
              return;
            }
            bot.zoneKey = zoneKey;
            settle(true);
          })
          .onError(() => {
            untrackSubscription(bot, next);
            if (bot.nearbySubscription === next) bot.nearbySubscription = null;
            bot.zoneKey = "";
            settle(false);
          })
          .subscribe([
            tables.player.where((row) => row
              .mapId.eq(mapId)
              .and(row.isVisible.eq(true))
              .and(row.identity.ne(identity))
              .and(row.zoneX.gte(minZoneX))
              .and(row.zoneX.lte(maxZoneX))
              .and(row.zoneY.gte(minZoneY))
              .and(row.zoneY.lte(maxZoneY))),
            tables.playerMotionFrame.where((row) => row
              .mapId.eq(mapId)
              .and(row.zoneX.gte(minZoneX))
              .and(row.zoneX.lte(maxZoneX))
              .and(row.zoneY.gte(minZoneY))
              .and(row.zoneY.lte(maxZoneY))),
            tables.playerMotionIdentity.where((row) => row
              .mapId.eq(mapId)
              .and(row.isVisible.eq(true))
              .and(row.identity.ne(identity))
              .and(row.zoneX.gte(minZoneX))
              .and(row.zoneX.lte(maxZoneX))
              .and(row.zoneY.gte(minZoneY))
              .and(row.zoneY.lte(maxZoneY))),
          ]);
        bot.nearbySubscription = next;
        bot.subscriptions.push(next);
      } catch {
        settle(false);
      }
    };
    startAfterSubscriptionEnds(previous, subscribeNext, () => settle(false));
  }

  function installSubscriptions(bot: VirtualBot, identity: Identity, mapId: string) {
    const conn = bot.connection;
    if (!conn) return Promise.reject(new Error("Virtual-player connection closed"));
    return new Promise<void>((resolve, reject) => {
      let remaining = 3;
      let settled = false;
      const timeout = window.setTimeout(() => fail(new Error("Virtual-player subscriptions timed out")), SUBSCRIPTION_READY_TIMEOUT_MS);
      function ready() {
        if (settled) return;
        remaining -= 1;
        if (remaining > 0) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve();
      }
      function fail(error = new Error("Virtual-player subscription failed")) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      }

      const core = conn.subscriptionBuilder()
        .onApplied(ready)
        .onError(() => fail())
        .subscribe([
          tables.player.where((row) => row.identity.eq(identity)),
          tables.playerMotionIdentity.where((row) => row.identity.eq(identity)),
          tables.playerProfile.where((row) => row.identity.eq(identity)),
          tables.playerAccountStatus.where((row) => row.identity.eq(identity)),
          tables.worldStatus,
          tables.playerProgress.where((row) => row.identity.eq(identity)),
          tables.playerResearch.where((row) => row.identity.eq(identity)),
          tables.activeResearch.where((row) => row.identity.eq(identity)),
          tables.playerLifetime.where((row) => row.identity.eq(identity)),
          tables.dragonBoss,
          tables.dragonResult,
          tables.spiderBoss,
          tables.spiderResult,
          tables.frostclawBoss,
          tables.frostclawResult,
          tables.chatMessage,
          tables.duel.where((row) => row.challenger.eq(identity)),
        ]);
      bot.subscriptions.push(core);

      const markers = conn.subscriptionBuilder()
        .onApplied(ready)
        .onError(() => fail())
        .subscribe([
          tables.playerMapFrame.where((row) => row.mapId.eq(mapId)),
        ]);
      bot.subscriptions.push(markers);
      installNearbySubscription(bot, mapId, true, (applied) => applied ? ready() : fail());
    });
  }

  function disconnectBot(bot: VirtualBot) {
    bot.ready = false;
    bot.subscriptions = [];
    bot.nearbySubscription = null;
    bot.nearbyRefreshPending = false;
    const conn = bot.connection;
    bot.connection = null;
    if (conn) {
      try { conn.disconnect(); } catch {}
    }
  }

  function markBotFailed(bot: VirtualBot, runGeneration: number) {
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
        const vector = normalizeMovementVector(
          bot.moving ? Math.cos(bot.facing) : 0,
          bot.moving ? Math.sin(bot.facing) : 0,
        );
        if (movementUpdateReason({ now, vector, inputKind: "keyboard", lastSent: bot.lastSentMovement })) {
          bot.lastSentMovement = { ...vector, sentAt: now };
          const sequence = ++bot.sequence;
          void conn.reducers.updateMovementState({
            x: bot.x,
            y: bot.y,
            dx: vector.dx,
            dy: vector.dy,
            sequence,
          }).catch((error) => {
            reportProtocolMismatch(error);
            markBotFailed(bot, runGeneration);
          });
        }

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
          inventoryJson: JSON.stringify([BASIC_PAPER_HAT, STARTER_STONE]),
          equippedHead: BASIC_PAPER_HAT,
          equippedChest: "",
          equippedFeet: "",
          enemyKills: bot.enemyKills,
          equippedRightHand: STARTER_STONE,
          equippedLeftHand: "",
          cosmeticHead: "",
          cosmeticChest: "",
          cosmeticFeet: "",
          cosmeticRightHand: "",
          cosmeticLeftHand: "",
        }).catch((error) => {
          reportProtocolMismatch(error);
          markBotFailed(bot, runGeneration);
        });
      }
    }, MOVEMENT_INTERVAL_MS);
  }

  function connectBotAttempt(bot: VirtualBot, runGeneration: number, mapId: string, owner: Identity, ticket: string) {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeout = 0;
      let attemptConnection: DbConnection | null = null;
      let attemptReady = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(ready);
      };
      timeout = window.setTimeout(() => {
        finish(false);
        if (bot.connection === attemptConnection) disconnectBot(bot);
      }, CONNECT_TIMEOUT_MS);

      try {
        attemptConnection = DbConnection.builder()
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
                await conn.reducers.joinVirtualPlayerLoadTest({ owner, ticket, mapId, x: bot.x, y: bot.y });
                if (generation !== runGeneration) throw new Error("Virtual-player start cancelled");
                await conn.reducers.enterWorld({ tabId: `load-test-${runGeneration}-${bot.index}` });
                await Promise.all([
                  conn.reducers.setSkinTone({ skinTone: Math.floor(Math.random() * 20) }),
                  conn.reducers.setPlayerSprite({ playerSprite: Math.floor(Math.random() * 4) }),
                  conn.reducers.beginAdventure({}),
                ]);
                if (generation !== runGeneration) throw new Error("Virtual-player start cancelled");
                await installSubscriptions(bot, identity, mapId);
                if (generation !== runGeneration) throw new Error("Virtual-player start cancelled");
                attemptReady = true;
                bot.ready = true;
                connected += 1;
                notify();
                finish(true);
              } catch (error) {
                reportProtocolMismatch(error);
                finish(false);
                if (bot.connection === attemptConnection) disconnectBot(bot);
              }
            })();
          })
          .onDisconnect(() => {
            if (bot.connection !== attemptConnection) {
              // An intentional stop clears bot.connection before the SDK emits
              // disconnect. Settle an in-flight bootstrap immediately instead
              // of leaving Start waiting for its 12-second timeout.
              if (!settled) finish(false);
              return;
            }
            bot.connection = null;
            bot.subscriptions = [];
            bot.nearbySubscription = null;
            bot.nearbyRefreshPending = false;
            if (!settled) {
              bot.ready = false;
              finish(false);
              return;
            }
            if (attemptReady && bot.ready) {
              bot.ready = false;
              connected = Math.max(0, connected - 1);
            }
            if (attemptReady && !bot.failed && generation === runGeneration && (phase === "starting" || phase === "running")) {
              bot.failed = true;
              failures += 1;
              notify();
            }
          })
          .onConnectError(() => {
            finish(false);
            if (bot.connection === attemptConnection) disconnectBot(bot);
          })
          .build();
        bot.connection = attemptConnection;
      } catch {
        finish(false);
        if (bot.connection === attemptConnection) disconnectBot(bot);
      }
    });
  }

  async function connectBotWithRetry(bot: VirtualBot, runGeneration: number, mapId: string, owner: Identity, ticket: string) {
    let totalBootstrapMs = 0;
    for (let attempt = 0; attempt < BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
      if (generation !== runGeneration) return { ready: false, bootstrapMs: totalBootstrapMs };
      bot.identity = null;
      bot.sequence = 0;
      bot.lastSentMovement = null;
      bot.zoneKey = "";
      bot.nearbySubscription = null;
      bot.nearbyRefreshPending = false;
      const startedAt = performance.now();
      const ready = await connectBotAttempt(bot, runGeneration, mapId, owner, ticket);
      totalBootstrapMs += performance.now() - startedAt;
      if (ready) return { ready: true, bootstrapMs: totalBootstrapMs };
      if (generation !== runGeneration) return { ready: false, bootstrapMs: totalBootstrapMs };
      if (attempt + 1 < BOOTSTRAP_MAX_ATTEMPTS) {
        await waitForLoadTestRamp(BOOTSTRAP_RETRY_BASE_MS * (2 ** attempt));
      }
    }

    if (!bot.failed) {
      bot.failed = true;
      failures += 1;
      notify();
    }
    return { ready: false, bootstrapMs: totalBootstrapMs };
  }

  async function start(count: number) {
    if (phase !== "idle") return { ok: false, error: "VIRTUAL PLAYERS ALREADY ACTIVE" };
    const normalizedCount = normalizeVirtualPlayerCount(count);
    if (normalizedCount > BROWSER_VIRTUAL_PLAYER_LIMIT) {
      return { ok: false, error: `BROWSER TEST LIMIT ${BROWSER_VIRTUAL_PLAYER_LIMIT} · USE npm run loadtest:virtual` };
    }
    const owner = dependencies.ownerIdentity();
    if (!owner) return { ok: false, error: "DEVELOPER CONNECTION REQUIRED" };
    let ticket = "";
    try { ticket = createVirtualPlayerTicket(); }
    catch { return { ok: false, error: "SECURE LOAD-TEST TICKET UNAVAILABLE" }; }
    phase = "starting";
    requested = normalizedCount;
    connected = 0;
    failures = 0;
    protocolMismatchReported = false;
    const runGeneration = ++generation;
    const spawn = dependencies.spawnContext();
    notify();

    try {
      await dependencies.beginServerRun(ticket, normalizedCount);
    } catch (error) {
      reportProtocolMismatch(error);
      phase = "idle";
      requested = 0;
      notify();
      return { ok: false, error: error instanceof Error ? error.message : "VIRTUAL PLAYER TEST SETUP FAILED" };
    }
    if (generation !== runGeneration) return { ok: false, error: "VIRTUAL PLAYER START CANCELLED" };

    bots = Array.from({ length: normalizedCount }, (_, index) => createBot(spawn, index, normalizedCount));
    startTimers(runGeneration, spawn.mapId);
    let nextBotIndex = 0;
    let consecutiveFailures = 0;
    const spawnWorker = async () => {
      while (generation === runGeneration) {
        const index = nextBotIndex;
        if (index >= bots.length) return;
        nextBotIndex += 1;
        const result = await connectBotWithRetry(bots[index], runGeneration, spawn.mapId, owner, ticket);
        if (generation !== runGeneration) return;
        consecutiveFailures = result.ready ? 0 : consecutiveFailures + 1;
        if (nextBotIndex < bots.length) {
          await waitForLoadTestRamp(virtualPlayerRampDelayMs(result.bootstrapMs, consecutiveFailures));
        }
      }
    };
    await Promise.all(Array.from(
      { length: virtualPlayerStartupConcurrency(bots.length) },
      () => spawnWorker(),
    ));
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
