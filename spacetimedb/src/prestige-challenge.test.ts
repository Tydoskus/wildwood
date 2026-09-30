import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { ensurePrestigeExpansion } from "./prestige-expansion";
import { prestigePerkRanks, statRewardMultiplier, writePrestigePerkRanks } from "./prestige";
import { BOSS_REWARD_CLAIM_BITS, DEFAULT_ATTACK_INTERVAL, MAX_BASE_ATTACKS_PER_SECOND, MIN_ATTACK_INTERVAL } from "../../shared/rules";
import { challengeMinimumInterval } from "../../shared/prestige-challenge";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture() {
  const f = crystalFixture();
  ensurePrestigeExpansion(f.ctx as any);
  f.ctx.timestamp = f.db.prestigeExpansion.id.find(0).unlocksAt;
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 1, perkPoints: 8, peakPower: 0, prestigedAt: f.ctx.timestamp });
  writePrestigePerkRanks(f.ctx, f.ctx.sender, { keenEdge: 2, doubleStrike: 1, splitShot: 0, riposte: 1, bossSlayer: 3, secondWind: 2, longShot: 4, fleetFoot: 3 });
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime, damage: 12345, attackRate: MIN_ATTACK_INTERVAL });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 12 });
  const saved = { ...f.db.playerProgress.identity.find(f.ctx.sender) };
  const ranks = prestigePerkRanks(f.ctx, f.ctx.sender);
  const finish = () => {
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
    f.run(server.prestigeAccount);
  };
  return { ...f, saved, ranks, finish };
}

it("parks the current run and disables prestige bonuses without erasing their allocations", () => {
  const f = fixture(); f.run(server.startPrestigeChallenge);
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: true, completed: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ attackRate: DEFAULT_ATTACK_INTERVAL, bossRewardClaims: 0 });
  expect(Object.values(prestigePerkRanks(f.ctx, f.ctx.sender)).every(rank => rank === 0)).toBe(true);
  expect(statRewardMultiplier(f.ctx, f.ctx.sender)).toBe(1);
  expect(f.db.playerPrestigePerk.identity.find(f.ctx.sender).keenEdge).toBe(2);
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "keenEdge" })).toThrow("disabled");
  expect(() => f.run(server.respecPrestigePerks)).toThrow("challenge");
  expect(() => f.run(server.startPrestigeChallenge)).toThrow("already active");
  expect(() => f.run(server.prestigeAccount)).toThrow();
});

it("restores the parked stats, stage and bonuses while raising base and cap exactly once", () => {
  const f = fixture(); f.run(server.startPrestigeChallenge); f.finish();
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ ...f.saved, attackRate: 1 / (MAX_BASE_ATTACKS_PER_SECOND + .5) });
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(12);
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(f.ranks);
  expect(f.db.playerPrestige.identity.find(f.ctx.sender)).toMatchObject({ level: 1, perkPoints: 8 });
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 1 });
  expect(f.db.prestigeChallengeBackup.identity.find(f.ctx.sender)).toBeNull();
  expect(() => f.run(server.abandonPrestigeChallenge)).toThrow("No saved");
});

it("allows four completions and disables earlier speed rewards on each challenge run", () => {
  const f = fixture();
  for (let count = 1; count <= 4; count++) {
    f.run(server.startPrestigeChallenge);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).attackRate).toBeCloseTo(DEFAULT_ATTACK_INTERVAL);
    f.finish();
    const state = f.db.playerPrestigeChallenge.identity.find(f.ctx.sender);
    expect(state.completed).toBe(count);
    expect(1 / f.db.playerProgress.identity.find(f.ctx.sender).attackRate).toBeCloseTo(MAX_BASE_ATTACKS_PER_SECOND + .5 * count);
    expect(1 / challengeMinimumInterval(state)).toBe(MAX_BASE_ATTACKS_PER_SECOND + .5 * count);
    expect(1 / applyEnemyRewards(f.saved, [{ type: "speed", amount: 99, count: 1 }], 1, challengeMinimumInterval(state)).attackRate).toBeCloseTo(MAX_BASE_ATTACKS_PER_SECOND + .5 * count);
  }
  expect(() => f.run(server.startPrestigeChallenge)).toThrow("four");
});

it("abandoning restores the saved run with no reward", () => {
  const f = fixture(); f.run(server.startPrestigeChallenge); f.run(server.abandonPrestigeChallenge);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(f.saved);
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(f.ranks);
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(12);
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 0 });
});

it("keeps the permanent base and cap reward through later ordinary prestiges and respecs", () => {
  const f = fixture(); f.run(server.startPrestigeChallenge); f.finish();
  f.run(server.prestigeAccount);
  expect(f.db.playerPrestige.identity.find(f.ctx.sender)).toMatchObject({ level: 2, perkPoints: 9 });
  const expected = 1 / (1 / DEFAULT_ATTACK_INTERVAL + .5);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).attackRate).toBeCloseTo(expected);
  f.run(server.respecPrestigePerks);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).attackRate).toBeCloseTo(expected);
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender).completed).toBe(1);
  expect(1 / challengeMinimumInterval(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender))).toBe(MAX_BASE_ATTACKS_PER_SECOND + .5);
});
