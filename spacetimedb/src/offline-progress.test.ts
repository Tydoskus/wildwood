import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { OFFLINE_MINIMUM_SECONDS, OFFLINE_WINDOW_SECONDS } from "../../shared/offline-progress";
import { referenceBuildForMap } from "../../shared/progression";
import { TERMS_VERSION } from "../../shared/legal";
import { DEVELOPER_IDENTITY } from "../../shared/developer-identity";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

/** A build that can hold Snowlands, standing in Home after the window opened. */
/** Far enough past the epoch that an hour can be subtracted from it. */
const CLOCK_MICROS = 1_790_000_000_000_000n;

function away(secondsAway: number, overrides: Record<string, unknown> = {}) {
  const fixture = crystalFixture();
  fixture.ctx.timestamp = new Timestamp(CLOCK_MICROS);
  const build = referenceBuildForMap(1);
  fixture.patch("playerProgress", {
    damage: build.damage, maxHp: build.maxHp, armor: build.armor,
    regen: build.regen, attackRate: build.attackInterval,
    desertUnlocked: true, snowlandsUnlocked: true,
    ...overrides,
  });
  fixture.seed("playerLegalConsent", {
    identity: fixture.ctx.sender, termsVersion: TERMS_VERSION, ageBand: 2, acceptedAt: fixture.ctx.timestamp,
  });
  fixture.seed("offlineProgress", {
    identity: fixture.ctx.sender, mapId: "", seconds: 0, kills: 0,
    damage: 0, health: 0, armor: 0, regen: 0, attackSpeed: 0,
    blocked: false, grantedAtMicros: 0n, pending: false,
    awaySinceMicros: fixture.ctx.timestamp.microsSinceUnixEpoch,
  });
  fixture.ctx.timestamp = new Timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + BigInt(secondsAway) * 1_000_000n,
  );
  return fixture;
}

function enter(fixture: ReturnType<typeof crystalFixture>) {
  return fixture.run(server.enterWorld, { tabId: "testtabid" });
}

it("pays out the highest map the build can hold, and closes the window behind it", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  const before = fixture.db.playerProgress.identity.find(fixture.ctx.sender);

  enter(fixture);

  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  expect(row.mapId).toBe("intermediate_snowlands");
  expect(row.blocked).toBe(false);
  expect(row.kills).toBeGreaterThan(0);
  expect(row.pending).toBe(true);
  expect(row.seconds).toBe(OFFLINE_WINDOW_SECONDS);
  // Reopening at zero is what stops the same absence paying twice.
  expect(row.awaySinceMicros).toBe(0n);

  const after = fixture.db.playerProgress.identity.find(fixture.ctx.sender);
  expect(after.damage + after.maxHp + after.armor + after.regen)
    .toBeGreaterThan(before.damage + before.maxHp + before.armor + before.regen);
  expect(row.damage + row.health + row.armor + row.regen).toBeGreaterThan(0);
});

it("caps a long absence at the window", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS * 20);
  enter(fixture);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).seconds).toBe(60 * 60);
});

it("credits ninety minutes to a player with all three offline-time ranks", () => {
  const fixture = away(3 * OFFLINE_WINDOW_SECONDS);
  fixture.seed("playerResearch", { identity: fixture.ctx.sender, offlineWindow: 3 });
  enter(fixture);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).seconds).toBe(90 * 60);
});

it("pays nothing for a reconnect", () => {
  const fixture = away(OFFLINE_MINIMUM_SECONDS - 1);
  const before = fixture.db.playerProgress.identity.find(fixture.ctx.sender).damage;

  enter(fixture);

  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  expect(row.pending).toBe(false);
  expect(row.kills).toBe(0);
  expect(fixture.db.playerProgress.identity.find(fixture.ctx.sender).damage).toBe(before);
});

it("steps down to the map the build can actually survive", () => {
  // Unlocked far past what these stats can hold.
  const fixture = away(OFFLINE_WINDOW_SECONDS, {
    lavaUnlocked: true, infernalUnlocked: true, waterUnlocked: true, samuraiUnlocked: true,
  });

  enter(fixture);

  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).mapId).toBe("intermediate_snowlands");
});

it("reports a blocked window instead of paying for a map that would kill them", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS, { damage: 1, maxHp: 1, armor: 0, regen: 0, attackRate: 1 });
  const before = fixture.db.playerProgress.identity.find(fixture.ctx.sender).damage;

  enter(fixture);

  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  expect(row.blocked).toBe(true);
  expect(row.kills).toBe(0);
  expect(row.pending).toBe(true);
  expect(fixture.db.playerProgress.identity.find(fixture.ctx.sender).damage).toBe(before);
});

it("only pays once, however many times the player re-enters", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  enter(fixture);
  const paid = fixture.db.playerProgress.identity.find(fixture.ctx.sender).damage;
  const granted = fixture.db.offlineProgress.identity.find(fixture.ctx.sender).grantedAtMicros;

  enter(fixture);

  expect(fixture.db.playerProgress.identity.find(fixture.ctx.sender).damage).toBe(paid);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).grantedAtMicros).toBe(granted);
});

it("clears the summary when the client says it has been shown", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  enter(fixture);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).pending).toBe(true);

  fixture.run(server.acknowledgeOfflineSummary, {});

  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).pending).toBe(false);
});

it("keeps the developer backdate behind developer access", () => {
  const fixture = away(0);
  expect(() => fixture.run(server.simulateTimeAway, { seconds: OFFLINE_WINDOW_SECONDS })).toThrow("Developer access required.");
});

it("settles the developer backdate on the spot, because a reload cannot reach it", () => {
  const fixture = away(0);
  // Copy the account onto the developer identity: the gate reads ctx.sender.
  const who = Identity.fromString(DEVELOPER_IDENTITY);
  const connectionId = new (fixture.ctx.connectionId!.constructor as any)(2n);
  for (const table of ["playerProgress", "player", "offlineProgress"]) {
    fixture.seed(table, { ...fixture.db[table].identity.find(fixture.ctx.sender), identity: who });
  }
  fixture.seed("playerSession", { ...fixture.db.playerSession.connectionId.find(fixture.ctx.connectionId), identity: who, connectionId });
  fixture.seed("playerController", { identity: who, connectionId });
  fixture.ctx.sender = who;
  fixture.ctx.connectionId = connectionId;
  fixture.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };

  fixture.run(server.simulateTimeAway, { seconds: OFFLINE_WINDOW_SECONDS });

  const row = fixture.db.offlineProgress.identity.find(who);
  expect(row.pending).toBe(true);
  expect(row.seconds).toBe(OFFLINE_WINDOW_SECONDS);
  expect(row.mapId).toBe("intermediate_snowlands");
  expect(row.kills).toBeGreaterThan(0);
});

it("opens the window when the account's last session ends", () => {
  const fixture = away(0);
  fixture.db.offlineProgress.identity.update({
    ...fixture.db.offlineProgress.identity.find(fixture.ctx.sender), awaySinceMicros: 0n,
  });

  fixture.run(server.onDisconnect);

  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).awaySinceMicros)
    .toBe(fixture.ctx.timestamp.microsSinceUnixEpoch);
});

it("pays nothing to an account that switched offline progress off, and closes the window anyway", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  fixture.seed("playerOfflinePreference", { identity: fixture.ctx.sender, enabled: false });
  const before = fixture.db.playerProgress.identity.find(fixture.ctx.sender);

  enter(fixture);

  const after = fixture.db.playerProgress.identity.find(fixture.ctx.sender);
  expect(after.damage).toBe(before.damage);
  expect(after.maxHp).toBe(before.maxHp);
  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  // Nothing to show, and no banked absence waiting to be paid if the setting
  // is switched back on: the window reopens from now, as a login always does.
  expect(row.pending).toBe(false);
  expect(row.awaySinceMicros).toBe(0n);
});
