import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy, reportKills } from "../../tests/helpers/enemy-defeat";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { addGold, goldFor, mergeGold, takeGold } from "./gold";
import { GOLD_MAP_GROWTH, mapGoldFactor } from "../../shared/gold";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const gold = (f: any, who = f.ctx.sender) => goldFor(f.ctx, who);
/** Every roll from now on returns `value`; integerInRange stays as the fixture had it. */
const rollAlways = (f: any, value: number) => { f.ctx.random = Object.assign(() => value, { integerInRange: f.ctx.random.integerInRange }); };
/** Kills the server accepts: strong enough, and the camp's budget full. */
function fighter() {
  const f = crystalFixture();
  f.patch("playerProgress", { damage: 1e15 });
  fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
  return f;
}
const kill = (f: any, count: number) => reportEnemy(f, "Shard Hopper", count);
const clearBoss = (f: any, sequence: bigint) =>
  reportKills(f, { streamId: "gold-boss-stream-0001", sequence, mapId: "crystal_hollows", enemies: [{ enemy: "boss", count: 1 }] });

describe("gold", () => {
  it("drops from a tenth of regular kills, 1 to 3 each, times the map's coins", () => {
    const f = fighter(), coins = mapGoldFactor("crystal_hollows");
    expect(coins).toBeCloseTo(GOLD_MAP_GROWTH ** 9, 9); // Crystal Hollows is map 10
    rollAlways(f, 0.5);
    kill(f, 5);
    expect(gold(f)).toBe(0n);
    rollAlways(f, 0.09);
    kill(f, 4);
    expect(gold(f)).toBe(BigInt(Math.round(12 * coins)));
    rollAlways(f, 0.01);
    kill(f, 2);
    expect(gold(f)).toBe(BigInt(Math.round(12 * coins) + Math.round(2 * coins)));
  });

  it("pays 2 to 4 for a boss's first clear in a run, and nothing for a repeat claim", () => {
    const f = crystalFixture();
    rollAlways(f, 0.99);
    clearBoss(f, 1n);
    expect(gold(f)).toBe(4n);
    clearBoss(f, 2n);
    expect(gold(f)).toBe(4n);
  });

  it("is kept through prestige and cleared by Reset Save", () => {
    const f = fighter();
    f.transaction(() => addGold(f.ctx, f.ctx.sender, 30));
    f.seed("playerPrestige", { identity: f.ctx.sender, level: 1, perkPoints: 0, peakPower: 0, prestigedAt: f.ctx.timestamp });
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 12 });
    f.run(server.prestigeAccount);
    expect(f.db.playerPrestige.identity.find(f.ctx.sender).level).toBe(2);
    expect(gold(f)).toBe(30n);
    f.run(server.resetPlayerProgress, {});
    expect(f.db.playerGold.identity.find(f.ctx.sender)).toBeFalsy();
  });

  it("moves a guest's gold to the account on link, replacing the account's", () => {
    const f = crystalFixture(), account = identity("5");
    f.transaction(() => { addGold(f.ctx, f.ctx.sender, 7); addGold(f.ctx, account, 99); });
    f.transaction(() => mergeGold(f.ctx, f.ctx.sender, account));
    expect(gold(f, account)).toBe(7n);
    expect(f.db.playerGold.identity.find(f.ctx.sender)).toBeFalsy();
    f.transaction(() => mergeGold(f.ctx, f.ctx.sender, account));
    expect(f.db.playerGold.identity.find(account)).toBeFalsy();
  });

  it("takes gold only when the player has enough, all or nothing", () => {
    const f = crystalFixture();
    f.transaction(() => addGold(f.ctx, f.ctx.sender, 10));
    expect(f.transaction(() => takeGold(f.ctx, f.ctx.sender, 11))).toBe(false);
    expect(gold(f)).toBe(10n);
    expect(f.transaction(() => takeGold(f.ctx, f.ctx.sender, 4))).toBe(true);
    expect(gold(f)).toBe(6n);
    expect(f.transaction(() => takeGold(f.ctx, f.ctx.sender, 6n))).toBe(true);
    expect(gold(f)).toBe(0n);
    expect(f.transaction(() => takeGold(f.ctx, identity("6"), 1))).toBe(false);
    expect(f.transaction(() => takeGold(f.ctx, identity("6"), 0))).toBe(true);
  });
});
