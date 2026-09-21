import { STARTER_BOW } from "../../shared/items";
import { defeatBudget, enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER, PROTOCOL_VERSION } from "../../shared/rules";
import { requireAllowedDefeatSession } from "./defeat-session";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const report = { streamId: "enforcement-stream-01", sequence: 1n, mapId: "endless_1", enemies: [{ enemy: "site:0", count: 100 }] };
// A real client seals at most REGULAR_ENEMY_LOOT_BATCH_MAX kills per report, so
// only a larger one is proof of a forged claim. Everything a client could have
// sent is bounded and written down instead; see enemy-defeats.ts.
const oversized = { ...report, enemies: [{ enemy: "site:0", count: 101 }] };
// One spawn site holds one enemy; a report can bank at most this many of its kills.
const SITE_CAPACITY = BigInt(Math.floor(defeatBudget(enemyDefeatDefinition("endless_1", "site:0")!.population).capacity));
function fixture(registered = false) {
  const f = crystalFixture();
  f.patch("player", { mapId: report.mapId });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
  if (registered) f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID],
    fullPayload: { auth_time: 1, iat: 5 } } } as any;
  return f;
}
it("commits the guest restriction, receipt and private audit together", () => {
  const f = fixture(); const before = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.recordEnemyDefeats, oversized);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toMatchObject({ requireSignIn: false, blockedUntilMicros: 40_000_000n });
  expect(f.db.playerController.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.player.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerSession.connectionId.find(f.ctx.connectionId).enteredWorld).toBe(false);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n).toBe(0n);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson).toBe(before.inventoryJson);
  expect([...f.db.moderationAction.iter()]).toMatchObject([{ action: "guest_connection_blocked", rule: "enemy_defeat_allowance" }]);
  expect([...f.db.regularEnemyLootCursor.iter()]).toMatchObject([{ sequence: 1n }]);
  expect(() => f.run(server.registerProtocol, { protocolVersion: PROTOCOL_VERSION })).toThrow("DEFEAT_SESSION_COOLDOWN");
  f.ctx.timestamp = new Timestamp(39_999_999n);
  expect(() => requireAllowedDefeatSession(f.ctx as any)).toThrow("DEFEAT_SESSION_COOLDOWN");
  f.ctx.timestamp = new Timestamp(40_000_000n);
  expect(() => f.run(server.registerProtocol, { protocolVersion: PROTOCOL_VERSION })).not.toThrow();
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).not.toBeNull();
});
it("revokes existing and refreshed account tokens, while allowing a later verified authentication", () => {
  const f = fixture(true);
  f.run(server.recordEnemyDefeats, oversized);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender).requireSignIn).toBe(true);
  f.ctx.timestamp = new Timestamp(100_000_000n);
  expect(() => f.run(server.registerProtocol, { protocolVersion: PROTOCOL_VERSION })).toThrow("DEFEAT_SESSION_REAUTH");
  (f.ctx.senderAuth.jwt as any).fullPayload.iat = 90; // Refreshed JWT, same authentication.
  expect(() => requireAllowedDefeatSession(f.ctx as any)).toThrow("DEFEAT_SESSION_REAUTH");
  (f.ctx.senderAuth.jwt as any).fullPayload.auth_time = 11;
  expect(() => f.run(server.registerProtocol, { protocolVersion: PROTOCOL_VERSION })).not.toThrow();
  (f.ctx.senderAuth.jwt as any).fullPayload.auth_time = 1;
  expect(() => requireAllowedDefeatSession(f.ctx as any)).toThrow("DEFEAT_SESSION_REAUTH");
  delete (f.ctx.senderAuth.jwt as any).fullPayload.auth_time;
  expect(() => requireAllowedDefeatSession(f.ctx as any)).toThrow("DEFEAT_SESSION_REAUTH");
});
it("does not punish legitimate duplicate delivery or grouped kills", () => {
  // A grouped report that fits the one-minute window; the same report delivered twice pays once.
  const grouped = Number(SITE_CAPACITY) - 4;
  const f = fixture(); const normal = { ...report, enemies: [{ enemy: "site:0", count: grouped }] };
  f.run(server.recordEnemyDefeats, normal); f.run(server.recordEnemyDefeats, normal);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(BigInt(grouped));
});
it("does not admit a new connection during the guest cooldown", () => {
  const f = fixture();
  f.run(server.recordEnemyDefeats, oversized);
  f.ctx.connectionId = new (f.ctx.connectionId!.constructor as any)(2n);
  f.run(server.onConnect);
  expect(f.db.playerSession.connectionId.find(f.ctx.connectionId)).toBeNull();
  expect(() => f.run(server.registerProtocol, { protocolVersion: PROTOCOL_VERSION })).toThrow("DEFEAT_SESSION_COOLDOWN");
});
it("also restricts an oversized batch instead of throwing away the restriction transaction", () => {
  const f = fixture(); f.run(server.recordEnemyDefeats, oversized);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).not.toBeNull();
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n).toBe(0n);
});
it("pays a clipped report its bounded share, writes it down, and leaves the session alone", () => {
  const f = fixture();
  f.run(server.recordEnemyDefeats, report);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.player.identity.find(f.ctx.sender)).not.toBeNull();
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(SITE_CAPACITY);
  expect([...f.db.enemyDefeatReview.iter()]).toMatchObject([
    { enemy: "site:0", kind: "spawn", requested: 100, accepted: Number(SITE_CAPACITY) }]);
});
it("bounds a boss claim the earned-time clock cannot pay without taking the session or the shard seat", () => {
  // A portal round-trip re-presents a personal boss before the clock has paid
  // for it. The claim earns nothing and is flagged; the player keeps playing.
  const f = fixture(); f.patch("playerProgress", { equippedRightHand: "", damage: 1 });
  f.seed("shardRuntime", { id: 0, role: "root", enabled: true, mapId: "", shardId: 0n });
  f.seed("mapShard", { id: 1n, mapId: report.mapId, databaseName: "test-shard", state: "ready", occupants: 1 });
  f.seed("mapShardMember", { identity: f.ctx.sender, mapId: report.mapId, shardId: 1n, generation: 1n, ready: true });
  f.run(server.recordEnemyDefeats, { ...report, enemies: [{ enemy: "boss", count: 1 }] });
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
  expect(f.db.mapShardMember.identity.find(f.ctx.sender)).not.toBeNull();
  expect(f.db.player.identity.find(f.ctx.sender)).not.toBeNull();
  expect(f.db.proceduralProgress.identity.find(f.ctx.sender)).toBeNull();
  expect([...f.db.enemyDefeatReview.iter()]).toMatchObject([{ enemy: "boss", kind: "boss-time", requested: 1, accepted: 0 }]);
});

it("only lets the owner suspend the named account and enforces the entire week even with fresh authentication", async () => {
  const { Identity } = await import("spacetimedb");
  const f = fixture(true), target = f.ctx.sender;
  const args = { identity: target, expectedDisplayName: "Test Player", untilMicros: 604_810_000_000n, reason: "Owner-requested exploit suspension" };
  expect(() => f.run(server.devSuspendPlayerAccount, args)).toThrow("owner");
  f.ctx.sender = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
  expect(() => f.run(server.devSuspendPlayerAccount, { ...args, expectedDisplayName: "wrong" })).toThrow("target");
  f.run(server.devSuspendPlayerAccount, args);
  f.run(server.devSuspendPlayerAccount, args);
  expect(f.db.moderationAction.count()).toBe(1n);
  expect(f.db.player.identity.find(target)).toBeNull();
  f.ctx.sender = target;
  (f.ctx.senderAuth.jwt as any).fullPayload.auth_time = 500_000;
  f.ctx.timestamp = new Timestamp(args.untilMicros - 1n);
  expect(() => requireAllowedDefeatSession(f.ctx as any)).toThrow("DEFEAT_SESSION_COOLDOWN");
  f.ctx.timestamp = new Timestamp(args.untilMicros);
  expect(() => requireAllowedDefeatSession(f.ctx as any)).not.toThrow();
});

it.each([false, true])("logs actual kill-limit enforcement with its durable audit ID (registered=%s)", registered => {
  const f = fixture(registered);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    f.run(server.recordEnemyDefeats, oversized);
    const events = warn.mock.calls.filter(call => call[0] === "Enemy defeat session restricted");
    expect(events).toHaveLength(1);
    const event = JSON.parse(String(events[0][1]));
    const audit = [...f.db.moderationAction.iter()][0];
    expect(event).toMatchObject({ event: "enemy_defeat_session_restricted", identity: f.ctx.sender.toHexString(),
      displayName: "Test Player", action: registered ? "session_revoked" : "guest_connection_blocked",
      moderationId: audit.id.toString(), mapId: report.mapId, streamId: report.streamId, sequence: "1",
      requireSignIn: registered, blockedUntilMs: registered ? 0 : 40_000,
      violations: [{ enemy: "batch", requested: 101, accepted: 0 }] });
    expect(event.violations).toEqual(JSON.parse(audit.before).violations);
    expect(f.db.player.identity.find(f.ctx.sender)).toBeNull();
    expect(event).not.toHaveProperty("jwt");
  } finally { warn.mockRestore(); }
});

it("does not log a session revocation for valid kills or duplicate delivery", () => {
  const f = fixture(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const valid = { ...report, enemies: [{ enemy: "site:0", count: 1 }] };
    f.run(server.recordEnemyDefeats, valid); f.run(server.recordEnemyDefeats, valid);
    expect(warn.mock.calls.filter(call => call[0] === "Enemy defeat session restricted")).toHaveLength(0);
  } finally { warn.mockRestore(); }
});
