import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { GEM_KILL_CREDIT_PER_GEM } from "../../shared/gem-drops";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

// A boss clear is one accepted defeat, and the fixture's Prismshell is
// beatable in one report once damage is high enough for the DPS check.
function clearBoss(f: ReturnType<typeof crystalFixture>, sequence: bigint, autoFarm = false) {
  f.patch("playerProgress", { damage: 1e15 });
  f.run(autoFarm ? server.recordAutoFarmEnemyDefeats : server.recordEnemyDefeats,
    { streamId: "kill-gems-test-stream", sequence, mapId: "crystal_hollows", enemies: [{ enemy: "boss", count: 1 }] });
}

it("pays a gem for a hidden manual kill when its credit completes a block", () => {
  const f = crystalFixture();
  f.patch("player", { isVisible: false });
  f.seed("gemKillProgress", { identity: f.ctx.sender, credit: GEM_KILL_CREDIT_PER_GEM - 6n });
  clearBoss(f, 1n);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender)?.balance).toBe(1n);
  expect(f.db.gemKillProgress.identity.find(f.ctx.sender)?.credit).toBe(0n);
  expect(f.db.playerGemDrop.identity.find(f.ctx.sender)).toMatchObject({ amount: 1, sequence: f.ctx.timestamp.microsSinceUnixEpoch });
  // The next kill starts the next block; no gem, no drop event.
  clearBoss(f, 2n);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender)?.balance).toBe(1n);
  expect(f.db.gemKillProgress.identity.find(f.ctx.sender)?.credit).toBe(6n);
  expect(f.db.playerGemDrop.identity.find(f.ctx.sender)?.amount).toBe(1);
});

it("counts a visible manual kill the same as a hidden one", () => {
  const f = crystalFixture();
  f.patch("player", { isVisible: true });
  f.seed("gemKillProgress", { identity: f.ctx.sender, credit: GEM_KILL_CREDIT_PER_GEM - 6n });
  clearBoss(f, 1n);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender)?.balance).toBe(1n);
  expect(f.db.gemKillProgress.identity.find(f.ctx.sender)?.credit).toBe(0n);
});

it("counts an Auto Farm kill at the 1,500-kill rate", () => {
  const f = crystalFixture();
  f.patch("player", { isVisible: false });
  f.seed("gemKillProgress", { identity: f.ctx.sender, credit: GEM_KILL_CREDIT_PER_GEM - 4n });
  clearBoss(f, 1n, true);
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender)?.balance).toBe(1n);
  expect(f.db.gemKillProgress.identity.find(f.ctx.sender)?.credit).toBe(0n);
});

it("never pays twice for a replayed report", () => {
  const f = crystalFixture();
  f.patch("player", { isVisible: false });
  f.seed("gemKillProgress", { identity: f.ctx.sender, credit: GEM_KILL_CREDIT_PER_GEM - 6n });
  clearBoss(f, 1n);
  // Same sequence again is rejected before rewards; the wallet is untouched.
  f.patch("playerProgress", { damage: 1e15 });
  f.run(server.recordEnemyDefeats, { streamId: "kill-gems-test-stream", sequence: 1n, mapId: "crystal_hollows", enemies: [{ enemy: "boss", count: 1 }] });
  expect(f.db.playerGemWallet.identity.find(f.ctx.sender)?.balance).toBe(1n);
  expect([...f.db.gemTransaction.iter()].filter(row => row.kind === "enemy_kills")).toHaveLength(1);
});

it("preserves existing partial gem credit when the ledger unit changes", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 40 });
  f.seed("gemKillProgress", { identity: f.ctx.sender, credit: 1_999n });
  f.run(server.runMaintenance, { maintenance: {} });
  expect(f.db.gemKillProgress.identity.find(f.ctx.sender)?.credit).toBe(5_997n);
  f.run(server.runMaintenance, { maintenance: {} });
  expect(f.db.gemKillProgress.identity.find(f.ctx.sender)?.credit).toBe(5_997n);
});

it("pays kills earned before kill gems existed once, at the idle rate, and never again", async () => {
  const { Identity } = await import("../../tests/helpers/spacetime-memory-db");
  const { DEVELOPER_IDENTITY } = await import("../../shared/developer-identity");
  const { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } = await import("../../shared/rules");
  const f = crystalFixture(), veteran = f.ctx.sender;
  // A veteran with 4,500 lifetime kills and a brand-new player with 300.
  f.seed("playerLifetime", { identity: veteran, joinedAt: f.ctx.timestamp, playedMicros: 0n, sessionStartedAt: f.ctx.timestamp, enemyKills: 4_500n, deathCount: 0n });
  const rookie = (await import("../../tests/helpers/crystal-hollows-fixture")).identity("3");
  f.seed("playerLifetime", { identity: rookie, joinedAt: f.ctx.timestamp, playedMicros: 0n, sessionStartedAt: f.ctx.timestamp, enemyKills: 300n, deathCount: 0n });
  // Act as the developer, the way developer-travel.test.ts does.
  const who = Identity.fromString(DEVELOPER_IDENTITY);
  const connectionId = new (f.ctx.connectionId!.constructor as any)(2n);
  f.seed("player", { ...f.db.player.identity.find(veteran), identity: who });
  f.progress(who);
  f.seed("playerSession", { ...f.db.playerSession.connectionId.find(f.ctx.connectionId), identity: who, connectionId });
  f.seed("playerController", { identity: who, connectionId });
  f.ctx.sender = who; f.ctx.connectionId = connectionId;
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };

  f.run(server.devGrantRetroactiveKillGems, {});
  expect(f.db.playerGemWallet.identity.find(veteran)?.balance).toBe(2n);
  expect(f.db.gemKillProgress.identity.find(veteran)?.credit).toBe(1_500n);
  // Under a block: nothing paid, but the progress row records the credit.
  expect(f.db.playerGemWallet.identity.find(rookie)?.balance ?? 0n).toBe(0n);
  expect(f.db.gemKillProgress.identity.find(rookie)?.credit).toBe(900n);
  // Running it again pays nobody twice.
  f.run(server.devGrantRetroactiveKillGems, {});
  expect(f.db.playerGemWallet.identity.find(veteran)?.balance).toBe(2n);
  expect([...f.db.gemTransaction.iter()].filter(row => row.kind === "enemy_kills")).toHaveLength(1);
});
