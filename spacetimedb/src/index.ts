import { schema, table, t } from "spacetimedb/server";

const WORLD = { width: 4800, height: 4800 };
const PLAYER_RADIUS = 17;
const PLAYER_SPEED = 175;
const DEFAULT_ATTACK_RANGE = 250;
const BOOTS_SPEED_MULTIPLIER = 1.5;
const MAX_INPUT_STEP_SECONDS = 0.2;
const STALE_PLAYER_SECONDS = 15;
const CHAT_MESSAGE_MAX_LENGTH = 250;
const CHAT_COOLDOWN_MICROS = 400_000n;
const CHAT_HISTORY_RETENTION_MICROS = 10_800_000_000n;

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

const spacetimedb = schema({ player, playerProfile, playerProgress, chatMessage });
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
    ctx.db.player.identity.update({
      ...existing,
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      facing: 0,
      moving: false,
      lastInputAt: ctx.timestamp,
      lastInputSequence: 0,
    });
    return;
  }

  ctx.db.player.insert({
    identity: ctx.sender,
    x: WORLD.width / 2,
    y: WORLD.height / 2,
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

export const move = spacetimedb.reducer(
  { inputX: t.f32(), inputY: t.f32() },
  (ctx, { inputX, inputY }) => {
    clearStalePlayers(ctx);
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current) return;

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
    if (!current || sequence <= current.lastInputSequence) return;

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
    if (!current) return;

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
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current) return;

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
