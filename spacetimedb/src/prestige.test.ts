import { fillDefeatBudget } from "../../tests/helpers/enemy-defeat";
import { expect, it, vi } from "vitest";
import { ScheduleAt, Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { STARTER_BOW } from "../../shared/items";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { PRESTIGE_STAT_GAIN_PER_LEVEL, prestigeStatMultiplier, prestigeUnlocked } from "../../shared/prestige";
import { PRESTIGE_PERK_MAX_RANK } from "../../shared/prestige-perks";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const CAMPAIGN_COMPLETE = BOSS_REWARD_CLAIM_BITS.aegisPrime;
const prestigeRow = (f: ReturnType<typeof crystalFixture>) => f.db.playerPrestige.identity.find(f.ctx.sender);
const perkRow = (f: ReturnType<typeof crystalFixture>) => f.db.playerPrestigePerk.identity.find(f.ctx.sender);

/** A player standing in the forest who can one-shot Spitters, which pay damage. */
function farmer(prestigeLevel = 0) {
  const f = crystalFixture();
  f.patch("player", { mapId: "tutorial_forest" });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1_000 });
  if (prestigeLevel) f.seed("playerPrestige", { identity: f.ctx.sender, level: prestigeLevel, perkPoints: prestigeLevel, peakPower: 0, prestigedAt: f.ctx.timestamp });
  return f;
}
const farmSpitters = (f: ReturnType<typeof crystalFixture>, count = 10) =>
  f.run(server.recordEnemyDefeats, { streamId: "prestige-stream-01", sequence: 1n, mapId: "tutorial_forest", enemies: [{ enemy: "Spitter", count }] });

it("opens only once the campaign's last boss is down, and one Endless stage further each prestige", () => {
  expect(prestigeUnlocked(0)).toBe(false);
  expect(prestigeUnlocked(CAMPAIGN_COMPLETE - 1)).toBe(false);
  expect(prestigeUnlocked(CAMPAIGN_COMPLETE)).toBe(true);
  expect(prestigeUnlocked(CAMPAIGN_COMPLETE, 0, 2)).toBe(false);   // second prestige wants Endless 1
  expect(prestigeUnlocked(CAMPAIGN_COMPLETE, 1, 2)).toBe(true);
  expect(prestigeUnlocked(CAMPAIGN_COMPLETE, 3, 5)).toBe(false);   // fifth wants Endless 4
  expect(prestigeUnlocked(CAMPAIGN_COMPLETE, 4, 5)).toBe(true);
  expect(prestigeUnlocked(0, 9, 2)).toBe(false);                   // Endless alone never opens it
  expect(prestigeStatMultiplier(0)).toBe(1);
  expect(prestigeStatMultiplier(3)).toBeCloseTo(1 + 3 * PRESTIGE_STAT_GAIN_PER_LEVEL);
});

it("refuses to prestige an unfinished campaign", () => {
  const f = crystalFixture();
  expect(() => f.run(server.prestigeAccount, {})).toThrow("Aegis Prime");
  expect(prestigeRow(f)).toBeFalsy();
});

it("banks a level and a perk point, then sends the player back to the forest with nothing", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { bossRewardClaims: CAMPAIGN_COMPLETE, damage: 5_000, maxHp: 900, desertUnlocked: true, snowlandsUnlocked: true });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 4 });
  f.run(server.prestigeAccount, {});
  const banked = prestigeRow(f);
  expect(banked).toMatchObject({ level: 1, perkPoints: 1 });
  expect(banked!.peakPower).toBeGreaterThan(0);
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(progress.damage).toBeLessThan(5_000);
  expect(progress.bossRewardClaims).toBe(0);
  expect(progress.desertUnlocked).toBe(false);
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender)).toBeFalsy();
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe("tutorial_forest");
  // The button must go dark again: the next prestige is earned from here up.
  expect(prestigeUnlocked(progress.bossRewardClaims)).toBe(false);
});

it("stacks a second prestige and keeps the highest power ever reached", () => {
  const f = crystalFixture();
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 1, perkPoints: 1, peakPower: 9_000_000, prestigedAt: f.ctx.timestamp });
  f.patch("playerProgress", { bossRewardClaims: CAMPAIGN_COMPLETE, damage: 10 });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
  f.run(server.prestigeAccount, {});
  expect(prestigeRow(f)).toMatchObject({ level: 2, perkPoints: 2, peakPower: 9_000_000 });
});

it("asks each prestige for one Endless stage more than the last", () => {
  const f = crystalFixture();
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 2, perkPoints: 2, peakPower: 1, prestigedAt: f.ctx.timestamp });
  f.patch("playerProgress", { bossRewardClaims: CAMPAIGN_COMPLETE });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
  expect(() => f.run(server.prestigeAccount, {})).toThrow("Clear Endless 2 before prestiging.");
  expect(prestigeRow(f)!.level).toBe(2);
  f.patch("proceduralProgress", { completed: 2 });
  f.run(server.prestigeAccount, {});
  expect(prestigeRow(f)!.level).toBe(3);
  // The stage is gone with the rest of the run: the fourth prestige starts from the forest again.
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender)).toBeFalsy();
});

it("keeps research through a prestige but not through a plain reset", () => {
  const prestiged = crystalFixture();
  prestiged.seed("playerResearch", { identity: prestiged.ctx.sender, foraging: 4, warcraft: 3 });
  prestiged.patch("playerProgress", { bossRewardClaims: CAMPAIGN_COMPLETE });
  prestiged.run(server.prestigeAccount, {});
  expect(prestiged.db.playerResearch.identity.find(prestiged.ctx.sender)).toMatchObject({ foraging: 4, warcraft: 3 });

  const wiped = crystalFixture();
  wiped.seed("playerResearch", { identity: wiped.ctx.sender, foraging: 4, warcraft: 3 });
  wiped.run(server.resetPlayerProgress, {});
  expect(wiped.db.playerResearch.identity.find(wiped.ctx.sender)).toBeFalsy();
});

it("keeps the lifetime kill count through a prestige but not through a plain reset", () => {
  const prestiged = crystalFixture();
  prestiged.patch("playerProgress", { bossRewardClaims: CAMPAIGN_COMPLETE });
  prestiged.seed("playerLifetime", { identity: prestiged.ctx.sender, enemyKills: 4_242n,
    joinedAt: prestiged.ctx.timestamp, sessionStartedAt: prestiged.ctx.timestamp });
  prestiged.run(server.prestigeAccount, {});
  expect(prestiged.db.playerLifetime.identity.find(prestiged.ctx.sender).enemyKills).toBe(4_242n);

  const wiped = crystalFixture();
  wiped.seed("playerLifetime", { identity: wiped.ctx.sender, enemyKills: 4_242n,
    joinedAt: wiped.ctx.timestamp, sessionStartedAt: wiped.ctx.timestamp });
  wiped.run(server.resetPlayerProgress, {});
  expect(wiped.db.playerLifetime.identity.find(wiped.ctx.sender).enemyKills).toBe(0n);
});

it("survives the player's own progress reset", () => {
  const f = crystalFixture();
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 2, perkPoints: 2, peakPower: 5, prestigedAt: f.ctx.timestamp });
  f.run(server.resetPlayerProgress, {});
  expect(prestigeRow(f)).toMatchObject({ level: 2, perkPoints: 2 });
});

it("pays ten percent more stat per kill for each prestige level", () => {
  const plain = farmer(0), prestiged = farmer(1);
  const before = plain.db.playerProgress.identity.find(plain.ctx.sender).damage;
  farmSpitters(plain); farmSpitters(prestiged);
  const plainGain = plain.db.playerProgress.identity.find(plain.ctx.sender).damage - before;
  const prestigedGain = prestiged.db.playerProgress.identity.find(prestiged.ctx.sender).damage - before;
  expect(plainGain).toBeGreaterThan(0);
  expect(prestigedGain / plainGain).toBeCloseTo(1 + PRESTIGE_STAT_GAIN_PER_LEVEL);
});

it("never accepts fewer kills from a prestiged player than a plain one", () => {
  // The claim bound is derived from the player's own stats, and prestige raises
  // the rewards those stats are projected with. A bigger bonus must never read
  // as a smaller claim, or the most invested players would be clipped.
  const plain = farmer(0), prestiged = farmer(5);
  const kills = (f: ReturnType<typeof crystalFixture>) => f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n;
  farmSpitters(plain, 60); farmSpitters(prestiged, 60);
  expect(kills(prestiged)).toBeGreaterThanOrEqual(kills(plain));
  expect([...prestiged.db.enemyDefeatReview.iter()]).toEqual([]);
});

it("spends a banked point on one rank and refuses anything it cannot pay for", () => {
  const f = crystalFixture();
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "keenEdge" })).toThrow("No perk points");
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 2, perkPoints: 2, peakPower: 0, prestigedAt: f.ctx.timestamp });
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "nope" })).toThrow("Unknown prestige perk");
  f.run(server.spendPrestigePerkPoint, { perk: "riposte" });
  expect(prestigeRow(f)).toMatchObject({ perkPoints: 1 });
  expect(perkRow(f)).toMatchObject({ riposte: 1 });
  f.run(server.spendPrestigePerkPoint, { perk: "riposte" });
  expect(prestigeRow(f)).toMatchObject({ perkPoints: 0 });
  expect(perkRow(f)).toMatchObject({ riposte: 2 });
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "riposte" })).toThrow("No perk points");
});

it("refuses to push a perk past its highest rank", () => {
  const f = crystalFixture();
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 9, perkPoints: 3, peakPower: 0, prestigedAt: f.ctx.timestamp });
  f.seed("playerPrestigePerk", { identity: f.ctx.sender, splitShot: PRESTIGE_PERK_MAX_RANK });
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "splitShot" })).toThrow("highest rank");
  expect(prestigeRow(f)).toMatchObject({ perkPoints: 3 });
});

it("widens the claim bound for perks that reach more enemies than the weapon can", () => {
  // Split Shot and Riposte finish kills the weapon's own damage cannot account
  // for. A bound blind to them would pay a perked player less than they earned.
  const accepted = (ranks: Record<string, number>) => {
    const f = farmer(0);
    // One slow, single projectile per swing, so the bound is well under the
    // claim and any widening of it is visible in what the server pays.
    f.patch("playerProgress", { attackRate: 10, projectileCount: 1 });
    if (Object.keys(ranks).length) f.seed("playerPrestigePerk", { identity: f.ctx.sender, ...ranks });
    // The perk-widened damage bound is the subject here, so bank the spawn
    // allowance rather than letting the arrival bank clip first and hide it.
    fillDefeatBudget(f, "tutorial_forest", "Spitter");
    farmSpitters(f, 100);
    return Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
  };
  const plain = accepted({});
  expect(plain).toBeGreaterThan(0);
  expect(plain).toBeLessThan(100);
  expect(accepted({ splitShot: PRESTIGE_PERK_MAX_RANK })).toBeGreaterThan(plain);
  expect(accepted({ riposte: PRESTIGE_PERK_MAX_RANK })).toBeGreaterThan(plain);
  expect(accepted({ doubleStrike: PRESTIGE_PERK_MAX_RANK })).toBeGreaterThanOrEqual(plain);
});

it("leaves a running research timer running, and it still completes after the prestige", () => {
  const f = crystalFixture();
  const completesAt = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 60_000_000n);
  f.seed("playerResearch", { identity: f.ctx.sender, foraging: 2 });
  f.seed("activeResearch", { identity: f.ctx.sender, researchId: "foraging", targetRank: 3,
    startedAt: f.ctx.timestamp, completesAt });
  const schedule = f.seed("researchCompletionSchedule", { scheduledId: 0n, scheduledAt: ScheduleAt.time(completesAt.microsSinceUnixEpoch),
    identity: f.ctx.sender, researchId: "foraging", targetRank: 3, completesAtMicros: completesAt.microsSinceUnixEpoch });
  f.patch("playerProgress", { bossRewardClaims: CAMPAIGN_COMPLETE });

  f.run(server.prestigeAccount, {});
  expect(f.db.activeResearch.identity.find(f.ctx.sender)).toMatchObject({ researchId: "foraging", targetRank: 3 });
  expect([...f.db.researchCompletionSchedule.iter()]).toHaveLength(1);

  // The timer fires as it would have if the player had never prestiged.
  f.ctx.timestamp = new Timestamp(completesAt.microsSinceUnixEpoch + 1n);
  f.run(server.completeResearch, { schedule: f.db.researchCompletionSchedule.scheduledId.find(schedule.scheduledId) });
  expect(f.db.playerResearch.identity.find(f.ctx.sender)).toMatchObject({ foraging: 3 });
  expect(f.db.activeResearch.identity.find(f.ctx.sender)).toBeFalsy();
});

it("drops the player's leaderboard power the moment they prestige", () => {
  // The board is rebuilt on a timer. Without an immediate refresh a reset
  // player sits at the top of everyone else's leaderboard until the sweep.
  const f = crystalFixture();
  f.patch("playerProgress", { bossRewardClaims: CAMPAIGN_COMPLETE, damage: 5_000_000, maxHp: 900_000 });
  f.seed("playerProfile", { identity: identity("9"), displayName: "Rival" });
  f.run(server.prestigeAccount, {});
  const entry = f.db.leaderboardEntry.identity.find(f.ctx.sender);
  expect(entry?.powerLevel ?? 0).toBeLessThan(5_000_000);
  expect(entry?.damage ?? 0).toBeLessThan(5_000_000);
});
