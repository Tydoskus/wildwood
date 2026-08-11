import { schema, SenderError, table, t } from "spacetimedb/server";
import { Identity, ScheduleAt, Timestamp } from "spacetimedb";

const WORLD = { width: 4800, height: 4800 };
const PLAYER_ZONE_SIZE = 600;
const PLAYER_RADIUS = 17;
const PLAYER_BASE_HP = 100;
const PLAYER_SPEED = 180;
const DEFAULT_ATTACK_RANGE = 200;
const PROTOCOL_VERSION = 20;
const ATTACK_BALANCE_VERSION = 1;
const DEFAULT_ATTACK_INTERVAL = 1.56;
const MIN_ATTACK_INTERVAL = .32;
const TRAILBLAZER_BOOTS = "trailblazer_boots";
const SPACETIME_AUTH_ISSUER = "https://auth.spacetimedb.com/oidc";
const SPACETIME_AUTH_CLIENT_ID = "client_03426HMgkAEmdC23XTZRKZ";
const DEVELOPER_IDENTITY_HEX = "c200a2bd4fd89d5cc59811729734b7f92d6bf328eda8fc64963fa5f7760dcb13";
const DEVELOPER_IDENTITY = new Identity(DEVELOPER_IDENTITY_HEX);
const ACCOUNT_LINK_LIFETIME_MICROS = 600_000_000n;
const PLAYER_SPAWN = { x: 360, y: 360 };
const BOOTS_SPEED_BONUS = 25;
const CHAT_MESSAGE_MAX_LENGTH = 250;
const CHAT_COOLDOWN_MICROS = 3_000_000n;
const CHAT_HISTORY_RETENTION_MICROS = 10_800_000_000n;
const CHAT_HISTORY_MAX_ROWS = 200;
const DUEL_REPLAY_RETENTION_MICROS = CHAT_HISTORY_RETENTION_MICROS;
const MAINTENANCE_INTERVAL_MICROS = 60_000_000n;
const LEADERBOARD_REFRESH_INTERVAL_MICROS = 900_000_000n;
const LEADERBOARD_LIMIT = 100;
const LEADERBOARD_REFRESH_VERSION = 2;
const DUEL_REQUEST_RANGE = 250;
const DUEL_REQUEST_COOLDOWN_MICROS = 5_000_000n;
const DISPLAY_NAME_COOLDOWN_MICROS = 2_592_000_000_000n;
// Beta support: let players correct names freely. Re-enable after account-link
// migration issues have settled without deleting any existing cooldown data.
const DISPLAY_NAME_COOLDOWN_ENABLED = false;
const DUEL_REQUEST_TIMEOUT_MICROS = 30_000_000n;
const DUEL_COUNTDOWN_MICROS = 3_000_000n;
const DUEL_DURATION_MICROS = 30_000_000n;
const DUEL_FINISH_HOLD_MICROS = 600_000n;
const DUEL_ARENA = {
  challenger: { x: 5880, y: 5940 },
  opponent: { x: 6120, y: 5940 },
};
const DRAGON_ID = 1;
const DRAGON_MAX_HP = 1_000_000;
const DRAGON_REWARD_DAMAGE = 650;
const DRAGON_RADIUS = 140;
const DRAGON_POSITION = { x: WORLD.width - 360, y: WORLD.height - 360 };
const DRAGON_HIT_RANGE_TOLERANCE = 60;
const DRAGON_RESPAWN_MICROS = 30_000_000n;

const NAME_ADJECTIVES = ["Mossy", "Bright", "Quiet", "Brave", "Dusky", "Lucky", "Wild", "Clever"];
const NAME_CREATURES = ["Fox", "Owl", "Badger", "Hare", "Raven", "Wolf", "Deer", "Moth"];

const player = table(
  {
    public: true,
    indexes: [{ accessor: "byZone", algorithm: "btree", columns: ["zoneX", "zoneY"] as const }],
  },
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
    feetItem: t.string().default(""),
    zoneX: t.i32().default(0),
    zoneY: t.i32().default(0),
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
    inventoryJson: t.string().default("[]"),
    equippedFeet: t.string().default(""),
  },
);

// Compact public ranking snapshot. Full player progress remains private to the
// owner's subscription and identity-scoped profile views.
const leaderboardEntry = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    damage: t.f32(),
    maxHp: t.f32(),
    isGuest: t.bool(),
    power: t.u32().default(0),
  },
);

// Public account kind stays separate from rankings so guest labels also work
// for players outside top 100. Legacy rows become known on next connection.
const playerAccountStatus = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    isGuest: t.bool(),
  },
);

// One tiny public presence aggregate keeps the HUD accurate without making
// every client subscribe to every active player row.
const worldStatus = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    onlinePlayers: t.u32(),
  },
);

const leaderboardRefreshState = table(
  { public: false },
  {
    id: t.u32().primaryKey(),
    refreshedAtMicros: t.u64(),
    version: t.u32().default(0),
  },
);

// Public profile metadata is queried one identity at a time by the client.
// Combat progress remains out of the global subscription and is also loaded
// only for the profile currently being viewed.
const playerLifetime = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    joinedAt: t.timestamp(),
    playedMicros: t.u64().default(0n),
    sessionStartedAt: t.timestamp(),
    enemyKills: t.u64().default(0n),
  },
);

const playerNameCooldown = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    changedAt: t.timestamp(),
  },
);

const playerBalanceVersion = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    version: t.u32(),
  },
);

// Persistent sign-in history. Private storage prevents account activity from
// becoming public player data. The viewer index powers the developer-only view
// without scanning private rows.
const playerAccessAudit = table(
  {
    public: false,
    indexes: [{ accessor: "byViewer", algorithm: "btree", columns: ["viewer"] as const }],
  },
  {
    identity: t.identity().primaryKey(),
    viewer: t.identity(),
    displayName: t.string(),
    firstSeenAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
    accountType: t.string(),
    lastProtocolVersion: t.u32(),
    label: t.string().default(""),
  },
);

// Presence belongs to a physical websocket, not an identity. Multiple tabs can
// share one identity; only the controller connection owns movement and duels.
const playerSession = table(
  {
    public: false,
    indexes: [{ accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const }],
  },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
    connectedAt: t.timestamp(),
    protocolVersion: t.u32().default(0),
    lastInputSequence: t.u32().default(0),
    enteredWorld: t.bool().default(false),
    tabId: t.string().default(""),
  },
);

const playerController = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    connectionId: t.connectionId(),
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

// Private beta feedback submitted through `/bug <description>`. Reports never
// enter public chat, but remain queryable by developers through Maincloud SQL.
const bugReport = table(
  {
    public: false,
    indexes: [{ accessor: "byReporter", algorithm: "btree", columns: ["reporter"] as const }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    reporter: t.identity(),
    reporterName: t.string(),
    message: t.string(),
    protocolVersion: t.u32(),
    reportedAt: t.timestamp(),
  },
);

const duel = table(
  {
    public: true,
    indexes: [
      { accessor: "byChallenger", algorithm: "btree", columns: ["challenger"] as const },
      { accessor: "byOpponent", algorithm: "btree", columns: ["opponent"] as const },
    ],
  },
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

const dragonBoss = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    hp: t.f32(),
    maxHp: t.f32(),
    alive: t.bool(),
    respawnAtMicros: t.u64(),
  },
);

const dragonContribution = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    displayName: t.string(),
    damage: t.f32(),
  },
);

const dragonAttackWindow = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    encounter: t.u64(),
    startedAtMicros: t.u64(),
    hits: t.u32(),
  },
);

const dragonResult = table(
  { public: true },
  {
    id: t.u32().primaryKey(),
    encounter: t.u64(),
    totalDamage: t.f32(),
    contributorsJson: t.string(),
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

const dragonRespawnSchedule = table(
  { scheduled: (): any => respawnDragon },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    encounter: t.u64(),
  },
);

const spacetimedb = schema({
  player,
  playerProfile,
  playerProgress,
  leaderboardEntry,
  playerAccountStatus,
  worldStatus,
  leaderboardRefreshState,
  playerLifetime,
  playerNameCooldown,
  playerBalanceVersion,
  playerAccessAudit,
  playerSession,
  playerController,
  chatCooldown,
  duelRequestCooldown,
  accountLink,
  chatMessage,
  bugReport,
  duel,
  duelReplay,
  dragonBoss,
  dragonContribution,
  dragonAttackWindow,
  dragonResult,
  maintenanceSchedule,
  dragonRespawnSchedule,
});
export default spacetimedb;

export const devAccessAudit = spacetimedb.view(
  { name: "dev_access_audit", public: true },
  t.array(playerAccessAudit.rowType),
  (ctx) => {
    if (!isDeveloperIdentity(ctx.sender)) return [];
    return Array.from(ctx.db.playerAccessAudit.byViewer.filter(ctx.sender));
  },
);

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

function isGeneratedDisplayName(displayName: string) {
  const [adjective, creature, suffix, ...extra] = displayName.split(" ");
  return extra.length === 0 &&
    NAME_ADJECTIVES.includes(adjective) &&
    NAME_CREATURES.includes(creature) &&
    /^\d{3}$/.test(suffix ?? "");
}

function defaultPlayerProgress(identity: any) {
  return {
    identity,
    maxHp: PLAYER_BASE_HP,
    damage: 4,
    attackRate: DEFAULT_ATTACK_INTERVAL,
    projectileSpeed: 390,
    projectileCount: 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    armor: 0,
    regen: 0,
    speed: PLAYER_SPEED,
    bootsCollected: false,
    inventoryJson: "[]",
    equippedFeet: "",
    introComplete: false,
  };
}

function ensurePlayerLifetime(ctx: any) {
  const current = ctx.db.playerLifetime.identity.find(ctx.sender);
  if (current) return current;
  const next = {
    identity: ctx.sender,
    joinedAt: ctx.timestamp,
    playedMicros: 0n,
    sessionStartedAt: ctx.timestamp,
    enemyKills: 0n,
  };
  ctx.db.playerLifetime.insert(next);
  return next;
}

function finishLifetimeSession(ctx: any, identity: any) {
  const lifetime = ctx.db.playerLifetime.identity.find(identity);
  if (!lifetime) return;
  const elapsed = ctx.timestamp.microsSinceUnixEpoch - lifetime.sessionStartedAt.microsSinceUnixEpoch;
  ctx.db.playerLifetime.identity.update({
    ...lifetime,
    playedMicros: lifetime.playedMicros + (elapsed > 0n ? elapsed : 0n),
    sessionStartedAt: ctx.timestamp,
  });
}

function speedForBoots(bootsCollected: boolean) {
  return PLAYER_SPEED + (bootsCollected ? BOOTS_SPEED_BONUS : 0);
}

function markAttackBalanceCurrent(ctx: any) {
  const current = ctx.db.playerBalanceVersion.identity.find(ctx.sender);
  const next = { identity: ctx.sender, version: ATTACK_BALANCE_VERSION };
  if (current) ctx.db.playerBalanceVersion.identity.update(next);
  else ctx.db.playerBalanceVersion.insert(next);
}

function migrateAttackBalance(ctx: any, progress: any) {
  const current = ctx.db.playerBalanceVersion.identity.find(ctx.sender);
  if (current?.version === ATTACK_BALANCE_VERSION) return progress;
  const migrated = {
    ...progress,
    attackRate: Math.max(MIN_ATTACK_INTERVAL, Math.min(DEFAULT_ATTACK_INTERVAL, progress.attackRate * 2)),
  };
  ctx.db.playerProgress.identity.update(migrated);
  markAttackBalanceCurrent(ctx);
  return migrated;
}

function powerForProgress(progress: { maxHp: number; damage: number; attackRate: number; armor: number; regen: number }) {
  const attackSpeedMultiplier = DEFAULT_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, progress.attackRate);
  return Math.max(0, Math.round(
    progress.damage * attackSpeedMultiplier +
    progress.maxHp +
    progress.armor * 3 +
    progress.regen * 10,
  ));
}

function playerZone(x: number, y: number) {
  return {
    zoneX: Math.floor(x / PLAYER_ZONE_SIZE),
    zoneY: Math.floor(y / PLAYER_ZONE_SIZE),
  };
}

function syncSenderAccountStatus(ctx: any) {
  const current = ctx.db.playerAccountStatus.identity.find(ctx.sender);
  const next = { identity: ctx.sender, isGuest: !hasSpacetimeAuthAccount(ctx) };
  if (current) ctx.db.playerAccountStatus.identity.update(next);
  else ctx.db.playerAccountStatus.insert(next);
}

function refreshLeaderboard(ctx: any) {
  const candidates: any[] = [];
  for (const progress of ctx.db.playerProgress.iter() as Iterable<any>) {
    const profile = ctx.db.playerProfile.identity.find(progress.identity);
    if (!profile) continue;
    const current = ctx.db.leaderboardEntry.identity.find(progress.identity);
    candidates.push({
      identity: progress.identity,
      identityKey: progress.identity.toHexString(),
      displayName: profile.displayName,
      power: powerForProgress(progress),
      damage: progress.damage,
      maxHp: progress.maxHp,
      isGuest: ctx.db.playerAccountStatus.identity.find(progress.identity)?.isGuest ?? current?.isGuest ?? false,
    });
  }

  const byName = (a: any, b: any) => a.displayName.localeCompare(b.displayName);
  const selected = new Map<string, any>();
  for (const candidate of [...candidates].sort((a, b) => b.power - a.power || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }
  for (const candidate of [...candidates].sort((a, b) => b.damage - a.damage || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }
  for (const candidate of [...candidates].sort((a, b) => b.maxHp - a.maxHp || byName(a, b)).slice(0, LEADERBOARD_LIMIT)) {
    selected.set(candidate.identityKey, candidate);
  }

  for (const current of [...ctx.db.leaderboardEntry.iter()] as any[]) {
    if (!selected.has(current.identity.toHexString())) ctx.db.leaderboardEntry.identity.delete(current.identity);
  }
  for (const candidate of selected.values()) {
    const next = {
      identity: candidate.identity,
      displayName: candidate.displayName,
      power: candidate.power,
      damage: candidate.damage,
      maxHp: candidate.maxHp,
      isGuest: candidate.isGuest,
    };
    const current = ctx.db.leaderboardEntry.identity.find(candidate.identity);
    if (!current) ctx.db.leaderboardEntry.insert(next);
    else if (
      current.displayName !== next.displayName ||
      current.power !== next.power ||
      current.damage !== next.damage ||
      current.maxHp !== next.maxHp ||
      current.isGuest !== next.isGuest
    ) ctx.db.leaderboardEntry.identity.update(next);
  }

  const refreshState = ctx.db.leaderboardRefreshState.id.find(1);
  const nextState = { id: 1, refreshedAtMicros: ctx.timestamp.microsSinceUnixEpoch, version: LEADERBOARD_REFRESH_VERSION };
  if (refreshState) ctx.db.leaderboardRefreshState.id.update(nextState);
  else ctx.db.leaderboardRefreshState.insert(nextState);
}

function refreshLeaderboardIfDue(ctx: any) {
  const state = ctx.db.leaderboardRefreshState.id.find(1);
  if (
    state?.version === LEADERBOARD_REFRESH_VERSION &&
    ctx.timestamp.microsSinceUnixEpoch - state.refreshedAtMicros < LEADERBOARD_REFRESH_INTERVAL_MICROS
  ) return;
  refreshLeaderboard(ctx);
}

function sameConnection(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

function sessionForContext(ctx: any) {
  return ctx.connectionId ? ctx.db.playerSession.connectionId.find(ctx.connectionId) : null;
}

function requireSession(ctx: any) {
  const session = sessionForContext(ctx);
  if (!session || !sameIdentity(session.identity, ctx.sender)) {
    throw new SenderError("Wildwood updated. Refresh to continue.");
  }
  return session;
}

function isSupportedProtocol(protocolVersion: number) {
  return protocolVersion === PROTOCOL_VERSION;
}

function requireSupportedSessionProtocol(ctx: any) {
  const session = requireSession(ctx);
  if (!isSupportedProtocol(session.protocolVersion)) {
    throw new SenderError("Wildwood updated. Refresh to continue.");
  }
  return session;
}

function requireCurrentProtocol(ctx: any) {
  requireSupportedSessionProtocol(ctx);
  const current = ctx.db.player.identity.find(ctx.sender);
  if (!current) throw new SenderError("Enter Wildwood first.");
  return current;
}

function requireControllingPlayer(ctx: any) {
  const current = requireCurrentProtocol(ctx);
  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (!ctx.connectionId || !controller || !sameConnection(controller.connectionId, ctx.connectionId)) {
    throw new SenderError("Wildwood is active in another tab.");
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

function isDeveloperIdentity(identity: any) {
  return identity?.toHexString?.().replace(/^0x/i, "").toLowerCase() === DEVELOPER_IDENTITY_HEX;
}

function requireDeveloper(ctx: any) {
  if (!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)) {
    throw new SenderError("Developer access required.");
  }
}

function touchPlayerAccessAudit(ctx: any, protocolVersion: number) {
  const profile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!profile) return;
  const current = ctx.db.playerAccessAudit.identity.find(ctx.sender);
  const next = {
    identity: ctx.sender,
    viewer: DEVELOPER_IDENTITY,
    displayName: profile.displayName,
    firstSeenAt: current?.firstSeenAt ?? ctx.timestamp,
    lastSeenAt: ctx.timestamp,
    accountType: hasSpacetimeAuthAccount(ctx) ? "account" : "guest",
    lastProtocolVersion: protocolVersion,
    label: current?.label ?? "",
  };
  if (current) ctx.db.playerAccessAudit.identity.update(next);
  else ctx.db.playerAccessAudit.insert(next);
}

function backfillKnownAccessAudit(ctx: any) {
  if (!isDeveloperIdentity(ctx.sender)) return;
  for (const lifetime of ctx.db.playerLifetime.iter() as Iterable<any>) {
    if (ctx.db.playerAccessAudit.identity.find(lifetime.identity)) continue;
    const profile = ctx.db.playerProfile.identity.find(lifetime.identity);
    if (!profile) continue;
    const status = ctx.db.playerAccountStatus.identity.find(lifetime.identity);
    const activePlayer = ctx.db.player.identity.find(lifetime.identity);
    ctx.db.playerAccessAudit.insert({
      identity: lifetime.identity,
      viewer: DEVELOPER_IDENTITY,
      displayName: profile.displayName,
      firstSeenAt: lifetime.joinedAt,
      lastSeenAt: lifetime.sessionStartedAt,
      accountType: status ? (status.isGuest ? "guest" : "account") : "unknown",
      lastProtocolVersion: activePlayer?.protocolVersion ?? 0,
      label: "",
    });
  }
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
    progress.bootsCollected === defaultProgress.bootsCollected &&
    progress.inventoryJson === defaultProgress.inventoryJson &&
    progress.equippedFeet === defaultProgress.equippedFeet;
}

function inventoryForProgress(progress: any) {
  return progress.bootsCollected ? [TRAILBLAZER_BOOTS] : [];
}

function equippedFeetForProgress(progress: any) {
  const inventory = inventoryForProgress(progress);
  return inventory.includes(progress.equippedFeet) ? progress.equippedFeet : inventory[0] ?? "";
}

function sameIdentity(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

function countOnlinePlayers(ctx: any) {
  let count = 0;
  for (const _player of ctx.db.player.iter()) count += 1;
  return count;
}

function ensureWorldStatus(ctx: any) {
  const current = ctx.db.worldStatus.id.find(0);
  if (current) return current;
  return ctx.db.worldStatus.insert({ id: 0, onlinePlayers: countOnlinePlayers(ctx) });
}

function adjustOnlinePlayers(ctx: any, change: number) {
  const current = ensureWorldStatus(ctx);
  const onlinePlayers = Math.max(0, current.onlinePlayers + change);
  if (onlinePlayers !== current.onlinePlayers) ctx.db.worldStatus.id.update({ ...current, onlinePlayers });
}

function reconcileOnlinePlayers(ctx: any) {
  const current = ensureWorldStatus(ctx);
  const onlinePlayers = countOnlinePlayers(ctx);
  if (onlinePlayers !== current.onlinePlayers) ctx.db.worldStatus.id.update({ ...current, onlinePlayers });
}

function activeDuelFor(ctx: any, identity: any) {
  const isActive = (current: any) =>
    current.status === "requested" ||
    current.status === "countdown" ||
    current.status === "active" ||
    current.status === "finishing";
  for (const current of ctx.db.duel.byChallenger.filter(identity) as Iterable<any>) {
    if (isActive(current)) return current;
  }
  for (const current of ctx.db.duel.byOpponent.filter(identity) as Iterable<any>) {
    if (isActive(current)) return current;
  }
  return null;
}

function removeIdentityPresence(ctx: any, identity: any) {
  const currentDuel = activeDuelFor(ctx, identity);
  if (currentDuel) {
    if (currentDuel.status === "finishing") {
      finishDuel(ctx, currentDuel);
    } else {
      const challengerDisconnected = sameIdentity(currentDuel.challenger, identity);
      const remainingIdentity = challengerDisconnected ? currentDuel.opponent : currentDuel.challenger;
      const remainingX = challengerDisconnected ? currentDuel.opponentOriginX : currentDuel.challengerOriginX;
      const remainingY = challengerDisconnected ? currentDuel.opponentOriginY : currentDuel.challengerOriginY;
      const remainingMaxHp = challengerDisconnected ? currentDuel.opponentMaxHp : currentDuel.challengerMaxHp;
      returnDuelPlayer(ctx, remainingIdentity, remainingX, remainingY, remainingMaxHp);
      ctx.db.duel.id.delete(currentDuel.id);
    }
  }
  const activePlayer = ctx.db.player.identity.find(identity);
  if (activePlayer) {
    ctx.db.player.identity.delete(identity);
    adjustOnlinePlayers(ctx, -1);
  }
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
  for (const identity of orphanIdentities) removeIdentityPresence(ctx, identity);
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

function ensureDragonBoss(ctx: any) {
  const existing = ctx.db.dragonBoss.id.find(DRAGON_ID);
  if (existing) return existing;
  return ctx.db.dragonBoss.insert({
    id: DRAGON_ID,
    encounter: 1n,
    hp: DRAGON_MAX_HP,
    maxHp: DRAGON_MAX_HP,
    alive: true,
    respawnAtMicros: 0n,
  });
}

function clearDragonCombatRows(ctx: any) {
  const contributionIdentities = [...ctx.db.dragonContribution.iter()].map((row: any) => row.identity);
  const attackIdentities = [...ctx.db.dragonAttackWindow.iter()].map((row: any) => row.identity);
  for (const identity of contributionIdentities) ctx.db.dragonContribution.identity.delete(identity);
  for (const identity of attackIdentities) ctx.db.dragonAttackWindow.identity.delete(identity);
}

function rewardDragonContributor(ctx: any, identity: any) {
  const current = ctx.db.playerProgress.identity.find(identity);
  if (!current) return;
  const next = { ...current, damage: current.damage + DRAGON_REWARD_DAMAGE };
  ctx.db.playerProgress.identity.update(next);
  const active = ctx.db.player.identity.find(identity);
  if (active) {
    ctx.db.player.identity.update({
      ...active,
      power: powerForProgress(next),
    });
  }
}

function finishDragonEncounter(ctx: any, dragon: any) {
  const contributions = [...ctx.db.dragonContribution.iter()]
    .filter((row: any) => row.encounter === dragon.encounter && row.damage > 0)
    .sort((a: any, b: any) => b.damage - a.damage);
  const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
  const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
    identity: row.identity.toHexString(),
    name: row.displayName,
    damage: row.damage,
    percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
  })));

  const result = {
    id: DRAGON_ID,
    encounter: dragon.encounter,
    totalDamage,
    contributorsJson,
    createdAt: ctx.timestamp,
  };
  if (ctx.db.dragonResult.id.find(DRAGON_ID)) ctx.db.dragonResult.id.update(result);
  else ctx.db.dragonResult.insert(result);

  for (const row of contributions) rewardDragonContributor(ctx, row.identity);

  const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + DRAGON_RESPAWN_MICROS;
  ctx.db.dragonBoss.id.update({
    ...dragon,
    hp: 0,
    alive: false,
    respawnAtMicros,
  });
  ctx.db.dragonRespawnSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(respawnAtMicros),
    encounter: dragon.encounter,
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
    ...playerZone(x, y),
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
  if (current.status === "finishing") {
    if (ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros) finishDuel(ctx, current);
    return;
  }
  if (current.status === "countdown") {
    if (ctx.timestamp.microsSinceUnixEpoch < current.startsAtMicros) return;
    ctx.db.duel.id.update({
      ...current,
      status: "active",
      startedAt: ctx.timestamp,
      lastResolvedAt: new Timestamp(current.startsAtMicros),
    });
    return;
  }
  const resolutionMicros = current.endsAtMicros < ctx.timestamp.microsSinceUnixEpoch
    ? current.endsAtMicros
    : ctx.timestamp.microsSinceUnixEpoch;
  let cursorMicros = current.lastResolvedAt.microsSinceUnixEpoch;
  let challengerHp = current.challengerHp;
  let opponentHp = current.opponentHp;
  let challengerAttacks = current.challengerAttacks;
  let opponentAttacks = current.opponentAttacks;
  let challengerDamageDealt = current.challengerDamageDealt;
  let opponentDamageDealt = current.opponentDamageDealt;
  let challengerRegened = current.challengerRegened;
  let opponentRegened = current.opponentRegened;
  let challengerBlocked = current.challengerBlocked;
  let opponentBlocked = current.opponentBlocked;
  const challengerHit = Math.max(1, current.challengerDamage - current.opponentArmor);
  const opponentHit = Math.max(1, current.opponentDamage - current.challengerArmor);
  const challengerIntervalMicros = Math.max(1, Math.round(current.challengerAttackRate * 1_000_000));
  const opponentIntervalMicros = Math.max(1, Math.round(current.opponentAttackRate * 1_000_000));

  while (cursorMicros < resolutionMicros && challengerHp > 0 && opponentHp > 0) {
    const nextChallengerAttack = current.startsAtMicros + BigInt((challengerAttacks + 1) * challengerIntervalMicros);
    const nextOpponentAttack = current.startsAtMicros + BigInt((opponentAttacks + 1) * opponentIntervalMicros);
    const nextEventMicros = nextChallengerAttack < nextOpponentAttack
      ? nextChallengerAttack
      : nextOpponentAttack;
    const advanceToMicros = nextEventMicros < resolutionMicros ? nextEventMicros : resolutionMicros;
    const elapsedSeconds = Number(advanceToMicros - cursorMicros) / 1_000_000;
    const challengerRegen = Math.min(current.challengerMaxHp - challengerHp, current.challengerRegen * elapsedSeconds);
    const opponentRegen = Math.min(current.opponentMaxHp - opponentHp, current.opponentRegen * elapsedSeconds);
    challengerHp += challengerRegen;
    opponentHp += opponentRegen;
    challengerRegened += challengerRegen;
    opponentRegened += opponentRegen;
    cursorMicros = advanceToMicros;
    if (nextEventMicros > resolutionMicros) break;

    const challengerHits = nextChallengerAttack === nextEventMicros;
    const opponentHits = nextOpponentAttack === nextEventMicros;
    const challengerTaken = opponentHits ? Math.min(challengerHp, opponentHit) : 0;
    const opponentTaken = challengerHits ? Math.min(opponentHp, challengerHit) : 0;
    challengerHp = Math.max(0, challengerHp - challengerTaken);
    opponentHp = Math.max(0, opponentHp - opponentTaken);
    if (challengerHits) {
      challengerAttacks += 1;
      challengerDamageDealt += opponentTaken;
      challengerBlocked += Math.min(current.opponentArmor, Math.max(0, current.challengerDamage - 1));
    }
    if (opponentHits) {
      opponentAttacks += 1;
      opponentDamageDealt += challengerTaken;
      opponentBlocked += Math.min(current.challengerArmor, Math.max(0, current.opponentDamage - 1));
    }
  }

  const next = {
    ...current,
    challengerHp,
    opponentHp,
    challengerAttacks,
    opponentAttacks,
    challengerDamageDealt,
    opponentDamageDealt,
    challengerRegened,
    opponentRegened,
    challengerBlocked,
    opponentBlocked,
    lastResolvedAt: new Timestamp(cursorMicros),
  };

  if (
    next.challengerHp <= 0 ||
    next.opponentHp <= 0 ||
    ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
  ) {
    const finishing = {
      ...next,
      status: "finishing",
      endsAtMicros: ctx.timestamp.microsSinceUnixEpoch + DUEL_FINISH_HOLD_MICROS,
    };
    syncDuelPlayerHealth(ctx, finishing);
    ctx.db.duel.id.update(finishing);
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

function enterWorldPresence(ctx: any, tabId: string) {
  const session = requireSupportedSessionProtocol(ctx);
  if (!ctx.connectionId) return;
  const normalizedTabId = tabId.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(normalizedTabId)) throw new SenderError("Invalid Wildwood tab session.");

  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (controller && !sameConnection(controller.connectionId, ctx.connectionId)) {
    const controllerSession = ctx.db.playerSession.connectionId.find(controller.connectionId);
    const sameTab = controllerSession?.tabId && controllerSession.tabId === normalizedTabId;
    if (controllerSession?.enteredWorld && !sameTab) {
      throw new SenderError("Wildwood is active in another tab.");
    }
    ctx.db.playerController.identity.update({ identity: ctx.sender, connectionId: ctx.connectionId });
  } else if (!controller) {
    ctx.db.playerController.insert({ identity: ctx.sender, connectionId: ctx.connectionId });
  }

  if (!session.enteredWorld || session.tabId !== normalizedTabId) {
    ctx.db.playerSession.connectionId.update({ ...session, enteredWorld: true, tabId: normalizedTabId });
  }

  const existingProfile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!existingProfile) {
    ctx.db.playerProfile.insert({
      identity: ctx.sender,
      displayName: generatedDisplayName(ctx.sender),
    });
  }

  let existingProgress: any = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!existingProgress) {
    existingProgress = defaultPlayerProgress(ctx.sender);
    ctx.db.playerProgress.insert(existingProgress);
    markAttackBalanceCurrent(ctx);
  } else {
    existingProgress = migrateAttackBalance(ctx, existingProgress);
    const equippedFeet = equippedFeetForProgress(existingProgress);
    const inventoryJson = JSON.stringify(inventoryForProgress(existingProgress));
    const speed = speedForBoots(existingProgress.bootsCollected);
    const maxHp = Math.max(PLAYER_BASE_HP, existingProgress.maxHp);
    if (existingProgress.maxHp !== maxHp || existingProgress.attackRange !== DEFAULT_ATTACK_RANGE || existingProgress.speed !== speed || existingProgress.inventoryJson !== inventoryJson || existingProgress.equippedFeet !== equippedFeet) {
      const migratedProgress = {
        ...existingProgress,
        maxHp,
        attackRange: DEFAULT_ATTACK_RANGE,
        speed,
        inventoryJson,
        equippedFeet,
      };
      ctx.db.playerProgress.identity.update(migratedProgress);
      existingProgress = migratedProgress;
    }
  }

  syncSenderAccountStatus(ctx);
  touchPlayerAccessAudit(ctx, session.protocolVersion);
  backfillKnownAccessAudit(ctx);

  const existing = ctx.db.player.identity.find(ctx.sender);
  const lifetime = ensurePlayerLifetime(ctx);
  if (!existing) {
    ctx.db.playerLifetime.identity.update({ ...lifetime, sessionStartedAt: ctx.timestamp });
  }
  const feetItem = equippedFeetForProgress(existingProgress);
  if (existing) {
    if (["countdown", "active", "finishing"].includes(activeDuelFor(ctx, ctx.sender)?.status)) {
      ctx.db.player.identity.update({
        ...existing,
        ...playerZone(existing.x, existing.y),
        power: powerForProgress(existingProgress),
        moving: false,
        feetItem,
        protocolVersion: session.protocolVersion,
        lastInputAt: ctx.timestamp,
      });
      return;
    }
    ctx.db.player.identity.update({
      ...existing,
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      ...playerZone(PLAYER_SPAWN.x, PLAYER_SPAWN.y),
      facing: 0,
      moving: false,
      power: powerForProgress(existingProgress),
      protocolVersion: session.protocolVersion,
      lastInputAt: ctx.timestamp,
      lastInputSequence: 0,
      feetItem,
    });
    return;
  }

  ctx.db.player.insert({
    identity: ctx.sender,
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    ...playerZone(PLAYER_SPAWN.x, PLAYER_SPAWN.y),
    facing: 0,
    hp: existingProgress.maxHp,
    maxHp: existingProgress.maxHp,
    power: powerForProgress(existingProgress),
    speed: speedForBoots(existingProgress.bootsCollected),
    moving: false,
    lastInputAt: ctx.timestamp,
    lastInputSequence: 0,
    protocolVersion: session.protocolVersion,
    feetItem,
  });
  adjustOnlinePlayers(ctx, 1);
}

export const onConnect = spacetimedb.clientConnected((ctx) => {
  ensureMaintenanceSchedule(ctx);
  ensureDragonBoss(ctx);
  ensureWorldStatus(ctx);

  if (!ctx.connectionId) return;
  const existingSession = ctx.db.playerSession.connectionId.find(ctx.connectionId);
  const nextSession = {
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    connectedAt: ctx.timestamp,
    protocolVersion: 0,
    lastInputSequence: 0,
    enteredWorld: false,
    tabId: "",
  };
  if (existingSession) ctx.db.playerSession.connectionId.update(nextSession);
  else ctx.db.playerSession.insert(nextSession);
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  if (!ctx.connectionId) return;
  const session = ctx.db.playerSession.connectionId.find(ctx.connectionId);
  if (!session) return;
  if (session.enteredWorld) touchPlayerAccessAudit(ctx, session.protocolVersion);
  ctx.db.playerSession.connectionId.delete(ctx.connectionId);

  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (!controller || !sameConnection(controller.connectionId, ctx.connectionId)) return;

  const remainingSessions = [...ctx.db.playerSession.byIdentity.filter(ctx.sender) as Iterable<any>];
  const replacement = remainingSessions.find((candidate: any) => candidate.enteredWorld);
  if (replacement) {
    ctx.db.playerController.identity.update({ identity: ctx.sender, connectionId: replacement.connectionId });
    const currentPlayer = ctx.db.player.identity.find(ctx.sender);
    if (currentPlayer) {
      ctx.db.player.identity.update({
        ...currentPlayer,
        moving: false,
        lastInputAt: ctx.timestamp,
        lastInputSequence: replacement.lastInputSequence,
        protocolVersion: replacement.protocolVersion,
      });
    }
    return;
  }
  ctx.db.playerController.identity.delete(ctx.sender);

  finishLifetimeSession(ctx, ctx.sender);
  removeIdentityPresence(ctx, ctx.sender);
});

export const runMaintenance = spacetimedb.reducer(
  { maintenance: maintenanceSchedule.rowType },
  (ctx, { maintenance }) => {
    void maintenance;
    const finishedDuels = [...ctx.db.duel.iter()].filter((current: any) =>
      current.status === "finishing" && ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
    );
    for (const current of finishedDuels) finishDuel(ctx, current);
    clearExpiredDuelRequests(ctx);
    clearExpiredHistory(ctx);
    clearExpiredAccountLinks(ctx);
    clearOrphanPresence(ctx);
    reconcileOnlinePlayers(ctx);
    refreshLeaderboardIfDue(ctx);
  },
);

export const respawnDragon = spacetimedb.reducer(
  { schedule: dragonRespawnSchedule.rowType },
  (ctx, { schedule }) => {
    const dragon = ensureDragonBoss(ctx);
    if (dragon.alive || dragon.encounter !== schedule.encounter) return;
    if (ctx.timestamp.microsSinceUnixEpoch < dragon.respawnAtMicros) return;
    clearDragonCombatRows(ctx);
    ctx.db.dragonBoss.id.update({
      ...dragon,
      encounter: dragon.encounter + 1n,
      hp: dragon.maxHp,
      alive: true,
      respawnAtMicros: 0n,
    });
  },
);

function applyDragonDamage(ctx: any, requestedHits: number) {
  const activePlayer = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) return;
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress) return;
  const dragon = ensureDragonBoss(ctx);
  if (!dragon.alive || dragon.hp <= 0) return;

  const centerDistance = Math.hypot(
    activePlayer.x - DRAGON_POSITION.x,
    activePlayer.y - DRAGON_POSITION.y,
  );
  if (centerDistance - DRAGON_RADIUS > progress.attackRange + DRAGON_HIT_RANGE_TOLERANCE) return;

  const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const intervalMicros = BigInt(Math.max(1, Math.round(progress.attackRate * 1_000_000)));
  const currentWindow = ctx.db.dragonAttackWindow.identity.find(ctx.sender);
  const newWindow =
    !currentWindow ||
    currentWindow.encounter !== dragon.encounter ||
    now - currentWindow.startedAtMicros >= intervalMicros;
  const remainingHits = newWindow
    ? progress.projectileCount
    : Math.max(0, progress.projectileCount - currentWindow.hits);
  const acceptedHits = Math.min(boundedHits, remainingHits);
  if (acceptedHits <= 0) return;

  if (newWindow) {
    const nextWindow = {
      identity: ctx.sender,
      encounter: dragon.encounter,
      startedAtMicros: now,
      hits: acceptedHits,
    };
    if (currentWindow) ctx.db.dragonAttackWindow.identity.update(nextWindow);
    else ctx.db.dragonAttackWindow.insert(nextWindow);
  } else {
    ctx.db.dragonAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
  }

  const damage = Math.min(dragon.hp, Math.max(1, progress.damage) * acceptedHits);
  const currentContribution = ctx.db.dragonContribution.identity.find(ctx.sender);
  const continuingContribution = currentContribution?.encounter === dragon.encounter;
  const displayName = continuingContribution
    ? currentContribution.displayName
    : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
  const nextContribution = {
    identity: ctx.sender,
    encounter: dragon.encounter,
    displayName,
    damage: continuingContribution ? currentContribution.damage + damage : damage,
  };
  if (currentContribution) ctx.db.dragonContribution.identity.update(nextContribution);
  else ctx.db.dragonContribution.insert(nextContribution);

  const nextDragon = { ...dragon, hp: Math.max(0, dragon.hp - damage) };
  if (nextDragon.hp <= 0) finishDragonEncounter(ctx, nextDragon);
  else ctx.db.dragonBoss.id.update(nextDragon);
}

// Legacy one-projectile reducer remains available while cached clients drain.
export const damageDragon = spacetimedb.reducer({}, (ctx) => applyDragonDamage(ctx, 1));

export const damageDragonBatch = spacetimedb.reducer(
  { hits: t.u32() },
  (ctx, { hits }) => applyDragonDamage(ctx, hits),
);

export const registerProtocol = spacetimedb.reducer(
  { protocolVersion: t.u32() },
  (ctx, { protocolVersion }) => {
    if (!isSupportedProtocol(protocolVersion)) {
      throw new SenderError("Wildwood updated. Refresh to continue.");
    }
    const session = requireSession(ctx);
    ctx.db.playerSession.connectionId.update({ ...session, protocolVersion });
    const current = ctx.db.player.identity.find(ctx.sender);
    const controller = ctx.db.playerController.identity.find(ctx.sender);
    if (current && ctx.connectionId && controller && sameConnection(controller.connectionId, ctx.connectionId)) {
      ctx.db.player.identity.update({ ...current, protocolVersion });
    }
  },
);

export const enterWorld = spacetimedb.reducer({ tabId: t.string() }, (ctx, { tabId }) => {
  requireSupportedSessionProtocol(ctx);
  enterWorldPresence(ctx, tabId);
});

export const resumeSession = spacetimedb.reducer(
  {},
  (ctx) => {
    requireSupportedSessionProtocol(ctx);
  },
);

export const beginAccountLink = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    requireSupportedSessionProtocol(ctx);
    if (hasSpacetimeAuthAccount(ctx)) throw new SenderError("Already signed in.");
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) throw new SenderError("Invalid account link.");
    clearExpiredAccountLinks(ctx);
    if (ctx.db.accountLink.code.find(code)) throw new SenderError("Account link already exists.");
    ctx.db.accountLink.insert({ code, guest: ctx.sender, createdAt: ctx.timestamp });
  },
);

export const claimGuestAccount = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    requireSupportedSessionProtocol(ctx);
    if (!hasSpacetimeAuthAccount(ctx)) throw new SenderError("Sign in required.");
    clearExpiredAccountLinks(ctx);

    const link = ctx.db.accountLink.code.find(code);
    if (!link) throw new SenderError("Account link expired. Sign in again.");
    if (sameIdentity(link.guest, ctx.sender)) throw new SenderError("Invalid account link.");
    if (activeDuelFor(ctx, link.guest) || activeDuelFor(ctx, ctx.sender)) {
      throw new SenderError("Finish duel before linking this account.");
    }

    const accountProgress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (accountProgress && !hasFreshProgress(accountProgress)) {
      throw new SenderError("This account already has Wildwood progress.");
    }

    const guestProgress = ctx.db.playerProgress.identity.find(link.guest);
    if (!guestProgress) throw new SenderError("Guest save unavailable. Return to guest mode and try again.");
    const nextProgress = { ...guestProgress, identity: ctx.sender };
    if (accountProgress) ctx.db.playerProgress.identity.update(nextProgress);
    else ctx.db.playerProgress.insert(nextProgress);

    const guestLifetime = ctx.db.playerLifetime.identity.find(link.guest);
    const accountLifetime = ctx.db.playerLifetime.identity.find(ctx.sender);
    if (guestLifetime) {
      const nextLifetime = {
        identity: ctx.sender,
        joinedAt: accountLifetime && accountLifetime.joinedAt.microsSinceUnixEpoch < guestLifetime.joinedAt.microsSinceUnixEpoch
          ? accountLifetime.joinedAt
          : guestLifetime.joinedAt,
        playedMicros: (accountLifetime?.playedMicros ?? 0n) + guestLifetime.playedMicros,
        sessionStartedAt: ctx.timestamp,
        enemyKills: (accountLifetime?.enemyKills ?? 0n) + guestLifetime.enemyKills,
      };
      if (accountLifetime) ctx.db.playerLifetime.identity.update(nextLifetime);
      else ctx.db.playerLifetime.insert(nextLifetime);
    }

    const guestProfile = ctx.db.playerProfile.identity.find(link.guest);
    const accountProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    const preserveAccountName = Boolean(accountProfile && !isGeneratedDisplayName(accountProfile.displayName));
    const transferGuestName = Boolean(guestProfile && !preserveAccountName && !isGeneratedDisplayName(guestProfile.displayName));
    if (transferGuestName && guestProfile && accountProfile) {
      ctx.db.playerProfile.identity.update({ ...accountProfile, displayName: guestProfile.displayName });
    } else if (transferGuestName && guestProfile) {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: guestProfile.displayName });
    }

    // A freshly-created guest's generated name must never overwrite an existing
    // authenticated name or carry a name-change lock onto that account.
    if (transferGuestName) {
      const guestNameCooldown = ctx.db.playerNameCooldown.identity.find(link.guest);
      const accountNameCooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
      if (guestNameCooldown && accountNameCooldown) {
        ctx.db.playerNameCooldown.identity.update({ ...accountNameCooldown, changedAt: guestNameCooldown.changedAt });
      } else if (guestNameCooldown) {
        ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: guestNameCooldown.changedAt });
      }
    }

    const activePlayer = ctx.db.player.identity.find(ctx.sender);
    if (activePlayer) {
      ctx.db.player.identity.update({
        ...activePlayer,
        hp: nextProgress.maxHp,
        maxHp: nextProgress.maxHp,
        speed: speedForBoots(nextProgress.bootsCollected),
        power: powerForProgress(nextProgress),
        feetItem: equippedFeetForProgress(nextProgress),
      });
    }

    const finalDisplayName = ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? generatedDisplayName(ctx.sender);
    const accountStatus = ctx.db.playerAccountStatus.identity.find(ctx.sender);
    const linkedStatus = { identity: ctx.sender, isGuest: false };
    if (accountStatus) ctx.db.playerAccountStatus.identity.update(linkedStatus);
    else ctx.db.playerAccountStatus.insert(linkedStatus);
    const guestAccountStatus = ctx.db.playerAccountStatus.identity.find(link.guest);
    if (guestAccountStatus) ctx.db.playerAccountStatus.identity.delete(link.guest);
    const guestLeaderboardEntry = ctx.db.leaderboardEntry.identity.find(link.guest);
    if (guestLeaderboardEntry) ctx.db.leaderboardEntry.identity.delete(link.guest);
    const guestContribution = ctx.db.dragonContribution.identity.find(link.guest);
    const accountContribution = ctx.db.dragonContribution.identity.find(ctx.sender);
    if (guestContribution) {
      const nextContribution = {
        identity: ctx.sender,
        encounter: guestContribution.encounter,
        displayName: finalDisplayName,
        damage: accountContribution?.encounter === guestContribution.encounter
          ? accountContribution.damage + guestContribution.damage
          : guestContribution.damage,
      };
      if (accountContribution) ctx.db.dragonContribution.identity.update(nextContribution);
      else ctx.db.dragonContribution.insert(nextContribution);
      ctx.db.dragonContribution.identity.delete(link.guest);
    }
    const guestDragonWindow = ctx.db.dragonAttackWindow.identity.find(link.guest);
    if (guestDragonWindow) ctx.db.dragonAttackWindow.identity.delete(link.guest);
    const accountDragonWindow = ctx.db.dragonAttackWindow.identity.find(ctx.sender);
    if (accountDragonWindow) ctx.db.dragonAttackWindow.identity.delete(ctx.sender);

    const accountBalance = ctx.db.playerBalanceVersion.identity.find(ctx.sender);
    const nextBalance = { identity: ctx.sender, version: ATTACK_BALANCE_VERSION };
    if (accountBalance) ctx.db.playerBalanceVersion.identity.update(nextBalance);
    else ctx.db.playerBalanceVersion.insert(nextBalance);

    // Migration transfers a guest save into the authenticated identity. Leave
    // no second durable save behind; otherwise an old guest token can later
    // reconnect with the pre-migration name and stats.
    const guestActivePlayer = ctx.db.player.identity.find(link.guest);
    if (guestActivePlayer) {
      ctx.db.player.identity.delete(link.guest);
      adjustOnlinePlayers(ctx, -1);
    }
    if (guestProgress) ctx.db.playerProgress.identity.delete(link.guest);
    if (guestProfile) ctx.db.playerProfile.identity.delete(link.guest);
    if (guestLifetime) ctx.db.playerLifetime.identity.delete(link.guest);
    const guestNameCooldown = ctx.db.playerNameCooldown.identity.find(link.guest);
    if (guestNameCooldown) ctx.db.playerNameCooldown.identity.delete(link.guest);
    const guestChatCooldown = ctx.db.chatCooldown.identity.find(link.guest);
    if (guestChatCooldown) ctx.db.chatCooldown.identity.delete(link.guest);
    const guestDuelRequestCooldown = ctx.db.duelRequestCooldown.identity.find(link.guest);
    if (guestDuelRequestCooldown) ctx.db.duelRequestCooldown.identity.delete(link.guest);
    const guestBalance = ctx.db.playerBalanceVersion.identity.find(link.guest);
    if (guestBalance) ctx.db.playerBalanceVersion.identity.delete(link.guest);

    const guestSessions = [...ctx.db.playerSession.byIdentity.filter(link.guest) as Iterable<any>];
    for (const session of guestSessions) ctx.db.playerSession.connectionId.delete(session.connectionId);
    const guestController = ctx.db.playerController.identity.find(link.guest);
    if (guestController) ctx.db.playerController.identity.delete(link.guest);

    const guestLinkCodes: string[] = [];
    for (const pendingLink of ctx.db.accountLink.iter() as Iterable<any>) {
      if (sameIdentity(pendingLink.guest, link.guest)) guestLinkCodes.push(pendingLink.code);
    }
    for (const pendingCode of guestLinkCodes) ctx.db.accountLink.code.delete(pendingCode);
  },
);

export const setDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const activePlayer = requireCurrentProtocol(ctx);
    const normalized = displayName.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(normalized)) {
      throw new SenderError("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores");
    }

    const existing = ctx.db.playerProfile.identity.find(ctx.sender);
    if (existing?.displayName === normalized) return;
    const cooldown = ctx.db.playerNameCooldown.identity.find(ctx.sender);
    // Repair names accidentally replaced by a generated guest name during a
    // prior account-link operation. The next real name starts the 30-day lock.
    if (DISPLAY_NAME_COOLDOWN_ENABLED && cooldown && !isGeneratedDisplayName(existing?.displayName ?? "") &&
      ctx.timestamp.microsSinceUnixEpoch - cooldown.changedAt.microsSinceUnixEpoch < DISPLAY_NAME_COOLDOWN_MICROS) {
      throw new SenderError("Display name can be changed once every 30 days.");
    }

    if (existing) {
      ctx.db.playerProfile.identity.update({ ...existing, displayName: normalized });
    } else {
      ctx.db.playerProfile.insert({ identity: ctx.sender, displayName: normalized });
    }
    if (cooldown) ctx.db.playerNameCooldown.identity.update({ ...cooldown, changedAt: ctx.timestamp });
    else ctx.db.playerNameCooldown.insert({ identity: ctx.sender, changedAt: ctx.timestamp });
    touchPlayerAccessAudit(ctx, activePlayer.protocolVersion);
  },
);

export const devSetAccessAuditLabel = spacetimedb.reducer(
  { identity: t.identity(), label: t.string() },
  (ctx, { identity, label }) => {
    requireDeveloper(ctx);
    const normalized = label.trim().replace(/\s+/g, " ");
    if (normalized.length > 60) throw new SenderError("Audit label must be 60 characters or fewer.");
    const current = ctx.db.playerAccessAudit.identity.find(identity);
    if (!current) throw new SenderError("Access audit row not found.");
    ctx.db.playerAccessAudit.identity.update({ ...current, label: normalized });
  },
);

export const devUpdatePlayerSave = spacetimedb.reducer(
  {
    identity: t.identity(),
    displayName: t.string(),
    maxHp: t.f32(),
    damage: t.f32(),
    attackRate: t.f32(),
    projectileSpeed: t.f32(),
    projectileCount: t.u32(),
    attackRange: t.f32(),
    armor: t.f32(),
    regen: t.f32(),
    speed: t.f32(),
  },
  (ctx, update) => {
    requireDeveloper(ctx);
    const profile = ctx.db.playerProfile.identity.find(update.identity);
    const progress = ctx.db.playerProgress.identity.find(update.identity);
    if (!profile || !progress) throw new SenderError("Player save row not found.");
    const displayName = update.displayName.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(displayName)) {
      throw new SenderError("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores.");
    }
    const bounded = (value: number, min: number, max: number, field: string) => {
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new SenderError(`${field} must be between ${min} and ${max}.`);
      }
      return value;
    };
    const nextProgress = {
      ...progress,
      maxHp: bounded(update.maxHp, 1, 1_000_000, "Max HP"),
      damage: bounded(update.damage, 1, 1_000_000, "Damage"),
      attackRate: bounded(update.attackRate, .05, 10, "Attack rate"),
      projectileSpeed: bounded(update.projectileSpeed, 1, 5_000, "Projectile speed"),
      projectileCount: Math.max(1, Math.min(20, Math.floor(update.projectileCount))),
      attackRange: bounded(update.attackRange, 1, 5_000, "Attack range"),
      armor: bounded(update.armor, 0, 1_000_000, "Armor"),
      regen: bounded(update.regen, 0, 1_000_000, "Regen"),
      speed: bounded(update.speed, 1, 2_000, "Move speed"),
    };
    ctx.db.playerProfile.identity.update({ ...profile, displayName });
    ctx.db.playerProgress.identity.update(nextProgress);
    const active = ctx.db.player.identity.find(update.identity);
    if (active) {
      ctx.db.player.identity.update({
        ...active,
        hp: Math.min(active.hp, nextProgress.maxHp),
        maxHp: nextProgress.maxHp,
        speed: nextProgress.speed,
        power: powerForProgress(nextProgress),
      });
    }
    const audit = ctx.db.playerAccessAudit.identity.find(update.identity);
    if (audit) ctx.db.playerAccessAudit.identity.update({ ...audit, displayName });
    refreshLeaderboard(ctx);
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
    inventoryJson: t.string(),
    equippedFeet: t.string(),
    enemyKills: t.u32(),
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
      attackRate: bounded(progress.attackRate, MIN_ATTACK_INTERVAL, 10, base.attackRate),
      projectileSpeed: bounded(progress.projectileSpeed, 390, 2_730, base.projectileSpeed),
      projectileCount: Number.isInteger(progress.projectileCount)
        ? Math.max(1, Math.min(20, progress.projectileCount))
        : base.projectileCount,
      armor: bounded(progress.armor, 0, 1_000_000, base.armor),
      regen: bounded(progress.regen, 0, 1_000_000, base.regen),
      speed: bounded(progress.speed, 1, 2_000, base.speed),
      bootsCollected: progress.bootsCollected === true,
    };
    const bootsCollected = base.bootsCollected || normalized.bootsCollected;
    const inventoryJson = JSON.stringify(bootsCollected ? [TRAILBLAZER_BOOTS] : []);
    const equippedFeet = bootsCollected ? TRAILBLAZER_BOOTS : "";
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
      speed: speedForBoots(bootsCollected),
      bootsCollected,
      inventoryJson,
      equippedFeet,
      introComplete: base.introComplete,
    };
    if (current) ctx.db.playerProgress.identity.update(next);
    else ctx.db.playerProgress.insert(next);
    const lifetime = ensurePlayerLifetime(ctx);
    const boundedKills = BigInt(Math.max(0, Math.min(4_294_967_295, Math.floor(progress.enemyKills))));
    if (boundedKills > lifetime.enemyKills) {
      ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: boundedKills });
    }
    ctx.db.player.identity.update({
      ...activePlayer,
      hp: next.maxHp,
      maxHp: next.maxHp,
      power: powerForProgress(next),
      speed: next.speed,
      feetItem: next.equippedFeet,
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
    const lifetime = ensurePlayerLifetime(ctx);
    ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: 0n });
    ctx.db.player.identity.update({
      ...activePlayer,
      hp: next.maxHp,
      maxHp: next.maxHp,
      power: powerForProgress(next),
      speed: next.speed,
      feetItem: next.equippedFeet,
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
      throw new SenderError("Chat message is too long");
    }

    const bugCommand = /^\/bug(?:\s|$)/i.exec(normalized);
    const report = bugCommand ? normalized.slice(bugCommand[0].length).trim() : "";
    if (bugCommand && !report) throw new SenderError("Use /bug followed by a description.");

    const cooldown = ctx.db.chatCooldown.identity.find(ctx.sender);
    if (cooldown && ctx.timestamp.microsSinceUnixEpoch - cooldown.lastSentAt.microsSinceUnixEpoch < CHAT_COOLDOWN_MICROS) {
      if (bugCommand) throw new SenderError("Wait 3 seconds before sending a bug report.");
      return;
    }
    if (cooldown) ctx.db.chatCooldown.identity.update({ ...cooldown, lastSentAt: ctx.timestamp });
    else ctx.db.chatCooldown.insert({ identity: ctx.sender, lastSentAt: ctx.timestamp });
    if (bugCommand) {
      ctx.db.bugReport.insert({
        id: 0n,
        reporter: ctx.sender,
        reporterName: profile.displayName,
        message: report,
        protocolVersion: PROTOCOL_VERSION,
        reportedAt: ctx.timestamp,
      });
      return;
    }

    insertChatMessage(ctx, ctx.sender, profile.displayName, normalized);
  },
);

export const requestDuel = spacetimedb.reducer(
  {},
  (ctx) => {
    const challenger = requireControllingPlayer(ctx);
    clearExpiredDuelRequests(ctx);
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("You already have a duel request.");

    const cooldown = ctx.db.duelRequestCooldown.identity.find(ctx.sender);
    if (cooldown && ctx.timestamp.microsSinceUnixEpoch - cooldown.requestedAt.microsSinceUnixEpoch < DUEL_REQUEST_COOLDOWN_MICROS) {
      throw new SenderError("Wait a moment before challenging again.");
    }

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
    if (!opponent) throw new SenderError("Move closer to the player you want to challenge.");
    if (cooldown) ctx.db.duelRequestCooldown.identity.update({ ...cooldown, requestedAt: ctx.timestamp });
    else ctx.db.duelRequestCooldown.insert({ identity: ctx.sender, requestedAt: ctx.timestamp });

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
    requireControllingPlayer(ctx);
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
      ...playerZone(DUEL_ARENA.challenger.x, DUEL_ARENA.challenger.y),
      hp: challengerProgress.maxHp,
      maxHp: challengerProgress.maxHp,
      moving: false,
      lastInputAt: ctx.timestamp,
    });
    ctx.db.player.identity.update({
      ...opponent,
      x: DUEL_ARENA.opponent.x,
      y: DUEL_ARENA.opponent.y,
      ...playerZone(DUEL_ARENA.opponent.x, DUEL_ARENA.opponent.y),
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
    requireControllingPlayer(ctx);
    const current = activeDuelFor(ctx, ctx.sender);
    if (current?.status === "countdown" || current?.status === "active" || current?.status === "finishing") resolveDuel(ctx, current);
  },
);

export const syncPosition = spacetimedb.reducer(
  { x: t.f64(), y: t.f64(), facing: t.f64(), moving: t.bool(), sequence: t.u32() },
  (ctx, { x, y, facing, moving, sequence }) => {
    const current = requireControllingPlayer(ctx);
    if (sequence <= current.lastInputSequence || ["countdown", "active", "finishing"].includes(activeDuelFor(ctx, ctx.sender)?.status)) return;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) {
      throw new SenderError("Position sync values must be finite");
    }

    const clampedX = Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, x));
    const clampedY = Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, y));
    ctx.db.player.identity.update({
      ...current,
      x: clampedX,
      y: clampedY,
      ...playerZone(clampedX, clampedY),
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
    const current = requireControllingPlayer(ctx);

    const validSpeed = [PLAYER_SPEED, PLAYER_SPEED + BOOTS_SPEED_BONUS]
      .some((allowed) => Math.abs(speed - allowed) < 0.01);
    if (!validSpeed) throw new SenderError("Unsupported player speed");

    ctx.db.player.identity.update({
      ...current,
      speed,
      lastInputAt: ctx.timestamp,
    });
  },
);
