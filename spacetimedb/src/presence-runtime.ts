// World presence and motion synchronisation: the analytical motion anchors
// (playerMotion), the remote presentation rows (playerMotionIdentity,
// playerMapMarker), the per-map population counters, the realtime frame
// schedules, saved world locations, the online-player count and the movement
// packet validation behind updateMovementState. The tables, the schema
// registration and the enterWorld/updateMovementState/runMaintenanceSweep
// reducer declarations stay in index.ts; this module only owns the bodies they
// call. enterWorldPresence also stays in index.ts because the cutscene history
// contract test reads its source there. Helpers that still live in index.ts
// arrive through createPresenceRuntime's deps so the moved code reads exactly
// as it did.
import { ScheduleAt } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { generatedMapUnlocked } from "./procedural-maps";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { generateMap, isProceduralMap, PROCEDURAL_ENTRY_BOSS } from "../../shared/procedural-maps";
import { HOME_EXTERIOR_MAP_ID, HOME_EXTERIOR_SPAWN, HOME_WORLD_WIDTH, HOME_WORLD_HEIGHT } from "../../shared/home";
import { BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS } from "../../shared/items";
import { PLAYER_MAP_FRAME_HZ, PLAYER_VELOCITY_SCALE, type PlayerMotionSample } from "../../shared/player-motion-frame";
import { PLAYER_MOTION_DETAIL_FRAME_HZ } from "../../shared/player-motion-interest";
import { analyticalPlayerMotionAt } from "../../shared/analytical-player-motion";
import { playerMotionSampleAt } from "../../shared/player-motion-sample";
import {
  BOSS_REWARD_CLAIM_BITS,
  PLAYER_RADIUS,
  PLAYER_SPAWN,
  PLAYER_SPEED,
  TUTORIAL_FOREST_MAP_ID,
} from "../../shared/rules";
import { accessibleCampaignMap } from "../../shared/equipment-access";

const MAX_PACKED_PLAYER_VELOCITY = 0x7fff / PLAYER_VELOCITY_SCALE;
// Movement packets are floats, so allow a tiny wire-format margin while
// still rejecting a client-provided velocity that exceeds its server-owned
// movement speed.  Position is still client-authored for smooth play, but a
// packet may not jump farther than server time and the owned speed allow.
export const MOVEMENT_SPEED_PACKET_TOLERANCE = 1;
// A short network/rendering margin covers a delayed mobile packet without
// making a speed-hacked position useful.  The allowance grows with the real
// server elapsed time between accepted movement packets.
export const MOVEMENT_POSITION_PACKET_TOLERANCE = 96;
export const PLAYER_ZONE_SIZE = 1_000;
export const MOTION_DETAIL_FRAME_INTERVAL_MICROS = 1_000_000n / BigInt(PLAYER_MOTION_DETAIL_FRAME_HZ);
export const MAP_FRAME_INTERVAL_MICROS = 1_000_000n / BigInt(PLAYER_MAP_FRAME_HZ);

export function playerZone(x: number, y: number) {
  return {
    zoneX: Math.floor(x / PLAYER_ZONE_SIZE),
    zoneY: Math.floor(y / PLAYER_ZONE_SIZE),
  };
}

export function analyticalMotionAt(motion: any, sampledAtMicros: bigint) {
  const sampled = analyticalPlayerMotionAt({
    x: motion.x,
    y: motion.y,
    vx: motion.vx,
    vy: motion.vy,
    moving: motion.moving,
    simulationTick: motion.simulationTick,
    anchoredAtMicros: motion.lastInputAt.microsSinceUnixEpoch,
  }, sampledAtMicros);
  if (motion.mapId === HOME_EXTERIOR_MAP_ID) {
    sampled.x = Math.max(PLAYER_RADIUS, Math.min(HOME_WORLD_WIDTH - PLAYER_RADIUS, sampled.x));
    sampled.y = Math.max(PLAYER_RADIUS, Math.min(HOME_WORLD_HEIGHT - PLAYER_RADIUS, sampled.y));
  }
  return {
    ...motion,
    ...sampled,
    facing: sampled.vx < 0 ? Math.PI : sampled.vx > 0 ? 0 : motion.facing,
    ...playerZone(sampled.x, sampled.y),
  };
}

export function playerWithMotion(ctx: any, activePlayer: any) {
  if (!activePlayer) return activePlayer;
  const motion = ctx.db.playerMotion.identity.find(activePlayer.identity);
  if (!motion || motion.mapId !== activePlayer.mapId) return activePlayer;
  const sampled = analyticalMotionAt(motion, ctx.timestamp.microsSinceUnixEpoch);
  return {
    ...activePlayer,
    x: sampled.x,
    y: sampled.y,
    facing: sampled.facing,
    moving: sampled.moving,
    dx: sampled.moving ? motion.dx : 0,
    dy: sampled.moving ? motion.dy : 0,
    vx: sampled.vx,
    vy: sampled.vy,
    simulationTick: sampled.simulationTick,
    motionEpoch: sampled.motionEpoch,
    lastInputAt: sampled.lastInputAt,
    lastInputSequence: sampled.lastInputSequence,
    zoneX: sampled.zoneX,
    zoneY: sampled.zoneY,
    mapId: sampled.mapId,
  };
}

export function stoppedMotionFields(current: any, advanceEpoch = false) {
  return {
    moving: false,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    simulationTick: current.simulationTick ?? 0,
    motionEpoch: ((current.motionEpoch ?? 0) + (advanceEpoch ? 1 : 0)) >>> 0,
  };
}

export function adjustPlayerMotionMapState(ctx: any, mapId: string, playerDelta: number, visibleDelta: number) {
  const current = ctx.db.playerMotionMapState.mapId.find(mapId);
  const playerCount = Math.max(0, (current?.playerCount ?? 0) + playerDelta);
  const visibleCount = Math.max(0, Math.min(playerCount, (current?.visibleCount ?? 0) + visibleDelta));
  if (playerCount === 0) {
    if (current) ctx.db.playerMotionMapState.mapId.delete(mapId);
    return;
  }
  const next = { mapId, playerCount, visibleCount };
  if (current) ctx.db.playerMotionMapState.mapId.update(next);
  else ctx.db.playerMotionMapState.insert(next);
}

/**
 * `known` carries a row the caller already read in this transaction. When the
 * key is present it is taken as the current value even if null; every host
 * call is paid for, so a map change reads the motion row once.
 */
export function syncPlayerMotion(ctx: any, activePlayer: any, known?: { motion?: any }) {
  const current = known && "motion" in known ? known.motion : ctx.db.playerMotion.identity.find(activePlayer.identity);
  const moving = Boolean(activePlayer.moving);
  const isVisible = activePlayer.mapId !== HOME_EXTERIOR_MAP_ID && activePlayer.isVisible !== false;
  const hasStoredVelocity = Number.isFinite(activePlayer.vx) && Number.isFinite(activePlayer.vy) && (
    !moving || activePlayer.vx !== 0 || activePlayer.vy !== 0
  );
  const fallbackSpeed = Number.isFinite(activePlayer.speed) ? Math.max(0, activePlayer.speed) : 0;
  const vx = moving
    ? Math.max(-MAX_PACKED_PLAYER_VELOCITY, Math.min(MAX_PACKED_PLAYER_VELOCITY, hasStoredVelocity ? activePlayer.vx : (activePlayer.dx ?? 0) * fallbackSpeed))
    : 0;
  const vy = moving
    ? Math.max(-MAX_PACKED_PLAYER_VELOCITY, Math.min(MAX_PACKED_PLAYER_VELOCITY, hasStoredVelocity ? activePlayer.vy : (activePlayer.dy ?? 0) * fallbackSpeed))
    : 0;
  const next = {
    networkId: current?.networkId ?? 0,
    identity: activePlayer.identity,
    x: activePlayer.x,
    y: activePlayer.y,
    facing: activePlayer.facing,
    moving,
    lastInputAt: activePlayer.lastInputAt,
    lastInputSequence: activePlayer.lastInputSequence,
    // Physical compatibility column. No current client or publisher reads it.
    inputIntervalMicros: 0n,
    zoneX: activePlayer.zoneX,
    zoneY: activePlayer.zoneY,
    mapId: activePlayer.mapId,
    dx: moving && Number.isFinite(activePlayer.dx) ? Math.max(-1, Math.min(1, activePlayer.dx)) : 0,
    dy: moving && Number.isFinite(activePlayer.dy) ? Math.max(-1, Math.min(1, activePlayer.dy)) : 0,
    isVisible,
    vx,
    vy,
    simulationTick: Number.isFinite(activePlayer.simulationTick) ? Math.max(0, Math.min(0xffffffff, Math.floor(activePlayer.simulationTick))) : current?.simulationTick ?? 0,
    motionEpoch: Number.isFinite(activePlayer.motionEpoch) ? Math.max(0, Math.min(0xffffffff, Math.floor(activePlayer.motionEpoch))) : current?.motionEpoch ?? 0,
  };
  const stored = current
    ? ctx.db.playerMotion.networkId.update(next)
    : ctx.db.playerMotion.insert(next);
  if (!current) {
    adjustPlayerMotionMapState(ctx, next.mapId, 1, isVisible ? 1 : 0);
  } else if (current.mapId !== next.mapId) {
    adjustPlayerMotionMapState(ctx, current.mapId, -1, current.isVisible ? -1 : 0);
    adjustPlayerMotionMapState(ctx, next.mapId, 1, isVisible ? 1 : 0);
  } else if (current.isVisible !== isVisible) {
    adjustPlayerMotionMapState(ctx, next.mapId, 0, isVisible ? 1 : -1);
  }
  return stored;
}

/**
 * Returns whether the player's world location was persisted here, so a caller
 * that would otherwise persist it again can skip the second round trip.
 * `known` rows were read by the caller in this transaction; see syncPlayerMotion.
 */
export function syncPlayerMotionIdentity(ctx: any, activePlayer: any, known?: { motion?: any }) {
  if (!activePlayer) return { persistedLocation: false };
  const motion = (known && "motion" in known ? known.motion : null) ?? ctx.db.playerMotion.identity.find(activePlayer.identity) ?? syncPlayerMotion(ctx, activePlayer);
  const profile = ctx.db.playerProfile.identity.find(activePlayer.identity);
  if (!profile) return { persistedLocation: false };
  const current = ctx.db.playerMotionIdentity.identity.find(activePlayer.identity);
  const next = {
    networkId: motion.networkId,
    identity: activePlayer.identity,
    mapId: activePlayer.mapId,
    isVisible: activePlayer.mapId !== HOME_EXTERIOR_MAP_ID && activePlayer.isVisible,
    zoneX: activePlayer.zoneX,
    zoneY: activePlayer.zoneY,
    displayName: profile.displayName,
    profileIcon: profile.profileIcon,
    playerSprite: profile.playerSprite,
    skinTone: profile.skinTone,
    isGuest: ctx.db.playerAccountStatus.identity.find(activePlayer.identity)?.isGuest ?? false,
    gender: profile.gender,
    speed: Number.isFinite(activePlayer.speed) ? Math.max(0, activePlayer.speed) : PLAYER_SPEED,
    powerLevel: Number.isFinite(activePlayer.powerLevel) ? Math.max(0, activePlayer.powerLevel) : 0,
    feetItem: activePlayer.feetItem ?? "",
    headItem: activePlayer.headItem ?? "",
    chestItem: activePlayer.chestItem ?? "",
    rightHandItem: activePlayer.rightHandItem ?? "",
    leftHandItem: activePlayer.leftHandItem ?? "",
  };
  if (!current) {
    ctx.db.playerMotionIdentity.insert(next);
    return { persistedLocation: false };
  }
  if (current.networkId !== next.networkId) {
    ctx.db.playerMotionIdentity.networkId.delete(current.networkId);
    ctx.db.playerMotionIdentity.insert(next);
    return { persistedLocation: false };
  }
  if (
    current.mapId !== next.mapId ||
    current.isVisible !== next.isVisible ||
    current.displayName !== next.displayName ||
    current.profileIcon !== next.profileIcon ||
    current.playerSprite !== next.playerSprite ||
    current.skinTone !== next.skinTone ||
    current.isGuest !== next.isGuest ||
    current.gender !== next.gender ||
    current.speed !== next.speed ||
    current.powerLevel !== next.powerLevel ||
    current.feetItem !== next.feetItem ||
    current.headItem !== next.headItem ||
    current.chestItem !== next.chestItem ||
    current.rightHandItem !== next.rightHandItem ||
    current.leftHandItem !== next.leftHandItem
  ) ctx.db.playerMotionIdentity.networkId.update(next);
  return { persistedLocation: false };
}

export function hasSharedMap(ctx: any) {
  for (const state of ctx.db.playerMotionMapState.iter() as Iterable<any>) {
    if (state.mapId !== HOME_EXTERIOR_MAP_ID && state.visibleCount > 1) return true;
  }
  return false;
}

// Existence checks use count(): a scan deserialises every row it touches, a
// count answers without reading any.
export function ensureMotionDetailFrameSchedule(ctx: any) {
  if (Number(ctx.db.motionDetailFrameSchedule.count()) > 0) return;
  if (Number(ctx.db.playerMotionInterest.count()) === 0) return;
  ctx.db.motionDetailFrameSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MOTION_DETAIL_FRAME_INTERVAL_MICROS),
  });
}

export function ensureMapFrameSchedule(ctx: any) {
  if (Number(ctx.db.mapFrameSchedule.count()) > 0) return;
  if (!hasSharedMap(ctx)) return;
  ctx.db.mapFrameSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + MAP_FRAME_INTERVAL_MICROS),
  });
}

export function ensureRealtimeFrameSchedules(ctx: any) {
  ensureMotionDetailFrameSchedule(ctx);
  ensureMapFrameSchedule(ctx);
}

export function motionSample(motion: any, sampledAtMicros: bigint): PlayerMotionSample {
  return playerMotionSampleAt(motion, sampledAtMicros);
}

export function persistWorldLocation(ctx: any, activePlayer: any) {
  if (ctx.db.virtualPlayer.identity.find(activePlayer.identity)) return;
  const current = ctx.db.playerLastLocation.identity.find(activePlayer.identity);
  const next = {
    identity: activePlayer.identity,
    mapId: activePlayer.mapId,
    x: activePlayer.x,
    y: activePlayer.y,
    facing: activePlayer.facing,
  };
  if (
    !current ||
    current.mapId !== next.mapId ||
    current.x !== next.x ||
    current.y !== next.y ||
    current.facing !== next.facing
  ) {
    if (current) ctx.db.playerLastLocation.identity.update(next);
    else ctx.db.playerLastLocation.insert(next);
  }
}

export function syncPlayerMapMarker(ctx: any, activePlayer: any, force = false) {
  if (!activePlayer) return;
  const current = ctx.db.playerMapMarker.identity.find(activePlayer.identity);
  const next = {
    identity: activePlayer.identity,
    x: activePlayer.x,
    y: activePlayer.y,
    mapId: activePlayer.mapId,
    isVisible: activePlayer.mapId !== HOME_EXTERIOR_MAP_ID && activePlayer.isVisible,
    updatedAt: ctx.timestamp,
  };
  if (!current) {
    ctx.db.playerMapMarker.insert(next);
    return;
  }
  // Physical compatibility row. New clients use player_map_frame; update this
  // row only at lifecycle boundaries so old stored data stays coherent.
  if (force || current.mapId !== next.mapId || current.isVisible !== next.isVisible) {
    ctx.db.playerMapMarker.identity.update(next);
  }
}

export function countOnlinePlayers(ctx: any) {
  // One presence row per online identity, across every map; table
  // cardinality avoids scanning players.
  return Number(ctx.db.player.count());
}

export function ensureWorldStatus(ctx: any) {
  const current = ctx.db.worldStatus.id.find(0);
  if (current) return current;
  return ctx.db.worldStatus.insert({ id: 0, onlinePlayers: countOnlinePlayers(ctx) });
}

export function reconcileOnlinePlayers(ctx: any) {
  const current = ensureWorldStatus(ctx);
  const onlinePlayers = countOnlinePlayers(ctx);
  if (onlinePlayers !== current.onlinePlayers) ctx.db.worldStatus.id.update({ ...current, onlinePlayers });
}

// Everything the moved bodies still borrow from index.ts. Passing these in keeps
// the module free of runtime imports from ./index.
export type PresenceRuntimeDeps = {
  WORLD: { width: number; height: number };
  VALID_MAP_IDS: { has: (id: string) => boolean };
  MAP_ARRIVALS: Record<string, { x: number; y: number }>;
  hasEndlessTravelAccess: (ctx: any, identity: any) => boolean;
  sameIdentity: (left: any, right: any) => boolean;
  finishLifetimeSession: (ctx: any, identity: any) => void;
  removeIdentityPresence: (ctx: any, identity: any) => void;
  requireControllingPlayer: (ctx: any) => any;
  activeDuelFor: (ctx: any, identity: any) => any;
  effectiveMovementSpeedForProgress: (ctx: any, progress: any) => number;
  equippedFeetForProgress: (progress: any) => string;
};

export function createPresenceRuntime(deps: PresenceRuntimeDeps) {
  const {
    WORLD, VALID_MAP_IDS, MAP_ARRIVALS, hasEndlessTravelAccess, sameIdentity, finishLifetimeSession,
    removeIdentityPresence, requireControllingPlayer,
    activeDuelFor, effectiveMovementSpeedForProgress, equippedFeetForProgress,
  } = deps;

  function savedWorldLocation(ctx: any, identity: any, progress: any) {
    const saved = ctx.db.playerLastLocation.identity.find(identity);
    const requestedMap = VALID_MAP_IDS.has(saved?.mapId) ? saved.mapId : TUTORIAL_FOREST_MAP_ID;
    let mapId = requestedMap;
    mapId = accessibleCampaignMap(mapId, progress);
    if (isProceduralMap(mapId) && !hasEndlessTravelAccess(ctx, identity) && !generatedMapUnlocked(mapId, ctx.db.proceduralProgress.identity.find(identity)?.completed ?? 0, Boolean(progress.bossRewardClaims & BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS]))) mapId = TUTORIAL_FOREST_MAP_ID;
    const fallback = isProceduralMap(mapId) ? generateMap(mapId).arrival : mapId === HOME_EXTERIOR_MAP_ID ? HOME_EXTERIOR_SPAWN : mapId === TUTORIAL_FOREST_MAP_ID ? PLAYER_SPAWN : MAP_ARRIVALS[mapId as keyof typeof MAP_ARRIVALS];
    const useSavedPosition = mapId === requestedMap;
    const x = useSavedPosition && Number.isFinite(saved?.x)
      ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, saved.x))
      : fallback.x;
    const y = useSavedPosition && Number.isFinite(saved?.y)
      ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, saved.y))
      : fallback.y;
    return { mapId, x, y, facing: useSavedPosition && Number.isFinite(saved?.facing) ? saved.facing : 0 };
  }

  function clearOrphanPresence(ctx: any) {
    const sessionsByIdentity = new Map<string, any[]>();
    for (const session of ctx.db.playerSession.iter() as Iterable<any>) {
      const key = session.identity.toHexString();
      const sessions = sessionsByIdentity.get(key) ?? [];
      sessions.push(session);
      sessionsByIdentity.set(key, sessions);
    }

    const invalidControllers: any[] = [];
    for (const controller of ctx.db.playerController.iter() as Iterable<any>) {
      const session = ctx.db.playerSession.connectionId.find(controller.connectionId);
      if (!session || !sameIdentity(session.identity, controller.identity)) invalidControllers.push(controller.identity);
    }
    for (const identity of invalidControllers) ctx.db.playerController.identity.delete(identity);

    for (const sessions of sessionsByIdentity.values()) {
      const identity = sessions[0].identity;
      if (!ctx.db.playerController.identity.find(identity)) {
        const enteredSession = sessions.find((session: any) => session.enteredWorld);
        if (enteredSession) ctx.db.playerController.insert({ identity, connectionId: enteredSession.connectionId });
      }
    }

    const orphanIdentities: any[] = [];
    for (const activePlayer of ctx.db.player.iter() as Iterable<any>) {
      if (!ctx.db.playerController.identity.find(activePlayer.identity)) orphanIdentities.push(activePlayer.identity);
    }
    for (const identity of orphanIdentities) {
      finishLifetimeSession(ctx, identity);
      removeIdentityPresence(ctx, identity);
    }
  }

  function applyMovementState(
    ctx: any,
    x: number,
    y: number,
    vx: number,
    vy: number,
    simulationTick: number,
    motionEpoch: number,
    sequence: number,
  ) {
    const current = requireControllingPlayer(ctx);
    if (sequence <= current.lastInputSequence || ["countdown", "active", "finishing"].includes(activeDuelFor(ctx, ctx.sender)?.status)) return;
    if (![x, y, vx, vy, simulationTick, motionEpoch].every(Number.isFinite)) throw new SenderError("Movement state values must be finite");

    const bounds = current.mapId === HOME_EXTERIOR_MAP_ID ? { width: HOME_WORLD_WIDTH, height: HOME_WORLD_HEIGHT } : WORLD;
    const clampedX = Math.max(PLAYER_RADIUS, Math.min(bounds.width - PLAYER_RADIUS, x));
    const clampedY = Math.max(PLAYER_RADIUS, Math.min(bounds.height - PLAYER_RADIUS, y));
    const boundedVx = Math.max(-MAX_PACKED_PLAYER_VELOCITY, Math.min(MAX_PACKED_PLAYER_VELOCITY, vx));
    const boundedVy = Math.max(-MAX_PACKED_PLAYER_VELOCITY, Math.min(MAX_PACKED_PLAYER_VELOCITY, vy));
    const moving = Math.abs(boundedVx) > 1e-6 || Math.abs(boundedVy) > 1e-6;
    const compatibilitySpeed = Math.max(1e-6, Number.isFinite(current.speed) ? current.speed : PLAYER_SPEED);
    const requestedSpeed = Math.hypot(boundedVx, boundedVy);
    // Black Boots are a flat bonus, so a wearer has one speed rather than an
    // in-combat and an out-of-combat one. The saved row can still lag a rank
    // that just finished, so the bound is the highest of what we know.
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    const expectedSpeed = progress ? effectiveMovementSpeedForProgress(ctx, progress) : compatibilitySpeed;
    const bootedSpeed = progress && equippedFeetForProgress(progress) === BLACK_BOOTS
      ? expectedSpeed + BLACK_BOOTS_SPEED_BONUS : expectedSpeed;
    const allowedSpeed = Math.max(compatibilitySpeed, expectedSpeed, bootedSpeed);
    // Movement is not where cheating pays. What a speed hack buys is farming
    // throughput, and that is capped where it is earned: no account can be paid
    // for more kills than the map can respawn (DEFEAT_MIN_RESPAWN_SECONDS).
    // So an impossible packet is corrected rather than punished. This used to
    // revoke the session on speed and reject the packet on position, which cost
    // honest players their footing after boss knockback, a respawn or a lag
    // spike, and logged a warning for every one of them.
    const speedScale = moving && requestedSpeed > allowedSpeed + MOVEMENT_SPEED_PACKET_TOLERANCE
      ? allowedSpeed / requestedSpeed : 1;
    const correctedVx = boundedVx * speedScale;
    const correctedVy = boundedVy * speedScale;
    let acceptedX = clampedX;
    let acceptedY = clampedY;
    const motion = ctx.db.playerMotion.identity.find(ctx.sender);
    if (motion && motion.mapId === current.mapId && current.lastInputSequence > 0) {
      const elapsedSeconds = Math.max(0,
        Number(ctx.timestamp.microsSinceUnixEpoch - motion.lastInputAt.microsSinceUnixEpoch) / 1_000_000);
      const expected = analyticalMotionAt(motion, ctx.timestamp.microsSinceUnixEpoch);
      const distance = Math.hypot(clampedX - expected.x, clampedY - expected.y);
      const maxDistance = allowedSpeed * elapsedSeconds + MOVEMENT_POSITION_PACKET_TOLERANCE;
      // Pull an unreachable position back onto the edge of what was reachable
      // instead of refusing it. The client keeps moving and the server keeps a
      // position it can defend.
      if (distance > maxDistance && distance > 0) {
        const reachable = maxDistance / distance;
        acceptedX = expected.x + (clampedX - expected.x) * reachable;
        acceptedY = expected.y + (clampedY - expected.y) * reachable;
      }
    }
    const boundedTick = Math.max(0, Math.min(0xffffffff, Math.floor(simulationTick)));
    const boundedEpoch = Math.max(0, Math.min(0xffffffff, Math.floor(motionEpoch)));
    const facing = correctedVx < 0 ? Math.PI : correctedVx > 0 ? 0 : current.facing;
    const nextPlayer = {
      ...current,
      x: acceptedX,
      y: acceptedY,
      ...playerZone(acceptedX, acceptedY),
      facing,
      moving,
      // Retained only for physical compatibility with the older direction row.
      dx: moving ? Math.max(-1, Math.min(1, correctedVx / compatibilitySpeed)) : 0,
      dy: moving ? Math.max(-1, Math.min(1, correctedVy / compatibilitySpeed)) : 0,
      vx: moving ? correctedVx : 0,
      vy: moving ? correctedVy : 0,
      simulationTick: boundedTick,
      motionEpoch: boundedEpoch,
      lastInputAt: ctx.timestamp,
      lastInputSequence: sequence,
    };
    syncPlayerMotion(ctx, nextPlayer);

    // The exact-own player row only needs lifecycle endpoints and idle
    // corrections. Continuous coordinates and zone crossings stay private in
    // the analytical anchor; remote subscribers never consume this row.
    const staticStateChanged =
      current.moving !== moving ||
      !moving;
    if (staticStateChanged) updateSnapshotRow(ctx, "player", nextPlayer);
  }

  return { savedWorldLocation, clearOrphanPresence, applyMovementState };
}
