import type { Identity } from "spacetimedb";
import { tables, type SubscriptionHandle } from "../../module_bindings";
import { remoteEquipmentFromRow, type RemoteEquipment } from "./remote-equipment";
import {
  adaptiveRemoteRenderAt,
  applyRemoteMotionCorrection,
  appendRemoteCorrectionSample,
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
  PLAYER_SPEED,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
} from "../../../shared/rules";
import type {
  LocalPlayerState,
  MapPlayerMarker,
  RemotePlayer,
  RemotePlayerDeath,
} from "../contracts";
import type { ChangePort, ReducerPort } from "../ports";
import type { ProfileDirectory } from "./profile-directory";
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
  bossAttackState?: RemoteBossAttackState;
};

type PlayerInterestArea = { left: number; top: number; right: number; bottom: number };

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
  developer: DeveloperService;
};

type PlayerRow = {
  identity: Identity;
  x: number;
  y: number;
  facing: number;
  motionEpoch: number;
  moving: boolean;
  speed: number;
  isVisible: boolean;
  lastInputSequence: number;
  controllerTabId: string;
  mapId: string;
};

type PlayerPresentationRow = RemoteEquipment & {
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
  speed: number;
  powerLevel: number;
};

function samePlayerPresentation(left: PlayerPresentationRow | undefined, right: PlayerPresentationRow) {
  if (!left) return false;
  // zoneX/zoneY are physical compatibility columns, not presentation state.
  return left.networkId === right.networkId &&
    left.mapId === right.mapId &&
    left.isVisible === right.isVisible &&
    left.displayName === right.displayName &&
    left.profileIcon === right.profileIcon &&
    left.playerSprite === right.playerSprite &&
    left.skinTone === right.skinTone &&
    left.isGuest === right.isGuest &&
    left.gender === right.gender &&
    left.speed === right.speed &&
    left.powerLevel === right.powerLevel &&
    left.feetItem === right.feetItem &&
    left.headItem === right.headItem &&
    left.chestItem === right.chestItem &&
    left.rightHandItem === right.rightHandItem &&
    left.leftHandItem === right.leftHandItem;
}

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
  const presentations = new Map<string, PlayerPresentationRow>();
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
  let mapPlayerSubscriptionTransitioning = false;
  let mapSubscriptionRefreshPending = false;
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
        const stalePresentations = [...presentations.entries()]
          .filter(([identity]) => identity !== id)
          .map(([, presentation]) => presentation);
        players.clear();
        presentations.clear();
        mapPlayerMarkers.clear();
        motionIdentities.clear();
        activeMotionIdentities.clear();
        playerMaps.clear();
        playerMaps.set(id, nextMapId);
        dependencies.changes.batch(() => {
          for (const presentation of stalePresentations) {
            dependencies.directory.tables.removeProfile(presentation);
            dependencies.directory.tables.removeAccountStatus(presentation);
          }
        });
        resetMotionInterest();
      }
      refreshMapPlayerSubscription(mapChanged);
      refreshMapMarkerSubscription(mapChanged);
      if (firstLocalState || mapChanged || presenceChanged || conflictBefore !== dependencies.sessionConflict()) {
        dependencies.changes.notify();
      }
      return;
    }
  }

  function removePlayer(row: { identity: Identity }) {
    const identity = row.identity.toHexString();
    // Remote player rows may appear briefly for profile/debug subscriptions.
    // Their lifecycle is owned exclusively by stable presentation rows.
    if (identity !== dependencies.localIdentity()) return;
    if (playerMaps.delete(identity)) dependencies.changes.notify();
  }

  function applyPresentation(player: RemotePlayerTarget, row: PlayerPresentationRow) {
    player.name = row.displayName || dependencies.directory.api.playerDisplayName(player.id);
    player.power = Number.isFinite(row.powerLevel) ? Math.max(0, row.powerLevel) : 0;
    player.speed = Number.isFinite(row.speed) && row.speed > 0 ? row.speed : PLAYER_SPEED;
    Object.assign(player, remoteEquipmentFromRow(row));
  }

  function createRemotePlayer(
    identity: string,
    row: PlayerPresentationRow,
    sample: ReturnType<typeof decodePlayerMotionFrame>[number],
    serverAtMs: number,
    receivedAt: number,
  ) {
    const moving = sample.vx !== 0 || sample.vy !== 0;
    const facing = sample.vx < 0 ? Math.PI : 0;
    const player: RemotePlayerTarget = {
      id: identity,
      name: row.displayName || dependencies.directory.api.playerDisplayName(identity),
      power: Number.isFinite(row.powerLevel) ? Math.max(0, row.powerLevel) : 0,
      x: sample.x,
      y: sample.y,
      speed: Number.isFinite(row.speed) && row.speed > 0 ? row.speed : PLAYER_SPEED,
      facing,
      moving,
      ...remoteEquipmentFromRow(row),
      samples: [{
        timelineAt: receivedAt,
        serverAtMs,
        receivedAt,
        x: sample.x,
        y: sample.y,
        vx: sample.vx,
        vy: sample.vy,
        simulationTick: sample.simulationTick,
        motionEpoch: sample.motionEpoch,
        facing,
        moving,
      }],
      interpolationClock: createRemoteInterpolationClock(receivedAt),
      motionCorrection: createRemoteMotionCorrection(receivedAt),
    };
    return player;
  }

  function upsertMotionIdentity(row: PlayerPresentationRow) {
    const identity = row.identity.toHexString();
    const presentationChanged = !samePlayerPresentation(presentations.get(identity), row);
    if (identity === dependencies.localIdentity()) localMotionNetworkId = row.networkId;
    if (identity !== dependencies.localIdentity() && (!row.isVisible || row.mapId !== currentMapId)) {
      removeMotionIdentity(row);
      return;
    }
    for (const [networkId, mappedIdentity] of motionIdentities) {
      if (mappedIdentity !== identity || networkId === row.networkId) continue;
      motionIdentities.delete(networkId);
      detailedMotionReadyNetworkIds.delete(networkId);
    }
    motionIdentities.set(row.networkId, identity);
    activeMotionIdentities.add(identity);
    presentations.set(identity, row);
    if (presentationChanged) {
      const player = players.get(identity);
      if (player) applyPresentation(player, row);
      dependencies.changes.batch(() => {
        dependencies.directory.tables.upsertProfile(row);
        dependencies.directory.tables.upsertAccountStatus(row);
        if (row.isVisible && row.mapId === currentMapId) playerMaps.set(identity, row.mapId);
        else playerMaps.delete(identity);
      });
    }
    const pendingMarker = mapPlayerMarkers.get(`network:${row.networkId}`);
    if (pendingMarker) {
      mapPlayerMarkers.delete(`network:${row.networkId}`);
      mapPlayerMarkers.set(identity, { ...pendingMarker, id: identity });
    }
    refreshMotionInterest();
  }

  function removeMotionIdentity(row: { networkId: number; identity: Identity }) {
    const identity = row.identity.toHexString();
    if (identity === dependencies.localIdentity() && localMotionNetworkId === row.networkId) localMotionNetworkId = null;
    if (motionIdentities.get(row.networkId) === identity) motionIdentities.delete(row.networkId);
    presentations.delete(identity);
    detailedMotionReadyNetworkIds.delete(row.networkId);
    activeMotionIdentities.delete(identity);
    const playerRemoved = players.delete(identity);
    remotePlayerDeaths.delete(identity);
    const markerRemoved = mapPlayerMarkers.delete(identity);
    const networkMarkerRemoved = mapPlayerMarkers.delete(`network:${row.networkId}`);
    const mapRemoved = playerMaps.delete(identity);
    dependencies.changes.batch(() => {
      dependencies.directory.tables.removeProfile(row);
      dependencies.directory.tables.removeAccountStatus(row);
    });
    refreshMotionInterest();
    if (playerRemoved || markerRemoved || networkMarkerRemoved || mapRemoved) dependencies.changes.notify();
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
      let existing = players.get(identity);
      if (!existing) {
        const presentation = presentations.get(identity);
        if (!presentation) continue;
        existing = createRemotePlayer(identity, presentation, sample, serverAtMs, receivedAt);
        players.set(identity, existing);
        dependencies.changes.notify();
      } else {
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
      }
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
    mapPlayerSubscriptionTransitioning = false;
    mapSubscriptionRefreshPending = false;
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
    const currentNetworkIds = new Set(motionRows.map((row) => row.networkId));
    const localIdentity = dependencies.localIdentity();

    dependencies.changes.batch(() => {
      let removed = false;
      for (const [networkId, identity] of motionIdentities) {
        if (currentNetworkIds.has(networkId)) continue;
        if (identity === localIdentity) continue;
        const presentation = presentations.get(identity);
        motionIdentities.delete(networkId);
        detailedMotionReadyNetworkIds.delete(networkId);
        activeMotionIdentities.delete(identity);
        presentations.delete(identity);
        playerMaps.delete(identity);
        players.delete(identity);
        remotePlayerDeaths.delete(identity);
        mapPlayerMarkers.delete(identity);
        mapPlayerMarkers.delete(`network:${networkId}`);
        if (presentation) {
          dependencies.directory.tables.removeProfile(presentation);
          dependencies.directory.tables.removeAccountStatus(presentation);
        }
        removed = true;
      }
      for (const identity of players.keys()) {
        if (identity === localIdentity || presentations.has(identity)) continue;
        players.delete(identity);
        playerMaps.delete(identity);
        removed = true;
      }
      for (const row of motionRows) upsertMotionIdentity(row);
      refreshMotionInterest();
      if (removed) dependencies.changes.notify();
    });
  }

  function refreshMapPlayerSubscription(force = false) {
    const connection = dependencies.reducers.connection();
    const selfIdentity = dependencies.localDbIdentity();
    if (!connection?.isActive || !dependencies.hydrationReady() || !selfIdentity) return;
    const mapId = currentMapId;
    const areaKey = mapId;
    if (mapPlayerSubscriptionTransitioning) {
      if (force || mapSubscriptionAreaKey !== areaKey) mapSubscriptionRefreshPending = true;
      return;
    }
    if (!force && mapPlayerSubscription && mapSubscriptionAreaKey === areaKey) return;

    const previous = mapPlayerSubscription;
    const previousAreaKey = mapSubscriptionAreaKey;
    const generation = ++mapSubscriptionGeneration;
    mapSubscriptionAreaKey = areaKey;
    mapPlayerSubscriptionTransitioning = true;
    const mapPresentations = tables.playerMotionIdentity.where((row) => row
      .mapId.eq(mapId)
      .and(row.isVisible.eq(true))
      .and(row.identity.ne(selfIdentity)));
    const mapBossAttacks = tables.bossAttackFrame.where((row) => row.mapId.eq(mapId));
    const mapPlayerDeaths = tables.playerDeathFrame.where((row) => row.mapId.eq(mapId));

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
            const staleMap = currentMapId !== mapId;
            if (!staleMap) reconcileMapPlayerSubscription(connection);
            mapPlayerSubscriptionTransitioning = false;
            const refreshPending = mapSubscriptionRefreshPending || staleMap;
            mapSubscriptionRefreshPending = false;
            if (refreshPending) queueMicrotask(() => refreshMapPlayerSubscription(true));
            else refreshMotionInterest();
          })
          .onError((ctx) => {
            if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration) return;
            console.error("Wildwood map player subscription error:", ctx.event);
            mapPlayerSubscription = null;
            mapSubscriptionAreaKey = "";
            mapPlayerSubscriptionTransitioning = false;
            mapSubscriptionRefreshPending = false;
            window.setTimeout(() => refreshMapPlayerSubscription(true), 1_000);
          })
          .subscribe([mapPresentations, mapBossAttacks, mapPlayerDeaths]);
        mapPlayerSubscription = next;
      } catch (error) {
        if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration) return;
        console.error("Wildwood map player subscription error:", error);
        mapPlayerSubscription = null;
        mapSubscriptionAreaKey = "";
        mapPlayerSubscriptionTransitioning = false;
        mapSubscriptionRefreshPending = false;
      }
    };
    startAfterSubscriptionEnds(previous, subscribeNext, (error) => {
      if (dependencies.reducers.connection() !== connection || generation !== mapSubscriptionGeneration) return;
      console.error("Wildwood map player subscription handoff error:", error);
      mapPlayerSubscription = previous;
      mapSubscriptionAreaKey = previousAreaKey;
      mapPlayerSubscriptionTransitioning = false;
      mapSubscriptionRefreshPending = false;
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
    // Kept in the public signature for the renderer boundary; presentation is
    // stable for the whole map and no longer churns subscriptions with camera motion.
    void interestArea;
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
          ![TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID, INFERNAL_DEPTHS_MAP_ID, WATER_REACH_MAP_ID].includes(mapId)
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
      presentations.clear();
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
