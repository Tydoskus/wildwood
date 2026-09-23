import { Timestamp } from "spacetimedb";
import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { DEFEAT_MIN_RESPAWN_SECONDS, ENEMY_DEFEAT_BATCH_MAX, defeatMinRespawnSeconds, enemyDefeatDefinition } from "../../shared/enemy-defeats";
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
    expect(defeatMinRespawnSeconds(40)).toBe(20);
    const pinned = player({ lapSeconds: 28 / 5, minutes: 10 });
    const unpinned = player({ lapSeconds: 28 / 5, minutes: 10, pinned: false });
    expect(pinned.paidPerSecond).toBeCloseTo(unpinned.paidPerSecond, 2);
    expect(pinned.paidPerSecond).toBeLessThanOrEqual(CEILING * 1.05);
  });

  it("reports what each profile actually earns", () => {
    const profiles = [
      ["honest lap (28s)", { lapSeconds: 28, minutes: 10 }],
      ["ad boost (10s)", { lapSeconds: 10, minutes: 10 }],
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

  it("pays a fast player on the ad boost in full", () => {
    // Clearing as fast as the boosted respawn allows is legitimate play.
    const run = player({ lapSeconds: DEFEAT_MIN_RESPAWN_SECONDS, minutes: 10 });
    expect(run.paid).toBe(run.claimed);
    expect(run.restricted).toBe(false);
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
    // that whole margin is the legitimate headroom an ad-boosted player has.
    expect(cheater.claimedPerSecond / honest.claimedPerSecond).toBeGreaterThan(50);
    expect(cheater.paid / honest.paid).toBeLessThan(3);
  });
});
