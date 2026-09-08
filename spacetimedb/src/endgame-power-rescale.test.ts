import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { rescaleEndgameProgress } from "../../shared/endgame-power-rescale";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture() {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 25 });
  f.ctx.connectionId = null;
  return f;
}

describe("endgame account migration", () => {
  it("backs up offline players, keeps ties and unlocks, and only converts once", () => {
    const f = fixture();
    const original = f.progress(identity("2"), {
      damage: 1e8, maxHp: 2e8, armor: 1e6, regen: 2e6,
      duskfallOrchardUnlocked: true, inventoryJson: '["basic_paper_hat"]',
    });
    f.progress(identity("3"), { ...original, identity: identity("3") });
    const low = f.db.playerProgress.identity.find(f.ctx.sender);
    f.run(server.onConnect);
    const next = f.db.playerProgress.identity.find(identity("2"));
    expect(next).toEqual(rescaleEndgameProgress(original));
    expect(f.db.playerProgress.identity.find(identity("3"))).toEqual({ ...next, identity: identity("3") });
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(low);
    expect(f.db.playerEndgameRebaseBackup.identity.find(identity("2"))).toMatchObject({ damage: original.damage, maxHp: original.maxHp });
    expect(f.db.moduleMigrationState.id.find(0).version).toBe(28);
    expect(f.db.playerBalanceVersion.identity.find(identity("2")).version).toBe(8);
    f.patch("playerProgress", { damage: next.damage + 1000 }, identity("2"));
    f.run(server.onConnect);
    expect(f.db.playerProgress.identity.find(identity("2")).damage).toBe(next.damage + 1000);
    expect(f.db.playerEndgameRebaseBackup.identity.find(identity("2")).damage).toBe(original.damage);
  });

  it("rolls back if a stat leaderboard would change even when power order survives", () => {
    const f = fixture();
    f.patch("playerProgress", { damage: 20_000, maxHp: 100 });
    f.progress(identity("2"), { damage: 30_000, maxHp: 1e8 });
    const before = [...f.db.playerProgress.iter()];
    expect(() => f.run(server.onConnect)).toThrow("fresh damage ranking audit");
    expect([...f.db.playerProgress.iter()]).toEqual(before);
    expect(f.db.playerEndgameRebaseBackup.count()).toBe(0n);
    expect(f.db.moduleMigrationState.id.find(0).version).toBe(25);
  });
});
