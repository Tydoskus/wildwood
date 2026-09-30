import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { PRESTIGE_PERK_IDS } from "../../shared/prestige-perks";
import { PRESTIGE_EXPANSION_DELAY_MS } from "../../shared/prestige-expansion";
import { ensurePrestigeExpansion } from "./prestige-expansion";
import { prestigePerkRanks, writePrestigePerkRanks } from "./prestige";
import { effectiveMovementSpeedForProgress } from "./player-speed";
import { mergeLinkedPrestige } from "./prestige-transfer";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function expansion() {
  const f = crystalFixture();
  ensurePrestigeExpansion(f.ctx as any);
  const launch = f.db.prestigeExpansion.id.find(0);
  const unlock = () => { f.ctx.timestamp = launch.unlocksAt; };
  f.seed("playerPrestige", { identity: f.ctx.sender, level: 20, perkPoints: 10, peakPower: 0, prestigedAt: f.ctx.timestamp });
  return { ...f, launch, unlock };
}

it("persists one shared 30-minute deadline across connects and subsequent publishes", () => {
  const f = expansion();
  expect(f.launch.unlocksAt.microsSinceUnixEpoch - f.launch.launchedAt.microsSinceUnixEpoch).toBe(BigInt(PRESTIGE_EXPANSION_DELAY_MS) * 1000n);
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 60_000_000n);
  ensurePrestigeExpansion(f.ctx as any);
  expect(f.db.prestigeExpansion.id.find(0)).toEqual(f.launch);
});

it("keeps prestige 21 and new perks locked until the exact shared deadline", () => {
  const f = expansion();
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 20 });
  f.ctx.timestamp = new Timestamp(f.launch.unlocksAt.microsSinceUnixEpoch - 1n);
  expect(() => f.run(server.prestigeAccount)).toThrow("capped at level 20");
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "bossSlayer" })).toThrow("countdown");
  expect(f.db.playerPrestige.identity.find(f.ctx.sender).perkPoints).toBe(10);
  f.unlock();
  f.run(server.spendPrestigePerkPoint, { perk: "bossSlayer" });
  f.run(server.prestigeAccount);
  expect(f.db.playerPrestige.identity.find(f.ctx.sender)).toMatchObject({ level: 21, perkPoints: 10 });
});

it("continues past all maxed perks and banks points instead of stopping", () => {
  const f = expansion(); f.unlock();
  writePrestigePerkRanks(f.ctx, f.ctx.sender, Object.fromEntries(PRESTIGE_PERK_IDS.map(id => [id, 5])) as any);
  f.patch("playerPrestige", { level: 100, perkPoints: 60 });
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 100 });
  f.run(server.prestigeAccount);
  expect(f.db.playerPrestige.identity.find(f.ctx.sender)).toMatchObject({ level: 101, perkPoints: 61 });
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(Object.fromEntries(PRESTIGE_PERK_IDS.map(id => [id, 5])));
  expect(() => f.run(server.spendPrestigePerkPoint, { perk: "secondWind" })).toThrow("highest rank");
  expect(f.db.playerPrestige.identity.find(f.ctx.sender).perkPoints).toBe(61);
});

it("applies range and speed immediately and accepts the researched perk speed", () => {
  const f = expansion(); f.unlock();
  f.seed("playerResearch", { identity: f.ctx.sender, utilityAttackRange: 5, moveSpeed: 20, utilityMoveSpeed: 5 });
  f.run(server.spendPrestigePerkPoint, { perk: "longShot" });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).attackRange).toBe(255);
  f.run(server.spendPrestigePerkPoint, { perk: "fleetFoot" });
  const speed = effectiveMovementSpeedForProgress(f.ctx, f.db.playerProgress.identity.find(f.ctx.sender));
  expect(f.db.player.identity.find(f.ctx.sender).speed).toBe(speed);
  expect(() => f.run(server.setSpeed, { speed })).not.toThrow();
  expect(() => f.run(server.setSpeed, { speed: speed + 10 })).toThrow("Unsupported player speed");
});

it("respec refunds both sets of perks and removes range and speed bonuses", () => {
  const f = expansion(); f.unlock();
  for (const perk of ["keenEdge", "longShot", "fleetFoot", "secondWind"]) f.run(server.spendPrestigePerkPoint, { perk });
  f.run(server.respecPrestigePerks);
  expect(f.db.playerPrestige.identity.find(f.ctx.sender).perkPoints).toBe(10);
  expect(prestigePerkRanks(f.ctx, f.ctx.sender)).toEqual(Object.fromEntries(PRESTIGE_PERK_IDS.map(id => [id, 0])));
  expect(f.db.playerProgress.identity.find(f.ctx.sender).attackRange).toBe(200);
});

it("preserves expansion ranks and excess points when linking a guest account", () => {
  const f = expansion(); f.unlock();
  const guest = f.ctx.sender; const account = new (guest.constructor as any)("2".repeat(64));
  writePrestigePerkRanks(f.ctx, guest, { ...prestigePerkRanks(f.ctx, guest), fleetFoot: 4 });
  f.seed("playerPrestige", { identity: account, level: 30, perkPoints: 0, peakPower: 0, prestigedAt: f.ctx.timestamp });
  writePrestigePerkRanks(f.ctx, account, { ...prestigePerkRanks(f.ctx, account), fleetFoot: 3 });
  mergeLinkedPrestige(f.ctx, guest, account);
  expect(prestigePerkRanks(f.ctx, account).fleetFoot).toBe(5);
  expect(f.db.playerPrestige.identity.find(account)).toMatchObject({ level: 50, perkPoints: 12 });
  expect(f.db.playerPrestigeExpansionPerk.identity.find(guest)).toBeNull();
});
