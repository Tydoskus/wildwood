import { schema, table, t } from "spacetimedb/server";

const WORLD = { width: 4800, height: 4800 };
const PLAYER_RADIUS = 17;
const PLAYER_SPEED = 175;
const MAX_INPUT_STEP_SECONDS = 0.2;
const STALE_PLAYER_SECONDS = 15;

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
  },
);

const spacetimedb = schema({ player });
export default spacetimedb;

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

  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({
      ...existing,
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      facing: 0,
      moving: false,
      lastInputAt: ctx.timestamp,
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
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  ctx.db.player.identity.delete(ctx.sender);
});

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
