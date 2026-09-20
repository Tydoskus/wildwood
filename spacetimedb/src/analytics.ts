import { table, t } from "spacetimedb/server";

export const UTC_DAY_MICROS = 86_400_000_000n;

const analyticsDailyPlayer = table(
  {
    name: "analytics_daily_player",
    public: false,
    indexes: [
      { accessor: "byDay", algorithm: "btree", columns: ["dayKey"] as const },
      { accessor: "byIdentity", algorithm: "btree", columns: ["identity"] as const },
    ],
  },
  {
    key: t.string().primaryKey(),
    identity: t.identity(),
    dayKey: t.string(),
    firstSeenDayKey: t.string(),
    isGuest: t.bool(),
    sessions: t.u32().default(0),
    sessionMicros: t.u64().default(0n),
  },
);

const analyticsDailyMapPlayer = table(
  {
    name: "analytics_daily_map_player",
    public: false,
    indexes: [{ accessor: "byDay", algorithm: "btree", columns: ["dayKey"] as const }],
  },
  {
    key: t.string().primaryKey(),
    identity: t.identity(),
    dayKey: t.string(),
    mapId: t.string(),
    releaseVersion: t.string(),
    sessions: t.u32().default(0),
    sessionMicros: t.u64().default(0n),
  },
);

const analyticsPlayer = table({ name: "analytics_player", public: false }, {
  identity: t.identity().primaryKey(),
  firstSeenDayKey: t.string(),
  firstKillDayKey: t.string().default(""),
  firstBossDayKey: t.string().default(""),
  firstPrestigeDayKey: t.string().default(""),
});

const analyticsConversion = table({ name: "analytics_conversion", public: false }, {
  id: t.u64().primaryKey().autoInc(),
  guestIdentity: t.identity(),
  accountIdentity: t.identity(),
  dayKey: t.string(),
});

export const analyticsTables = {
  analyticsDailyPlayer,
  analyticsDailyMapPlayer,
  analyticsPlayer,
  analyticsConversion,
};

function dayKeyFor(ctx: any, micros = ctx.timestamp.microsSinceUnixEpoch) {
  return String(micros / UTC_DAY_MICROS);
}

function identityKey(identity: any) {
  return identity.toHexString().toLowerCase();
}

function releaseVersionFor(session: any) {
  return session?.clientVersion?.trim() || (session?.protocolVersion ? `protocol-${session.protocolVersion}` : "unknown");
}

function playerAnalyticsRow(ctx: any, identity: any, dayKey: string) {
  const current = ctx.db.analyticsPlayer.identity.find(identity);
  if (current) return current;
  const next = { identity, firstSeenDayKey: dayKey, firstKillDayKey: "", firstBossDayKey: "", firstPrestigeDayKey: "" };
  ctx.db.analyticsPlayer.insert(next);
  return next;
}

export function recordAnalyticsSessionStart(ctx: any, mapId: string) {
  if (!ctx.connectionId) return;
  // The client version lives beside the session rather than in it, so a live
  // connection's analytics reads both rows as one.
  const session = { ...ctx.db.playerSession.connectionId.find(ctx.connectionId),
    ...ctx.db.playerSessionAnalytics.connectionId.find(ctx.connectionId) };
  if (!session.enteredWorld) return;
  const dayKey = dayKeyFor(ctx);
  const identity = identityKey(ctx.sender);
  const player = playerAnalyticsRow(ctx, ctx.sender, dayKey);
  const playerKey = `${dayKey}:${identity}`;
  const status = ctx.db.playerAccountStatus.identity.find(ctx.sender);
  const daily = ctx.db.analyticsDailyPlayer.key.find(playerKey);
  const nextDaily = {
    key: playerKey,
    identity: ctx.sender,
    dayKey,
    firstSeenDayKey: player.firstSeenDayKey,
    isGuest: status?.isGuest ?? true,
    sessions: (daily?.sessions ?? 0) + 1,
    sessionMicros: daily?.sessionMicros ?? 0n,
  };
  if (daily) ctx.db.analyticsDailyPlayer.key.update(nextDaily);
  else ctx.db.analyticsDailyPlayer.insert(nextDaily);

  const releaseVersion = releaseVersionFor(session);
  const mapKey = `${dayKey}:${identity}:${mapId}:${releaseVersion}`;
  const mapDaily = ctx.db.analyticsDailyMapPlayer.key.find(mapKey);
  const nextMapDaily = {
    key: mapKey,
    identity: ctx.sender,
    dayKey,
    mapId,
    releaseVersion,
    sessions: (mapDaily?.sessions ?? 0) + 1,
    sessionMicros: mapDaily?.sessionMicros ?? 0n,
  };
  if (mapDaily) ctx.db.analyticsDailyMapPlayer.key.update(nextMapDaily);
  else ctx.db.analyticsDailyMapPlayer.insert(nextMapDaily);
}

/** Counts a map visit separately from the player session count. */
export function recordAnalyticsMapVisit(ctx: any, mapId: string) {
  if (!ctx.connectionId) return;
  const session = ctx.db.playerSession.connectionId.find(ctx.connectionId);
  if (!session?.enteredWorld) return;
  const dayKey = dayKeyFor(ctx);
  const key = `${dayKey}:${identityKey(ctx.sender)}:${mapId}:${releaseVersionFor(session)}`;
  const current = ctx.db.analyticsDailyMapPlayer.key.find(key);
  const next = {
    key,
    identity: ctx.sender,
    dayKey,
    mapId,
    releaseVersion: releaseVersionFor(session),
    sessions: (current?.sessions ?? 0) + 1,
    sessionMicros: current?.sessionMicros ?? 0n,
  };
  if (current) ctx.db.analyticsDailyMapPlayer.key.update(next);
  else ctx.db.analyticsDailyMapPlayer.insert(next);
}

export function finishAnalyticsSession(ctx: any, session: any, mapId: string) {
  const startedAtMicros = BigInt(session?.analyticsStartedAtMicros ?? 0n);
  if (!startedAtMicros) return;
  const elapsed = ctx.timestamp.microsSinceUnixEpoch - startedAtMicros;
  if (elapsed <= 0n) return;
  const dayKey = dayKeyFor(ctx, startedAtMicros);
  const identity = identityKey(session.identity);
  const playerKey = `${dayKey}:${identity}`;
  const daily = ctx.db.analyticsDailyPlayer.key.find(playerKey);
  if (daily) ctx.db.analyticsDailyPlayer.key.update({ ...daily, sessionMicros: daily.sessionMicros + elapsed });
  const mapKey = `${dayKey}:${identity}:${mapId}:${releaseVersionFor(session)}`;
  const mapDaily = ctx.db.analyticsDailyMapPlayer.key.find(mapKey);
  if (mapDaily) ctx.db.analyticsDailyMapPlayer.key.update({ ...mapDaily, sessionMicros: mapDaily.sessionMicros + elapsed });
}

export function recordAnalyticsMilestone(ctx: any, kind: "kill" | "boss" | "prestige") {
  const dayKey = dayKeyFor(ctx);
  const current = playerAnalyticsRow(ctx, ctx.sender, dayKey);
  const field = kind === "kill" ? "firstKillDayKey" : kind === "boss" ? "firstBossDayKey" : "firstPrestigeDayKey";
  if (current[field]) return;
  ctx.db.analyticsPlayer.identity.update({ ...current, [field]: dayKey });
}

export function recordAnalyticsConversion(ctx: any, guestIdentity: any, accountIdentity: any) {
  ctx.db.analyticsConversion.insert({ id: 0n, guestIdentity, accountIdentity, dayKey: dayKeyFor(ctx) });
}

function parseDayKey(value: string) {
  if (!/^\d+$/.test(value)) throw new Error("Invalid analytics day range.");
  const day = Number(value);
  if (!Number.isSafeInteger(day)) throw new Error("Invalid analytics day range.");
  return day;
}

function rate(count: number, total: number) {
  return total ? Math.round((count / total) * 10_000) / 100 : null;
}

export function readAnalyticsDashboard(ctx: any, fromDayKey: string, toDayKey: string) {
  const from = parseDayKey(fromDayKey);
  const to = parseDayKey(toDayKey);
  if (from > to || to - from > 366) throw new Error("Analytics range must be 1-367 days.");

  const dailyRows = [...ctx.db.analyticsDailyPlayer.iter()].filter((row: any) => {
    const day = Number(row.dayKey);
    return day >= from - 29 && day <= to;
  });
  const rowsByDay = new Map<number, any[]>();
  for (const row of dailyRows) {
    const day = Number(row.dayKey);
    const bucket = rowsByDay.get(day) ?? [];
    bucket.push(row);
    rowsByDay.set(day, bucket);
  }
  const dashboardDays = [];
  for (let day = from; day <= to; day++) {
    const rows = rowsByDay.get(day) ?? [];
    const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
    const sessionMicros = rows.reduce((sum, row) => sum + row.sessionMicros, 0n);
    const unique = (offset: number) => new Set(
      dailyRows.filter(row => Number(row.dayKey) >= day - offset + 1 && Number(row.dayKey) <= day)
        .map(row => identityKey(row.identity)),
    ).size;
    dashboardDays.push({
      dayKey: String(day),
      dau: rows.length,
      wau: unique(7),
      mau: unique(30),
      newPlayers: rows.filter(row => row.firstSeenDayKey === String(day)).length,
      returningPlayers: rows.filter(row => row.firstSeenDayKey !== String(day)).length,
      guestPlayers: rows.filter(row => row.isGuest).length,
      accountPlayers: rows.filter(row => !row.isGuest).length,
      sessions,
      sessionsPerPlayer: rows.length ? sessions / rows.length : null,
      sessionMicros: sessionMicros.toString(),
      averageSessionSeconds: sessions ? Number(sessionMicros) / sessions / 1_000_000 : null,
    });
  }

  const activeByDay = new Map<string, Set<string>>();
  for (const row of dailyRows) {
    const key = `${row.firstSeenDayKey}:${identityKey(row.identity)}`;
    const set = activeByDay.get(row.dayKey) ?? new Set<string>();
    set.add(key);
    activeByDay.set(row.dayKey, set);
  }
  const cohorts = [...ctx.db.analyticsPlayer.iter()]
    .filter((row: any) => Number(row.firstSeenDayKey) >= from && Number(row.firstSeenDayKey) <= to)
    .reduce((map: Map<string, any[]>, row: any) => {
      const bucket = map.get(row.firstSeenDayKey) ?? [];
      bucket.push(row);
      map.set(row.firstSeenDayKey, bucket);
      return map;
    }, new Map<string, any[]>());
  const retention = [...cohorts.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([cohortDay, players]) => {
    const retained = (offset: number) => {
      const active = activeByDay.get(String(Number(cohortDay) + offset));
      if (!active) return null;
      return players.filter(player => active.has(`${cohortDay}:${identityKey(player.identity)}`)).length;
    };
    const d1 = retained(1); const d7 = retained(7); const d30 = retained(30);
    return {
      cohortDayKey: cohortDay,
      size: players.length,
      d1, d1Rate: d1 === null ? null : rate(d1, players.length),
      d7, d7Rate: d7 === null ? null : rate(d7, players.length),
      d30, d30Rate: d30 === null ? null : rate(d30, players.length),
    };
  });

  const milestones = [...ctx.db.analyticsPlayer.iter()].reduce((result: any, row: any) => {
    for (const [key, field] of [["firstKill", "firstKillDayKey"], ["firstBoss", "firstBossDayKey"], ["firstPrestige", "firstPrestigeDayKey"]]) {
      const day = row[field];
      if (day && Number(day) >= from && Number(day) <= to) result[key][day] = (result[key][day] ?? 0) + 1;
    }
    return result;
  }, { firstKill: {}, firstBoss: {}, firstPrestige: {} });

  const mapRows = [...ctx.db.analyticsDailyMapPlayer.iter()].filter((row: any) => Number(row.dayKey) >= from && Number(row.dayKey) <= to);
  const mapBuckets = new Map<string, any>();
  for (const row of mapRows) {
    const key = `${row.mapId}:${row.releaseVersion}`;
    const bucket = mapBuckets.get(key) ?? { mapId: row.mapId, releaseVersion: row.releaseVersion, players: new Set<string>(), sessions: 0, sessionMicros: 0n };
    bucket.players.add(identityKey(row.identity));
    bucket.sessions += row.sessions;
    bucket.sessionMicros += row.sessionMicros;
    mapBuckets.set(key, bucket);
  }
  const activity = [...mapBuckets.values()].map(row => ({ mapId: row.mapId, releaseVersion: row.releaseVersion, players: row.players.size, sessions: row.sessions, sessionMicros: row.sessionMicros.toString(), averageSessionSeconds: row.sessions ? Number(row.sessionMicros) / row.sessions / 1_000_000 : null })).sort((a, b) => b.sessions - a.sessions);
  const conversionsByDay: Record<string, number> = {};
  for (const row of ctx.db.analyticsConversion.iter()) {
    if (Number(row.dayKey) >= from && Number(row.dayKey) <= to) conversionsByDay[row.dayKey] = (conversionsByDay[row.dayKey] ?? 0) + 1;
  }

  return JSON.stringify({
    fromDayKey, toDayKey, timezone: "UTC", days: dashboardDays, retention,
    conversion: { total: Object.values(conversionsByDay).reduce((sum, count) => sum + count, 0), byDay: conversionsByDay },
    milestones, activity,
  });
}
