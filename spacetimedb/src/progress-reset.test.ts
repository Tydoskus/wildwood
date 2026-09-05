import { describe, expect, it, vi } from "vitest";
import { type ConnectionId, Identity } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { BOSS_REWARD_CLAIM_BITS, MAP_IDS, PLAYER_BASE_HP, PLAYER_SPAWN, PROTOCOL_VERSION, TUTORIAL_FOREST_MAP_ID } from "../../shared/rules";
import { AGE_BAND_ADULT, TERMS_VERSION } from "../../shared/legal";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
const spawn = { mapId: TUTORIAL_FOREST_MAP_ID, ...PLAYER_SPAWN };

function rootFixture(mapId: string) {
  const f = crystalFixture();
  f.patch("player", { mapId });
  f.seed("shardRuntime", { id: 0, role: "root", enabled: true });
  f.seed("mapShard", { id: 1n, mapId, databaseName: "old-region", state: "ready", occupants: 1 });
  if (mapId !== TUTORIAL_FOREST_MAP_ID) {
    f.seed("mapShard", { id: 2n, mapId: TUTORIAL_FOREST_MAP_ID, databaseName: "tutorial-region", state: "ready", occupants: 0 });
  }
  f.seed("mapShardMember", { identity: f.ctx.sender, mapId, shardId: 1n, generation: 3n, ready: true });
  f.seed("shardCoordinatorConnection", { id: 0, host: "http://localhost", token: "test" });
  f.seed("playerLastLocation", { identity: f.ctx.sender, mapId, x: 4050, y: 4050 });
  return f;
}

describe("progress reset returns the character to the tutorial", () => {
  it.each(MAP_IDS)("resets location, movement and progress from %s", (mapId) => {
    const f = crystalFixture();
    f.patch("player", { mapId, hp: 1, maxHp: 900, moving: true, vx: 180, dx: 1, motionEpoch: 2 });
    f.patch("playerProgress", { introComplete: true, desertUnlocked: true, crystalHollowsUnlocked: true, maxHp: 900 });
    f.seed("playerMotion", { identity: f.ctx.sender, networkId: 1, mapId, x: 4200, y: 4300,
      moving: true, vx: 180, dx: 1, motionEpoch: 4, simulationTick: 9, lastInputSequence: 12, lastInputAt: f.ctx.timestamp });
    f.seed("playerLastLocation", { identity: f.ctx.sender, mapId, x: 4200, y: 4300 });
    f.run(server.resetPlayerProgress);
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ ...spawn, hp: PLAYER_BASE_HP,
      maxHp: PLAYER_BASE_HP, moving: false, vx: 0, vy: 0, dx: 0, dy: 0, motionEpoch: 5 });
    expect(f.db.playerMotion.identity.find(f.ctx.sender)).toMatchObject({ ...spawn, moving: false, motionEpoch: 5 });
    expect(f.db.playerLastLocation.identity.find(f.ctx.sender)).toMatchObject(spawn);
    expect(f.db.playerMapMarker.identity.find(f.ctx.sender)).toMatchObject(spawn);
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ introComplete: false,
      desertUnlocked: false, crystalHollowsUnlocked: false, maxHp: PLAYER_BASE_HP, bossRewardClaims: 0 });
  });

  it.each(["crystal_hollows", TUTORIAL_FOREST_MAP_ID])("rotates regional admission from %s and ignores old checkpoints", (mapId) => {
    const f = rootFixture(mapId);
    f.run(server.resetPlayerProgress);
    const shardId = mapId === TUTORIAL_FOREST_MAP_ID ? 1n : 2n;
    expect(f.db.mapShardMember.identity.find(f.ctx.sender)).toMatchObject({ mapId: TUTORIAL_FOREST_MAP_ID,
      shardId, generation: 10_000_000n, ready: false });
    expect(f.db.mapShard.id.find(shardId).occupants).toBe(1);
    if (shardId === 2n) expect(f.db.mapShard.id.find(1n).occupants).toBe(0);
    expect(f.db.shardTransferBarrier.identity.find(f.ctx.sender)).toMatchObject({ shardId: 1n, generation: 3n });
    f.ctx.sender = owner;
    f.run(server.checkpointShardLocation, { identity: identity("1"), shardId: 1n, generation: 3n, x: 4900, y: 4900 });
    expect(f.db.playerLastLocation.identity.find(identity("1"))).toMatchObject(spawn);
  });

  it("keeps the tutorial location and locked portals after disconnect and re-entry", () => {
    const f = crystalFixture();
    for (const boss of Object.keys(BOSS_REWARD_CLAIM_BITS)) {
      f.seed(`${boss}Contribution`, { identity: f.ctx.sender, encounter: 7n });
      f.seed(`${boss}AttackWindow`, { identity: f.ctx.sender });
    }
    f.run(server.acceptTerms, { termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
    f.run(server.resetPlayerProgress);
    for (const boss of Object.keys(BOSS_REWARD_CLAIM_BITS)) {
      expect(f.db[`${boss}Contribution`].identity.find(f.ctx.sender)).toBeNull();
      expect(f.db[`${boss}AttackWindow`].identity.find(f.ctx.sender)).toBeNull();
    }
    f.run(server.onDisconnect);
    expect(f.db.playerLastLocation.identity.find(f.ctx.sender)).toMatchObject(spawn);
    // Use the fixture SDK's constructor (the module has its own SDK install).
    f.ctx.connectionId = new (f.ctx.connectionId!.constructor as typeof ConnectionId)(2n);
    f.seed("playerSession", { connectionId: f.ctx.connectionId, identity: f.ctx.sender, protocolVersion: PROTOCOL_VERSION });
    expect(f.db.playerSession.connectionId.find(f.ctx.connectionId)?.identity).toEqual(f.ctx.sender);
    f.run(server.enterWorld, { tabId: "reset-test-tab" });
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject(spawn);
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toMatchObject({ introComplete: false,
      desertUnlocked: false, crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false });
  });

  it("preserves account gems and purchased upgrade capacity", () => {
    const f = crystalFixture();
    const wallet = f.seed("playerGemWallet", { identity: f.ctx.sender, balance: 250n });
    const bench = f.seed("playerUpgradeBench", { identity: f.ctx.sender, secondSlotUnlocked: true });
    f.run(server.resetPlayerProgress);
    expect(f.db.playerGemWallet.identity.find(f.ctx.sender)).toEqual(wallet);
    expect(f.db.playerUpgradeBench.identity.find(f.ctx.sender)).toEqual(bench);
  });

  it("rejects a reset during a duel before deleting progress or changing map admission", () => {
    const f = rootFixture("crystal_hollows");
    f.seed("duel", { id: 1n, challenger: f.ctx.sender, opponent: identity("2"), status: "active" });
    const before = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(() => f.run(server.resetPlayerProgress)).toThrow("Finish your duel");
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(before);
    expect(f.db.mapShardMember.identity.find(f.ctx.sender)).toMatchObject({ generation: 3n, mapId: "crystal_hollows" });
  });
});
