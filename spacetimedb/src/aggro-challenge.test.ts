import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { ensurePrestigeExpansion } from "./prestige-expansion";
import { prestigePerkRanks, statRewardMultiplier, storedPrestigePerkRanks, writePrestigePerkRanks } from "./prestige";
import { prestigeRangeBonus } from "./player-speed";
import { BOSS_REWARD_CLAIM_BITS, DEFAULT_ATTACK_INTERVAL, MIN_ATTACK_INTERVAL } from "../../shared/rules";
import { PRESTIGE_PERK_IDS } from "../../shared/prestige-perks";
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
  // A first prestige's requirement, whatever the player's level: the campaign's last boss. No Endless stage.
  const reachNextPrestige = () => {
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  };
  return { ...f, saved, ranks, reachNextPrestige };
}
const zero = Object.fromEntries(PRESTIGE_PERK_IDS.map(perk => [perk, 0]));

it("starts fresh with every prestige bonus off, and keeps the owned perks untouched", () => {
  const f = fixture();
  const multiplier = statRewardMultiplier(f.ctx, f.ctx.sender);
  f.run(server.startAggroRun);
  expect(f.db.playerAggroChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: true, completed: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ bossRewardClaims: 0, attackRate: DEFAULT_ATTACK_INTERVAL });
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("tutorial_forest");
  expect(statRewardMultiplier(f.ctx, f.ctx.sender)).toBeLessThan(multiplier);
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(zero);
  expect(prestigeRangeBonus(f.ctx, f.ctx.sender)).toBe(0);
  expect(storedPrestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(f.ranks);
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "keenEdge" })).toThrow("challenge");
  expect(() => f.run(server.startAggroRun)).toThrow("already");
  expect(() => f.run(server.startPrestigeChallenge)).toThrow();
});

it("restarts the run on death", () => {
  const f = fixture();
  f.run(server.startAggroRun);
  f.patch("playerProgress", { damage: 999, bossRewardClaims: BOSS_REWARD_CLAIM_BITS.dragon });
  f.run(server.recordPlayerDeath);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ bossRewardClaims: 0 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBeLessThan(999);
  expect(f.db.playerAggroChallenge.identity.find(f.ctx.sender).active).toBe(true);
  // Outside a run a death changes nothing.
  const g = fixture();
  g.run(server.recordPlayerDeath);
  expect(g.db.playerProgress.identity.find(g.ctx.sender).damage).toBe(12345);
});

it("is won at a first prestige's requirement (the campaign's last boss), handing back the main run and its bonuses", () => {
  const f = fixture();
  f.run(server.startAggroRun);
  expect(() => f.run(server.prestigeAccount)).toThrow("Aggro");
  f.reachNextPrestige();
  f.run(server.prestigeAccount);
  expect(f.db.playerAggroChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 1 });
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ damage: 12345, attackRate: MIN_ATTACK_INTERVAL });
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(12);
  expect(f.db.playerPrestige.identity.find(f.ctx.sender)).toMatchObject({ level: 1, perkPoints: 8 });
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(f.ranks);
  expect(f.db.prestigeChallengeBackup.identity.find(f.ctx.sender)).toBeNull();
});

it("dropping out hands back the main run with no win, and four wins end the challenge", () => {
  const f = fixture();
  f.run(server.startAggroRun);
  f.run(server.abandonAggroRun);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(f.saved);
  expect(f.db.playerAggroChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 0 });
  for (let win = 1; win <= 4; win++) {
    f.run(server.startAggroRun); f.reachNextPrestige(); f.run(server.prestigeAccount);
    expect(f.db.playerAggroChallenge.identity.find(f.ctx.sender).completed).toBe(win);
  }
  expect(() => f.run(server.startAggroRun)).toThrow("complete");
});

it("switching between the challenges never loses the main run or the parked Reflect run", () => {
  const f = fixture();
  const mainRun = () => expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(f.saved);
  const clean = () => expect(f.db.prestigeChallengeBackup.identity.find(f.ctx.sender)).toBeNull();
  f.run(server.startAggroRun); f.run(server.abandonAggroRun); mainRun(); clean();
  f.run(server.startPrestigeChallenge);
  expect(() => f.run(server.startAggroRun)).toThrow("Reflect Only");
  f.patch("playerProgress", { damage: 777 });
  f.run(server.abandonPrestigeChallenge); mainRun(); clean();
  expect(f.db.prestigeChallengeRun.identity.find(f.ctx.sender)).toBeTruthy();
  f.run(server.startAggroRun);
  expect(() => f.run(server.startPrestigeChallenge)).toThrow();
  f.run(server.recordPlayerDeath);
  f.run(server.abandonAggroRun); mainRun(); clean();
  // The parked Reflect run outlived the Aggro run in between.
  f.run(server.startPrestigeChallenge);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(777);
  f.run(server.abandonPrestigeChallenge); mainRun(); clean();
  f.run(server.startAggroRun); f.reachNextPrestige(); f.run(server.prestigeAccount);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(12345);
  expect(f.db.playerAggroChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 1 });
  expect(f.db.playerPrestigeChallenge.identity.find(f.ctx.sender)).toMatchObject({ active: false, completed: 0 });
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(f.ranks);
  clean();
});

it("refuses to drop out when the saved run can't be read, changing nothing", () => {
  const f = fixture();
  f.run(server.startAggroRun);
  const backup = f.db.prestigeChallengeBackup.identity.find(f.ctx.sender);
  for (const broken of ["not json", JSON.stringify({ maxHp: 0, damage: 1, armor: 0, regen: 0, attackRate: 1 }), JSON.stringify({ damage: 5 })]) {
    f.db.prestigeChallengeBackup.identity.update({ ...backup, progressJson: broken });
    expect(() => f.run(server.abandonAggroRun)).toThrow("still in the Aggro run");
    expect(f.db.playerAggroChallenge.identity.find(f.ctx.sender).active).toBe(true);
    expect(f.db.prestigeChallengeBackup.identity.find(f.ctx.sender).progressJson).toBe(broken);
  }
  f.db.prestigeChallengeBackup.identity.update(backup);
  f.run(server.abandonAggroRun);
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(f.saved);
});
