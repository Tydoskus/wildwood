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
