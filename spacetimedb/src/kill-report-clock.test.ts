import { Timestamp } from "spacetimedb";
import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
import { SIM_CLOCK_BANK_SECONDS } from "../../shared/enemy-defeats";
import { KILL_REPORT_BURST, KILL_REPORT_REFILL_SECONDS, REGULAR_KILL_REPORT_SECONDS } from "../../shared/rules";
import { reportRateKey, scaledDefeatCounts, simulationClock, simulationClockKey, SIM_CLOCK_EPISODE_RECOVERY_SECONDS } from "./enemy-defeats";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const MAP = "crystal_hollows", ENEMY = "Shard Hopper";
const at = (seconds: number) => BigInt(Math.round(seconds * 1e6));
const row = (tokens: number, seconds: number) => ({ tokens, updatedAtMicros: at(seconds) });

describe("simulation clock arithmetic", () => {
  it("starts full, and an honest report leaves the bank where real time put it", () => {
    // A first report: the game time it covers came before the server knew the
    // account, so it is paid in full and the bank starts full.
    expect(simulationClock(null, at(100), 30_000)).toMatchObject({ scale: 1, credit: SIM_CLOCK_BANK_SECONDS, tokens: SIM_CLOCK_BANK_SECONDS });
    // Thirty seconds simulated in thirty seconds of real time costs nothing.
    expect(simulationClock(row(270, 100), at(130), 30_000)).toMatchObject({ scale: 1, credit: 300, tokens: 270 });
    // Network jitter either way is carried by the bank, never scaled.
    expect(simulationClock(row(270, 100), at(128), 32_000)).toMatchObject({ scale: 1, tokens: 266 });
    expect(simulationClock(row(266, 128), at(162), 28_000)).toMatchObject({ scale: 1, tokens: 272 });
  });

  it("pays a first report in full however long the page ran before its first kill", () => {
    // Nine minutes in menus, at Home or dying to a camp before the first kill
    // lands: the page counted all of it, and nothing on the server can say
    // when that time began. It used to be measured against the bank alone and
    // clipped by half.
    expect(simulationClock(null, at(1_000), 540_000)).toMatchObject({ scale: 1, tokens: SIM_CLOCK_BANK_SECONDS, episodeStarted: false });
    // The row dropped by the six-hour idle sweep is the same case.
    expect(simulationClock(undefined, at(50_000), 3_600_000)).toMatchObject({ scale: 1, tokens: SIM_CLOCK_BANK_SECONDS });
  });

  it("caps the bank after the report's own time is added and taken off", () => {
    // Ten minutes idle with the tab open, then one report carrying all of it:
    // it is paid in full and leaves the bank full, not empty.
    expect(simulationClock(row(270, 0), at(630), 630_000)).toMatchObject({ scale: 1, tokens: 270 });
    expect(simulationClock(row(SIM_CLOCK_BANK_SECONDS, 0), at(600), 600_000)).toMatchObject({ scale: 1, tokens: SIM_CLOCK_BANK_SECONDS });
    // Time that passed with nothing simulated tops the bank up to the cap only.
    expect(simulationClock(row(10, 0), at(86_400), 30_000).tokens).toBe(SIM_CLOCK_BANK_SECONDS);
  });

  it("scales a client that simulates faster than real time to the real-time share", () => {
    // The bank covers the first five minutes of a 3x client...
    let clock = simulationClock(null, at(30), 90_000);
    expect(clock.scale).toBe(1);
    let previous = row(clock.tokens, 30);
    for (let t = 60; clock.scale === 1; t += 30) { clock = simulationClock(previous, at(t), 90_000); previous = row(clock.tokens, t); }
    // ...and once it is empty, a third of each report is what real time allowed.
    expect(clock).toMatchObject({ episodeStarted: true, bank: 0 });
    expect(clock.tokens).toBeLessThan(0);
    const next = simulationClock(previous, at(Number(previous.updatedAtMicros) / 1e6 + 30), 90_000);
    expect(next.scale).toBeCloseTo(1 / 3, 9);
    expect(next).toMatchObject({ before: 0, bank: 0, episodeStarted: false });
    // A flush's second batch claims almost nothing and is not scaled; the
    // episode carries on through it instead of starting again next report.
    const tail = simulationClock(row(next.tokens, 100), at(100.2), 50);
    expect(tail).toMatchObject({ scale: 1, episodeStarted: false });
    expect(simulationClock(row(tail.tokens, 100.2), at(130), 90_000)).toMatchObject({ episodeStarted: false });
  });

  it("starts an episode on the first scaled report even when an unscaled one emptied the bank exactly", () => {
    const emptied = simulationClock(row(60, 0), at(30), 90_000);
    expect(emptied).toMatchObject({ scale: 1, tokens: 0, episodeStarted: false });
    const scaled = simulationClock(row(emptied.tokens, 30), at(60), 90_000);
    expect(scaled).toMatchObject({ episodeStarted: true, bank: 0 });
    // Stopping the hack: the bank refills from zero, and the episode ends once
    // it holds a minute of slack again, so a later relapse is logged afresh.
    const recovering = simulationClock(row(scaled.tokens, 60), at(90), 20_000);
    expect(recovering).toMatchObject({ scale: 1, before: 0, bank: 10, episodeStarted: false });
    expect(recovering.tokens).toBeLessThan(0);
    const recovered = simulationClock(row(recovering.tokens, 90), at(150), 0);
    expect(recovered).toMatchObject({ bank: SIM_CLOCK_EPISODE_RECOVERY_SECONDS + 10, tokens: SIM_CLOCK_EPISODE_RECOVERY_SECONDS + 10 });
    expect(simulationClock(row(recovered.tokens, 150), at(151), 100_000)).toMatchObject({ episodeStarted: true });
  });

  it("never scales a report that cannot say, and never reads a clock that ran backwards", () => {
    expect(simulationClock(row(0, 100), at(100), 0)).toMatchObject({ scale: 1, tokens: 0 });
    expect(simulationClock(row(50, 200), at(100), 10_000)).toMatchObject({ scale: 1, credit: 50, tokens: 40 });
  });

  it("scales counts down to whole kills, and leaves an unscaled count exactly alone", () => {
    expect(scaledDefeatCounts([17, 1], 1)).toEqual([17, 1]);
    expect(scaledDefeatCounts([30], 1 / 3)).toEqual([10]);
    expect(scaledDefeatCounts([17, 3], .2)).toEqual([3, 1]);
    // A boss clear, a count of one, survives a scale just under one.
    expect(scaledDefeatCounts([12, 1], .97)).toEqual([12, 1]);
    // An Endless report, one entry per site: half of it is paid, not none.
    expect(scaledDefeatCounts(Array(10).fill(1), .5).reduce((a, b) => a + b, 0)).toBe(5);
    expect(scaledDefeatCounts([3, 3, 3], 0)).toEqual([0, 0, 0]);
    // A boss clear wins a tie: an Endless report of nine sites and the boss, scaled.
    expect(scaledDefeatCounts([...Array(9).fill(1), 1], .9, [...Array(9).fill(false), true]).at(-1)).toBe(1);
    expect(scaledDefeatCounts([1, 1], .6, [false, true])).toEqual([0, 1]);
  });
});

function fixture() {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
  fillDefeatBudget(f, MAP, ENEMY);
  let sequence = 0n;
  const kills = () => Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
  const report = (count: number, simulatedMillis: number, options: { sequence?: bigint; mapId?: string } = {}) => {
    const next = options.sequence ?? ++sequence;
    return f.run(server.reportEnemyDefeats, { streamId: "clock-test-stream-01", sequence: next, mapId: options.mapId ?? MAP, simulatedMillis, enemies: [{ enemy: ENEMY, count }] });
  };
  const advance = (seconds: number) => { f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + at(seconds)); };
  return { ...f, kills, report, advance, clock: () => f.db.enemyDefeatBudget.key.find(simulationClockKey(f.ctx.sender)) };
}

describe("simulation clock on report_enemy_defeats", () => {
  it("pays an honest cadence in full and keeps the clock in step", () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) { f.advance(REGULAR_KILL_REPORT_SECONDS); f.report(5, REGULAR_KILL_REPORT_SECONDS * 1000); }
    expect(f.kills()).toBe(50);
    expect(f.clock()!.tokens).toBe(SIM_CLOCK_BANK_SECONDS);
  });

  it("does not charge the clock again for a report it has already consumed", () => {
    const f = fixture();
    f.report(5, 30_000);
    const after = f.clock();
    f.advance(1);
    // A retry of the same sequence after a lost acknowledgement, even one that
    // now claims more game time, changes nothing.
    f.report(5, 290_000, { sequence: 1n });
    expect(f.clock()).toEqual(after);
    expect(f.kills()).toBe(5);
  });

  it("consumes a report it pays nothing, so it never blocks the stream", () => {
    const f = fixture();
    f.seed("enemyDefeatBudget", { key: simulationClockKey(f.ctx.sender), identity: f.ctx.sender, tokens: 0, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    f.advance(1);
    f.report(3, 60_000);
    warn.mockRestore();
    expect(f.kills()).toBe(0);
    expect([...f.db.regularEnemyLootCursor.iter()]).toMatchObject([{ sequence: 1n }]);
    f.advance(30); f.report(3, 30_000);
    expect(f.kills()).toBe(3);
  });

  it("warns and writes one audit line per episode, and restricts nothing", () => {
    const f = fixture();
    f.seed("enemyDefeatBudget", { key: simulationClockKey(f.ctx.sender), identity: f.ctx.sender, tokens: 10, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    f.advance(30); f.report(10, 80_000);
    f.advance(30); f.report(10, 90_000);
    f.advance(30); f.report(10, 90_000);
    const warnings = warn.mock.calls.filter(call => /simulation ahead/.test(String(call[0])));
    warn.mockRestore();
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(String(warnings[0][1]))).toMatchObject({ identity: f.ctx.sender.toHexString(), displayName: "Test Player", mapId: MAP, claimed: 80, credit: 40, ratio: 2 });
    expect([...f.db.moderationAction.iter()]).toMatchObject([{ action: "rewards_scaled", actorType: "automatic", rule: "simulation_clock_ahead", targetName: "Test Player" }]);
    // Half, then a third, then a third: ten kills a report become 5, 3, 3.
    expect(f.kills()).toBe(11);
    expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
    expect(f.db.player.identity.find(f.ctx.sender)).not.toBeNull();
  });

  it("answers the retired reducers, which cannot say how long a tab played, with a refresh", () => {
    const f = fixture();
    for (const reducer of [server.recordEnemyDefeats, server.recordAutoFarmEnemyDefeats])
      expect(() => f.run(reducer, { streamId: "clock-test-legacy-01", sequence: 1n, mapId: MAP, enemies: [{ enemy: ENEMY, count: 5 }] }))
        .toThrow("WildStat updated. Refresh to continue.");
    expect(f.kills()).toBe(0);
    expect(f.clock()).toBeNull();
  });
});

describe("kill report throttle", () => {
  it("lets a burst through, then one report per refill, on both new kill reducers", () => {
    const f = fixture();
    for (let i = 0; i < KILL_REPORT_BURST; i++) f.report(1, 0);
    expect(() => f.report(1, 0)).toThrow("Enemy rewards are catching up.");
    // The refused report was never processed: the next attempt reuses its sequence.
    expect([...f.db.regularEnemyLootCursor.iter()]).toMatchObject([{ sequence: BigInt(KILL_REPORT_BURST) }]);
    f.advance(KILL_REPORT_REFILL_SECONDS - .01);
    expect(() => f.report(1, 0, { sequence: BigInt(KILL_REPORT_BURST + 1) })).toThrow("Enemy rewards are catching up.");
    f.advance(.01);
    f.report(1, 0, { sequence: BigInt(KILL_REPORT_BURST + 1) });
    expect(f.kills()).toBe(KILL_REPORT_BURST + 1);
    expect(() => f.run(server.reportAutoFarmEnemyDefeats, { streamId: "clock-test-other-01", sequence: 1n, mapId: MAP, simulatedMillis: 0, enemies: [{ enemy: ENEMY, count: 1 }] }))
      .toThrow("Enemy rewards are catching up.");
  });

  it("is the first check, ahead of the session guard", () => {
    const f = fixture();
    f.seed("enemyDefeatBudget", { key: reportRateKey(f.ctx.sender), identity: f.ctx.sender, tokens: 0, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
    f.db.playerController.identity.delete(f.ctx.sender);
    expect(() => f.report(1, 0)).toThrow("Enemy rewards are catching up.");
  });

  it("spends nothing on a report that fails later", () => {
    const f = fixture();
    for (let i = 0; i < KILL_REPORT_BURST * 2; i++) expect(() => f.report(1, 0, { mapId: "water_reach" })).toThrow("another map");
    expect(f.db.enemyDefeatBudget.key.find(reportRateKey(f.ctx.sender))).toBeNull();
    f.report(1, 0, { sequence: 1n });
    expect(f.kills()).toBe(1);
  });

  it("never meets an honest client: reports every 30 seconds with portal and boss drains, and a reconnect backlog at once", () => {
    const f = fixture();
    let sent = 0;
    for (let minute = 0; minute < 30; minute++) {
      // Two timer reports a minute, and a drain (portal, boss, hidden tab) in every one.
      for (let i = 0; i < 3; i++) { f.advance(20); f.report(1, 20_000); sent++; }
    }
    // Five minutes offline: a handful of sealed batches, sent back to back.
    f.advance(300);
    for (let i = 0; i < 6; i++) { f.report(1, i ? 0 : 300_000); sent++; }
    expect(f.kills()).toBe(sent);
  });
});
