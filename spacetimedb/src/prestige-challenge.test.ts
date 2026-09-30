import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { ensurePrestigeExpansion } from "./prestige-expansion";
import { prestigePerkRanks, statRewardMultiplier, writePrestigePerkRanks } from "./prestige";
import { BOSS_REWARD_CLAIM_BITS, DEFAULT_ATTACK_INTERVAL, MAX_BASE_ATTACKS_PER_SECOND, MIN_ATTACK_INTERVAL } from "../../shared/rules";
import { challengeGoal, challengeMinimumInterval } from "../../shared/prestige-challenge";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
import { REFLECT_CHALLENGE_ENROLLEE, enrollPlayerByName } from "./module-migrations";
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
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 3 });
    f.run(server.prestigeAccount);
  };
  return { ...f, saved, ranks, finish };
}

it("parks the current run and resets its stats, keeping prestige level and perks on", () => {
  const f = fixture(); const multiplier = statRewardMultiplier(f.ctx, f.ctx.sender); f.run(server.startPrestigeChallenge);
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: true, completed: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ attackRate: DEFAULT_ATTACK_INTERVAL, bossRewardClaims: 0 });
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(f.ranks);
  expect(statRewardMultiplier(f.ctx, f.ctx.sender)).toBe(multiplier);
  expect(multiplier).toBeGreaterThan(1);
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "keenEdge" })).toThrow("challenge");
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

it("enrols a player by name where they stand, parking that run without resetting it", () => {
  const f = fixture();
  f.patch("playerProfile", { displayName: "Phoe" });
  expect(enrollPlayerByName(f.ctx, REFLECT_CHALLENGE_ENROLLEE)).toBe("enrolled");
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: true, completed: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject(f.saved);
  expect(enrollPlayerByName(f.ctx, REFLECT_CHALLENGE_ENROLLEE)).toBe("already in a challenge");
  // Finishing hands back the run as it stood at enrolment, with the reward.
  f.patch("proceduralProgress", { completed: 13 }); f.run(server.prestigeAccount);
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(12);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ ...f.saved, attackRate: 1 / (MAX_BASE_ATTACKS_PER_SECOND + .5) });
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 1 });
});

it("enrols nobody when no player, or more than one, has the name", () => {
  const f = fixture();
  expect(enrollPlayerByName(f.ctx, REFLECT_CHALLENGE_ENROLLEE)).toBeNull();
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toBeNull();
});

it("wins each Reflect Only run on its own goal: map 15's boss, then Endless 1, 2 and 3", () => {
  const f = fixture();
  f.run(server.startPrestigeChallenge);
  // The first goal is the campaign's last boss, nothing else.
  expect(() => f.run(server.prestigeAccount)).toThrow("Defeat Aegis Prime (map 15) to win");
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  f.run(server.prestigeAccount);
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 1 });
  expect(f.db.playerPrestige.identity.find(f.ctx.sender).level).toBe(1);
  for (const stage of [1, 2, 3]) {
    f.run(server.startPrestigeChallenge);
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: stage - 1 });
    expect(() => f.run(server.prestigeAccount)).toThrow(`Clear Endless ${stage} to win`);
    f.patch("proceduralProgress", { completed: stage });
    f.run(server.prestigeAccount);
    expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender).completed).toBe(stage + 1);
  }
});

it("names each Reflect Only goal", () => {
  expect(challengeGoal(0).label).toBe("Defeat Aegis Prime (map 15)");
  expect(challengeGoal(3).label).toBe("Clear Endless 3");
});

it("drops out keeping the challenge run, and drops back in where it stood", () => {
  const f = fixture();
  f.run(server.startPrestigeChallenge);
  // Progress made on the challenge run.
  f.patch("playerProgress", { damage: 777, bossRewardClaims: 7 });
  f.patch("player", { mapId: "intermediate_snowlands", x: 123, y: 456 });
  f.run(server.abandonPrestigeChallenge);
  // Out: the main run is back, the challenge run is parked, and the client can see that.
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject(f.saved);
  expect(f.db.prestigeChallengeRun.identity.find(f.ctx.sender)).toMatchObject({ mapId: "intermediate_snowlands", x: 123, y: 456 });
  expect(f.db.playerPrestigeChallengeParked.identity.find(f.ctx.sender)).toBeTruthy();
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 0 });
  // Back in: the challenge run returns as it was, and the main run is saved again.
  f.run(server.startPrestigeChallenge);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ damage: 777, bossRewardClaims: 7 });
  expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: "intermediate_snowlands" });
  expect(f.db.prestigeChallengeRun.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerPrestigeChallengeParked.identity.find(f.ctx.sender)).toBeNull();
  expect(JSON.parse(f.db.prestigeChallengeBackup.identity.find(f.ctx.sender).progressJson).damage).toBe(f.saved.damage);
  // A win restores the main run and leaves nothing parked.
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  f.run(server.prestigeAccount);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(f.saved.damage);
  expect(f.db.prestigeChallengeRun.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerPrestigeChallengeParked.identity.find(f.ctx.sender)).toBeNull();
});

it("starts fresh from the forest when nothing is parked", () => {
  const f = fixture(); f.run(server.startPrestigeChallenge);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ attackRate: DEFAULT_ATTACK_INTERVAL, bossRewardClaims: 0 });
});
