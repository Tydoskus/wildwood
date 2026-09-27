import { Timestamp } from "spacetimedb";
import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { DEFEAT_MIN_RESPAWN_SECONDS, ENEMY_DEFEAT_BATCH_MAX, SIM_CLOCK_BANK_SECONDS, defeatBudget, defeatMinRespawnSeconds, enemyDefeatDefinition, mapEnemyPopulation } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { MIN_ATTACK_INTERVAL, REGULAR_ENEMY_RESPAWN_SECONDS, REGULAR_KILL_REPORT_SECONDS } from "../../shared/rules";
import { STARTER_BOW } from "../../shared/items";
import { defaultBalanceSettings, resolveMapBalance } from "../../shared/map-balance";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const MAP = "crystal_hollows";
/** The roster a lap of the map actually presents, species by species. */
const ROSTER = Object.keys(ENEMY_TYPES)
  .map(kind => ({ kind, definition: enemyDefeatDefinition(MAP, kind) }))
  .filter((entry): entry is { kind: string; definition: NonNullable<typeof entry.definition> } => Boolean(entry.definition));
const MAP_POPULATION = ROSTER.reduce((sum, entry) => sum + entry.definition.population, 0);

/**
 * Drives one account through a stretch of play and reports what the server
 * actually paid, so a claimed farming rate can be compared against the rate
 * the server is willing to honour.
 */
function player(options: { lapSeconds: number; minutes: number; reportSeconds?: number; pinned?: boolean }) {
  const f = crystalFixture();
  // Almost every live account carries a pinned v2 balance snapshot, and that
  // path resolves its own respawn basis. Simulate it, or the ceiling is only
  // measured on the few accounts that have none.
  if (options.pinned !== false) {
    f.seed("playerMapBalance", { identity: f.ctx.sender, mapId: MAP,
      snapshotJson: JSON.stringify(resolveMapBalance(MAP, defaultBalanceSettings(), 1, 2)) });
  }
  // A build that one-shots everything at the fastest attack speed with a
  // ranged volley, so combat is never the binding limit and the respawn
  // ceiling is what the simulation is actually measuring. (Each projectile
  // kills at most one enemy, and the combat clock is shared across species.)
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: `["${STARTER_BOW}"]`, damage: 1e18, attackRate: MIN_ATTACK_INTERVAL, projectileCount: 3 });
  f.patch("player", { mapId: MAP });

  const reportSeconds = options.reportSeconds ?? REGULAR_KILL_REPORT_SECONDS;
  const totalSeconds = options.minutes * 60;
  const streamId = "simulation-stream";
  let sequence = 0n;
  let elapsed = 0;
  let claimed = 0;
  let paid = 0;
  /** Kills owed, merged by species: a report may name each enemy only once. */
  let pending = new Map<string, number>();
  let sinceReport = 0;

  const advance = (seconds: number) => {
    f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(Math.round(seconds * 1e6)));
  };
  /**
   * A report may never carry more than ENEMY_DEFEAT_BATCH_MAX kills, nor name a
   * species twice; the server takes the session from anything larger, so no
   * real client or script sends one. A backlog goes out as several reports,
   * which is exactly what a script hammering the reducer would do.
   */
  const flush = () => {
    while (pending.size) {
      const chunk: { enemy: string; count: number }[] = [];
      let room = ENEMY_DEFEAT_BATCH_MAX;
      for (const [enemy, owed] of [...pending]) {
        if (room <= 0) break;
        const take = Math.min(owed, room);
        chunk.push({ enemy, count: take });
        room -= take;
        if (take === owed) pending.delete(enemy);
        else pending.set(enemy, owed - take);
      }
      if (!chunk.length) break;
      sequence += 1n;
      const before = Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
      f.run(server.recordEnemyDefeats, { mapId: MAP, streamId, sequence, enemies: chunk });
      paid = Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
      // player_gem_drop and player_item_drop are event tables: the host hands
      // each row to the client and drops it. The in-memory database keeps rows,
      // so drain them here or a later drop collides on the identity key.
      for (const table of ["playerGemDrop", "playerItemDrop"]) {
        for (const row of [...(f.db as any)[table].iter()]) (f.db as any)[table].identity.delete(row.identity);
      }
      if (paid === before) break;    // the bucket is dry; further reports earn nothing
    }
    pending = new Map();
  };

  while (elapsed < totalSeconds) {
    for (const { kind, definition } of ROSTER) {
      pending.set(kind, (pending.get(kind) ?? 0) + definition.population);
      claimed += definition.population;
    }
    advance(options.lapSeconds);
    elapsed += options.lapSeconds;
    sinceReport += options.lapSeconds;
    if (sinceReport >= reportSeconds) { flush(); sinceReport = 0; }
  }
  flush();

  return {
    claimed, paid,
    claimedPerSecond: claimed / totalSeconds,
    paidPerSecond: paid / totalSeconds,
    restricted: Boolean(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)),
    stillInWorld: Boolean(f.db.player.identity.find(f.ctx.sender)),
    reviewed: [...f.db.enemyDefeatReview.iter()].length,
  };
}

const CEILING = MAP_POPULATION / DEFEAT_MIN_RESPAWN_SECONDS;

describe("farming rate under the respawn ceiling", () => {
  it("prices the map the way the ceiling is meant to", () => {
    expect(MAP_POPULATION).toBe(30);
    expect(CEILING).toBe(3);
  });

  it("uses the same ceiling for a pinned snapshot, and follows a tuned respawn", () => {
    // The pinned path resolves its own basis. It used to divide the respawn by
    // six, which left the ceiling applying only to accounts without a snapshot
    // — and live has thousands with one.
    expect(defeatMinRespawnSeconds(REGULAR_ENEMY_RESPAWN_SECONDS)).toBe(DEFEAT_MIN_RESPAWN_SECONDS);
    // Nothing halves the respawn any more, so neither does the ceiling.
    expect(defeatMinRespawnSeconds(20)).toBe(20);
    const pinned = player({ lapSeconds: 28 / 5, minutes: 10 });
    const unpinned = player({ lapSeconds: 28 / 5, minutes: 10, pinned: false });
    expect(pinned.paidPerSecond).toBeCloseTo(unpinned.paidPerSecond, 2);
    expect(pinned.paidPerSecond).toBeLessThanOrEqual(CEILING * 1.05);
  });

  it("reports what each profile actually earns", () => {
    const profiles = [
      ["honest lap (28s)", { lapSeconds: 28, minutes: 10 }],
      ["plain respawn (10s)", { lapSeconds: 10, minutes: 10 }],
      ["old ad rate (5s)", { lapSeconds: 5, minutes: 10 }],
      ["5x speed hack", { lapSeconds: 28 / 5, minutes: 10 }],
      ["flat-out script", { lapSeconds: .5, minutes: 10 }],
      ["script, one hour", { lapSeconds: .5, minutes: 60 }],
    ] as const;
    const rows = profiles.map(([name, options]) => {
      const run = player(options);
      return `${name.padEnd(18)} claimed ${run.claimedPerSecond.toFixed(2).padStart(6)}/s  paid ${run.paidPerSecond.toFixed(2).padStart(5)}/s  restricted ${run.restricted}`;
    });
    console.log("\n" + rows.join("\n"));
    expect(rows).toHaveLength(profiles.length);
  });

  it("pays an ordinary lap in full", () => {
    // Ryan's own pace: a whole map in twenty-eight seconds.
    const run = player({ lapSeconds: 28, minutes: 10 });
    expect(run.paid).toBe(run.claimed);
    expect(run.paidPerSecond).toBeCloseTo(run.claimedPerSecond, 6);
    expect(run.restricted).toBe(false);
    expect(run.reviewed).toBe(0);
  });

  it("pays a fast player on the 10-second respawn in full", () => {
    // Clearing as fast as the plain respawn allows is legitimate play, and
    // since 0.807 that is ten seconds with no ad involved.
    expect(DEFEAT_MIN_RESPAWN_SECONDS).toBe(10);
    const run = player({ lapSeconds: DEFEAT_MIN_RESPAWN_SECONDS, minutes: 10 });
    expect(run.paid).toBe(run.claimed);
    expect(run.restricted).toBe(false);
    expect(run.reviewed).toBe(0);
  });

  it("clips the old ad-halved rate of a 10-second respawn", () => {
    // Half of ten seconds is what the ad used to allow on top of the plain
    // clock. Nothing grants it now, so the ceiling holds it to the plain rate.
    const run = player({ lapSeconds: DEFEAT_MIN_RESPAWN_SECONDS / 2, minutes: 10 });
    expect(run.claimedPerSecond).toBeCloseTo(CEILING * 2, 1);
    expect(run.paidPerSecond).toBeLessThanOrEqual(CEILING * 1.05);
    expect(run.paid).toBeLessThan(run.claimed);
    expect(run.restricted).toBe(false);
    expect(run.stillInWorld).toBe(true);
  });

  it("holds a speed hacker to the ceiling and keeps them playing", () => {
    // Five times the pace of a real lap. Nothing about the movement packets
    // matters here: the payout is bounded where it is earned.
    const run = player({ lapSeconds: 28 / 5, minutes: 10 });
    expect(run.claimedPerSecond).toBeGreaterThan(CEILING * 1.5);
    expect(run.paidPerSecond).toBeLessThanOrEqual(CEILING * 1.05);
    expect(run.paid).toBeLessThan(run.claimed);
    // No ban, no disconnect, no queue for a person to read.
    expect(run.restricted).toBe(false);
    expect(run.stillInWorld).toBe(true);
    expect(run.reviewed).toBe(0);
  });

  it("holds a flat-out script to the same ceiling", () => {
    const run = player({ lapSeconds: .5, minutes: 10 });
    expect(run.claimedPerSecond).toBeGreaterThan(CEILING * 15);
    expect(run.paidPerSecond).toBeLessThanOrEqual(CEILING * 1.05);
    expect(run.restricted).toBe(false);
    expect(run.stillInWorld).toBe(true);
  });

  it("gives a cheater no meaningful edge over an honest player", () => {
    const honest = player({ lapSeconds: 28, minutes: 10 });
    const cheater = player({ lapSeconds: .5, minutes: 10 });
    // Fifty-six times the claimed rate buys under three times the payout, and
    // that whole margin is the legitimate headroom of a player who clears as
    // fast as the 10-second respawn allows.
    expect(cheater.claimedPerSecond / honest.claimedPerSecond).toBeGreaterThan(50);
    expect(cheater.paid / honest.paid).toBeLessThan(3);
  });
});

/** Every species a map presents, with how many of each a full lap kills. */
const rosters = new Map<string, { kind: string; population: number }[]>();
const rosterOf = (mapId: string) => {
  let roster = rosters.get(mapId);
  if (!roster) rosters.set(mapId, roster = Object.keys(ENEMY_TYPES)
    .map(kind => ({ kind, population: enemyDefeatDefinition(mapId, kind)?.population ?? 0 }))
    .filter(entry => entry.population > 0));
  return roster;
};

/**
 * Drives the current client through report_enemy_defeats. Kills land lap by
 * lap in the client's own game time and go into batches of at most
 * ENEMY_DEFEAT_BATCH_MAX. A batch is sealed when it fills or when the
 * 30-second report timer fires, and each report carries the game time the
 * client simulated since it sealed the one before. `speed` is game seconds per
 * real second: 1 for an honest client, 3 or 5 for a hooked performance.now and
 * requestAnimationFrame, which runs walking, attacks and respawns faster but
 * leaves the report timer and the server's clock alone.
 */
function currentClient(options: {
  lapSeconds: number; minutes: number; speed?: number;
  /** What the client says it simulated: measured game time, 0 (cannot say), or real time (a script lying). */
  says?: "measured" | "zero" | "real";
  /** A script hopping between maps on real time; it drains its reports before each portal, as the client does. */
  maps?: string[]; rotateSeconds?: number;
  /** The socket drops: kills keep queueing and nothing is sent until it is back. */
  offline?: { from: number; seconds: number };
  /** The tab stays open with nothing to fight: game time runs, no kills land. */
  idle?: { from: number; seconds: number };
  /** Send through record_enemy_defeats instead, which knows nothing of game time: what every report was paid before. */
  legacy?: boolean;
}) {
  const f = crystalFixture();
  const maps = options.maps ?? [MAP];
  if (!options.maps) f.seed("playerMapBalance", { identity: f.ctx.sender, mapId: MAP,
    snapshotJson: JSON.stringify(resolveMapBalance(MAP, defaultBalanceSettings(), 1, 2)) });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: `["${STARTER_BOW}"]`, damage: 1e18, attackRate: MIN_ATTACK_INTERVAL, projectileCount: 3 });
  f.patch("player", { mapId: maps[0] });
  const speed = options.speed ?? 1, says = options.says ?? "measured";
  const totalSeconds = options.minutes * 60, step = 1;
  const streamId = "current-client-stream";
  let sequence = 0n, mapIndex = 0, lap = 0, sinceReport = 0, sinceRotate = 0;
  let claimed = 0, reports = 0, throttled = 0, rejected = 0, scaledWarnings = 0;
  type Batch = { mapId: string; enemies: Map<string, number>; count: number; gameMs: number; realMs: number; sealed: boolean };
  const batches: Batch[] = [];
  let unsealedGameMs = 0, unsealedRealMs = 0;
  const paid = () => Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
  const seal = () => {
    const tail = batches.at(-1);
    if (!tail || tail.sealed) return;
    tail.sealed = true; tail.gameMs = unsealedGameMs; tail.realMs = unsealedRealMs;
    unsealedGameMs = 0; unsealedRealMs = 0;
  };
  const record = (mapId: string, enemy: string, count: number) => {
    claimed += count;
    while (count > 0) {
      let tail = batches.at(-1);
      if (!tail || tail.sealed || tail.mapId !== mapId) {
        seal();
        tail = { mapId, enemies: new Map(), count: 0, gameMs: 0, realMs: 0, sealed: false };
        batches.push(tail);
      }
      const take = Math.min(count, ENEMY_DEFEAT_BATCH_MAX - tail.count);
      tail.enemies.set(enemy, (tail.enemies.get(enemy) ?? 0) + take);
      tail.count += take; count -= take;
      if (tail.count === ENEMY_DEFEAT_BATCH_MAX) seal();
    }
  };
  const send = () => {
    seal();
    while (batches.length && batches[0].sealed) {
      const batch = batches[0];
      const simulatedMillis = says === "zero" ? 0 : Math.round(says === "real" ? batch.realMs : batch.gameMs);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const report = { streamId, sequence: sequence + 1n, mapId: batch.mapId, enemies: [...batch.enemies].map(([enemy, count]) => ({ enemy, count })) };
      try {
        if (options.legacy) f.run(server.recordEnemyDefeats, report);
        else f.run(server.reportEnemyDefeats, { ...report, simulatedMillis });
      } catch (error) {
        // The client keeps the batch and tries again on a later tick.
        if (/Enemy rewards are catching up/.test(String(error))) { throttled++; return; }
        // A script that hopped before its throttled reports went out loses them.
        if (/belong to another map/.test(String(error))) { rejected++; batches.shift(); continue; }
        throw error;
      } finally {
        scaledWarnings += warn.mock.calls.filter(call => /simulation ahead/.test(String(call[0]))).length;
        warn.mockRestore();
      }
      sequence += 1n; reports++; batches.shift();
      for (const table of ["playerGemDrop", "playerItemDrop"]) {
        for (const row of [...(f.db as any)[table].iter()]) (f.db as any)[table].identity.delete(row.identity);
      }
    }
  };
  const within = (window: { from: number; seconds: number } | undefined, t: number) => Boolean(window && t >= window.from && t < window.from + window.seconds);
  let paidAtHalf = 0;
  for (let t = 0; t < totalSeconds; t += step) {
    f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(step * 1e6));
    unsealedGameMs += speed * step * 1000; unsealedRealMs += step * 1000;
    if (!within(options.idle, t)) {
      lap += speed * step / options.lapSeconds;
      for (; lap >= 1; lap--) for (const { kind, population } of rosterOf(maps[mapIndex])) record(maps[mapIndex], kind, population);
    }
    sinceReport += step; sinceRotate += step;
    if (sinceReport >= REGULAR_KILL_REPORT_SECONDS) {
      sinceReport = 0;
      if (within(options.offline, t)) seal(); else send();
    }
    if (options.rotateSeconds && sinceRotate >= options.rotateSeconds) {
      sinceRotate = 0;
      send();
      mapIndex = (mapIndex + 1) % maps.length;
      f.patch("player", { mapId: maps[mapIndex] });
    }
    if (t + step === totalSeconds / 2) paidAtHalf = paid();
  }
  send();
  return {
    claimed, paid: paid(), reports, throttled, rejected, scaledWarnings,
    claimedPerSecond: claimed / totalSeconds, paidPerSecond: paid() / totalSeconds,
    /** The rate over the second half of the run, once any bank has been spent. */
    sustainedPerSecond: (paid() - paidAtHalf) / (totalSeconds / 2),
    restricted: Boolean(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)),
    stillInWorld: Boolean(f.db.player.identity.find(f.ctx.sender)),
    moderation: [...f.db.moderationAction.iter()],
  };
}

describe("the current client, held to the server's clock", () => {
  const HONEST_LAP = 28;
  // An hour of play a second at a time is quick alone, slow beside the rest of the suite.
  const SIMULATION_TIMEOUT_MS = 60_000;
  it("reports what each profile earns through report_enemy_defeats", () => {
    const profiles = [
      ["honest lap", { lapSeconds: HONEST_LAP, minutes: 60 }],
      ["3x speed hack", { lapSeconds: HONEST_LAP, minutes: 60, speed: 3 }],
      ["5x speed hack", { lapSeconds: HONEST_LAP, minutes: 60, speed: 5 }],
      ["5x hack, says 0", { lapSeconds: HONEST_LAP, minutes: 60, speed: 5, says: "zero" }],
      ["2-map hop script", { lapSeconds: .5, minutes: 60, says: "real", maps: [MAP, "water_reach"], rotateSeconds: 300 }],
    ] as const;
    const rows = profiles.map(([name, options]) => {
      const run = currentClient(options as Parameters<typeof currentClient>[0]);
      return `${name.padEnd(18)} claimed ${run.claimedPerSecond.toFixed(2).padStart(6)}/s  paid ${run.paidPerSecond.toFixed(2).padStart(5)}/s  sustained ${run.sustainedPerSecond.toFixed(2).padStart(5)}/s  throttled ${run.throttled}`;
    });
    console.log("\n" + rows.join("\n"));
    expect(rows).toHaveLength(profiles.length);
  }, SIMULATION_TIMEOUT_MS);

  it("pays an honest lap exactly what the old reducer paid it, and never scales it", () => {
    const current = currentClient({ lapSeconds: HONEST_LAP, minutes: 10 });
    const legacy = currentClient({ lapSeconds: HONEST_LAP, minutes: 10, legacy: true });
    expect(current.paid).toBe(current.claimed);
    expect(current.claimed).toBe(legacy.claimed);
    expect(current.paid).toBe(legacy.paid);
    // The lap the older harness above drives is paid in full as well.
    const older = player({ lapSeconds: HONEST_LAP, minutes: 10 });
    expect(older.paid).toBe(older.claimed);
    expect(current.throttled).toBe(0);
    expect(current.scaledWarnings).toBe(0);
    expect(current.moderation).toEqual([]);
    expect(current.restricted).toBe(false);
  });

  it("pays a 3x and a 5x speed hack within a tenth of the honest pace over an hour", () => {
    const honest = currentClient({ lapSeconds: HONEST_LAP, minutes: 60 });
    for (const speed of [3, 5]) {
      const hack = currentClient({ lapSeconds: HONEST_LAP, minutes: 60, speed });
      expect(hack.claimedPerSecond).toBeCloseTo(honest.claimedPerSecond * speed, 1);
      // The bank is the whole head start: ten minutes of free overclaim in the hour.
      expect(hack.paid / honest.paid).toBeLessThan((3_600 + SIM_CLOCK_BANK_SECONDS) / 3_600 * 1.02);
      // After the five-minute bank is spent it earns the honest rate.
      expect(hack.sustainedPerSecond / honest.sustainedPerSecond).toBeLessThan(1.02);
      // One warning and one audit line for the whole episode, and no punishment.
      expect(hack.scaledWarnings).toBe(1);
      expect(hack.moderation).toMatchObject([{ action: "rewards_scaled", actorType: "automatic", rule: "simulation_clock_ahead", channel: "account" }]);
      expect(hack.restricted).toBe(false);
      expect(hack.stillInWorld).toBe(true);
      expect(hack.throttled).toBe(0);
    }
  }, SIMULATION_TIMEOUT_MS);

  it("holds a map-hopping script to one map's wall, far below what the refilled buckets hold", () => {
    // Every spawn bucket refills while its owner is away, so a script alternating
    // two maps every five minutes used to arrive to a full bank each time: the
    // whole bank plus five minutes of respawns per visit. They all draw on one
    // combat clock now, which refills at real time.
    const budget = defeatBudget(MAP_POPULATION);
    const refilledBuckets = (budget.capacity + budget.perSecond * 300) / 300;
    const run = currentClient({ lapSeconds: .5, minutes: 60, says: "real", maps: [MAP, "water_reach"], rotateSeconds: 300 });
    expect(mapEnemyPopulation("water_reach")).toBe(MAP_POPULATION);
    expect(refilledBuckets).toBeGreaterThan(CEILING * 2);
    expect(run.sustainedPerSecond).toBeLessThanOrEqual(CEILING * 1.02);
    expect(run.paidPerSecond).toBeLessThan(refilledBuckets * .7);
    expect(run.restricted).toBe(false);
    expect(run.stillInWorld).toBe(true);
  }, SIMULATION_TIMEOUT_MS);

  it("pays an honest four-minute disconnect backlog in full when it is flushed at once", () => {
    const run = currentClient({ lapSeconds: HONEST_LAP, minutes: 10, offline: { from: 120, seconds: 240 } });
    expect(run.paid).toBe(run.claimed);
    expect(run.throttled).toBe(0);
    expect(run.scaledWarnings).toBe(0);
  });

  it("does not clip the report after a long idle, or the ones after it", () => {
    // Twenty minutes with the tab open and nothing fought: the next report
    // carries all of that game time, and the server saw all of it pass.
    const run = currentClient({ lapSeconds: HONEST_LAP, minutes: 30, idle: { from: 300, seconds: 1_200 } });
    expect(run.paid).toBe(run.claimed);
    expect(run.scaledWarnings).toBe(0);
  });

  it("never scales a report that cannot say how long it simulated, but pays it only from the bank", () => {
    const run = currentClient({ lapSeconds: HONEST_LAP, minutes: 60, speed: 5, says: "zero" });
    expect(run.scaledWarnings).toBe(0);
    expect(run.moderation).toEqual([]);
    // The combat clock refills with game time the server accepted, and a
    // report that claims none adds none: once the fifteen-minute bank is
    // spent, a client that says nothing (or was taken apart to) earns nothing.
    expect(run.sustainedPerSecond).toBeLessThan(.05);
    expect(run.paidPerSecond).toBeLessThan(currentClient({ lapSeconds: HONEST_LAP, minutes: 60 }).paidPerSecond);
  }, SIMULATION_TIMEOUT_MS);
});
