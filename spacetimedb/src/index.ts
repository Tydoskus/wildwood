import { schema, table, t } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";

const WORLD = { width: 4800, height: 4800 };
const PLAYER_RADIUS = 17;
const PLAYER_SPEED = 175;
const DEFAULT_ATTACK_RANGE = 200;
const PROTOCOL_VERSION = 4;
const SPACETIME_AUTH_ISSUER = "https://auth.spacetimedb.com/oidc";
const SPACETIME_AUTH_CLIENT_ID = "client_03426HMgkAEmdC23XTZRKZ";
const ACCOUNT_LINK_LIFETIME_MICROS = 600_000_000n;
const PLAYER_SPAWN = { x: 360, y: 360 };
const BOOTS_SPEED_MULTIPLIER = 1.5;
const CHAT_MESSAGE_MAX_LENGTH = 250;
const CHAT_COOLDOWN_MICROS = 3_000_000n;
const CHAT_HISTORY_RETENTION_MICROS = 10_800_000_000n;
const CHAT_HISTORY_MAX_ROWS = 200;
const DUEL_REPLAY_RETENTION_MICROS = CHAT_HISTORY_RETENTION_MICROS;
const MAINTENANCE_INTERVAL_MICROS = 60_000_000n;
const DUEL_REQUEST_RANGE = 250;
const DUEL_REQUEST_COOLDOWN_MICROS = 5_000_000n;
const DISPLAY_NAME_COOLDOWN_MICROS = 2_592_000_000_000n;
const DUEL_REQUEST_TIMEOUT_MICROS = 30_000_000n;
const DUEL_COUNTDOWN_MICROS = 3_000_000n;
const DUEL_DURATION_MICROS = 30_000_000n;
const DUEL_ARENA = {
  challenger: { x: 5880, y: 6000 },
  opponent: { x: 6120, y: 6000 },
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
    power: t.u32().default(95),
    protocolVersion: t.u32().default(0),
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
    introComplete: t.bool().default(false),
  },
);

const playerNameCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    changedAt: t.timestamp(),
  },
);

const chatCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    lastSentAt: t.timestamp(),
  },
);

const duelRequestCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    requestedAt: t.timestamp(),
  },
);

// A short-lived, private bridge from an anonymous SpacetimeDB identity to its
// first authenticated SpacetimeAuth identity. The random code never leaves the
// browser that began sign-in and is consumed once claimed.
const accountLink = table(
  { public: false },
  {
    code: t.string().primaryKey(),
    guest: t.identity(),
    createdAt: t.timestamp(),
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
    replayId: t.u64().default(0n),
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
    startsAtMicros: t.u64().default(0n),
    challengerRegen: t.f32().default(0),
    challengerAttacks: t.u32().default(0),
    challengerDamageDealt: t.f32().default(0),
    challengerRegened: t.f32().default(0),
    challengerBlocked: t.f32().default(0),
    opponentRegen: t.f32().default(0),
    opponentAttacks: t.u32().default(0),
    opponentDamageDealt: t.f32().default(0),
    opponentRegened: t.f32().default(0),
    opponentBlocked: t.f32().default(0),
  },
);

const duelReplay = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    challengerName: t.string(),
    opponentName: t.string(),
    winnerName: t.string(),
    durationSeconds: t.f32(),
    challengerMaxHp: t.f32(),
    challengerDamage: t.f32(),
    challengerArmor: t.f32(),
    challengerAttackRate: t.f32(),
    challengerRegen: t.f32(),
    challengerFinalHp: t.f32(),
    challengerAttacks: t.u32(),
    challengerDamageDealt: t.f32(),
    challengerRegened: t.f32(),
    challengerBlocked: t.f32(),
    opponentMaxHp: t.f32(),
    opponentDamage: t.f32(),
    opponentArmor: t.f32(),
    opponentAttackRate: t.f32(),
    opponentRegen: t.f32(),
    opponentFinalHp: t.f32(),
    opponentAttacks: t.u32(),
    opponentDamageDealt: t.f32(),
    opponentRegened: t.f32(),
    opponentBlocked: t.f32(),
    createdAt: t.timestamp(),
  },
);

const maintenanceSchedule = table(
  { scheduled: (): any => runMaintenance },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const spacetimedb = schema({ player, playerProfile, playerProgress, playerNameCooldown, chatCooldown, duelRequestCooldown, accountLink, chatMessage, duel, duelReplay, maintenanceSchedule });
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
    introComplete: false,
  };
}

function powerForProgress(progress: { maxHp: number; damage: number; attackRate: number; armor: number; regen: number }) {
  return Math.max(0, Math.round(
    progress.damage * .15 +
    progress.maxHp +
    progress.armor * 3 +
    progress.regen * 10 +
    50 / progress.attackRate,
  ));
}

function requireCurrentProtocol(ctx: any) {
  const current = ctx.db.player.identity.find(ctx.sender);
  if (!current || current.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error("Wildwood updated. Refresh to continue.");
  }
  return current;
}

function hasSpacetimeAuthAccount(ctx: any) {
  const jwt = ctx.senderAuth?.jwt;
  return Boolean(
    jwt &&
    jwt.issuer === SPACETIME_AUTH_ISSUER &&
    Array.isArray(jwt.audience) &&
    jwt.audience.includes(SPACETIME_AUTH_CLIENT_ID),
  );
}

function clearExpiredAccountLinks(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expiredCodes: string[] = [];
  for (const link of ctx.db.accountLink.iter() as Iterable<any>) {
    if (now - link.createdAt.microsSinceUnixEpoch >= ACCOUNT_LINK_LIFETIME_MICROS) {
      expiredCodes.push(link.code);
    }
  }
  for (const code of expiredCodes) ctx.db.accountLink.code.delete(code);
}

function hasFreshProgress(progress: any) {
  const defaultProgress = defaultPlayerProgress(progress.identity);
  return !progress.introComplete &&
    progress.maxHp === defaultProgress.maxHp &&
    progress.damage === defaultProgress.damage &&
    progress.attackRate === defaultProgress.attackRate &&
    progress.projectileSpeed === defaultProgress.projectileSpeed &&
    progress.projectileCount === defaultProgress.projectileCount &&
    progress.attackRange === defaultProgress.attackRange &&
    progress.armor === defaultProgress.armor &&
    progress.regen === defaultProgress.regen &&
    progress.speed === defaultProgress.speed &&
    progress.bootsCollected === defaultProgress.bootsCollected;
}

function sameIdentity(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

function activeDuelFor(ctx: any, identity: any) {
  for (const current of ctx.db.duel.iter() as Iterable<any>) {
    if (
      (current.status === "requested" || current.status === "countdown" || current.status === "active") &&
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

function ensureMaintenanceSchedule(ctx: any) {
  for (const _task of ctx.db.maintenanceSchedule.iter()) return;
  ctx.db.maintenanceSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(MAINTENANCE_INTERVAL_MICROS),
  });
}

function trimChatHistory(ctx: any) {
  const messages = [...ctx.db.chatMessage.iter()] as Array<{ id: bigint }>;
  if (messages.length <= CHAT_HISTORY_MAX_ROWS) return;
  messages.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const message of messages.slice(0, messages.length - CHAT_HISTORY_MAX_ROWS)) {
    ctx.db.chatMessage.id.delete(message.id);
  }
}

function insertChatMessage(ctx: any, sender: any, senderName: string, message: string, replayId = 0n) {
  ctx.db.chatMessage.insert({
    id: 0n,
    sender,
    senderName,
    message,
    replayId,
    sentAt: ctx.timestamp,
  });
  trimChatHistory(ctx);
}

function insertDuelAnnouncement(ctx: any, winnerName: string, loserName: string, replayId: bigint) {
  insertChatMessage(ctx, ctx.sender, "DUEL", `${winnerName} beat ${loserName} in a duel.`, replayId);
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

function syncDuelPlayerHealth(ctx: any, current: any) {
  const challenger = ctx.db.player.identity.find(current.challenger);
  const opponent = ctx.db.player.identity.find(current.opponent);
  if (challenger) {
    ctx.db.player.identity.update({
      ...challenger,
      hp: current.challengerHp,
      maxHp: current.challengerMaxHp,
      moving: false,
      lastInputAt: ctx.timestamp,
    });
  }
  if (opponent) {
    ctx.db.player.identity.update({
      ...opponent,
      hp: current.opponentHp,
      maxHp: current.opponentMaxHp,
      moving: false,
      lastInputAt: ctx.timestamp,
    });
  }
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

  const challengerName = ctx.db.playerProfile.identity.find(current.challenger)?.displayName ?? "PLAYER";
  const opponentName = ctx.db.playerProfile.identity.find(current.opponent)?.displayName ?? "PLAYER";
  const challengerWon = current.challengerHp > current.opponentHp;
  const opponentWon = current.opponentHp > current.challengerHp;
  const winnerName = challengerWon ? challengerName : opponentWon ? opponentName : "DRAW";
  const durationSeconds = Math.max(0, Number(current.lastResolvedAt.microsSinceUnixEpoch - current.startsAtMicros) / 1_000_000);

  ctx.db.duelReplay.insert({
    id: current.id,
    challengerName,
    opponentName,
    winnerName,
    durationSeconds,
    challengerMaxHp: current.challengerMaxHp,
    challengerDamage: current.challengerDamage,
    challengerArmor: current.challengerArmor,
    challengerAttackRate: current.challengerAttackRate,
    challengerRegen: current.challengerRegen,
    challengerFinalHp: current.challengerHp,
    challengerAttacks: current.challengerAttacks,
    challengerDamageDealt: current.challengerDamageDealt,
    challengerRegened: current.challengerRegened,
    challengerBlocked: current.challengerBlocked,
    opponentMaxHp: current.opponentMaxHp,
    opponentDamage: current.opponentDamage,
    opponentArmor: current.opponentArmor,
    opponentAttackRate: current.opponentAttackRate,
    opponentRegen: current.opponentRegen,
    opponentFinalHp: current.opponentHp,
    opponentAttacks: current.opponentAttacks,
    opponentDamageDealt: current.opponentDamageDealt,
    opponentRegened: current.opponentRegened,
    opponentBlocked: current.opponentBlocked,
    createdAt: ctx.timestamp,
  });

  if (challengerWon) {
    insertDuelAnnouncement(ctx, challengerName, opponentName, current.id);
  } else if (opponentWon) {
    insertDuelAnnouncement(ctx, opponentName, challengerName, current.id);
  } else {
    insertChatMessage(ctx, ctx.sender, "DUEL", `${challengerName} and ${opponentName} drew a duel.`, current.id);
  }
  ctx.db.duel.id.delete(current.id);
}

function resolveDuel(ctx: any, current: any) {
  if (current.status === "countdown") {
    if (ctx.timestamp.microsSinceUnixEpoch < current.startsAtMicros) return;
    ctx.db.duel.id.update({
      ...current,
      status: "active",
      startedAt: ctx.timestamp,
      lastResolvedAt: ctx.timestamp,
    });
    return;
  }
  const resolutionMicros = current.endsAtMicros < ctx.timestamp.microsSinceUnixEpoch
    ? current.endsAtMicros
    : ctx.timestamp.microsSinceUnixEpoch;
  const elapsedSeconds = Math.max(0, Number(resolutionMicros - current.lastResolvedAt.microsSinceUnixEpoch) / 1_000_000);
  if (elapsedSeconds <= 0) {
    if (ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros) finishDuel(ctx, current);
    return;
  }

  const duelSeconds = Math.max(0, Number(resolutionMicros - current.startsAtMicros) / 1_000_000);
  const challengerAttacks = Math.floor(duelSeconds / current.challengerAttackRate);
  const opponentAttacks = Math.floor(duelSeconds / current.opponentAttackRate);
  const newChallengerAttacks = Math.max(0, challengerAttacks - current.challengerAttacks);
  const newOpponentAttacks = Math.max(0, opponentAttacks - current.opponentAttacks);
  const challengerHit = Math.max(1, current.challengerDamage - current.opponentArmor);
  const opponentHit = Math.max(1, current.opponentDamage - current.challengerArmor);
  const challengerRegen = Math.min(
    current.challengerMaxHp - current.challengerHp,
    current.challengerRegen * elapsedSeconds,
  );
  const opponentRegen = Math.min(
    current.opponentMaxHp - current.opponentHp,
    current.opponentRegen * elapsedSeconds,
  );
  const challengerHpAfterRegen = current.challengerHp + challengerRegen;
  const opponentHpAfterRegen = current.opponentHp + opponentRegen;
  const challengerTaken = Math.min(challengerHpAfterRegen, opponentHit * newOpponentAttacks);
  const opponentTaken = Math.min(opponentHpAfterRegen, challengerHit * newChallengerAttacks);
  const next = {
    ...current,
    challengerHp: Math.max(0, challengerHpAfterRegen - challengerTaken),
    opponentHp: Math.max(0, opponentHpAfterRegen - opponentTaken),
    challengerAttacks,
    opponentAttacks,
    challengerDamageDealt: current.challengerDamageDealt + opponentTaken,
    opponentDamageDealt: current.opponentDamageDealt + challengerTaken,
    challengerRegened: current.challengerRegened + challengerRegen,
    opponentRegened: current.opponentRegened + opponentRegen,
    challengerBlocked: current.challengerBlocked + Math.min(current.opponentArmor, Math.max(0, current.challengerDamage - 1)) * newChallengerAttacks,
    opponentBlocked: current.opponentBlocked + Math.min(current.challengerArmor, Math.max(0, current.opponentDamage - 1)) * newOpponentAttacks,
    lastResolvedAt: ctx.timestamp,
  };

  if (
    next.challengerHp <= 0 ||
    next.opponentHp <= 0 ||
    ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
  ) {
    finishDuel(ctx, next);
  } else {
    syncDuelPlayerHealth(ctx, next);
    ctx.db.duel.id.update(next);
  }
}

function clearExpiredHistory(ctx: any) {
  const chatCutoff = ctx.timestamp.microsSinceUnixEpoch - CHAT_HISTORY_RETENTION_MICROS;
  const replayCutoff = ctx.timestamp.microsSinceUnixEpoch - DUEL_REPLAY_RETENTION_MICROS;
  const staleMessageIds: bigint[] = [];
  const staleReplayIds: bigint[] = [];

  for (const message of ctx.db.chatMessage.iter() as Iterable<any>) {
    if (message.sentAt.microsSinceUnixEpoch < chatCutoff) staleMessageIds.push(message.id);
  }
  for (const replay of ctx.db.duelReplay.iter() as Iterable<any>) {
    if (replay.createdAt.microsSinceUnixEpoch < replayCutoff) staleReplayIds.push(replay.id);
  }

  for (const id of staleMessageIds) ctx.db.chatMessage.id.delete(id);
  for (const id of staleReplayIds) ctx.db.duelReplay.id.delete(id);
  trimChatHistory(ctx);
}

export const onConnect = spacetimedb.clientConnected((ctx) => {
  ensureMaintenanceSchedule(ctx);

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
  } else if (existingProgress.attackRange !== DEFAULT_ATTACK_RANGE) {
    ctx.db.playerProgress.identity.update({
      ...existingProgress,
      attackRange: DEFAULT_ATTACK_RANGE,
    });
  }

  const existing = ctx.db.player.identity.find(ctx.sender);
  const progressForPresence = existingProgress ?? defaultPlayerProgress(ctx.sender);
  if (existing) {
    if (["countdown", "active"].includes(activeDuelFor(ctx, ctx.sender)?.status)) {
      ctx.db.player.identity.update({
        ...existing,
        power: powerForProgress(progressForPresence),
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
      power: powerForProgress(progressForPresence),
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
    power: powerForProgress(progressForPresence),
    speed: PLAYER_SPEED,
    moving: false,
    lastInputAt: ctx.timestamp,
    lastInputSequence: 0,
    protocolVersion: 0,
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

export const runMaintenance = spacetimedb.reducer(
  { maintenance: maintenanceSchedule.rowType },
  (ctx, { maintenance }) => {
    void maintenance;
    clearExpiredDuelRequests(ctx);
    clearExpiredHistory(ctx);
    clearExpiredAccountLinks(ctx);
  },
);

export const registerProtocol = spacetimedb.reducer(
  { protocolVersion: t.u32() },
  (ctx, { protocolVersion }) => {
    if (protocolVersion !== PROTOCOL_VERSION) {
      throw new Error("Wildwood updated. Refresh to continue.");
    }
    const current = ctx.db.player.identity.find(ctx.sender);
    if (!current) throw new Error("Player connection not ready.");
    ctx.db.player.identity.update({ ...current, protocolVersion });
  },
);

export const beginAccountLink = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    requireCurrentProtocol(ctx);
    if (hasSpacetimeAuthAccount(ctx)) throw new Error("Already signed in.");
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) throw new Error("Invalid account link.");
    clearExpiredAccountLinks(ctx);
    if (ctx.db.accountLink.code.find(code)) throw new Error("Account link already exists.");
    ctx.db.accountLink.insert({ code, guest: ctx.sender, createdAt: ctx.timestamp });
  },
);

export const claimGuestAccount = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    requireCurrentProtocol(ctx);
    if (!hasSpacetimeAuthAccount(ctx)) throw new Error("Sign in required.");
    clearExpiredAccountLinks(ctx);

    const link = ctx.db.accountLink.code.find(code);
    if (!link) throw new Error("Account link expired. Sign in again.");
    if (sameIdentity(link.guest, ctx.sender)) throw new Error("Invalid account link.");

    const accountProgress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (accountProgress && !hasFreshProgress(accountProgress)) {
      throw new Error("This account already has Wildwood progress.");
    }

    const guestProgress = ctx.db.playerProgress.identity.find(link.guest);
    const nextProgress = guestProgress
      ? { ...guestProgress, identity: ctx.sender }
      : defaultPlayerProgress(ctx.sender);
    if (accountProgress) ctx.db.playerProgress.identity.update(nextProgress);
    else ctx.db.playerProgress.insert(nextProgress);

    const guestProfile = ctx.db.playerProfile.identity.find(link.guest);
    const accountProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (guestProfile && accountProfile) {
      ctx.db.playerProfile.identity.update({ ...accountProfile, displayName: guestProfile.displayName });
    } else if (guestProfile) {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: guestProfile.displayName });
    }

    const guestNameCooldown = ctx.db.playerNameCooldown.identity.find(link.guest);
    const accountNameCooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
    if (guestNameCooldown && accountNameCooldown) {
      ctx.db.playerNameCooldown.identity.update({ ...accountNameCooldown, changedAt: guestNameCooldown.changedAt });
    } else if (guestNameCooldown) {
      ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: guestNameCooldown.changedAt });
    }

    const activePlayer = ctx.db.player.identity.find(ctx.sender);
    if (activePlayer) {
      ctx.db.player.identity.update({
        ...activePlayer,
        hp: nextProgress.maxHp,
        maxHp: nextProgress.maxHp,
        speed: nextProgress.speed,
        power: powerForProgress(nextProgress),
      });
    }
    ctx.db.accountLink.code.delete(code);
  },
);

export const setDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    requireCurrentProtocol(ctx);
    const normalized = displayName.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(normalized)) {
      throw new Error("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores");
    }

    const cooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
    if (cooldown && ctx.timestamp.microsSinceUnixEpoch - cooldown.changedAt.microsSinceUnixEpoch < DISPLAY_NAME_COOLDOWN_MICROS) {
      throw new Error("Display name can be changed once every 30 days.");
    }

    const existing = ctx.db.playerProfile.identity.find(ctx.sender);
    if (existing) {
      ctx.db.playerProfile.identity.update({ ...existing, displayName: normalized });
    } else {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: normalized });
    }
    if (cooldown) ctx.db.playerNameCooldown.identity.update({ ...cooldown, changedAt: ctx.timestamp });
    else ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: ctx.timestamp });
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
    const activePlayer = requireCurrentProtocol(ctx);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    const base = current ?? defaultPlayerProgress(ctx.sender);
    const bounded = (value: number, min: number, max: number, fallback: number) =>
      Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    const normalized = {
      maxHp: bounded(progress.maxHp, 1, 1_000_000, base.maxHp),
      damage: bounded(progress.damage, 1, 1_000_000, base.damage),
      attackRate: bounded(progress.attackRate, .16, 10, base.attackRate),
      projectileSpeed: bounded(progress.projectileSpeed, 390, 2_730, base.projectileSpeed),
      projectileCount: Number.isInteger(progress.projectileCount)
        ? Math.max(1, Math.min(20, progress.projectileCount))
        : base.projectileCount,
      armor: bounded(progress.armor, 0, 1_000_000, base.armor),
      regen: bounded(progress.regen, 0, 1_000_000, base.regen),
      speed: bounded(progress.speed, 1, 2_000, base.speed),
      bootsCollected: progress.bootsCollected === true,
    };
    const next = {
      identity: ctx.sender,
      maxHp: Math.max(base.maxHp, normalized.maxHp),
      damage: Math.max(base.damage, normalized.damage),
      attackRate: Math.min(base.attackRate, normalized.attackRate),
      projectileSpeed: Math.max(base.projectileSpeed, normalized.projectileSpeed),
      projectileCount: Math.max(base.projectileCount, normalized.projectileCount),
      attackRange: DEFAULT_ATTACK_RANGE,
      armor: Math.max(base.armor, normalized.armor),
      regen: Math.max(base.regen, normalized.regen),
      speed: Math.max(base.speed, normalized.speed),
      bootsCollected: base.bootsCollected || normalized.bootsCollected,
      introComplete: base.introComplete,
    };
    if (current) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
    ctx.db.player.identity.update({
      ...activePlayer,
      hp: next.maxHp,
      maxHp: next.maxHp,
      power: powerForProgress(next),
      speed: next.speed,
    });
  },
);

export const beginAdventure = spacetimedb.reducer(
  {},
  (ctx) => {
    requireCurrentProtocol(ctx);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    if (current?.introComplete) return;
    if (current) ctx.db.playerProgress.identity.update({ ...current, introComplete: true });
    else ctx.db.playerProgress.insert({ ...defaultPlayerProgress(ctx.sender), introComplete: true });
  },
);

export const resetPlayerProgress = spacetimedb.reducer(
  {},
  (ctx) => {
    const activePlayer = requireCurrentProtocol(ctx);
    const current = ctx.db.playerProgress.identity.find(ctx.sender);
    const next = defaultPlayerProgress(ctx.sender);
    if (current) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
    ctx.db.player.identity.update({
      ...activePlayer,
      hp: next.maxHp,
      maxHp: next.maxHp,
      power: powerForProgress(next),
      speed: next.speed,
    });
  },
);

export const sendChatMessage = spacetimedb.reducer(
  { message: t.string() },
  (ctx, { message }) => {
    requireCurrentProtocol(ctx);
    const profile = ctx.db.playerProfile.identity.find(ctx.sender);
    if (!profile) return;

    const normalized = message.trim();
    if (!normalized) return;
    if (normalized.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new Error("Chat message is too long");
    }

    const cooldown = ctx.db.chatCooldown.identity.find(ctx.sender);
    if (cooldown && ctx.timestamp.microsSinceUnixEpoch - cooldown.lastSentAt.microsSinceUnixEpoch < CHAT_COOLDOWN_MICROS) return;
    if (cooldown) ctx.db.chatCooldown.identity.update({ ...cooldown, lastSentAt: ctx.timestamp });
    else ctx.db.chatCooldown.insert({ identity: ctx.sender, lastSentAt: ctx.timestamp });
    insertChatMessage(ctx, ctx.sender, profile.displayName, normalized);
  },
);

export const requestDuel = spacetimedb.reducer(
  {},
  (ctx) => {
    const challenger = requireCurrentProtocol(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;

    const cooldown = ctx.db.duelRequestCooldown.identity.find(ctx.sender);
    if (cooldown && ctx.timestamp.microsSinceUnixEpoch - cooldown.requestedAt.microsSinceUnixEpoch < DUEL_REQUEST_COOLDOWN_MICROS) return;
    if (cooldown) ctx.db.duelRequestCooldown.identity.update({ ...cooldown, requestedAt: ctx.timestamp });
    else ctx.db.duelRequestCooldown.insert({ identity: ctx.sender, requestedAt: ctx.timestamp });

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
      startsAtMicros: ctx.timestamp.microsSinceUnixEpoch,
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
      challengerRegen: 0,
      challengerAttacks: 0,
      challengerDamageDealt: 0,
      challengerRegened: 0,
      challengerBlocked: 0,
      opponentHp: 0,
      opponentMaxHp: 0,
      opponentDamage: 0,
      opponentArmor: 0,
      opponentAttackRate: 1,
      opponentRegen: 0,
      opponentAttacks: 0,
      opponentDamageDealt: 0,
      opponentRegened: 0,
      opponentBlocked: 0,
    });
  },
);

export const acceptDuel = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    requireCurrentProtocol(ctx);
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
    if (Math.hypot(challenger.x - opponent.x, challenger.y - opponent.y) > DUEL_REQUEST_RANGE) {
      ctx.db.duel.id.delete(current.id);
      return;
    }

    const startsAtMicros = ctx.timestamp.microsSinceUnixEpoch + DUEL_COUNTDOWN_MICROS;
    const endsAtMicros = startsAtMicros + DUEL_DURATION_MICROS;
    ctx.db.duel.id.update({
      ...current,
      status: "countdown",
      startedAt: ctx.timestamp,
      startsAtMicros,
      endsAtMicros,
      lastResolvedAt: ctx.timestamp,
      challengerHp: challengerProgress.maxHp,
      challengerMaxHp: challengerProgress.maxHp,
      challengerDamage: challengerProgress.damage,
      challengerArmor: challengerProgress.armor,
      challengerAttackRate: challengerProgress.attackRate,
      challengerRegen: challengerProgress.regen,
      challengerAttacks: 0,
      challengerDamageDealt: 0,
      challengerRegened: 0,
      challengerBlocked: 0,
      opponentHp: opponentProgress.maxHp,
      opponentMaxHp: opponentProgress.maxHp,
      opponentDamage: opponentProgress.damage,
      opponentArmor: opponentProgress.armor,
      opponentAttackRate: opponentProgress.attackRate,
      opponentRegen: opponentProgress.regen,
      opponentAttacks: 0,
      opponentDamageDealt: 0,
      opponentRegened: 0,
      opponentBlocked: 0,
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
    requireCurrentProtocol(ctx);
    const current = activeDuelFor(ctx, ctx.sender);
    if (current?.status === "countdown" || current?.status === "active") resolveDuel(ctx, current);
  },
);

export const syncPosition = spacetimedb.reducer(
  { x: t.f64(), y: t.f64(), facing: t.f64(), moving: t.bool(), sequence: t.u32() },
  (ctx, { x, y, facing, moving, sequence }) => {
    const current = requireCurrentProtocol(ctx);
    if (sequence <= current.lastInputSequence || ["countdown", "active"].includes(activeDuelFor(ctx, ctx.sender)?.status)) return;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) {
      throw new Error("Position sync values must be finite");
    }

    ctx.db.player.identity.update({
      ...current,
      x: Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, x)),
      y: Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, y)),
      facing,
      moving,
      lastInputAt: ctx.timestamp,
      lastInputSequence: sequence,
    });
  },
);

export const setSpeed = spacetimedb.reducer(
  { speed: t.f32() },
  (ctx, { speed }) => {
    const current = requireCurrentProtocol(ctx);

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
