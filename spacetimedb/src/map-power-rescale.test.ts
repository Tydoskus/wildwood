import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { compressLegacyMapPower } from "../../shared/map-power-rescale";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture() {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 23 });
  f.ctx.connectionId = null;
  return f;
}

describe("one-time live map power migration", () => {
  it("backs up original stats, preserves ties and progression, and never scales twice", () => {
    const f = fixture();
    const original = f.progress(identity("2"), { damage: 1e10, maxHp: 2e10, armor: 1e7, regen: 1e8,
      crystalHollowsUnlocked: true, inventoryJson: '["basic_paper_hat"]' });
    f.progress(identity("3"), { ...original, identity: identity("3") });
    const low = f.db.playerProgress.identity.find(f.ctx.sender);
    f.run(server.onConnect);
    const next = f.db.playerProgress.identity.find(identity("2"));
    expect(next).toEqual(compressLegacyMapPower(original));
    expect(f.db.playerProgress.identity.find(identity("3"))).toEqual({ ...next, identity: identity("3") });
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(low);
    expect(f.db.playerPowerRebaseBackup.identity.find(identity("2"))).toMatchObject({ damage: 1e10, maxHp: 2e10, version: 7 });
    expect(f.db.playerPowerRebaseBackup.count()).toBe(3n);
    expect(f.db.playerBalanceVersion.identity.find(identity("2")).version).toBe(7);
    expect(f.db.moduleMigrationState.id.find(0).version).toBe(24);
    f.patch("playerProgress", { damage: next.damage + 1000 }, identity("2"));
    f.run(server.onConnect);
    expect(f.db.playerProgress.identity.find(identity("2")).damage).toBe(next.damage + 1000);
    expect(f.db.playerPowerRebaseBackup.identity.find(identity("2")).damage).toBe(1e10);
  });

  it("rejects the entire transaction if equipment/research would reverse effective ranking", () => {
    const f = fixture();
    f.patch("playerProgress", { damage: 39000, maxHp: 100 });
    f.seed("playerResearch", { identity: f.ctx.sender, warcraft: 50 });
    f.progress(identity("2"), { damage: 93000, maxHp: 100 });
    const before = [...f.db.playerProgress.iter()];
    expect(() => f.run(server.onConnect)).toThrow("fresh ranking audit");
    expect([...f.db.playerProgress.iter()]).toEqual(before);
    expect(f.db.playerPowerRebaseBackup.count()).toBe(0n);
    expect(f.db.moduleMigrationState.id.find(0).version).toBe(23);
  });
});
