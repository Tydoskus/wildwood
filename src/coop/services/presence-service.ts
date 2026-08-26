import type { Identity } from "spacetimedb";
import { tables, type SubscriptionHandle } from "../../module_bindings";
import { remoteEquipmentFromRow, type RemoteEquipment } from "./remote-equipment";
import {
  adaptiveRemoteRenderAt,
  applyRemoteMotionCorrection,
  appendRemoteCorrectionSample,
  appendRemoteTimelineSample,
  createRemoteMotionCorrection,
  createRemoteInterpolationClock,
  createRestartRemoteInterpolationClock,
  duplicateRemoteMotionSample,
  observeRemoteSample,
  remoteMotionAt,
  remoteSampleIntervalMs,
  remoteMotionTransition,
  resetRemoteMotionCorrection,
  type RemoteInterpolationClock,
  type RemoteMotionCorrection,
} from "./remote-interpolation";
import {
  createRemoteBossAttackState,
  remoteBossAttackFrame,
  type RemoteBossAttackState,
} from "./remote-boss-attack";
import {
  decodePlayerMapFrame,
  decodePlayerMotionFrame,
  type PlayerMapSample,
} from "../../../shared/player-motion-frame";
import {
  samePlayerMotionInterest,
  selectPlayerMotionInterest,
} from "../../../shared/player-motion-interest";
import {
  movementUpdateReason,
  sanitizeMovementVelocity,
  type MovementInputKind,
  type SentMovementState,
} from "./sparse-movement";
import { createSpeedSyncTracker } from "./speed-sync";
import { startAfterSubscriptionEnds, unsubscribeIfActive } from "./subscription-handoff";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../../../shared/rules";
import type {
  LocalPlayerState,
  MapPlayerMarker,
  RemotePlayer,
  RemotePlayerDeath,
} from "../contracts";
import type { ChangePort, ReducerPort } from "../ports";
import type { ProfileDirectory } from "./profile-directory";
import type { PlayerProfileService } from "./player-profile-service";
import type { DeveloperService } from "./developer-service";

type RemotePlayerSample = {
  timelineAt: number;
  serverAtMs: number;
  receivedAt: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  simulationTick: number;
  motionEpoch: number;
  facing: number;
  moving: boolean;
};

type RemotePlayerTarget = RemotePlayer & {
  samples: RemotePlayerSample[];
  interpolationClock: RemoteInterpolationClock;
  motionCorrection: RemoteMotionCorrection;
  lastInputSequence: number;
  bossAttackState?: RemoteBossAttackState;
};

type PlayerInterestArea = { left: number; top: number; right: number; bottom: number };
type MapZoneBounds = { mapId: string; minZoneX: number; maxZoneX: number; minZoneY: number; maxZoneY: number };

type PresenceServiceDependencies = {
  reducers: ReducerPort;
  changes: ChangePort;
  localIdentity: () => string;
  localDbIdentity: () => Identity | null;
  hydrationReady: () => boolean;
  worldEntryReady: () => boolean;
  sessionConflict: () => boolean;
  authTabId: () => string;
  onControllerConflict: () => void;
  directory: ProfileDirectory;
  profiles: PlayerProfileService;
  developer: DeveloperService;
};

type PlayerRow = RemoteEquipment & {
  identity: Identity;
  x: number;
  y: number;
  facing: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  simulationTick: number;
  motionEpoch: number;
  moving: boolean;
  power: number;
  powerLevel: number;
  speed: number;
  isVisible: boolean;
  lastInputAt: { microsSinceUnixEpoch: bigint };
  lastInputSequence: number;
  controllerTabId: string;
  mapId: string;
};

type MotionIdentityRow = {
  networkId: number;
  identity: Identity;
  mapId: string;
  isVisible: boolean;
  zoneX: number;
  zoneY: number;
  displayName: string;
  profileIcon: number;
  playerSprite: number;
  skinTone: number;
  isGuest: boolean;
  gender: number;
};

const MAP_PLAYER_ZONE_SIZE = 1_000;
const MAP_PLAYER_ZONE_RADIUS = 2;
const MAP_PLAYER_PREFETCH_ZONES = 1;
const MAX_MAP_ZONE_X = Math.floor((WORLD_WIDTH - 1) / MAP_PLAYER_ZONE_SIZE);
const MAX_MAP_ZONE_Y = Math.floor((WORLD_HEIGHT - 1) / MAP_PLAYER_ZONE_SIZE);
const REMOTE_SAMPLE_LIMIT = 8;
const REMOTE_PLAYER_DEATH_TTL_MS = 4_250;

function serverTimestampMs(timestamp: { microsSinceUnixEpoch: bigint }) {
  return Number(timestamp.microsSinceUnixEpoch) / 1_000;
}

function appendRemoteMotionSample(existing: RemotePlayerTarget, sample: Omit<RemotePlayerSample, "timelineAt">) {
  const latest = existing.samples[existing.samples.length - 1];
  if (!latest || sample.serverAtMs <= latest.serverAtMs) return;
  if (duplicateRemoteMotionSample(latest, sample)) return;

  const transition = remoteMotionTransition(latest, sample);
  const movementRestarted = transition === "restart";
  const motionDiscontinuity = transition === "discontinuity";
  if (!movementRestarted && !motionDiscontinuity) {
    observeRemoteSample(
      existing.interpolationClock,
      remoteSampleIntervalMs(latest, sample),
      sample.receivedAt - latest.receivedAt,
    );
  }
  if (movementRestarted || motionDiscontinuity) {
    existing.samples.length = 0;
    existing.samples.push({ ...sample, timelineAt: sample.receivedAt });
    existing.interpolationClock = movementRestarted
      ? createRestartRemoteInterpolationClock(sample.receivedAt)
      : createRemoteInterpolationClock(sample.receivedAt);
    resetRemoteMotionCorrection(existing.motionCorrection, sample.receivedAt);
  } else {
    const renderAt = adaptiveRemoteRenderAt(existing.interpolationClock, sample.receivedAt);
    appendRemoteCorrectionSample(existing.samples, sample, renderAt, existing.speed, existing.motionCorrection);
  }
  while (existing.samples.length > REMOTE_SAMPLE_LIMIT) existing.samples.shift();
  existing.moving = sample.moving;
}

export function createPresenceService(dependencies: PresenceServiceDependencies) {
  const players = new Map<string, RemotePlayerTarget>();
  const motionIdentities = new Map<number, string>();
  const activeMotionIdentities = new Set<string>();
  const playerMaps = new Map<string, string>();
  const remotePlayerRenderBuffer: RemotePlayer[] = [];
  const mapPlayerMarkers = new Map<string, MapPlayerMarker>();
  const detailedMotionIdentities = new Set<string>();
  const detailedMotionReadyNetworkIds = new Set<number>();
  const remotePlayerDeaths = new Map<string, RemotePlayerDeath>();
  const speedSyncTracker = createSpeedSyncTracker();
  let mapPlayerSubscription: SubscriptionHandle | null = null;
  let mapSubscriptionGeneration = 0;
  let mapSubscriptionAreaKey = "";
  let mapPlayerInterestBounds: MapZoneBounds | null = null;
  let mapPlayerSubscriptionTransitioning = false;
  let mapMarkerSubscription: SubscriptionHandle | null = null;
  let mapMarkerSubscriptionGeneration = 0;
  let currentMapId = TUTORIAL_FOREST_MAP_ID;
  let localMotionNetworkId: number | null = null;
  let latestMapSamples: readonly PlayerMapSample[] = [];
  let desiredMotionNetworkIds: number[] = [];
  let submittedMotionNetworkIds: number[] = [];
  let motionInterestInFlight = false;
  let lastSentMovement: SentMovementState | null = null;
  let nextPositionSequence = 0;
  let localSimulationTick = 0;
  let localMotionEpoch = 0;
  let localState: LocalPlayerState | null = null;
  let onlinePlayerCount = 0;

  function advanceLocalMotionEpoch() {
    localMotionEpoch = (localMotionEpoch + 1) & 0xffff;
    if (localMotionEpoch === 0) localMotionEpoch = 1;
  }

  function rebuildDetailedMotionIdentities() {
    detailedMotionIdentities.clear();
    for (const networkId of desiredMotionNetworkIds) {
      if (!detailedMotionReadyNetworkIds.has(networkId)) continue;
      const identity = motionIdentities.get(networkId);
      if (identity && identity !== dependencies.localIdentity()) detailedMotionIdentities.add(identity);
    }
  }

  function submitMotionInterest() {
    const connection = dependencies.reducers.connection();
    if (
      motionInterestInFlight ||
      dependencies.reducers.protocolBlocked() ||
      dependencies.reducers.worldEntryBlocked() ||
      !connection?.isActive ||
      !dependencies.hydrationReady() ||
      !dependencies.worldEntryReady() ||
      samePlayerMotionInterest(desiredMotionNetworkIds, submittedMotionNetworkIds)
    ) return;
    const submitted = [...desiredMotionNetworkIds];
    submittedMotionNetworkIds = submitted;
    motionInterestInFlight = true;
    dependencies.reducers.sendReducer(
      "motion interest",
      (current) => current.reducers.setPlayerMotionInterest({ networkIds: submitted }),
      () => {
        motionInterestInFlight = false;
        if (samePlayerMotionInterest(submittedMotionNetworkIds, submitted)) submittedMotionNetworkIds = [];
      },
      () => {
        motionInterestInFlight = false;
        submitMotionInterest();
      },
    );
  }

  function refreshMotionInterest() {
    if (mapPlayerSubscriptionTransitioning) return;
    const position = localState;
    const next = position
      ? selectPlayerMotionInterest({
        samples: latestMapSamples,
        originX: position.x,
        originY: position.y,
        localNetworkId: localMotionNetworkId,
        availableNetworkIds: new Set(motionIdentities.keys()),
        previousNetworkIds: desiredMotionNetworkIds,
      })
      : [];
    if (samePlayerMotionInterest(next, desiredMotionNetworkIds)) return;
    desiredMotionNetworkIds = next;
    for (const networkId of detailedMotionReadyNetworkIds) {
      if (!desiredMotionNetworkIds.includes(networkId)) detailedMotionReadyNetworkIds.delete(networkId);
    }
    rebuildDetailedMotionIdentities();
    submitMotionInterest();
  }

  function resetMotionInterest() {
    latestMapSamples = [];
    desiredMotionNetworkIds = [];
    submittedMotionNetworkIds = [];
    detailedMotionIdentities.clear();
    detailedMotionReadyNetworkIds.clear();
    motionInterestInFlight = false;
  }

  function appendPlayerSample(existing: RemotePlayerTarget, row: PlayerRow, serverAtMs: number, receivedAt: number) {
    const latest = existing.samples[existing.samples.length - 1];
    const motionDiscontinuity = latest?.motionEpoch !== row.motionEpoch;
    if (!motionDiscontinuity && row.lastInputSequence <= existing.lastInputSequence) return;
    if (motionDiscontinuity || !row.moving || row.moving !== existing.moving) {
      appendRemoteMotionSample(existing, {
        serverAtMs,
        receivedAt,
        x: row.x,
        y: row.y,
        vx: row.vx,
        vy: row.vy,
        simulationTick: row.simulationTick,
        motionEpoch: row.motionEpoch,
        facing: row.facing,
        moving: row.moving,
      });
    }
    existing.lastInputSequence = row.lastInputSequence;
  }

  function upsertPlayer(row: PlayerRow) {
    const id = row.identity.toHexString();
    if (id === dependencies.localIdentity()) {
      localMotionEpoch = row.motionEpoch & 0xffff;
      speedSyncTracker.observe(row.speed);
      const nextMapId = row.mapId || TUTORIAL_FOREST_MAP_ID;
      const firstLocalState = localState === null;
      const presenceChanged = dependencies.developer.api.developerPresenceVisible() !== row.isVisible;
      const conflictBefore = dependencies.sessionConflict();
      playerMaps.set(id, nextMapId);
      dependencies.developer.observePresence(row.isVisible);
      if (dependencies.worldEntryReady() && row.controllerTabId && row.controllerTabId !== dependencies.authTabId()) {
        dependencies.onControllerConflict();
      }
      const mapChanged = currentMapId !== nextMapId;
      currentMapId = nextMapId;
      const acceptServerPosition = firstLocalState || mapChanged || row.lastInputSequence >= (localState?.lastInputSequence ?? 0);
      localState = {
        x: acceptServerPosition ? row.x : localState?.x ?? row.x,
        y: acceptServerPosition ? row.y : localState?.y ?? row.y,
        facing: acceptServerPosition ? row.facing : localState?.facing ?? row.facing,
        speed: row.speed,
        moving: acceptServerPosition ? row.moving : localState?.moving ?? row.moving,
        lastInputSequence: Math.max(row.lastInputSequence, localState?.lastInputSequence ?? 0),
        mapId: currentMapId,
      };
      if (mapChanged) {
        players.clear();
        mapPlayerMarkers.clear();
        motionIdentities.clear();
        activeMotionIdentities.clear();
        resetMotionInterest();
      }
      refreshMapPlayerSubscription(mapChanged);
      refreshMapMarkerSubscription(mapChanged);
      if (firstLocalState || mapChanged || presenceChanged || conflictBefore !== dependencies.sessionConflict()) {
        dependencies.changes.notify();
      }
      return;
    }

    if (!row.isVisible) {
      dependencies.profiles.forgetPlayerMap(id);
      const mapRemoved = playerMaps.delete(id);
      const playerRemoved = players.delete(id);
      if (mapRemoved || playerRemoved || dependencies.profiles.isActive(id)) dependencies.changes.notify();
      return;
    }

    const nextMapId = row.mapId || TUTORIAL_FOREST_MAP_ID;
    dependencies.profiles.observePlayerMap(id, nextMapId);
    const previousMapId = playerMaps.get(id);
    playerMaps.set(id, nextMapId);

    if (nextMapId !== currentMapId) {
      const removed = players.delete(id);
      if (removed || (previousMapId !== nextMapId && dependencies.profiles.isActive(id))) dependencies.changes.notify();
      return;
    }

    const receivedAt = performance.now();
    const serverAtMs = serverTimestampMs(row.lastInputAt);
    const existing = players.get(id);
    const equipment = remoteEquipmentFromRow(row);
    if (existing) {
      appendPlayerSample(existing, row, serverAtMs, receivedAt);
      existing.speed = row.speed;
      existing.power = row.powerLevel;
      Object.assign(existing, equipment);
    } else {
      players.set(id, {
        id,
        name: dependencies.directory.api.playerDisplayName(id),
        power: row.powerLevel,
        x: row.x,
        y: row.y,
        speed: row.speed,
        facing: row.facing,
        moving: row.moving,
        ...equipment,
        samples: [{
          timelineAt: receivedAt,
          serverAtMs,
          receivedAt,
          x: row.x,
          y: row.y,
          vx: row.vx,
          vy: row.vy,
          simulationTick: row.simulationTick,
          motionEpoch: row.motionEpoch,
          facing: row.facing,
          moving: row.moving,
        }],
        interpolationClock: createRemoteInterpolationClock(receivedAt),
        motionCorrection: createRemoteMotionCorrection(receivedAt),
        lastInputSequence: row.lastInputSequence,
      });
      dependencies.changes.notify();
    }
  }

  function removePlayer(row: { identity: Identity }) {
    const identity = row.identity.toHexString();
    const playerRemoved = players.delete(identity);
    remotePlayerDeaths.delete(identity);
    const mapRemoved = playerMaps.delete(identity);
    const profileMapRemoved = dependencies.profiles.forgetPlayerMap(identity);
    if (playerRemoved || mapRemoved || profileMapRemoved || dependencies.profiles.isActive(identity)) dependencies.changes.notify();
  }

  function upsertMotionIdentity(row: MotionIdentityRow) {
    const identity = row.identity.toHexString();
    if (identity === dependencies.localIdentity()) localMotionNetworkId = row.networkId;
    if (identity !== dependencies.localIdentity() && (!row.isVisible || row.mapId !== currentMapId)) {
      removeMotionIdentity(row);
      return;
    }
    for (const [networkId, mappedIdentity] of motionIdentities) {
      if (mappedIdentity === identity && networkId !== row.networkId) motionIdentities.delete(networkId);
    }
    motionIdentities.set(row.networkId, identity);
    activeMotionIdentities.add(identity);
    dependencies.changes.batch(() => {
      dependencies.directory.tables.upsertProfile(row);
      dependencies.directory.tables.upsertAccountStatus(row);
      if (row.isVisible && row.mapId === currentMapId) playerMaps.set(identity, row.mapId);
      else playerMaps.delete(identity);
    });
    refreshMotionInterest();
  }

  function removeMotionIdentity(row: { networkId: number; identity: Identity }) {
    const identity = row.identity.toHexString();
    if (identity === dependencies.localIdentity() && localMotionNetworkId === row.networkId) localMotionNetworkId = null;
    if (motionIdentities.get(row.networkId) === identity) motionIdentities.delete(row.networkId);
    detailedMotionReadyNetworkIds.delete(row.networkId);
    activeMotionIdentities.delete(identity);
    const playerRemoved = players.delete(identity);
    remotePlayerDeaths.delete(identity);
    const markerRemoved = mapPlayerMarkers.delete(identity) || mapPlayerMarkers.delete(`network:${row.networkId}`);
    const mapRemoved = playerMaps.delete(identity);
    refreshMotionInterest();
    if (playerRemoved || markerRemoved || mapRemoved) dependencies.changes.notify();
  }

  function upsertPlayerMotionFrame(row: { emittedAt: { microsSinceUnixEpoch: bigint }; playerCount: number; payload: Uint8Array }) {
    let samples;
    try {
      samples = decodePlayerMotionFrame(row.payload, row.playerCount);
    } catch (error) {
      console.warn("Ignored malformed Wildwood movement frame:", error);
      return;
    }
    const receivedAt = performance.now();
    const serverAtMs = serverTimestampMs(row.emittedAt);
    let readinessChanged = false;
    for (const sample of samples) {
      if (!desiredMotionNetworkIds.includes(sample.networkId)) continue;
      const identity = motionIdentities.get(sample.networkId);
      if (!identity || identity === dependencies.localIdentity()) continue;
      const existing = players.get(identity);
      if (!existing) continue;
      appendRemoteMotionSample(existing, {
        serverAtMs,
        receivedAt,
        x: sample.x,
        y: sample.y,
        vx: sample.vx,
        vy: sample.vy,
        simulationTick: sample.simulationTick,
        motionEpoch: sample.motionEpoch,
        facing: sample.vx < 0 ? Math.PI : sample.vx > 0 ? 0 : existing.facing,
        moving: sample.vx !== 0 || sample.vy !== 0,
      });
      if (!detailedMotionReadyNetworkIds.has(sample.networkId)) {
        detailedMotionReadyNetworkIds.add(sample.networkId);
        readinessChanged = true;
      }
    }
    if (readinessChanged) rebuildDetailedMotionIdentities();
  }

  function upsertPlayerMapFrame(row: { mapId: string; playerCount: number; payload: Uint8Array }) {
    if (row.mapId !== currentMapId) return;
    let samples;
    try {
      samples = decodePlayerMapFrame(row.payload, row.playerCount);
    } catch (error) {
      console.warn("Ignored malformed Wildwood minimap frame:", error);
      return;
    }
    latestMapSamples = samples;
    mapPlayerMarkers.clear();
    for (const sample of samples) {
      if (sample.networkId === localMotionNetworkId) continue;
      const markerId = motionIdentities.get(sample.networkId) ?? `network:${sample.networkId}`;
      mapPlayerMarkers.set(markerId, { id: markerId, x: sample.x, y: sample.y });
    }
    refreshMotionInterest();
  }

  function upsertBossAttackFrame(row: {
    mapId: string;
    networkId: number;
    attackerX: number;
    attackerY: number;
    targetX: number;
    targetY: number;
    targetRadius: number;
    hits: number;
  }) {
    if (row.mapId !== currentMapId) return;
    const identity = motionIdentities.get(row.networkId);
    if (!identity || identity === dependencies.localIdentity()) return;
    const player = players.get(identity);
    if (!player) return;
    player.bossAttackState = createRemoteBossAttackState({
      attackerX: row.attackerX,
      attackerY: row.attackerY,
      targetX: row.targetX,
      targetY: row.targetY,
      targetRadius: row.targetRadius,
      hits: row.hits,
    }, performance.now());
  }

  function upsertPlayerDeathFrame(row: { mapId: string; networkId: number; playerX: number; playerY: number; facing: number }) {
    if (row.mapId !== currentMapId) return;
    const identity = motionIdentities.get(row.networkId);
    if (!identity || identity === dependencies.localIdentity() || !players.has(identity)) return;
    remotePlayerDeaths.set(identity, {
      id: identity,
      mapId: row.mapId,
      x: row.playerX,
      y: row.playerY,
      facing: row.facing,
      startedAtMs: performance.now(),
    });
  }

  function upsertWorldStatus(row: { id: number; onlinePlayers: number }) {
    if (row.id !== 0) return;
    onlinePlayerCount = Math.max(0, row.onlinePlayers);
    dependencies.changes.notify();
  }

  function releaseMapPlayerSubscription() {
    mapSubscriptionGeneration += 1;
    unsubscribeIfActive(mapPlayerSubscription);
    mapPlayerSubscription = null;
    mapSubscriptionAreaKey = "";
    mapPlayerInterestBounds = null;
    mapPlayerSubscriptionTransitioning = false;
  }

  function releaseMapMarkerSubscription() {
    mapMarkerSubscriptionGeneration += 1;
    mapMarkerSubscription?.unsubscribe();
    mapMarkerSubscription = null;
  }

  function refreshMapMarkerSubscription(force = false) {
    const connection = dependencies.reducers.connection();
    const selfIdentity = dependencies.localDbIdentity();
    if (!connection?.isActive || !dependencies.hydrationReady() || !selfIdentity) return;
    if (!force && mapMarkerSubscription) return;

    const previous = mapMarkerSubscription;
    const generation = ++mapMarkerSubscriptionGeneration;
    const mapId = currentMapId;
    const next = connection
      .subscriptionBuilder()
      .onApplied(() => {
        if (dependencies.reducers.connection() !== connection || generation !== mapMarkerSubscriptionGeneration) return;
        previous?.unsubscribe();
      })
      .onError((ctx) => {
        if (dependencies.reducers.connection() !== connection || generation !== mapMarkerSubscriptionGeneration) return;
        console.error("Wildwood map marker subscription error:", ctx.event);
        mapMarkerSubscription = previous;
      })
      .subscribe([
        tables.playerMapFrame.where((frame) => frame.mapId.eq(mapId)),
        tables.playerMotionDetailFrame.where((frame) => frame.recipient.eq(selfIdentity)),
      ]);
    mapMarkerSubscription = next;
  }

  function reconcileMapPlayerSubscription(connection: NonNullable<ReturnType<ReducerPort["connection"]>>) {
    const motionRows = [...connection.db.playerMotionIdentity.iter()];
    const playerRows = [...connection.db.player.iter()];
    const currentNetworkIds = new Set(motionRows.map((row) => row.networkId));
    const currentPlayerIds = new Set(playerRows.map((row) => row.identity.toHexString()));

    dependencies.changes.batch(() => {
      let removed = false;
      for (const [networkId, identity] of motionIdentities) {
        if (currentNetworkIds.has(networkId)) continue;
        motionIdentities.delete(networkId);
        activeMotionIdentities.delete(identity);
        playerMaps.delete(identity);
        if (!currentPlayerIds.has(identity)) players.delete(identity);
        removed = true;
      }
      for (const identity of players.keys()) {
        if (identity === dependencies.localIdentity() || currentPlayerIds.has(identity)) continue;
        players.delete(identity);
        playerMaps.delete(identity);
        removed = true;
      }
      for (const row of motionRows) upsertMotionIdentity(row);
      for (const row of playerRows) upsertPlayer(row);
      refreshMotionInterest();
      if (removed) dependencies.changes.notify();
    });
  }

  function refreshMapPlayerSubscription(force = false, interestArea?: PlayerInterestArea) {
    const connection = dependencies.reducers.connection();
    const selfIdentity = dependencies.localDbIdentity();
    if (!connection?.isActive || !dependencies.hydrationReady() || !selfIdentity) return;
    const centerX = Math.floor((localState?.x ?? 0) / MAP_PLAYER_ZONE_SIZE);
    const centerY = Math.floor((localState?.y ?? 0) / MAP_PLAYER_ZONE_SIZE);
    if (interestArea && [interestArea.left, interestArea.top, interestArea.right, interestArea.bottom].every(Number.isFinite)) {
      const left = Math.min(interestArea.left, interestArea.right);
      const right = Math.max(interestArea.left, interestArea.right);
      const top = Math.min(interestArea.top, interestArea.bottom);
      const bottom = Math.max(interestArea.top, interestArea.bottom);
      mapPlayerInterestBounds = {
        mapId: currentMapId,
        minZoneX: Math.max(0, Math.floor(left / MAP_PLAYER_ZONE_SIZE) - MAP_PLAYER_PREFETCH_ZONES),
        maxZoneX: Math.min(MAX_MAP_ZONE_X, Math.floor(right / MAP_PLAYER_ZONE_SIZE) + MAP_PLAYER_PREFETCH_ZONES),
        minZoneY: Math.max(0, Math.floor(top / MAP_PLAYER_ZONE_SIZE) - MAP_PLAYER_PREFETCH_ZONES),
        maxZoneY: Math.min(MAX_MAP_ZONE_Y, Math.floor(bottom / MAP_PLAYER_ZONE_SIZE) + MAP_PLAYER_PREFETCH_ZONES),
      };
    }
    const bounds = mapPlayerInterestBounds?.mapId === currentMapId
      ? mapPlayerInterestBounds
      : {
        mapId: currentMapId,
        minZoneX: Math.max(0, centerX - MAP_PLAYER_ZONE_RADIUS),
        maxZoneX: Math.min(MAX_MAP_ZONE_X, centerX + MAP_PLAYER_ZONE_RADIUS),
        minZoneY: Math.max(0, centerY - MAP_PLAYER_ZONE_RADIUS),
        maxZoneY: Math.min(MAX_MAP_ZONE_Y, centerY + MAP_PLAYER_ZONE_RADIUS),
      };
    const areaKey = `${bounds.mapId}:${bounds.minZoneX}:${bounds.maxZoneX}:${bounds.minZoneY}:${bounds.maxZoneY}`;
    if (mapPlayerSubscriptionTransitioning) return;
    if (!force && mapPlayerSubscription && mapSubscriptionAreaKey === areaKey) return;

    const previous = mapPlayerSubscription;
    const previousAreaKey = mapSubscriptionAreaKey;
    const generation = ++mapSubscriptionGeneration;
    mapSubscriptionAreaKey = areaKey;
    mapPlayerSubscriptionTransitioning = true;
    const nearbyPlayers = tables.player.where((row) => row
      .mapId.eq(currentMapId)
      .and(row.isVisible.eq(true))
      .and(row.identity.ne(selfIdentity))
      .and(row.zoneX.gte(bounds.minZoneX))
      .and(row.zoneX.lte(bounds.maxZoneX))
      .and(row.zoneY.gte(bounds.minZoneY))
      .and(row.zoneY.lte(bounds.maxZoneY)));
    const nearbyMotionIdentities = tables.playerMotionIdentity.where((row) => row
      .mapId.eq(currentMapId)
      .and(row.isVisible.eq(true))
      .and(row.identity.ne(selfIdentity))
      .and(row.zoneX.gte(bounds.minZoneX))
      .and(row.zoneX.lte(bounds.maxZoneX))
      .and(row.zoneY.gte(bounds.minZoneY))
      .and(row.zoneY.lte(bounds.maxZoneY)));
    const nearbyBossAttacks = tables.bossAttackFrame.where((row) => row
      .mapId.eq(currentMapId)
      .and(row.zoneX.gte(bounds.minZoneX))
      .and(row.zoneX.lte(bounds.maxZoneX))
      .and(row.zoneY.gte(bounds.minZoneY))
      .and(row.zoneY.lte(bounds.maxZoneY)));
    const nearbyPlayerDeaths = tables.playerDeathFrame.where((row) => row
      .mapId.eq(currentMapId)
      .and(row.zoneX.gte(bounds.minZoneX))
      .and(row.zoneX.lte(bounds.maxZoneX))
      .and(row.zoneY.gte(bounds.minZoneY))
      .and(row.zoneY.lte(bounds.maxZoneY)));

    let next: SubscriptionHandle | null = null;
    const subscribeNext = () => {
      if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration || !connection.isActive) return;
      if (mapPlayerSubscription === previous) mapPlayerSubscription = null;
      try {
        next = connection
          .subscriptionBuilder()
          .onApplied(() => {
            if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration || mapPlayerSubscription !== next) {
              unsubscribeIfActive(next);
              return;
            }
            reconcileMapPlayerSubscription(connection);
            mapPlayerSubscriptionTransitioning = false;
            refreshMotionInterest();
            queueMicrotask(() => refreshMapPlayerSubscription(false));
          })
          .onError((ctx) => {
            if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration) return;
            console.error("Wildwood map player subscription error:", ctx.event);
            mapPlayerSubscription = null;
            mapSubscriptionAreaKey = "";
            mapPlayerSubscriptionTransitioning = false;
            window.setTimeout(() => refreshMapPlayerSubscription(true), 1_000);
          })
          .subscribe([nearbyPlayers, nearbyMotionIdentities, nearbyBossAttacks, nearbyPlayerDeaths]);
        mapPlayerSubscription = next;
      } catch (error) {
        if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration) return;
        console.error("Wildwood map player subscription error:", error);
        mapPlayerSubscription = null;
        mapSubscriptionAreaKey = "";
        mapPlayerSubscriptionTransitioning = false;
      }
    };
    startAfterSubscriptionEnds(previous, subscribeNext, (error) => {
      if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration) return;
      console.error("Wildwood map player subscription handoff error:", error);
      mapPlayerSubscription = previous;
      mapSubscriptionAreaKey = previousAreaKey;
      mapPlayerSubscriptionTransitioning = false;
    });
  }

  function syncMovementState(
    x: number,
    y: number,
    vx: number,
    vy: number,
    inputKind: MovementInputKind = "keyboard",
    force = false,
    interestArea?: PlayerInterestArea,
  ) {
    const connection = dependencies.reducers.connection();
    if (dependencies.reducers.protocolBlocked() || !connection || !Number.isFinite(x) || !Number.isFinite(y)) return;
    localSimulationTick = (localSimulationTick + 1) >>> 0;
    refreshMapPlayerSubscription(false, interestArea);
    const now = performance.now();
    const velocity = sanitizeMovementVelocity(vx, vy);
    if (!movementUpdateReason({ now, velocity, inputKind, lastSent: lastSentMovement, force })) return;

    lastSentMovement = { ...velocity, sentAt: now };
    const sequence = ++nextPositionSequence;
    if (localState) {
      localState.x = x;
      localState.y = y;
      if (velocity.vx < 0) localState.facing = Math.PI;
      else if (velocity.vx > 0) localState.facing = 0;
      localState.moving = velocity.moving;
      localState.lastInputSequence = sequence;
    }
    dependencies.reducers.sendReducer(
      "movement state",
      (current) => current.reducers.updateMovementState({
        x,
        y,
        vx: velocity.vx,
        vy: velocity.vy,
        simulationTick: localSimulationTick,
        motionEpoch: localMotionEpoch,
        sequence,
      }),
    );
  }

  return {
    tables: {
      upsertPlayer,
      removePlayer,
      upsertMotionIdentity,
      removeMotionIdentity,
      upsertPlayerMotionFrame,
      upsertPlayerMapFrame,
      upsertBossAttackFrame,
      upsertPlayerDeathFrame,
      upsertWorldStatus,
    },
    api: {
      localState: () => localState,
      syncSpeed(speed: number) {
        if (
          dependencies.reducers.protocolBlocked() ||
          dependencies.reducers.worldEntryBlocked() ||
          !dependencies.reducers.connection() ||
          !speedSyncTracker.begin(speed, performance.now())
        ) return;
        dependencies.reducers.sendReducer(
          "speed sync",
          (connection) => connection.reducers.setSpeed({ speed }),
          () => speedSyncTracker.reject(speed, performance.now()),
          () => speedSyncTracker.accept(speed),
        );
      },
      syncMovementState,
      correctMovementPosition(x: number, y: number, stop = false) {
        if (stop) advanceLocalMotionEpoch();
        const velocity = stop || !lastSentMovement ? { vx: 0, vy: 0 } : lastSentMovement;
        syncMovementState(x, y, velocity.vx, velocity.vy, "keyboard", true);
      },
      async changeMap(mapId: string, x: number, y: number) {
        const connection = dependencies.reducers.connection();
        if (
          dependencies.reducers.protocolBlocked() ||
          dependencies.reducers.worldEntryBlocked() ||
          !connection ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          ![TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID, INFERNAL_DEPTHS_MAP_ID].includes(mapId)
        ) return false;
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.changeMap({ mapId, x, y }));
          return true;
        } catch (error) {
          dependencies.reducers.handleFailure("map change", error);
          return false;
        }
      },
      remotePlayers() {
        const result = remotePlayerRenderBuffer;
        result.length = 0;
        const now = performance.now();
        for (const player of players.values()) {
          if (player.id === dependencies.localIdentity() || !detailedMotionIdentities.has(player.id)) continue;
          const renderAt = adaptiveRemoteRenderAt(player.interpolationClock, now);
          const motion = applyRemoteMotionCorrection(
            remoteMotionAt(player.samples, renderAt),
            player.motionCorrection,
            now,
            player.speed,
          );
          player.x = motion.x;
          player.y = motion.y;
          player.facing = motion.facing;
          player.moving = motion.moving;
          const bossAttack = remoteBossAttackFrame(player.bossAttackState, now);
          if (bossAttack) {
            player.facing = bossAttack.facing;
            player.throwClock = bossAttack.throwClock;
            player.bossAttack = bossAttack.visual;
          } else {
            player.bossAttackState = undefined;
            player.throwClock = undefined;
            player.bossAttack = undefined;
          }
          result.push(player);
        }
        return result;
      },
      remotePlayerCount() {
        return detailedMotionIdentities.size;
      },
      remotePlayerDeath(identity: string) {
        const death = remotePlayerDeaths.get(identity);
        if (!death) return null;
        if (death.mapId !== currentMapId || performance.now() - death.startedAtMs > REMOTE_PLAYER_DEATH_TTL_MS) {
          remotePlayerDeaths.delete(identity);
          return null;
        }
        return { ...death };
      },
      mapPlayerMarkers: () => [...mapPlayerMarkers.values()],
      onlinePlayerCount: () => onlinePlayerCount,
      hasRemotePlayerInArea(minX: number, minY: number, maxX: number, maxY: number) {
        for (const player of players.values()) {
          if (player.id === dependencies.localIdentity() || !detailedMotionIdentities.has(player.id)) continue;
          const latest = player.samples[player.samples.length - 1];
          const x = latest?.x ?? player.x;
          const y = latest?.y ?? player.y;
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
        }
        return false;
      },
    },
    localState: () => localState,
    currentMapId: () => currentMapId,
    mapFor: (identity: string) => playerMaps.get(identity),
    hasActiveMotion: (identity: string) => activeMotionIdentities.has(identity),
    renameRemotePlayer(identity: string, displayName: string) {
      const player = players.get(identity);
      if (player) player.name = displayName;
    },
    reserveStoppedMotion() {
      localSimulationTick = (localSimulationTick + 1) >>> 0;
      return {
        sequence: ++nextPositionSequence,
        simulationTick: localSimulationTick,
        motionEpoch: localMotionEpoch,
      };
    },
    commitStoppedPosition(position: { x: number; y: number }, sequence: number) {
      lastSentMovement = { vx: 0, vy: 0, moving: false, sentAt: performance.now() };
      if (localState) {
        localState.x = position.x;
        localState.y = position.y;
        localState.moving = false;
        localState.lastInputSequence = sequence;
      }
    },
    isSubscriptionTransitioning: () => mapPlayerSubscriptionTransitioning,
    activeSubscriptionCount: () => Number(Boolean(mapPlayerSubscription)) + Number(Boolean(mapMarkerSubscription)),
    activateSubscriptions() {
      refreshMapPlayerSubscription(true);
      refreshMapMarkerSubscription(true);
    },
    beginSession(identityChanged: boolean) {
      lastSentMovement = null;
      nextPositionSequence = 0;
      localSimulationTick = 0;
      submittedMotionNetworkIds = [];
      motionInterestInFlight = false;
      advanceLocalMotionEpoch();
      speedSyncTracker.reset();
      if (identityChanged) localState = null;
    },
    markDisconnected() {
      lastSentMovement = null;
      nextPositionSequence = 0;
      localSimulationTick = 0;
      submittedMotionNetworkIds = [];
      motionInterestInFlight = false;
      speedSyncTracker.reset();
    },
    clearSession() {
      releaseMapPlayerSubscription();
      releaseMapMarkerSubscription();
      players.clear();
      remotePlayerDeaths.clear();
      mapPlayerMarkers.clear();
      motionIdentities.clear();
      activeMotionIdentities.clear();
      resetMotionInterest();
      localMotionNetworkId = null;
      onlinePlayerCount = 0;
      playerMaps.clear();
    },
  };
}

export type PresenceService = ReturnType<typeof createPresenceService>;
