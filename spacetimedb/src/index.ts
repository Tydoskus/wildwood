import { schema, table, t } from "spacetimedb/server";

const WORLD = { width: 4800, height: 4800 };
const PLAYER_RADIUS = 17;
const PLAYER_SPEED = 175;
const DEFAULT_ATTACK_RANGE = 250;
const PLAYER_SPAWN = { x: 360, y: 360 };
const BOOTS_SPEED_MULTIPLIER = 1.5;
const MAX_INPUT_STEP_SECONDS = 0.2;
const STALE_PLAYER_SECONDS = 15;
const CHAT_MESSAGE_MAX_LENGTH = 250;
const CHAT_COOLDOWN_MICROS = 400_000n;
const CHAT_HISTORY_RETENTION_MICROS = 10_800_000_000n;
const DUEL_REQUEST_RANGE = 250;
const DUEL_REQUEST_TIMEOUT_MICROS = 30_000_000n;
const DUEL_DURATION_MICROS = 30_000_000n;
const DUEL_ARENA = {
  challenger: { x: 2280, y: 2400 },
  opponent: { x: 2520, y: 2400 },
};

const NAME_ADJECTIVES = ["Mossy", "Bright", "Quiet", "Brave", "Dusky", "Lucky", "Wild", "Clever"];
const NAME_CREATURES = ["Fox", "Owl", "Badger", "Hare", "Raven", "Wolf", "Deer", "Moth"];

const player = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    x: t.f64(),
    y: t.f64(),
    facing: t.f64(),
    hp: t.f32(),
    maxHp: t.f32(),
    speed: t.f32(),
    moving: t.bool(),
    lastInputAt: t.timestamp(),
    lastInputSequence: t.u32().default(0),
  },
);

const playerProfile = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
  },
);

const playerProgress = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    maxHp: t.f32(),
    damage: t.f32(),
    attackRate: t.f32(),
    projectileSpeed: t.f32(),
    projectileCount: t.u32(),
    attackRange: t.f32(),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
    bootsCollected: t.bool(),
  },
);

const chatMessage = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sender: t.identity(),
    senderName: t.string(),
    message: t.string(),
    sentAt: t.timestamp(),
  },
);

const duel = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    challenger: t.identity(),
    opponent: t.identity(),
    status: t.string(),
    createdAt: t.timestamp(),
    startedAt: t.timestamp(),
    endsAtMicros: t.u64(),
    lastResolvedAt: t.timestamp(),
    challengerOriginX: t.f64(),
    challengerOriginY: t.f64(),
    opponentOriginX: t.f64(),
    opponentOriginY: t.f64(),
    challengerHp: t.f32(),
    challengerMaxHp: t.f32(),
    challengerDamage: t.f32(),
    challengerArmor: t.f32(),
    challengerAttackRate: t.f32(),
    opponentHp: t.f32(),
    opponentMaxHp: t.f32(),
    opponentDamage: t.f32(),
    opponentArmor: t.f32(),
    opponentAttackRate: t.f32(),
  },
);

const spacetimedb = schema({ player, playerProfile, playerProgress, chatMessage, duel });
export default spacetimedb;

function generatedDisplayName(identity: { toHexString: () => string }) {
  let hash = 2166136261;
  for (const character of identity.toHexString()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const adjective = NAME_ADJECTIVES[(hash >>> 0) % NAME_ADJECTIVES.length];
  const creature = NAME_CREATURES[((hash >>> 8) >>> 0) % NAME_CREATURES.length];
  const number = String((hash >>> 16) % 1000).padStart(3, "0");
  return `${adjective} ${creature} ${number}`;
}

function defaultPlayerProgress(identity: any) {
  return {
    identity,
    maxHp: 30,
    damage: 4,
    attackRate: 0.78,
    projectileSpeed: 390,
    projectileCount: 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    armor: 0,
    regen: 0,
    speed: PLAYER_SPEED,
    bootsCollected: false,
  };
}

function sameIdentity(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

function activeDuelFor(ctx: any, identity: any) {
  for (const current of ctx.db.duel.iter() as Iterable<any>) {
    if (
      (current.status === "requested" || current.status === "active") &&
      (sameIdentity(current.challenger, identity) || sameIdentity(current.opponent, identity))
    ) {
      return current;
    }
  }
  return null;
}

function clearExpiredDuelRequests(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expiredIds: bigint[] = [];
  for (const current of ctx.db.duel.iter() as Iterable<any>) {
    if (
      current.status === "requested" &&
      now - current.createdAt.microsSinceUnixEpoch >= DUEL_REQUEST_TIMEOUT_MICROS
    ) {
      expiredIds.push(current.id);
    }
  }
  for (const id of expiredIds) ctx.db.duel.id.delete(id);
}

function insertDuelAnnouncement(ctx: any, winner: any, loser: any) {
  const winnerName = ctx.db.playerProfile.identity.find(winner)?.displayName ?? "PLAYER";
  const loserName = ctx.db.playerProfile.identity.find(loser)?.displayName ?? "PLAYER";
  ctx.db.chatMessage.insert({
    id: 0n,
    sender: winner,
    senderName: "DUEL",
    message: `${winnerName} beat ${loserName} in a duel.`,
    sentAt: ctx.timestamp,
  });
}

function returnDuelPlayer(ctx: any, identity: any, x: number, y: number, maxHp: number) {
  const current = ctx.db.player.identity.find(identity);
  if (!current) return;
  ctx.db.player.identity.update({
    ...current,
    x,
    y,
    hp: maxHp,
    maxHp,
    moving: false,
    lastInputAt: ctx.timestamp,
  });
}

function finishDuel(ctx: any, current: any) {
  returnDuelPlayer(
    ctx,
    current.challenger,
    current.challengerOriginX,
    current.challengerOriginY,
    current.challengerMaxHp,
  );
  returnDuelPlayer(
    ctx,
    current.opponent,
    current.opponentOriginX,
    current.opponentOriginY,
    current.opponentMaxHp,
  );

  if (current.challengerHp > current.opponentHp) {
    insertDuelAnnouncement(ctx, current.challenger, current.opponent);
  } else if (current.opponentHp > current.challengerHp) {
    insertDuelAnnouncement(ctx, current.opponent, current.challenger);
  } else {
    const challengerName = ctx.db.playerProfile.identity.find(current.challenger)?.displayName ?? "PLAYER";
    const opponentName = ctx.db.playerProfile.identity.find(current.opponent)?.displayName ?? "PLAYER";
    ctx.db.chatMessage.insert({
      id: 0n,
      sender: current.challenger,
      senderName: "DUEL",
      message: `${challengerName} and ${opponentName} drew a duel.`,
      sentAt: ctx.timestamp,
    });
  }
  ctx.db.duel.id.delete(current.id);
}

function resolveDuel(ctx: any, current: any) {
  const resolutionMicros = current.endsAtMicros < ctx.timestamp.microsSinceUnixEpoch
    ? current.endsAtMicros
    : ctx.timestamp.microsSinceUnixEpoch;
  const elapsedSeconds = Math.max(0, Number(resolutionMicros - current.lastResolvedAt.microsSinceUnixEpoch) / 1_000_000);
  if (elapsedSeconds <= 0) {
    if (ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros) finishDuel(ctx, current);
    return;
  }

  const challengerTaken = Math.max(1, current.opponentDamage - current.challengerArmor)
    * elapsedSeconds / current.opponentAttackRate;
  const opponentTaken = Math.max(1, current.challengerDamage - current.opponentArmor)
    * elapsedSeconds / current.challengerAttackRate;
  const next = {
    ...current,
    challengerHp: Math.max(0, current.challengerHp - challengerTaken),
    opponentHp: Math.max(0, current.opponentHp - opponentTaken),
    lastResolvedAt: { microsSinceUnixEpoch: resolutionMicros },
  };

  if (
    next.challengerHp <= 0 ||
    next.opponentHp <= 0 ||
    ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
  ) {
    finishDuel(ctx, next);
  } else {
    ctx.db.duel.id.update(next);
  }
}

function clearStalePlayers(ctx: { db: { player: { iter: () => Iterable<unknown>; identity: { delete: (identity: never) => void } } }; timestamp: { microsSinceUnixEpoch: bigint } }) {
  const cutoff = ctx.timestamp.microsSinceUnixEpoch - BigInt(STALE_PLAYER_SECONDS * 1_000_000);
  const staleIdentities: never[] = [];

  for (const candidate of ctx.db.player.iter() as Iterable<{ identity: never; lastInputAt: { microsSinceUnixEpoch: bigint } }>) {
    if (candidate.lastInputAt.microsSinceUnixEpoch < cutoff) staleIdentities.push(candidate.identity);
  }

  for (const identity of staleIdentities) ctx.db.player.identity.delete(identity);
}

export const onConnect = spacetimedb.clientConnected((ctx) => {
  clearStalePlayers(ctx);

  const existingProfile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!existingProfile) {
    ctx.db.playerProfile.insert({
      identity: ctx.sender,
      displayName: generatedDisplayName(ctx.sender),
    });
  }

  const existingProgress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!existingProgress) {
    ctx.db.playerProgress.insert(defaultPlayerProgress(ctx.sender));
  } else if (existingProgress.attackRange < DEFAULT_ATTACK_RANGE) {
    ctx.db.playerProgress.identity.update({
      ...existingProgress,
      attackRange: DEFAULT_ATTACK_RANGE,
    });
  }

  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    if (activeDuelFor(ctx, ctx.sender)?.status === "active") {
      ctx.db.player.identity.update({
        ...existing,
        moving: false,
        lastInputAt: ctx.timestamp,
      });
      return;
    }
    ctx.db.player.identity.update({
      ...existing,
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      facing: 0,
      moving: false,
      lastInputAt: ctx.timestamp,
      lastInputSequence: 0,
    });
    return;
  }

  ctx.db.player.insert({
    identity: ctx.sender,
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    facing: 0,
    hp: 30,
    maxHp: 30,
    speed: PLAYER_SPEED,
    moving: false,
    lastInputAt: ctx.timestamp,
    lastInputSequence: 0,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const currentDuel = activeDuelFor(ctx, ctx.sender);
  if (currentDuel) {
    const challengerDisconnected = sameIdentity(currentDuel.challenger, ctx.sender);
    const remainingIdentity = challengerDisconnected
      ? currentDuel.opponent
      : currentDuel.challenger;
    const remainingX = challengerDisconnected
      ? currentDuel.opponentOriginX
      : currentDuel.challengerOriginX;
    const remainingY = challengerDisconnected
      ? currentDuel.opponentOriginY
      : currentDuel.challengerOriginY;
    const remainingMaxHp = challengerDisconnected
      ? currentDuel.opponentMaxHp
      : currentDuel.challengerMaxHp;
    returnDuelPlayer(ctx, remainingIdentity, remainingX, remainingY, remainingMaxHp);
    ctx.db.duel.id.delete(currentDuel.id);
  }
  ctx.db.player.identity.delete(ctx.sender);
});

export const setDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const normalized = displayName.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(normalized)) {
      throw new Error("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores");
    }

    const existing = ctx.db.playerProfile.identity.find(ctx.sender);
    if (existing) {
      ctx.db.playerProfile.identity.update({ ...existing, displayName: normalized });
    } else {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: normalized });
    }
  },
);

export const savePlayerProgress = spacetimedb.reducer(
  {
    maxHp: t.f32(),
    damage: t.f32(),
    attackRate: t.f32(),
    projectileSpeed: t.f32(),
    projectileCount: t.u32(),
    attackRange: t.f32(),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
    bootsCollected: t.bool(),
  },
  (ctx, progress) => {
    const values = [
      progress.maxHp,
      progress.damage,
      progress.attackRate,
      progress.projectileSpeed,
      progress.attackRange,
      progress.armor,
      progress.regen,
      progress.speed,
    ];
    if (
      values.some((value) => !Number.isFinite(value)) ||
      !Number.isInteger(progress.projectileCount) ||
      progress.maxHp < 1 || progress.maxHp > 1_000_000 ||
      progress.damage < 1 || progress.damage > 1_000_000 ||
      progress.attackRate < 0.16 || progress.attackRate > 10 ||
      progress.projectileSpeed < 390 || progress.projectileSpeed > 2_730 ||
      progress.projectileCount < 1 || progress.projectileCount > 20 ||
      progress.attackRange < DEFAULT_ATTACK_RANGE || progress.attackRange > 5_000 ||
      progress.armor < 0 || progress.armor > 1_000_000 ||
      progress.regen < 0 || progress.regen > 1_000_000 ||
      progress.speed < 1 || progress.speed > 2_000
    ) {
      throw new Error("Invalid player progress");
    }

    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    const next = { identity: ctx.sender, ...progress };
    if (current) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
  },
);

export const resetPlayerProgress = spacetimedb.reducer(
  {},
  (ctx) => {
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    const next = defaultPlayerProgress(ctx.sender);
    if (current) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
  },
);

export const sendChatMessage = spacetimedb.reducer(
  { message: t.string() },
  (ctx, { message }) => {
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) return;

    const normalized = message.trim();
    if (!normalized) return;
    if (normalized.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new Error("Chat message is too long");
    }

    const cooldownCutoff = ctx.timestamp.microsSinceUnixEpoch - CHAT_COOLDOWN_MICROS;
    const historyCutoff = ctx.timestamp.microsSinceUnixEpoch - CHAT_HISTORY_RETENTION_MICROS;
    const staleMessageIds: bigint[] = [];
    let isCoolingDown = false;
    for (const previous of ctx.db.chatMessage.iter() as Iterable<{ id: bigint; sender: never; sentAt: { microsSinceUnixEpoch: bigint } }>) {
      if (previous.sentAt.microsSinceUnixEpoch < historyCutoff) staleMessageIds.push(previous.id);
      if (previous.sender === ctx.sender && previous.sentAt.microsSinceUnixEpoch > cooldownCutoff) {
        isCoolingDown = true;
      }
    }
    for (const id of staleMessageIds) ctx.db.chatMessage.id.delete(id);
    if (isCoolingDown) return;

    ctx.db.chatMessage.insert({
      id: 0n,
      sender: ctx.sender,
      senderName: profile.displayName,
      message: normalized,
      sentAt: ctx.timestamp,
    });
  },
);

export const requestDuel = spacetimedb.reducer(
  {},
  (ctx) => {
    clearExpiredDuelRequests(ctx);
    const challenger = ctx.db.player.identity.find(ctx.sender);
    if (!challenger || activeDuelFor(ctx, ctx.sender)) return;

    let opponent: any = null;
    let closestDistanceSq = DUEL_REQUEST_RANGE * DUEL_REQUEST_RANGE;
    for (const candidate of ctx.db.player.iter() as Iterable<any>) {
      if (sameIdentity(candidate.identity, ctx.sender)) continue;
      if (activeDuelFor(ctx, candidate.identity)) continue;
      const dx = candidate.x - challenger.x;
      const dy = candidate.y - challenger.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= closestDistanceSq) {
        closestDistanceSq = distanceSq;
        opponent = candidate;
      }
    }
    if (!opponent) return;

    ctx.db.duel.insert({
      id: 0n,
      challenger: ctx.sender,
      opponent: opponent.identity,
      status: "requested",
      createdAt: ctx.timestamp,
      startedAt: ctx.timestamp,
      endsAtMicros: ctx.timestamp.microsSinceUnixEpoch,
      lastResolvedAt: ctx.timestamp,
      challengerOriginX: challenger.x,
      challengerOriginY: challenger.y,
      opponentOriginX: opponent.x,
      opponentOriginY: opponent.y,
      challengerHp: 0,
      challengerMaxHp: 0,
      challengerDamage: 0,
      challengerArmor: 0,
      challengerAttackRate: 1,
      opponentHp: 0,
      opponentMaxHp: 0,
      opponentDamage: 0,
      opponentArmor: 0,
      opponentAttackRate: 1,
    });
  },
);

export const acceptDuel = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    clearExpiredDuelRequests(ctx);
    const current = ctx.db.duel.id.find(id);
    if (!current || current.status !== "requested" || !sameIdentity(current.opponent, ctx.sender)) return;
    if (ctx.timestamp.microsSinceUnixEpoch - current.createdAt.microsSinceUnixEpoch > DUEL_REQUEST_TIMEOUT_MICROS) {
      ctx.db.duel.id.delete(current.id);
      return;
    }

    const challenger = ctx.db.player.identity.find(current.challenger);
    const opponent = ctx.db.player.identity.find(current.opponent);
    const challengerProgress = ctx.db.playerProgress.identity.find(current.challenger);
    const opponentProgress = ctx.db.playerProgress.identity.find(current.opponent);
    if (!challenger || !opponent || !challengerProgress || !opponentProgress) {
      ctx.db.duel.id.delete(current.id);
      return;
    }

    const endsAtMicros = ctx.timestamp.microsSinceUnixEpoch + DUEL_DURATION_MICROS;
    ctx.db.duel.id.update({
      ...current,
      status: "active",
      startedAt: ctx.timestamp,
      endsAtMicros,
      lastResolvedAt: ctx.timestamp,
      challengerHp: challengerProgress.maxHp,
      challengerMaxHp: challengerProgress.maxHp,
      challengerDamage: challengerProgress.damage,
      challengerArmor: challengerProgress.armor,
      challengerAttackRate: challengerProgress.attackRate,
      opponentHp: opponentProgress.maxHp,
      opponentMaxHp: opponentProgress.maxHp,
      opponentDamage: opponentProgress.damage,
      opponentArmor: opponentProgress.armor,
      opponentAttackRate: opponentProgress.attackRate,
    });
    ctx.db.player.identity.update({
      ...challenger,
      x: DUEL_ARENA.challenger.x,
      y: DUEL_ARENA.challenger.y,
      hp: challengerProgress.maxHp,
      maxHp: challengerProgress.maxHp,
      moving: false,
      lastInputAt: ctx.timestamp,
    });
    ctx.db.player.identity.update({
      ...opponent,
      x: DUEL_ARENA.opponent.x,
      y: DUEL_ARENA.opponent.y,
      hp: opponentProgress.maxHp,
      maxHp: opponentProgress.maxHp,
      moving: false,
      lastInputAt: ctx.timestamp,
    });
  },
);

export const pulseDuel = spacetimedb.reducer(
  {},
  (ctx) => {
    const current = activeDuelFor(ctx, ctx.sender);
    if (current?.status === "active") resolveDuel(ctx, current);
  },
);

export const move = spacetimedb.reducer(
  { inputX: t.f32(), inputY: t.f32() },
  (ctx, { inputX, inputY }) => {
    clearStalePlayers(ctx);
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current || activeDuelFor(ctx, ctx.sender)?.status === "active") return;

    if (!Number.isFinite(inputX) || !Number.isFinite(inputY)) {
      throw new Error("Movement input must be finite");
    }

    const inputLength = Math.hypot(inputX, inputY);
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const elapsedSeconds = Number(nowMicros - current.lastInputAt.microsSinceUnixEpoch) / 1_000_000;
    const stepSeconds = Math.min(MAX_INPUT_STEP_SECONDS, Math.max(0, elapsedSeconds));

    if (inputLength < 0.01 || stepSeconds === 0) {
      ctx.db.player.identity.update({
        ...current,
        moving: false,
        lastInputAt: ctx.timestamp,
      });
      return;
    }

    const directionX = inputX / inputLength;
    const directionY = inputY / inputLength;
    const x = Math.max(
      PLAYER_RADIUS,
      Math.min(WORLD.width - PLAYER_RADIUS, current.x + directionX * current.speed * stepSeconds),
    );
    const y = Math.max(
      PLAYER_RADIUS,
      Math.min(WORLD.height - PLAYER_RADIUS, current.y + directionY * current.speed * stepSeconds),
    );

    ctx.db.player.identity.update({
      ...current,
      x,
      y,
      facing: Math.atan2(directionY, directionX),
      moving: true,
      lastInputAt: ctx.timestamp,
    });
  },
);

export const moveV2 = spacetimedb.reducer(
  { inputX: t.f32(), inputY: t.f32(), sequence: t.u32() },
  (ctx, { inputX, inputY, sequence }) => {
    clearStalePlayers(ctx);
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current || sequence <= current.lastInputSequence || activeDuelFor(ctx, ctx.sender)?.status === "active") return;

    if (!Number.isFinite(inputX) || !Number.isFinite(inputY)) {
      throw new Error("Movement input must be finite");
    }

    const inputLength = Math.hypot(inputX, inputY);
    if (!current.moving && inputLength >= 0.01) {
      ctx.db.player.identity.update({
        ...current,
        moving: true,
        lastInputAt: ctx.timestamp,
        lastInputSequence: sequence,
      });
      return;
    }

    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const elapsedSeconds = Number(nowMicros - current.lastInputAt.microsSinceUnixEpoch) / 1_000_000;
    const stepSeconds = Math.min(MAX_INPUT_STEP_SECONDS, Math.max(0, elapsedSeconds));

    if (inputLength < 0.01 || stepSeconds === 0) {
      ctx.db.player.identity.update({
        ...current,
        moving: false,
        lastInputAt: ctx.timestamp,
        lastInputSequence: sequence,
      });
      return;
    }

    const directionX = inputX / inputLength;
    const directionY = inputY / inputLength;
    const x = Math.max(
      PLAYER_RADIUS,
      Math.min(WORLD.width - PLAYER_RADIUS, current.x + directionX * current.speed * stepSeconds),
    );
    const y = Math.max(
      PLAYER_RADIUS,
      Math.min(WORLD.height - PLAYER_RADIUS, current.y + directionY * current.speed * stepSeconds),
    );

    ctx.db.player.identity.update({
      ...current,
      x,
      y,
      facing: Math.atan2(directionY, directionX),
      moving: true,
      lastInputAt: ctx.timestamp,
      lastInputSequence: sequence,
    });
  },
);

export const syncPosition = spacetimedb.reducer(
  { x: t.f64(), y: t.f64(), facing: t.f64(), sequence: t.u32() },
  (ctx, { x, y, facing, sequence }) => {
    clearStalePlayers(ctx);
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current || activeDuelFor(ctx, ctx.sender)?.status === "active") return;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) {
      throw new Error("Position sync values must be finite");
    }

    ctx.db.player.identity.update({
      ...current,
      x: Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, x)),
      y: Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, y)),
      facing,
      moving: false,
      lastInputAt: ctx.timestamp,
      lastInputSequence: sequence,
    });
  },
);

export const heartbeat = spacetimedb.reducer(
  {},
  (ctx) => {
    clearExpiredDuelRequests(ctx);
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current) return;

    const activeDuel = activeDuelFor(ctx, ctx.sender);
    if (activeDuel?.status === "active") resolveDuel(ctx, activeDuel);

    ctx.db.player.identity.update({
      ...current,
      lastInputAt: ctx.timestamp,
    });
  },
);

export const setSpeed = spacetimedb.reducer(
  { speed: t.f32() },
  (ctx, { speed }) => {
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current) return;

    const validSpeed = [PLAYER_SPEED, PLAYER_SPEED * BOOTS_SPEED_MULTIPLIER]
      .some((allowed) => Math.abs(speed - allowed) < 0.01);
    if (!validSpeed) throw new Error("Unsupported player speed");

    ctx.db.player.identity.update({
      ...current,
      speed,
      lastInputAt: ctx.timestamp,
    });
  },
);
