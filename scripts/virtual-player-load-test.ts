import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { Identity } from "spacetimedb";
import { DbConnection, tables } from "../src/module_bindings";
import type { DbConnection as DbConnectionType, SubscriptionHandle } from "../src/module_bindings";
import {
  BASIC_PAPER_HAT,
  DEFAULT_ATTACK_INTERVAL,
  DEFAULT_ATTACK_RANGE,
  MAP_IDS,
  PLAYER_BASE_HP,
  PLAYER_PROJECTILE_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PROTOCOL_VERSION,
  STARTER_STONE,
  TUTORIAL_FOREST_MAP_ID,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../shared/rules";
import {
  VIRTUAL_PLAYER_LIMIT,
  VIRTUAL_PLAYER_SAVE_INTERVAL_MS,
  VIRTUAL_PLAYER_TICKET_BYTES,
} from "../shared/virtual-player-load-test";
import {
  movementUpdateReason,
  normalizeMovementVector,
  type SentMovementState,
} from "../src/coop/services/sparse-movement";
import {
  startAfterSubscriptionEnds,
  unsubscribeIfActive,
} from "../src/coop/services/subscription-handoff";
import {
  VIRTUAL_PLAYER_LOAD_MODES,
  isVirtualPlayerLoadMode,
  virtualPlayerLoadProfile,
  virtualPlayerLoadSpawnPoint,
  virtualPlayerLoadWorkerCount,
  virtualPlayerWorkerIndices,
  type VirtualPlayerLoadMode,
} from "./virtual-player-load-test-config";

const WORKER_FLAG = "WILDWOOD_LOAD_TEST_WORKER";
const TOKEN_ENV = "WILDWOOD_LOAD_TEST_TOKEN";
const CONNECT_TIMEOUT_MS = 20_000;
const SUBSCRIPTION_TIMEOUT_MS = 15_000;
const MOVEMENT_INTERVAL_MS = 100;
const MAP_ZONE_SIZE = 1_000;
const MAP_ZONE_RADIUS = 2;
const MAX_ZONE_X = Math.floor((WORLD_WIDTH - 1) / MAP_ZONE_SIZE);
const MAX_ZONE_Y = Math.floor((WORLD_HEIGHT - 1) / MAP_ZONE_SIZE);

type CoordinatorConfig = {
  count: number;
  mode: VirtualPlayerLoadMode;
  host: string;
  database: string;
  mapId: string;
  durationSeconds: number;
  workerCount: number;
  spawnRate: number;
  bootstrapConcurrency: number;
};

type WorkerStart = CoordinatorConfig & {
  type: "start";
  workerIndex: number;
  ownerHex: string;
  ticket: string;
};

type WorkerCommand = WorkerStart | { type: "pause" } | { type: "stop" };

type WorkerSnapshot = {
  type: "snapshot";
  workerIndex: number;
  connected: number;
  failed: number;
  disconnects: number;
  movementAcks: number;
  saveAcks: number;
  reducerErrors: number;
};

type WorkerEvent = WorkerSnapshot | {
  type: "bootstrapComplete" | "paused" | "stopped";
  workerIndex: number;
};

type LoadBot = {
  index: number;
  connection: DbConnectionType | null;
  subscriptions: SubscriptionHandle[];
  nearbySubscription: SubscriptionHandle | null;
  identity: Identity | null;
  zoneKey: string;
  nearbyRefreshPending: boolean;
  x: number;
  y: number;
  angle: number;
  sequence: number;
  lastSent: SentMovementState | null;
  movementInFlight: boolean;
  saveInFlight: boolean;
  nextSaveAt: number;
  enemyKills: number;
  ready: boolean;
  stopping: boolean;
};

type WorkerCounters = {
  connected: number;
  failed: number;
  disconnects: number;
  movementAcks: number;
  saveAcks: number;
  reducerErrors: number;
};

const scriptPath = fileURLToPath(import.meta.url);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function positiveInteger(value: string | undefined, fallback: number, label: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function nonNegativeNumber(value: string | undefined, fallback: number, label: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater`);
  return parsed;
}

function readArguments(argv: string[]) {
  const values = new Map<string, string>();
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${rawKey}`);
    values.set(rawKey, value);
  }
  return { values, help };
}

function helpText() {
  return `Wildwood virtual-player load runner

Usage:
  ${TOKEN_ENV}=<developer-id-token> npm run loadtest:virtual -- [options]

Options:
  --count <1-${VIRTUAL_PLAYER_LIMIT}>       Bots (default 100)
  --mode <${VIRTUAL_PLAYER_LOAD_MODES.join("|")}>  Traffic profile (default movement)
  --host <ws-url>             SpacetimeDB host (default ws://localhost:3000)
  --database <name>           Database (default wildwood-coop)
  --map <map-id>              Spawn map (default ${TUTORIAL_FOREST_MAP_ID})
  --duration <seconds>        Measured run after startup; 0 waits for Ctrl-C (default 60)
  --workers <count>           Processes; automatic minimum keeps <=200 sockets/process
  --spawn-rate <bots/sec>     Aggregate connection start rate
  --bootstrap-concurrency <n> Concurrent connects per worker (default 16)

Modes:
  movement   Sparse 1 Hz movement only; no subscriptions or saves
  realistic  Normal subscriptions, smooth steering, and 2.5 s saves
  dense      Full subscriptions; all bots in one zone; rapid steering

Keep the authenticated developer game open. Token is used only by the coordinator
to create and clean a short-lived run; anonymous worker processes never receive it.`;
}

function parseCoordinatorConfig(argv: string[]): CoordinatorConfig | { help: true } {
  const { values, help } = readArguments(argv);
  if (help) return { help: true };
  const count = positiveInteger(values.get("count"), 100, "count");
  if (count > VIRTUAL_PLAYER_LIMIT) throw new Error(`count cannot exceed ${VIRTUAL_PLAYER_LIMIT}`);
  const modeValue = values.get("mode") ?? "movement";
  if (!isVirtualPlayerLoadMode(modeValue)) throw new Error(`mode must be ${VIRTUAL_PLAYER_LOAD_MODES.join(", ")}`);
  const mode = modeValue;
  const requestedWorkers = values.has("workers")
    ? positiveInteger(values.get("workers"), 1, "workers")
    : undefined;
  const workerCount = virtualPlayerLoadWorkerCount(count, requestedWorkers);
  const profile = virtualPlayerLoadProfile(mode);
  const mapId = values.get("map") ?? TUTORIAL_FOREST_MAP_ID;
  if (!(MAP_IDS as readonly string[]).includes(mapId)) throw new Error(`Unsupported map: ${mapId}`);
  return {
    count,
    mode,
    host: values.get("host") ?? process.env.WILDWOOD_LOAD_TEST_HOST ?? "ws://localhost:3000",
    database: values.get("database") ?? process.env.WILDWOOD_LOAD_TEST_DATABASE ?? "wildwood-coop",
    mapId,
    durationSeconds: nonNegativeNumber(values.get("duration"), 60, "duration"),
    workerCount,
    spawnRate: positiveInteger(values.get("spawn-rate"), profile.defaultSpawnRate, "spawn-rate"),
    bootstrapConcurrency: positiveInteger(values.get("bootstrap-concurrency"), 16, "bootstrap-concurrency"),
  };
}

function buildConnection(options: {
  host: string;
  database: string;
  token?: string;
  lightMode: boolean;
  onConnect: (connection: DbConnectionType, identity: Identity) => void;
  onDisconnect: (error?: Error) => void;
  onConnectError: (error: Error) => void;
}) {
  return DbConnection.builder()
    .withUri(options.host)
    .withDatabaseName(options.database)
    .withToken(options.token)
    .withLightMode(options.lightMode)
    .onConnect((connection, identity) => options.onConnect(connection, identity))
    .onDisconnect((_ctx, error) => options.onDisconnect(error))
    .onConnectError((_ctx, error) => options.onConnectError(error))
    .build();
}

async function connectCoordinator(config: CoordinatorConfig, token: string, ticket: string) {
  let reportLost!: (error: Error) => void;
  const lost = new Promise<Error>((resolve) => { reportLost = resolve; });
  return new Promise<{ connection: DbConnectionType; identity: Identity; lost: Promise<Error> }>((resolve, reject) => {
    let settled = false;
    let connection: DbConnectionType | null = null;
    const timeout = setTimeout(() => finish(new Error("Developer coordinator connection timed out")), CONNECT_TIMEOUT_MS);
    const finish = (error?: Error, identity?: Identity) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error || !connection || !identity) {
        connection?.disconnect();
        reject(error ?? new Error("Developer coordinator connection failed"));
      } else resolve({ connection, identity, lost });
    };
    connection = buildConnection({
      host: config.host,
      database: config.database,
      token,
      lightMode: true,
      onConnect: (connected, identity) => {
        connection = connected;
        void (async () => {
          try {
            await connected.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
            await connected.reducers.devBeginVirtualPlayerLoadTest({ ticket, maxCount: config.count });
            finish(undefined, identity);
          } catch (error) {
            finish(new Error(errorMessage(error)));
          }
        })();
      },
      onDisconnect: (error) => {
        const disconnected = error ?? new Error("Developer coordinator disconnected");
        if (settled) reportLost(disconnected);
        else finish(disconnected);
      },
      onConnectError: finish,
    });
  });
}

function aggregateSnapshots(snapshots: Map<number, WorkerSnapshot>) {
  const total = { connected: 0, failed: 0, disconnects: 0, movementAcks: 0, saveAcks: 0, reducerErrors: 0 };
  for (const snapshot of snapshots.values()) {
    total.connected += snapshot.connected;
    total.failed += snapshot.failed;
    total.disconnects += snapshot.disconnects;
    total.movementAcks += snapshot.movementAcks;
    total.saveAcks += snapshot.saveAcks;
    total.reducerErrors += snapshot.reducerErrors;
  }
  return total;
}

async function waitForWorkerEvents(
  children: ChildProcess[],
  received: Set<number>,
  expected: number,
  timeoutMs: number,
) {
  const started = Date.now();
  while (received.size < expected && Date.now() - started < timeoutMs) await sleep(50);
  if (received.size < expected) {
    const alive = children.filter((child) => child.connected).length;
    throw new Error(`Timed out waiting for workers (${received.size}/${expected}, ${alive} alive)`);
  }
}

async function runCoordinator(config: CoordinatorConfig) {
  const token = process.env[TOKEN_ENV]?.trim();
  if (!token) throw new Error(`${TOKEN_ENV} is required. Run with --help for secure setup.`);
  const ticket = randomBytes(VIRTUAL_PLAYER_TICKET_BYTES).toString("hex");
  console.log(`Authorizing ${config.count} ${config.mode} bots on ${config.database} via ${config.workerCount} processes...`);
  const coordinator = await connectCoordinator(config, token, ticket);
  const snapshots = new Map<number, WorkerSnapshot>();
  const bootstrapped = new Set<number>();
  const paused = new Set<number>();
  const stopped = new Set<number>();
  const children: ChildProcess[] = [];
  const workerEnvironment = { ...process.env };
  delete workerEnvironment[TOKEN_ENV];
  let stopping = false;
  let infrastructureFailure = false;
  let stopReason = "duration complete";
  let requestStop!: (reason: string) => void;
  const stopRequested = new Promise<string>((resolve) => {
    requestStop = (reason) => resolve(reason);
  });
  void coordinator.lost.then((error) => {
    if (!stopping) {
      infrastructureFailure = true;
      requestStop(`coordinator disconnected: ${error.message}`);
    }
  });

  for (let workerIndex = 0; workerIndex < config.workerCount; workerIndex += 1) {
    const child = fork(scriptPath, [], {
      execArgv: ["--import", "tsx"],
      env: { ...workerEnvironment, [WORKER_FLAG]: "1" },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    children.push(child);
    child.on("message", (message: WorkerEvent) => {
      if (message.type === "snapshot") snapshots.set(message.workerIndex, message);
      if (message.type === "bootstrapComplete") bootstrapped.add(message.workerIndex);
      if (message.type === "paused") paused.add(message.workerIndex);
      if (message.type === "stopped") stopped.add(message.workerIndex);
    });
    child.on("exit", (code, signal) => {
      if (!stopping) {
        infrastructureFailure = true;
        const reason = `worker ${workerIndex} exited (${code ?? signal ?? "unknown"})`;
        console.error(reason);
        requestStop(reason);
        if (!bootstrapped.has(workerIndex)) bootstrapped.add(workerIndex);
      }
    });
    child.send({
      ...config,
      type: "start",
      workerIndex,
      ownerHex: coordinator.identity.toHexString(),
      ticket,
    } satisfies WorkerStart);
  }

  const signalStop = (signal: string) => requestStop(signal);
  process.once("SIGINT", () => signalStop("SIGINT"));
  process.once("SIGTERM", () => signalStop("SIGTERM"));

  const reportingStarted = Date.now();
  let previous = aggregateSnapshots(snapshots);
  let previousAt = reportingStarted;
  const reportTimer = setInterval(() => {
    const now = Date.now();
    const current = aggregateSnapshots(snapshots);
    const elapsed = Math.max(.001, (now - previousAt) / 1_000);
    const moveRate = Math.round((current.movementAcks - previous.movementAcks) / elapsed);
    const saveRate = Math.round((current.saveAcks - previous.saveAcks) / elapsed);
    console.log(`${Math.round((now - reportingStarted) / 1_000)}s · ${current.connected}/${config.count} connected · ${moveRate} move/s · ${saveRate} save/s · ${current.failed} failed · ${current.disconnects} disconnected · ${current.reducerErrors} reducer errors`);
    previous = current;
    previousAt = now;
  }, 5_000);

  try {
    await Promise.race([
      waitForWorkerEvents(children, bootstrapped, config.workerCount, Math.max(120_000, config.count / config.spawnRate * 6_000 + 60_000)),
      stopRequested.then((reason) => { throw new Error(`Stopped during startup: ${reason}`); }),
    ]);
    const ready = aggregateSnapshots(snapshots);
    console.log(`Startup complete · ${ready.connected}/${config.count} connected · ${ready.failed} failed`);
    if (config.durationSeconds > 0) {
      stopReason = await Promise.race([
        sleep(config.durationSeconds * 1_000).then(() => "duration complete"),
        stopRequested,
      ]);
    } else stopReason = await stopRequested;
  } finally {
    stopping = true;
    clearInterval(reportTimer);
    for (const child of children) if (child.connected) child.send({ type: "pause" } satisfies WorkerCommand);
    try { await waitForWorkerEvents(children, paused, config.workerCount, 5_000); } catch {}
    try {
      await coordinator.connection.reducers.devClearVirtualPlayers({});
    } catch (error) {
      console.error(`Server cleanup warning: ${errorMessage(error)}`);
    }
    for (const child of children) if (child.connected) child.send({ type: "stop" } satisfies WorkerCommand);
    try { await waitForWorkerEvents(children, stopped, config.workerCount, 10_000); } catch {}
    for (const child of children) if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
    coordinator.connection.disconnect();
  }

  const final = aggregateSnapshots(snapshots);
  console.log(`Stopped (${stopReason}) · ${final.movementAcks} movement acks · ${final.saveAcks} save acks · ${final.failed} failed · test data erased`);
  if (infrastructureFailure || final.failed > 0 || final.reducerErrors > 0) process.exitCode = 1;
}

function sendWorkerEvent(event: WorkerEvent) {
  if (process.send) process.send(event);
}

function workerSnapshot(workerIndex: number, counters: WorkerCounters): WorkerSnapshot {
  return { type: "snapshot", workerIndex, ...counters };
}

function subscriptionError(context: { event?: unknown }) {
  return new Error(`Subscription failed: ${String(context.event ?? "unknown")}`);
}

function installNearbySubscription(bot: LoadBot, config: WorkerStart, initial: boolean) {
  const connection = bot.connection;
  if (!connection?.isActive) return Promise.reject(new Error("Bot connection closed"));
  const identity = bot.identity;
  if (!identity) return Promise.reject(new Error("Bot identity unavailable"));
  const zoneX = Math.floor(bot.x / MAP_ZONE_SIZE);
  const zoneY = Math.floor(bot.y / MAP_ZONE_SIZE);
  const minZoneX = Math.max(0, zoneX - MAP_ZONE_RADIUS);
  const maxZoneX = Math.min(MAX_ZONE_X, zoneX + MAP_ZONE_RADIUS);
  const minZoneY = Math.max(0, zoneY - MAP_ZONE_RADIUS);
  const maxZoneY = Math.min(MAX_ZONE_Y, zoneY + MAP_ZONE_RADIUS);
  const zoneKey = `${config.mapId}:${minZoneX}:${maxZoneX}:${minZoneY}:${maxZoneY}`;
  if (!initial && bot.zoneKey === zoneKey) return Promise.resolve();
  const previous = bot.nearbySubscription;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let next: SubscriptionHandle | null = null;
    const timeout = setTimeout(() => finish(new Error("Nearby subscription timed out")), SUBSCRIPTION_TIMEOUT_MS);
    const removeTracked = (subscription: SubscriptionHandle | null) => {
      if (!subscription) return;
      const index = bot.subscriptions.indexOf(subscription);
      if (index >= 0) bot.subscriptions.splice(index, 1);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        unsubscribeIfActive(next);
        removeTracked(next);
        if (bot.nearbySubscription === next) bot.nearbySubscription = null;
        reject(error);
        return;
      }
      bot.zoneKey = zoneKey;
      bot.nearbySubscription = next;
      resolve();
    };
    const subscribeNext = () => {
      removeTracked(previous);
      if (bot.nearbySubscription === previous) bot.nearbySubscription = null;
      if (settled) return;
      if (bot.stopping || bot.connection !== connection || !connection.isActive) {
        finish(new Error("Bot connection closed during subscription handoff"));
        return;
      }
      try {
        next = connection.subscriptionBuilder()
          .onApplied(() => {
            if (settled) {
              unsubscribeIfActive(next);
              return;
            }
            finish();
          })
          .onError((context) => finish(subscriptionError(context)))
          .subscribe([
            tables.player.where((row) => row
              .mapId.eq(config.mapId)
              .and(row.isVisible.eq(true))
              .and(row.identity.ne(identity))
              .and(row.zoneX.gte(minZoneX))
              .and(row.zoneX.lte(maxZoneX))
              .and(row.zoneY.gte(minZoneY))
              .and(row.zoneY.lte(maxZoneY))),
            tables.playerMotionFrame.where((row) => row
              .mapId.eq(config.mapId)
              .and(row.zoneX.gte(minZoneX))
              .and(row.zoneX.lte(maxZoneX))
              .and(row.zoneY.gte(minZoneY))
              .and(row.zoneY.lte(maxZoneY))),
            tables.playerMotionIdentity.where((row) => row
              .mapId.eq(config.mapId)
              .and(row.isVisible.eq(true))
              .and(row.identity.ne(identity))
              .and(row.zoneX.gte(minZoneX))
              .and(row.zoneX.lte(maxZoneX))
              .and(row.zoneY.gte(minZoneY))
              .and(row.zoneY.lte(maxZoneY))),
          ]);
        bot.nearbySubscription = next;
        bot.subscriptions.push(next);
      } catch (error) {
        finish(new Error(errorMessage(error)));
      }
    };
    startAfterSubscriptionEnds(previous, subscribeNext, (error) => finish(new Error(errorMessage(error))));
  });
}

function installFullSubscriptions(bot: LoadBot, identity: Identity, config: WorkerStart) {
  const connection = bot.connection;
  if (!connection) return Promise.reject(new Error("Bot connection closed"));
  return new Promise<void>((resolve, reject) => {
    let remaining = 3;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Bot subscriptions timed out")), SUBSCRIPTION_TIMEOUT_MS);
    const ready = () => {
      remaining -= 1;
      if (remaining === 0) finish();
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const core = connection.subscriptionBuilder()
      .onApplied(ready)
      .onError((context) => finish(subscriptionError(context)))
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
    const markers = connection.subscriptionBuilder()
      .onApplied(ready)
      .onError((context) => finish(subscriptionError(context)))
      .subscribe([tables.playerMapFrame.where((row) => row.mapId.eq(config.mapId))]);
    bot.subscriptions.push(core, markers);
    void installNearbySubscription(bot, config, true).then(ready, finish);
  });
}

function createBot(index: number, mode: VirtualPlayerLoadMode, count: number): LoadBot {
  const position = virtualPlayerLoadSpawnPoint(mode, index, count);
  return {
    index,
    connection: null,
    subscriptions: [],
    nearbySubscription: null,
    identity: null,
    zoneKey: "",
    nearbyRefreshPending: false,
    x: position.x,
    y: position.y,
    angle: index * 2.399963229728653 % (Math.PI * 2),
    sequence: 0,
    lastSent: null,
    movementInFlight: false,
    saveInFlight: false,
    nextSaveAt: performance.now() + VIRTUAL_PLAYER_SAVE_INTERVAL_MS * (.75 + index % 11 / 20),
    enemyKills: 0,
    ready: false,
    stopping: false,
  };
}

function disconnectBot(bot: LoadBot) {
  bot.stopping = true;
  bot.ready = false;
  bot.subscriptions = [];
  bot.nearbySubscription = null;
  bot.identity = null;
  const connection = bot.connection;
  bot.connection = null;
  try { connection?.disconnect(); } catch {}
}

function connectBot(bot: LoadBot, config: WorkerStart, owner: Identity, counters: WorkerCounters) {
  const profile = virtualPlayerLoadProfile(config.mode);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let connection: DbConnectionType | null = null;
    const timeout = setTimeout(() => finish(new Error("Bot connection timed out")), CONNECT_TIMEOUT_MS);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        disconnectBot(bot);
        reject(error);
      } else resolve();
    };
    connection = buildConnection({
      host: config.host,
      database: config.database,
      lightMode: profile.lightMode,
      onConnect: (connected, identity) => {
        connection = connected;
        bot.connection = connected;
        bot.identity = identity;
        bot.stopping = false;
        void (async () => {
          try {
            await connected.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
            await connected.reducers.joinVirtualPlayerLoadTest({
              owner,
              ticket: config.ticket,
              mapId: config.mapId,
              x: bot.x,
              y: bot.y,
            });
            await connected.reducers.enterWorld({ tabId: `node-load-${config.workerIndex}-${bot.index}` });
            if (profile.subscriptions === "full") {
              await Promise.all([
                connected.reducers.setSkinTone({ skinTone: bot.index % 20 }),
                connected.reducers.setPlayerSprite({ playerSprite: bot.index % 4 }),
                connected.reducers.beginAdventure({}),
              ]);
              await installFullSubscriptions(bot, identity, config);
            }
            bot.nextSaveAt = performance.now() + VIRTUAL_PLAYER_SAVE_INTERVAL_MS * (.75 + bot.index % 11 / 20);
            bot.ready = true;
            counters.connected += 1;
            finish();
          } catch (error) {
            finish(new Error(errorMessage(error)));
          }
        })();
      },
      onDisconnect: (error) => {
        if (!settled) {
          finish(error ?? new Error("Bot disconnected during startup"));
          return;
        }
        if (bot.ready && !bot.stopping) {
          bot.ready = false;
          counters.connected = Math.max(0, counters.connected - 1);
          counters.disconnects += 1;
        }
      },
      onConnectError: finish,
    });
    bot.connection = connection;
  });
}

async function connectBotWithRetry(bot: LoadBot, config: WorkerStart, owner: Identity, counters: WorkerCounters) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await connectBot(bot, config, owner, counters);
      return;
    } catch (error) {
      if (attempt === 2) {
        counters.failed += 1;
        console.error(`Worker ${config.workerIndex} bot ${bot.index} failed: ${errorMessage(error)}`);
        return;
      }
      await sleep(250 * (2 ** attempt));
    }
  }
}

function saveBot(bot: LoadBot, counters: WorkerCounters) {
  const connection = bot.connection;
  if (!connection?.isActive || bot.saveInFlight) return;
  bot.saveInFlight = true;
  bot.enemyKills += 1;
  void connection.reducers.savePlayerProgress({
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
  }).then(() => {
    counters.saveAcks += 1;
  }).catch(() => {
    counters.reducerErrors += 1;
  }).finally(() => {
    bot.saveInFlight = false;
  });
}

function updateBot(bot: LoadBot, config: WorkerStart, elapsedSeconds: number, now: number, counters: WorkerCounters) {
  const connection = bot.connection;
  if (!bot.ready || !connection?.isActive) return;
  const profile = virtualPlayerLoadProfile(config.mode);
  bot.angle += profile.angularVelocity * elapsedSeconds;
  let dx = Math.cos(bot.angle);
  let dy = Math.sin(bot.angle);
  let nextX = bot.x + dx * PLAYER_SPEED * elapsedSeconds;
  let nextY = bot.y + dy * PLAYER_SPEED * elapsedSeconds;
  if (nextX < PLAYER_RADIUS || nextX > WORLD_WIDTH - PLAYER_RADIUS) {
    bot.angle = Math.PI - bot.angle;
    dx = Math.cos(bot.angle);
    nextX = bot.x + dx * PLAYER_SPEED * elapsedSeconds;
  }
  if (nextY < PLAYER_RADIUS || nextY > WORLD_HEIGHT - PLAYER_RADIUS) {
    bot.angle = -bot.angle;
    dy = Math.sin(bot.angle);
    nextY = bot.y + dy * PLAYER_SPEED * elapsedSeconds;
  }
  bot.x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, nextX));
  bot.y = Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, nextY));
  const vector = normalizeMovementVector(dx, dy);
  const reason = movementUpdateReason({ now, vector, inputKind: profile.inputKind, lastSent: bot.lastSent });
  if (reason && !bot.movementInFlight) {
    bot.lastSent = { ...vector, sentAt: now };
    bot.movementInFlight = true;
    const sequence = ++bot.sequence;
    void connection.reducers.updateMovementState({ x: bot.x, y: bot.y, dx: vector.dx, dy: vector.dy, sequence })
      .then(() => { counters.movementAcks += 1; })
      .catch(() => { counters.reducerErrors += 1; })
      .finally(() => { bot.movementInFlight = false; });
  }

  if (profile.subscriptions === "full" && !bot.nearbyRefreshPending) {
    bot.nearbyRefreshPending = true;
    void installNearbySubscription(bot, config, false)
      .catch(() => { counters.reducerErrors += 1; })
      .finally(() => { bot.nearbyRefreshPending = false; });
  }
  if (profile.saves && now >= bot.nextSaveAt) {
    bot.nextSaveAt = now + VIRTUAL_PLAYER_SAVE_INTERVAL_MS * (.75 + Math.random() * .5);
    saveBot(bot, counters);
  }
}

async function runWorker(config: WorkerStart) {
  const owner = Identity.fromString(config.ownerHex);
  const indices = virtualPlayerWorkerIndices(config.count, config.workerIndex, config.workerCount);
  const bots = indices.map((index) => createBot(index, config.mode, config.count));
  const counters: WorkerCounters = { connected: 0, failed: 0, disconnects: 0, movementAcks: 0, saveAcks: 0, reducerErrors: 0 };
  let paused = false;
  let lastMovementAt = performance.now();
  const movementTimer = setInterval(() => {
    if (paused) return;
    const now = performance.now();
    const elapsedSeconds = Math.max(0, Math.min(.25, (now - lastMovementAt) / 1_000));
    lastMovementAt = now;
    for (const bot of bots) updateBot(bot, config, elapsedSeconds, now, counters);
  }, MOVEMENT_INTERVAL_MS);
  const snapshotTimer = setInterval(() => sendWorkerEvent(workerSnapshot(config.workerIndex, counters)), 1_000);

  process.on("message", (message: WorkerCommand) => {
    if (message.type === "pause") {
      paused = true;
      for (const bot of bots) {
        if (!bot.ready && bot.connection) disconnectBot(bot);
      }
      sendWorkerEvent({ type: "paused", workerIndex: config.workerIndex });
    }
    if (message.type === "stop") {
      paused = true;
      clearInterval(movementTimer);
      clearInterval(snapshotTimer);
      for (const bot of bots) disconnectBot(bot);
      sendWorkerEvent(workerSnapshot(config.workerIndex, counters));
      sendWorkerEvent({ type: "stopped", workerIndex: config.workerIndex });
      setTimeout(() => process.exit(0), 25);
    }
  });

  let nextIndex = 0;
  let nextStartAt = performance.now();
  const perWorkerInterval = 1_000 * config.workerCount / config.spawnRate;
  const reserveStart = async () => {
    const scheduledAt = nextStartAt;
    nextStartAt += perWorkerInterval;
    const wait = scheduledAt - performance.now();
    if (wait > 0) await sleep(wait);
  };
  const bootstrapWorker = async () => {
    while (nextIndex < bots.length && !paused) {
      const bot = bots[nextIndex++];
      await reserveStart();
      if (paused) return;
      await connectBotWithRetry(bot, config, owner, counters);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(config.bootstrapConcurrency, Math.max(1, bots.length)) },
    () => bootstrapWorker(),
  ));
  sendWorkerEvent(workerSnapshot(config.workerIndex, counters));
  sendWorkerEvent({ type: "bootstrapComplete", workerIndex: config.workerIndex });
}

async function workerMain() {
  const config = await new Promise<WorkerStart>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Worker did not receive startup config")), 10_000);
    process.once("message", (message: WorkerCommand) => {
      if (message.type !== "start") return reject(new Error("Worker received invalid startup message"));
      clearTimeout(timeout);
      resolve(message);
    });
  });
  await runWorker(config);
}

async function main() {
  if (process.env[WORKER_FLAG] === "1") {
    await workerMain();
    return;
  }
  const config = parseCoordinatorConfig(process.argv.slice(2));
  if ("help" in config) {
    console.log(helpText());
    return;
  }
  await runCoordinator(config);
}

main().catch((error) => {
  console.error(`Load test failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
