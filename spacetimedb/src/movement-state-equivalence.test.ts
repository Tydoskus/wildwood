import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import {
  analyticalMotionAt, playerZone, syncPlayerMotion, MOVEMENT_POSITION_PACKET_TOLERANCE, MOVEMENT_SPEED_PACKET_TOLERANCE,
} from "./presence-runtime";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { defeatRestrictionError, requireAllowedDefeatSession } from "./defeat-session";
import { activeDuelFor } from "./duel-runtime";
import { effectiveMovementSpeedForProgress } from "./player-speed";
import { BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS } from "../../shared/items";
import { HOME_EXTERIOR_MAP_ID, HOME_WORLD_HEIGHT, HOME_WORLD_WIDTH } from "../../shared/home";
import { PLAYER_VELOCITY_SCALE } from "../../shared/player-motion-frame";
import { COMPATIBLE_PROTOCOL_VERSIONS, PLAYER_RADIUS, PLAYER_SPEED } from "../../shared/rules";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
// The old algorithm below needs the production WORLD and equippedFeetForProgress,
// which live inside index.ts. Catch them on their way into the presence runtime.
const captured = vi.hoisted(() => ({ deps: null as any }));
vi.mock("./presence-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./presence-runtime")>();
  return { ...actual, createPresenceRuntime: (deps: any) => { captured.deps = deps; return actual.createPresenceRuntime(deps); } };
});

// ---------------------------------------------------------------------------
// The movement path exactly as it was before the host-call cut (git 719542f0):
// requireControllingPlayer and its helpers from index.ts, playerWithMotion and
// applyMovementState from presence-runtime.ts, and the two reducer bodies that
// call it. Only the dependency plumbing differs; the logic is copied verbatim.
// ---------------------------------------------------------------------------
const LEGACY_CLIENT_ERRORS = { protocolUpdate: "Wildwood updated. Refresh to continue.", missingPresence: "Enter Wildwood first." };
const MAX_PACKED_PLAYER_VELOCITY = 0x7fff / PLAYER_VELOCITY_SCALE;
const sameIdentity = (a: any, b: any) => captured.deps.sameIdentity(a, b);
function sameConnection(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}
function sessionForContext(ctx: any) {
  return ctx.connectionId ? ctx.db.playerSession.connectionId.find(ctx.connectionId) : null;
}
function requireSession(ctx: any) {
  requireAllowedDefeatSession(ctx);
  const session = sessionForContext(ctx);
  if (!session || !sameIdentity(session.identity, ctx.sender)) {
    throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
  }
  return session;
}
function blockedSession(ctx: any) {
  return Boolean(defeatRestrictionError(ctx));
}
function isSupportedProtocol(protocolVersion: number) {
  return COMPATIBLE_PROTOCOL_VERSIONS.includes(protocolVersion);
}
function requireSupportedSessionProtocol(ctx: any) {
  const session = requireSession(ctx);
  if (!isSupportedProtocol(session.protocolVersion)) {
    throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
  }
  return session;
}
function requireCurrentProtocol(ctx: any) {
  requireSupportedSessionProtocol(ctx);
  const current = ctx.db.player.identity.find(ctx.sender);
  if (!current) throw new SenderError(LEGACY_CLIENT_ERRORS.missingPresence);
  return legacyPlayerWithMotion(ctx, current);
}
function requireControllingPlayer(ctx: any) {
  const current = requireCurrentProtocol(ctx);
  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (!ctx.connectionId || !controller || !sameConnection(controller.connectionId, ctx.connectionId)) {
    throw new SenderError("Wildstat is active in another tab.");
  }
  return current;
}
function legacyPlayerWithMotion(ctx: any, activePlayer: any) {
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
function legacyApplyMovementState(
  ctx: any,
  x: number,
  y: number,
  vx: number,
  vy: number,
  simulationTick: number,
  motionEpoch: number,
  sequence: number,
) {
  const { WORLD, equippedFeetForProgress } = captured.deps;
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
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  const expectedSpeed = progress ? effectiveMovementSpeedForProgress(ctx, progress) : compatibilitySpeed;
  const bootedSpeed = progress && equippedFeetForProgress(progress) === BLACK_BOOTS
    ? expectedSpeed + BLACK_BOOTS_SPEED_BONUS : expectedSpeed;
  const allowedSpeed = Math.max(compatibilitySpeed, expectedSpeed, bootedSpeed);
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
  const staticStateChanged =
    current.moving !== moving ||
    !moving;
  if (staticStateChanged) updateSnapshotRow(ctx, "player", nextPlayer);
}
const legacyUpdateMovementState = (ctx: any, { x, y, vx, vy, simulationTick, motionEpoch, sequence }: any) => {
  if (blockedSession(ctx)) return;
  legacyApplyMovementState(ctx, x, y, vx, vy, simulationTick, motionEpoch, sequence);
};
const legacySyncPosition = (ctx: any, { x, y, facing, moving, sequence }: any) => {
  if (!Number.isFinite(facing)) throw new SenderError("Movement state values must be finite");
  const currentMotion = ctx.db.playerMotion.identity.find(ctx.sender);
  const speed = Math.max(0, ctx.db.player.identity.find(ctx.sender)?.speed ?? PLAYER_SPEED);
  const horizontal = Math.cos(facing);
  legacyApplyMovementState(
    ctx,
    x,
    y,
    moving && Math.abs(horizontal) >= 1e-6 ? horizontal * speed : 0,
    moving ? Math.sin(facing) * speed : 0,
    (currentMotion?.simulationTick ?? 0) + 1 >>> 0,
    currentMotion?.motionEpoch ?? 0,
    sequence,
  );
};

// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every table, every row, every field. NaN and -0 are kept distinct.
function dump(db: Record<string, any>) {
  return JSON.stringify(Object.keys(db).sort().map(name => [name, [...db[name].iter()]]), (_key, value) =>
    typeof value === "bigint" ? `${value}n`
      : typeof value === "number" && Number.isNaN(value) ? "NaN"
        : Object.is(value, -0) ? "-0" : value);
}

type Fixture = ReturnType<typeof crystalFixture>;
type Outcome = { error: string | null };
const attempt = (f: Fixture, reducer: (ctx: any, args: any) => unknown, args: any): Outcome => {
  try { f.run(reducer, args); return { error: null }; }
  catch (error: any) { return { error: `${error?.constructor?.name}: ${error?.message}` }; }
};

function ownedSpeed(f: Fixture, compatibilitySpeed: number) {
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  const expectedSpeed = progress ? effectiveMovementSpeedForProgress(f.ctx, progress) : compatibilitySpeed;
  const booted = progress && captured.deps.equippedFeetForProgress(progress) === BLACK_BOOTS ? expectedSpeed + BLACK_BOOTS_SPEED_BONUS : expectedSpeed;
  return Math.max(compatibilitySpeed, expectedSpeed, booted);
}

const tally = { packets: 0, accepted: 0, errors: 0, stale: 0, speedClamped: 0, pulledBack: 0, nearReachEdge: 0, ownedSpeedOnly: 0, ownedReachOnly: 0 };

function runScenario(seed: number, steps: number) {
  const rand = mulberry32(seed);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
  const next = crystalFixture(), prev = crystalFixture();
  const both = (change: (f: Fixture) => void) => { change(next); change(prev); };
  const upsert = (f: Fixture, table: string, row: Record<string, unknown>) => {
    const current = f.db[table].identity.find(f.ctx.sender);
    if (current) f.db[table].identity.update({ ...current, ...row });
    else f.seed(table, { identity: f.ctx.sender, ...row });
  };
  const savedProgress = next.db.playerProgress.identity.find(next.ctx.sender);
  const savedController = next.db.playerController.identity.find(next.ctx.sender);

  // Starting state: the player row's speed, research, boots and map vary.
  const rowSpeed = pick([180, 180, 205, 190.8, 183.6, 216.8, 0, 1e-9, 400]);
  both(f => f.patch("player", { speed: rowSpeed }));
  if (rand() < 0.6) {
    const research = { moveSpeed: Math.floor(rand() * 11), utilityMoveSpeed: Math.floor(rand() * 6) };
    both(f => upsert(f, "playerResearch", research));
  }
  const boots = pick(["none", "equipped", "equipped-locked", "owned"] as const);
  if (boots !== "none") both(f => f.patch("playerProgress", {
    inventoryJson: JSON.stringify([BLACK_BOOTS]),
    equippedFeet: boots === "owned" ? "" : BLACK_BOOTS,
    infernalUnlocked: boots !== "equipped-locked",
  }));
  if (rand() < 0.2) {
    const speedOverride = pick([0, 150, 260]);
    both(f => f.patch("playerProgress", { speedOverride }));
  }
  if (rand() < 0.15) both(f => f.patch("player", { mapId: HOME_EXTERIOR_MAP_ID, x: 500, y: 500 }));

  for (let step = 0; step < steps; step++) {
    // Server time moves on (occasionally backwards: the elapsed clamp).
    const dt = pick([0, 0.000001, 0.016, 0.1, 0.25, 0.5, 0.5, 1, 2, 5, 30, 300, -0.2]);
    both(f => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(Math.round(dt * 1_000_000))); });

    // Broken sessions, restrictions and duels come and go, so most packets land
    // on a healthy session and reach the speed and reach checks.
    if (rand() < 0.35) both(f => {
      f.ctx.connectionId = savedController.connectionId;
      if (!f.db.playerController.identity.find(f.ctx.sender)) f.db.playerController.insert(savedController);
      const session = f.db.playerSession.connectionId.find(savedController.connectionId);
      f.db.playerSession.connectionId.update({ ...session, protocolVersion: COMPATIBLE_PROTOCOL_VERSIONS[0] });
      if (f.db.defeatSessionRestriction.identity.find(f.ctx.sender)) f.db.defeatSessionRestriction.identity.delete(f.ctx.sender);
      for (const duel of [...f.db.duel.iter()]) f.db.duel.id.delete(duel.id);
    });

    const roll = rand();
    let outcome: [Outcome, Outcome] | null = null;
    if (roll < 0.62) {
      // A movement packet aimed at the edges the two checks draw.
      const player = next.db.player.identity.find(next.ctx.sender);
      const motion = next.db.playerMotion.identity.find(next.ctx.sender);
      const now = next.ctx.timestamp.microsSinceUnixEpoch;
      const anchored = motion && motion.mapId === player.mapId;
      const expected = anchored ? analyticalMotionAt(motion, now) : player;
      const compatibilitySpeed = Math.max(1e-6, Number.isFinite(player.speed) ? player.speed : PLAYER_SPEED);
      const owned = ownedSpeed(next, compatibilitySpeed);
      const elapsed = motion ? Math.max(0, Number(now - motion.lastInputAt.microsSinceUnixEpoch) / 1_000_000) : 0;
      const lastSequence = anchored ? motion.lastInputSequence : player.lastInputSequence;
      const tiny = pick([0, 1e-9, -1e-9, 1e-6, -1e-6, 0.01, -0.01]);
      const speed = pick([
        0, 1e-7, compatibilitySpeed, compatibilitySpeed + MOVEMENT_SPEED_PACKET_TOLERANCE + tiny,
        owned, owned + MOVEMENT_SPEED_PACKET_TOLERANCE + tiny, owned * 2, compatibilitySpeed * 3, rand() * 600,
        MAX_PACKED_PLAYER_VELOCITY + 100,
      ]);
      const angle = rand() < 0.4 ? pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) : rand() * Math.PI * 2;
      const vx = Math.fround(Math.cos(angle) * speed);
      const vy = Math.fround(Math.sin(angle) * speed);
      const radius = pick([
        0, rand() * 20, compatibilitySpeed * elapsed + MOVEMENT_POSITION_PACKET_TOLERANCE + tiny * 1000,
        owned * elapsed + MOVEMENT_POSITION_PACKET_TOLERANCE + tiny * 1000, rand() * 5_000,
      ]);
      if (radius > 0 && Math.abs(radius - (owned * elapsed + MOVEMENT_POSITION_PACKET_TOLERANCE)) < 20) tally.nearReachEdge++;
      const heading = rand() * Math.PI * 2;
      let x = expected.x + Math.cos(heading) * radius;
      let y = expected.y + Math.sin(heading) * radius;
      if (rand() < 0.05) [x, y] = [pick([-100, 0, 4_900, 1e9]), pick([-100, 0, 4_900, 1e9])];
      const sequence = pick([lastSequence + 1, lastSequence + 1, lastSequence + 1, lastSequence, lastSequence - 1, lastSequence + 7, 0, 0xffffffff]);
      const packet = {
        x: rand() < 0.02 ? NaN : x,
        y,
        vx: rand() < 0.02 ? Infinity : vx,
        vy,
        simulationTick: pick([sequence, sequence * 3, 0, 2 ** 32 + 5, -4, 1.5]),
        motionEpoch: pick([1, 1, 2, 0, 1e12]),
        sequence,
      };
      if (rand() < 0.12) {
        const legacy = { x: packet.x, y: packet.y, facing: rand() < 0.03 ? NaN : angle, moving: speed > 0, sequence };
        outcome = [attempt(next, server.syncPosition as any, legacy), attempt(prev, legacySyncPosition, legacy)];
      } else {
        outcome = [attempt(next, server.updateMovementState as any, packet), attempt(prev, legacyUpdateMovementState, packet)];
      }
      tally.packets++;
      const stored = next.db.playerMotion.identity.find(next.ctx.sender);
      if (outcome[0].error) tally.errors++;
      else if (!stored || stored.lastInputSequence !== sequence || stored.lastInputAt.microsSinceUnixEpoch !== now) tally.stale++;
      else {
        tally.accepted++;
        if (Number.isFinite(packet.vx) && stored.moving && Math.abs(stored.vx - Math.max(-MAX_PACKED_PLAYER_VELOCITY, Math.min(MAX_PACKED_PLAYER_VELOCITY, packet.vx))) > 1e-9) tally.speedClamped++;
        const bounds = stored.mapId === HOME_EXTERIOR_MAP_ID ? { width: HOME_WORLD_WIDTH, height: HOME_WORLD_HEIGHT } : captured.deps.WORLD;
        const clampedX = Math.max(PLAYER_RADIUS, Math.min(bounds.width - PLAYER_RADIUS, packet.x));
        if (Number.isFinite(clampedX) && stored.x !== clampedX) tally.pulledBack++;
        // The cases the lazy bound exists for: past the row's speed or reach,
        // within the owned one, so it is worked out and then changes nothing.
        const requested = Math.hypot(vx, vy);
        if (requested > compatibilitySpeed + MOVEMENT_SPEED_PACKET_TOLERANCE && requested <= owned + MOVEMENT_SPEED_PACKET_TOLERANCE &&
          stored.vx === vx) tally.ownedSpeedOnly++;
        const clampedY = Math.max(PLAYER_RADIUS, Math.min(bounds.height - PLAYER_RADIUS, packet.y));
        const distance = Math.hypot(clampedX - expected.x, clampedY - expected.y);
        if (anchored && lastSequence > 0 && distance > compatibilitySpeed * elapsed + MOVEMENT_POSITION_PACKET_TOLERANCE &&
          distance <= owned * elapsed + MOVEMENT_POSITION_PACKET_TOLERANCE) tally.ownedReachOnly++;
      }
    } else if (roll < 0.67) {
      // A research rank finishes: the owned speed moves past the row's.
      const research = { moveSpeed: Math.floor(rand() * 11), utilityMoveSpeed: Math.floor(rand() * 6) };
      both(f => upsert(f, "playerResearch", research));
    } else if (roll < 0.71) {
      const change = pick([
        { inventoryJson: JSON.stringify([BLACK_BOOTS]), equippedFeet: BLACK_BOOTS, infernalUnlocked: true },
        { equippedFeet: "" },
        { infernalUnlocked: false },
        { inventoryJson: "[]" },
        { inventoryJson: "not json" },
      ]);
      both(f => { if (f.db.playerProgress.identity.find(f.ctx.sender)) f.patch("playerProgress", change); });
    } else if (roll < 0.75) {
      const speed = pick([180, 205, 190.8, 216.8, 0, 400, 1e-9]);
      both(f => f.patch("player", { speed }));
    } else if (roll < 0.79) {
      // Death (and the first packet after the respawn skips the reach check).
      outcome = [attempt(next, server.recordPlayerDeath as any, {}), attempt(prev, server.recordPlayerDeath as any, {})];
    } else if (roll < 0.83) {
      const status = pick(["requested", "countdown", "active", "finishing", "finished", "none"]);
      both(f => {
        for (const duel of [...f.db.duel.iter()]) f.db.duel.id.delete(duel.id);
        if (status !== "none") f.seed("duel", { challenger: f.ctx.sender, opponent: identity("2"), status, createdAt: f.ctx.timestamp });
      });
    } else if (roll < 0.86) {
      // Map mismatch between the player row and the motion anchor.
      const mapId = pick(["crystal_hollows", HOME_EXTERIOR_MAP_ID, "clockwork_ruins"]);
      const which = pick(["player", "motion"]);
      both(f => {
        if (which === "player") f.patch("player", { mapId });
        else { const motion = f.db.playerMotion.identity.find(f.ctx.sender); if (motion) f.db.playerMotion.networkId.update({ ...motion, mapId }); }
      });
    } else if (roll < 0.88) {
      // No motion row at all: the first packet after world entry.
      both(f => { const motion = f.db.playerMotion.identity.find(f.ctx.sender); if (motion) f.db.playerMotion.networkId.delete(motion.networkId); });
    } else if (roll < 0.92) {
      const kind = pick(["blocked", "expired", "signin", "clear"]);
      both(f => {
        const now = f.ctx.timestamp.microsSinceUnixEpoch;
        const row = { identity: f.ctx.sender, revokedAtMicros: now,
          blockedUntilMicros: kind === "blocked" ? now + 30_000_000n : kind === "expired" ? now - 1n : 0n, requireSignIn: kind === "signin" };
        if (f.db.defeatSessionRestriction.identity.find(f.ctx.sender)) f.db.defeatSessionRestriction.identity.delete(f.ctx.sender);
        if (kind !== "clear") f.db.defeatSessionRestriction.insert(row);
      });
    } else if (roll < 0.96) {
      const kind = pick(["no-controller", "controller", "old-protocol", "protocol", "no-connection", "connection"]);
      both(f => {
        if (kind === "no-controller") { if (f.db.playerController.identity.find(f.ctx.sender)) f.db.playerController.identity.delete(f.ctx.sender); }
        else if (kind === "controller") { if (!f.db.playerController.identity.find(f.ctx.sender)) f.db.playerController.insert(savedController); }
        else if (kind === "no-connection") f.ctx.connectionId = null;
        else if (kind === "connection") f.ctx.connectionId = savedController.connectionId;
        else {
          const session = f.db.playerSession.connectionId.find(savedController.connectionId);
          f.db.playerSession.connectionId.update({ ...session, protocolVersion: kind === "old-protocol" ? 0 : COMPATIBLE_PROTOCOL_VERSIONS[0] });
        }
      });
    } else {
      const present = Boolean(next.db.playerProgress.identity.find(next.ctx.sender));
      both(f => { if (present) f.db.playerProgress.identity.delete(f.ctx.sender); else f.db.playerProgress.insert(savedProgress); });
    }

    if (outcome) expect(outcome[0], `seed ${seed} step ${step}`).toEqual(outcome[1]);
    const after = dump(next.db), before = dump(prev.db);
    if (after !== before) expect(JSON.parse(after), `seed ${seed} step ${step}`).toEqual(JSON.parse(before));
  }
}

it("accepts, corrects and writes exactly what the old movement path did, packet for packet", { timeout: 60_000 }, () => {
  // Randomised, but seeded: a failure names the seed and step to replay.
  for (let seed = 1; seed <= 250; seed++) runScenario(seed, 40);
  // The run is only proof if it reached every branch, on both sides of each edge.
  expect(tally.accepted).toBeGreaterThan(2_000);
  expect(tally.stale).toBeGreaterThan(200);
  expect(tally.errors).toBeGreaterThan(50);
  expect(tally.speedClamped).toBeGreaterThan(300);
  expect(tally.pulledBack).toBeGreaterThan(250);
  expect(tally.ownedSpeedOnly).toBeGreaterThan(100);
  expect(tally.ownedReachOnly).toBeGreaterThan(50);
  expect(tally.accepted - tally.speedClamped).toBeGreaterThan(1_000);
  expect(tally.nearReachEdge).toBeGreaterThan(300);
});

it("does not read progress, research or the inventory for a packet within the player row's speed", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([BLACK_BOOTS]), equippedFeet: BLACK_BOOTS, infernalUnlocked: true });
  f.seed("playerResearch", { identity: f.ctx.sender, moveSpeed: 3 });
  const move = (x: number, vx: number, sequence: number) =>
    f.run(server.updateMovementState, { x, y: 4000, vx, vy: 0, simulationTick: sequence, motionEpoch: 1, sequence });
  const later = () => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 500_000n); };
  move(4000, 180, 1);
  later();
  const calls: string[] = [];
  const wrap = (table: string, index: string, method: string) => {
    const api = f.db[table][index]; const original = api[method];
    api[method] = (...args: any[]) => { calls.push(`${table}.${index}.${method}`); return original(...args); };
  };
  for (const table of Object.keys(f.db)) for (const [index, api] of Object.entries(f.db[table]))
    if (api && typeof api === "object") for (const method of ["find", "filter", "update", "delete"]) if (typeof (api as any)[method] === "function") wrap(table, index, method);
  move(4090, 180, 2);                                  // a keyboard heartbeat
  expect(calls).toEqual([
    "defeatSessionRestriction.identity.find", "playerSession.connectionId.find", "player.identity.find",
    "playerMotion.identity.find", "playerController.identity.find", "duel.byChallenger.filter", "playerMotion.networkId.update",
  ]);
  calls.length = 0;
  later();
  move(4180, 210, 3);                                  // Black Boots: past the row's speed, so it is worked out
  expect(calls).toContain("playerProgress.identity.find");
  expect(calls.filter(call => call === "playerProgress.identity.find")).toHaveLength(1);
  expect(f.db.playerMotion.identity.find(f.ctx.sender).vx).toBeCloseTo(210, 3);
});
