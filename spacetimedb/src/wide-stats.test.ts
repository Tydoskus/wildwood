import { expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { updateSnapshotRow, deleteSnapshotRow } from "./snapshot-row-writes";
import { readPlayerProgress, iterPlayerProgress } from "./wide-stats";
import { F32_STAT_LIMIT } from "../../shared/wide-stats";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("keeps stats past f32 in player_wide_stats and reads them back whole", () => {
  const f = crystalFixture();
  const progress = readPlayerProgress(f.ctx, f.ctx.sender);
  const written = updateSnapshotRow(f.ctx as any, "playerProgress", { ...progress, damage: 1e40, maxHp: 5e45, armor: 12, regen: 3 });
  // The caller keeps the full row; player_progress holds the clamp.
  expect(written).toMatchObject({ damage: 1e40, maxHp: 5e45 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ damage: F32_STAT_LIMIT, maxHp: F32_STAT_LIMIT, armor: 12 });
  expect(f.db.playerWideStats.identity.find(f.ctx.sender)).toMatchObject({ damage: 1e40, maxHp: 5e45 });
  expect(readPlayerProgress(f.ctx, f.ctx.sender)).toMatchObject({ damage: 1e40, maxHp: 5e45, armor: 12, regen: 3 });
  expect([...iterPlayerProgress(f.ctx)].find(row => row.identity.equals(f.ctx.sender))).toMatchObject({ damage: 1e40 });
});

it("grows past the old ceiling through ordinary rewards", () => {
  const f = crystalFixture();
  const progress = { ...readPlayerProgress(f.ctx, f.ctx.sender), damage: 2.9e38 };
  const next = applyEnemyRewards(progress, [{ type: "damage", amount: 1e38, count: 3 }], 1);
  expect(next.damage).toBeCloseTo(5.9e38, -36);
  updateSnapshotRow(f.ctx as any, "playerProgress", next);
  expect(readPlayerProgress(f.ctx, f.ctx.sender).damage).toBeCloseTo(5.9e38, -36);
});

it("lets a direct write to player_progress win, and drops the wide row when stats fall back", () => {
  const f = crystalFixture();
  const progress = readPlayerProgress(f.ctx, f.ctx.sender);
  updateSnapshotRow(f.ctx as any, "playerProgress", { ...progress, damage: 1e40 });
  // Something writing player_progress directly: its value stands, the stale wide one is ignored.
  f.patch("playerProgress", { damage: 7 });
  expect(readPlayerProgress(f.ctx, f.ctx.sender).damage).toBe(7);
  // A prestige back to small numbers drops the row.
  updateSnapshotRow(f.ctx as any, "playerProgress", { ...progress, damage: 10 });
  expect(f.db.playerWideStats.identity.find(f.ctx.sender)).toBeNull();
  updateSnapshotRow(f.ctx as any, "playerProgress", { ...progress, damage: 1e40 });
  deleteSnapshotRow(f.ctx as any, "playerProgress", f.ctx.sender);
  expect(f.db.playerWideStats.identity.find(f.ctx.sender)).toBeNull();
});

it("clamps other f32 stat columns instead of storing Infinity", () => {
  const f = crystalFixture();
  const player = f.db.player.identity.find(f.ctx.sender);
  updateSnapshotRow(f.ctx as any, "player", { ...player, hp: 1e40, maxHp: Infinity });
  expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ hp: F32_STAT_LIMIT, maxHp: F32_STAT_LIMIT });
});

it("keeps a duel's stats past f32 beside it, from the insert on, and reads them back", async () => {
  const { insertSnapshotRow } = await import("./snapshot-row-writes");
  const { withDuelWide, writeReplayWide } = await import("./wide-stats");
  const f = crystalFixture();
  const duel = insertSnapshotRow(f.ctx as any, "duel", { id: 0n, challenger: f.ctx.sender, opponent: f.ctx.sender, status: "active",
    createdAt: f.ctx.timestamp, startedAt: f.ctx.timestamp, endsAtMicros: 0n, lastResolvedAt: f.ctx.timestamp,
    challengerOriginX: 0, challengerOriginY: 0, opponentOriginX: 0, opponentOriginY: 0,
    challengerHp: 4e45, challengerMaxHp: 4e45, challengerDamage: 9e41, challengerArmor: 1, challengerAttackRate: 1,
    opponentHp: 100, opponentMaxHp: 100, opponentDamage: 5, opponentArmor: 1, opponentAttackRate: 1 } as any) as any;
  expect(duel.challengerHp).toBe(4e45);
  const stored = f.db.duel.id.find(duel.id);
  expect(stored.challengerHp).toBe(F32_STAT_LIMIT);
  expect(f.db.duelWideStats.duelId.find(duel.id).challenger.equals(f.ctx.sender)).toBe(true);
  expect(withDuelWide(f.ctx, stored)).toMatchObject({ challengerHp: 4e45, challengerDamage: 9e41, opponentHp: 100 });
  // A write from a row read without merging keeps the full values behind the clamp.
  updateSnapshotRow(f.ctx as any, "duel", { ...stored, challengerName: "Renamed" });
  expect(withDuelWide(f.ctx, f.db.duel.id.find(duel.id)).challengerHp).toBe(4e45);
  // The replay keeps them too.
  const replay = writeReplayWide(f.ctx, { id: duel.id, challengerMaxHp: 4e45, challengerFinalHp: 3e45, opponentMaxHp: 100 });
  expect(replay.challengerMaxHp).toBe(F32_STAT_LIMIT);
  expect(JSON.parse(f.db.duelReplayWideStats.replayId.find(duel.id).statsJson).challengerFinalHp).toBe(3e45);
  deleteSnapshotRow(f.ctx as any, "duel", duel.id);
  expect(f.db.duelWideStats.duelId.find(duel.id)).toBeNull();
});

it("moves the f32 ranking into leaderboard_entry_v2, which holds stats past f32", async () => {
  const { moveToWideTables } = await import("./module-migrations");
  const f = crystalFixture();
  const row = { identity: f.ctx.sender, displayName: "Big", damage: 3e38, maxHp: 5, isGuest: false, power: 1, armor: 0, regen: 0, playedMicros: 0n,
    profileIcon: 0, powerLevel: 1, gender: 0, skinTone: 3, headItem: "", chestItem: "", feetItem: "", rightHandItem: "", leftHandItem: "" };
  f.seed("leaderboardEntryLegacy", row);
  f.seed("duelWireAccess", { key: "x:0", identity: f.ctx.sender, combatVersion: 0 });
  moveToWideTables(f.ctx);
  expect(f.db.leaderboardEntry.identity.find(f.ctx.sender)).toMatchObject({ displayName: "Big", damage: 3e38 });
  expect([...f.db.leaderboardEntryLegacy.iter()]).toHaveLength(0);
  expect([...f.db.duelWireAccess.iter()]).toHaveLength(0);
  f.db.leaderboardEntry.identity.update({ ...f.db.leaderboardEntry.identity.find(f.ctx.sender), damage: 7e60 });
  expect(f.db.leaderboardEntry.identity.find(f.ctx.sender).damage).toBe(7e60);
});
