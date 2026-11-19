import { Range, SenderError, table, t } from "spacetimedb/server";
import type spacetimedbType from "./index";
import {
  CROSSING_MAX_POINTS,
  CROSSING_STEPS,
  GUILD_CROSSING_ARRIVAL,
  crossingFrontierSpawn,
  crossingPointsForState,
  dailyCrossingAttempts,
  guildCrossingGuildId,
  guildCrossingMapId,
  isGuildCrossingMap,
  type CrossingFall,
  type CrossingPioneer,
  type CrossingSide,
  type GuildCrossingSnapshot,
  type GuildCrossingSummary,
} from "../../shared/guild-crossing";
import { isGuildHallMap } from "../../shared/guild-hall";
import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { isTownMap, TOWN_ARRIVAL, TOWN_MAP_ID } from "../../shared/town";
import { questDay, questWeek, questWeekEndsAtMs } from "../../shared/weekly-quests";

const DAY_MS = 86_400_000;

/**
 * Each guild's weekly Glass Crossing state. Private so clients never see unrevealed bits of `secretMask`.
 */
export const guildCrossingWeek = table({ name: "guild_crossing_week", public: false }, {
  key: t.string().primaryKey(),
  week: t.u32().index("btree"),
  guildId: t.u64(),
  /** 16-bit secret mask (bit i = 0 -> left safe, 1 -> right safe). Never sent to clients. */
  secretMask: t.u32(),
  /** Number of steps revealed so far (0..16). */
  revealed: t.u8(),
  completed: t.bool(),
  completedBy: t.string(),
  completedByIdentity: t.string(),
  completedByIcon: t.u32(),
  completedAt: t.u64(),
  pointsAwarded: t.u32(),
  fallsJson: t.string(),
  pioneersJson: t.string(),
});

/**
 * Per-account daily Glass Crossing attempts and streak. Tracked per player per UTC day
 * so leaving/rejoining a guild cannot reset daily tries.
 */
export const guildCrossingAttempt = table({ name: "guild_crossing_attempt", public: false }, {
  identity: t.identity().primaryKey(),
  day: t.u32(),
  used: t.u32(),
  streak: t.u32(),
  bestStreak: t.u32(),
  guildId: t.u64(),
});

export const guildCrossingTables = { guildCrossingWeek, guildCrossingAttempt };

type Ctx = any;
const crossingKey = (week: number, guildId: bigint) => `${week}:${guildId}`;
const bitSide = (mask: number, step: number): CrossingSide => (((mask >>> step) & 1) === 1 ? "right" : "left");

function parseJsonArray<T>(raw: string | undefined): T[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function generateSecretMask(random: () => number): number {
  let mask = 0;
  for (let i = 0; i < CROSSING_STEPS; i++) {
    if (random() >= 0.5) mask |= 1 << i;
  }
  return mask >>> 0;
}

/** Bonus Guild Quest Points already awarded by Glass Crossing for `(week, guildId)`. */
export function guildCrossingBonusPoints(ctx: Ctx, week: number, guildId: bigint): number {
  return ctx.db.guildCrossingWeek?.key.find(crossingKey(week, guildId))?.pointsAwarded ?? 0;
}

/** Drops Glass Crossing weeks older than last week, matching `pruneOldGuildQuestWeeks`. */
export function pruneOldGuildCrossingWeeks(ctx: Ctx) {
  if (!ctx.db.guildCrossingWeek) return 0;
  const lastWeek = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch)) - 1;
  const old = [...ctx.db.guildCrossingWeek.week.filter(new Range({ tag: "unbounded" }, { tag: "excluded", value: lastWeek }))];
  for (const row of old) ctx.db.guildCrossingWeek.key.delete(row.key);
  return old.length;
}

function attemptForToday(ctx: Ctx, identity: any, day: number) {
  const row = ctx.db.guildCrossingAttempt?.identity.find(identity);
  if (!row || row.day !== day) return { used: 0, streak: 0, bestStreak: row?.bestStreak ?? 0 };
  return { used: row.used, streak: row.streak, bestStreak: row.bestStreak };
}

/** Lightweight summary included in `GuildSnapshot` so Guilds → Quests shows status without an extra fetch. */
export function guildCrossingSummaryFor(ctx: Ctx, identity: any, guildId: bigint, memberCount: number): GuildCrossingSummary {
  const day = questDay(ctx.timestamp.microsSinceUnixEpoch);
  const week = questWeek(day);
  const row = ctx.db.guildCrossingWeek?.key.find(crossingKey(week, guildId));
  const dailyLimit = dailyCrossingAttempts(memberCount);
  const attempt = attemptForToday(ctx, identity, day);
  const fallsCount = row ? parseJsonArray<CrossingFall>(row.fallsJson).length : 0;
  return {
    revealed: row?.revealed ?? 0,
    steps: CROSSING_STEPS,
    completed: Boolean(row?.completed),
    pointsAwarded: row?.pointsAwarded ?? 0,
    maxPoints: CROSSING_MAX_POINTS,
    fallsCount,
    dailyLimit,
    usedToday: attempt.used,
    remainingToday: Math.max(0, dailyLimit - attempt.used),
    winnerName: row?.completed && row.completedBy ? row.completedBy : null,
  };
}

/** Full client snapshot for the caller's guild. Never exposes unrevealed bits of `secretMask`. */
export function readGuildCrossing(ctx: Ctx, identity: any): GuildCrossingSnapshot | null {
  const member = ctx.db.guildMember.identity.find(identity);
  if (!member) return null;
  const guild = ctx.db.guild.id.find(member.guildId);
  if (!guild) return null;
  const day = questDay(ctx.timestamp.microsSinceUnixEpoch);
  const week = questWeek(day);
  const row = ctx.db.guildCrossingWeek.key.find(crossingKey(week, guild.id));
  const revealed = Math.max(0, Math.min(CROSSING_STEPS, row?.revealed ?? 0));
  const revealedSides: CrossingSide[] = [];
  if (row) {
    for (let i = 0; i < revealed; i++) revealedSides.push(bitSide(row.secretMask, i));
  }
  const falls = row ? parseJsonArray<CrossingFall>(row.fallsJson) : [];
  const pioneers = row ? parseJsonArray<CrossingPioneer>(row.pioneersJson) : [];
  const memberCount = Math.max(1, guild.members || [...ctx.db.guildMember.guildId.filter(guild.id)].length);
  const dailyLimit = dailyCrossingAttempts(memberCount);
  const attempt = attemptForToday(ctx, identity, day);
  return {
    week,
    day,
    resetsAtMs: questWeekEndsAtMs(day),
    nextDayAtMs: (day + 1) * DAY_MS,
    guildId: String(guild.id),
    guildName: guild.name,
    guildEmblem: guild.emblem ?? -1,
    memberCount,
    steps: CROSSING_STEPS,
    revealed,
    completed: Boolean(row?.completed),
    pointsAwarded: row?.pointsAwarded ?? 0,
    maxPoints: CROSSING_MAX_POINTS,
    fallsCount: falls.length,
    dailyLimit,
    usedToday: attempt.used,
    remainingToday: Math.max(0, dailyLimit - attempt.used),
    winnerName: row?.completed && row.completedBy ? row.completedBy : null,
    revealedSides,
    falls,
    pioneers,
    winner: row?.completed && row.completedBy
      ? { name: row.completedBy, identity: row.completedByIdentity, profileIcon: row.completedByIcon }
      : null,
    currentStreak: attempt.streak,
    bestStreak: attempt.bestStreak,
  };
}

export type GuildCrossingDeps = {
  requireGuildPlayer: (ctx: Ctx) => void;
  requireGuildConnection: (ctx: Ctx) => void;
  profileFor: (ctx: Ctx, identity: any) => { displayName: string; profileIcon: number; skinTone?: number } | null;
  creditCrossingPoints: (ctx: Ctx, guildId: bigint, guildName: string, delta: number) => void;
};

/** Executes one 50/50 glass step (or final Finish Portal crossing) for `ctx.sender`'s guild. */
export function stepGuildCrossingFor(ctx: Ctx, expectedStep: number, side: string, deps: Pick<GuildCrossingDeps, "profileFor" | "creditCrossingPoints">) {
  const member = ctx.db.guildMember.identity.find(ctx.sender) ?? (() => { throw new SenderError("Join a guild to enter the Glass Crossing."); })();
  const guild = ctx.db.guild.id.find(member.guildId) ?? (() => { throw new SenderError("Guild no longer exists."); })();
  const day = questDay(ctx.timestamp.microsSinceUnixEpoch);
  const week = questWeek(day);
  const key = crossingKey(week, guild.id);
  let row = ctx.db.guildCrossingWeek.key.find(key);
  if (!row) {
    row = ctx.db.guildCrossingWeek.insert({
      key,
      week,
      guildId: guild.id,
      secretMask: generateSecretMask(() => ctx.random()),
      revealed: 0,
      completed: false,
      completedBy: "",
      completedByIdentity: "",
      completedByIcon: 0,
      completedAt: 0n,
      pointsAwarded: 0,
      fallsJson: "[]",
      pioneersJson: "[]",
    });
  }
  if (row.completed) throw new SenderError("Your guild already cleared the Glass Crossing this week.");
  if (expectedStep !== row.revealed) throw new SenderError("A guildmate just stepped ahead! Refreshing the bridge.");

  const memberCount = Math.max(1, guild.members || [...ctx.db.guildMember.guildId.filter(guild.id)].length);
  const dailyLimit = dailyCrossingAttempts(memberCount);
  const existingAttempt = ctx.db.guildCrossingAttempt.identity.find(ctx.sender);
  const prev = existingAttempt && existingAttempt.day === day
    ? existingAttempt
    : { identity: ctx.sender, day, used: 0, streak: 0, bestStreak: existingAttempt?.bestStreak ?? 0, guildId: guild.id };
  if (prev.used >= dailyLimit) throw new SenderError("No tries left today. Come back after daily reset.");

  const profile = deps.profileFor(ctx, ctx.sender);
  const playerRow = ctx.db.player?.identity.find(ctx.sender) ?? null;
  const playerName = profile?.displayName || member.name || "Wanderer";
  const playerIcon = profile?.profileIcon ?? 0;
  const playerHex = ctx.sender.toHexString();
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;

  const falls = parseJsonArray<CrossingFall>(row.fallsJson);
  const pioneers = parseJsonArray<CrossingPioneer>(row.pioneersJson);
  let nextRevealed = row.revealed;
  let nextCompleted = false;
  let nextUsed = prev.used;
  let nextStreak = prev.streak;
  let nextBestStreak = prev.bestStreak;

  if (row.revealed >= CROSSING_STEPS) {
    // Step 16 was shattered earlier: stepping through the unlocked Finish Portal completes the week.
    if (side !== "finish") throw new SenderError("Step through the Finish Portal to claim victory.");
    nextCompleted = true;
    nextStreak += 1;
    nextBestStreak = Math.max(nextBestStreak, nextStreak);
  } else {
    if (side !== "left" && side !== "right") throw new SenderError("Choose Left or Right.");
    const safeSide = bitSide(row.secretMask, row.revealed);
    if (side === safeSide) {
      pioneers.push({ step: row.revealed, side, name: playerName, identity: playerHex, profileIcon: playerIcon });
      nextRevealed = row.revealed + 1;
      nextStreak += 1;
      nextBestStreak = Math.max(nextBestStreak, nextStreak);
      if (nextRevealed >= CROSSING_STEPS) nextCompleted = true;
    } else {
      falls.push({
        step: row.revealed,
        side,
        name: playerName,
        identity: playerHex,
        profileIcon: playerIcon,
        atMs: Number(nowMicros / 1000n),
        ...(typeof profile?.skinTone === "number" ? { skinTone: profile.skinTone } : {}),
        ...(playerRow?.headItem ? { headItem: playerRow.headItem } : {}),
        ...(playerRow?.chestItem ? { chestItem: playerRow.chestItem } : {}),
        ...(playerRow?.feetItem ? { feetItem: playerRow.feetItem } : {}),
        ...(playerRow?.rightHandItem ? { rightHandItem: playerRow.rightHandItem } : {}),
        ...(playerRow?.leftHandItem ? { leftHandItem: playerRow.leftHandItem } : {}),
      });
      nextRevealed = row.revealed + 1;
      nextUsed += 1;
      nextStreak = 0;
    }
  }

  const nextPoints = crossingPointsForState(nextRevealed, nextCompleted);
  const pointsDelta = Math.max(0, nextPoints - row.pointsAwarded);

  const updatedRow = {
    ...row,
    revealed: nextRevealed,
    completed: nextCompleted,
    completedBy: nextCompleted ? playerName : row.completedBy,
    completedByIdentity: nextCompleted ? playerHex : row.completedByIdentity,
    completedByIcon: nextCompleted ? playerIcon : row.completedByIcon,
    completedAt: nextCompleted ? nowMicros : row.completedAt,
    pointsAwarded: row.pointsAwarded + pointsDelta,
    fallsJson: JSON.stringify(falls),
    pioneersJson: JSON.stringify(pioneers),
  };
  ctx.db.guildCrossingWeek.key.update(updatedRow);

  const updatedAttempt = {
    identity: ctx.sender,
    day,
    used: nextUsed,
    streak: nextStreak,
    bestStreak: nextBestStreak,
    guildId: guild.id,
  };
  if (existingAttempt) ctx.db.guildCrossingAttempt.identity.update(updatedAttempt);
  else ctx.db.guildCrossingAttempt.insert(updatedAttempt);

  if (pointsDelta > 0) deps.creditCrossingPoints(ctx, guild.id, guild.name, pointsDelta);
  return {
    outcome: nextUsed > prev.used ? "fell" as const : nextCompleted ? "cleared" as const : "safe" as const,
    revealed: nextRevealed,
    completed: nextCompleted,
    pointsDelta,
  };
}

export function registerGuildCrossing(spacetimedb: typeof spacetimedbType, deps: GuildCrossingDeps) {
  const getGuildCrossing = spacetimedb.procedure({}, t.string(), (ctx: Ctx) => ctx.withTx((tx: Ctx) => {
    deps.requireGuildConnection(tx);
    return JSON.stringify(readGuildCrossing(tx, tx.sender));
  }));
  const stepGuildCrossing = spacetimedb.reducer({ expectedStep: t.u8(), side: t.string() }, (ctx: Ctx, { expectedStep, side }) => {
    deps.requireGuildPlayer(ctx);
    stepGuildCrossingFor(ctx, expectedStep, side, deps);
  });
  return { getGuildCrossing, stepGuildCrossing };
}

/** Whether `identity` belongs to the guild that owns this Glass Crossing map. */
export function guildCrossingMember(ctx: Ctx, identity: any, mapId: string) {
  const id = guildCrossingGuildId(mapId);
  return id !== null && (ctx.db.guildMember.identity.find(identity)?.guildId ?? null) === id;
}

/** Frontier spawn inside `guild_crossing_<guildId>` so players land right behind the next 50/50 tile. */
export function guildCrossingSpawnFor(ctx: Ctx, mapId: string) {
  const guildId = guildCrossingGuildId(mapId);
  if (guildId === null) return { ...GUILD_CROSSING_ARRIVAL };
  const week = questWeek(questDay(ctx.timestamp.microsSinceUnixEpoch));
  const row = ctx.db.guildCrossingWeek?.key.find(crossingKey(week, guildId));
  if (!row) return { ...GUILD_CROSSING_ARRIVAL };
  const revealed = Math.max(0, Math.min(CROSSING_STEPS, row.revealed));
  const sides: CrossingSide[] = [];
  for (let i = 0; i < revealed; i++) sides.push(bitSide(row.secretMask, i));
  return crossingFrontierSpawn(revealed, Boolean(row.completed), sides);
}

/** `change_map` into `guild_crossing_<guildId>`: from anywhere for guild members; preserves Fight return location. */
export function enterGuildCrossing(
  ctx: Ctx,
  current: any,
  mapId: string,
  x: number,
  y: number,
  deps: { transitionPlayerMap: (ctx: Ctx, current: any, mapId: string, arrival: { x: number; y: number }) => any; persistWorldLocation: (ctx: Ctx, player: any) => void },
) {
  if (!guildCrossingMember(ctx, ctx.sender, mapId)) throw new SenderError("Only the guild's members can enter its Glass Crossing.");
  if (current.hp <= 0) throw new SenderError("Respawn before travelling.");
  if (current.mapId !== HOME_EXTERIOR_MAP_ID && !isGuildHallMap(current.mapId) && !isGuildCrossingMap(current.mapId) && !isTownMap(current.mapId) && [x, y].every(Number.isFinite)) {
    const saved = { identity: ctx.sender, mapId: current.mapId, x, y, facing: current.facing };
    if (ctx.db.homeReturnLocation.identity.find(ctx.sender)) ctx.db.homeReturnLocation.identity.update(saved);
    else ctx.db.homeReturnLocation.insert(saved);
  }
  const landing = guildCrossingSpawnFor(ctx, mapId);
  deps.transitionPlayerMap(ctx, current, mapId, landing);
  deps.persistWorldLocation(ctx, ctx.db.player.identity.find(ctx.sender));
}

/** A member left or was removed from a guild while inside its Glass Crossing: move them to Town. */
export function guildCrossingMemberLeft(
  ctx: Ctx,
  identity: any,
  guildId: bigint,
  deps: { transitionPlayerMap: (ctx: Ctx, current: any, mapId: string, arrival: { x: number; y: number }) => any; persistWorldLocation: (ctx: Ctx, player: any) => void },
) {
  const mapId = guildCrossingMapId(guildId);
  const player = ctx.db.player.identity.find(identity);
  if (player?.mapId === mapId) {
    deps.transitionPlayerMap({ ...ctx, sender: identity }, player, TOWN_MAP_ID, TOWN_ARRIVAL);
    deps.persistWorldLocation({ ...ctx, sender: identity }, ctx.db.player.identity.find(identity));
  }
  if (ctx.db.homeReturnLocation.identity.find(identity)?.mapId === mapId) ctx.db.homeReturnLocation.identity.delete(identity);
}

export { GUILD_CROSSING_ARRIVAL, isGuildCrossingMap };
