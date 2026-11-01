import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { OFFLINE_MINIMUM_SECONDS, OFFLINE_WINDOW_SECONDS } from "../../shared/offline-progress";
import { referenceBuildForMap } from "../../shared/progression";
import { TERMS_VERSION } from "../../shared/legal";
import { DEVELOPER_IDENTITY } from "../../shared/developer-identity";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
import { progressOf } from "../../tests/helpers/progress";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { MAP_IDS } from "../../shared/rules";
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
  const before = progressOf(fixture, fixture.ctx.sender);

  enter(fixture);

  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  expect(row.mapId).toBe("intermediate_snowlands");
  expect(row.blocked).toBe(false);
  expect(row.kills).toBeGreaterThan(0);
  expect(row.pending).toBe(true);
  expect(row.seconds).toBe(OFFLINE_WINDOW_SECONDS);
  // Reopening at zero is what stops the same absence paying twice.
  expect(row.awaySinceMicros).toBe(0n);

  expect(row.damage + row.health + row.armor + row.regen).toBeGreaterThan(0);
  // Offered, not paid, until the fight is picked.
  expect(progressOf(fixture, fixture.ctx.sender).damage).toBe(before.damage);
  fixture.run(server.collectOfflineProgressAs, { activity: "fight" });
  const after = progressOf(fixture, fixture.ctx.sender);
  expect(after.damage + after.maxHp + after.armor + after.regen)
    .toBeGreaterThan(before.damage + before.maxHp + before.armor + before.regen);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).pending).toBe(false);
  // Collected once: a second pick pays nothing more.
  fixture.run(server.collectOfflineProgressAs, { activity: "fight" });
  expect(progressOf(fixture, fixture.ctx.sender).damage).toBe(after.damage);
});

it("pays the mining instead of the fight when mining is picked", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  const before = progressOf(fixture, fixture.ctx.sender);
  enter(fixture);
  const choice = fixture.db.offlineGatherChoice.identity.find(fixture.ctx.sender);
  expect(choice.rocks).toBeGreaterThan(0);
  fixture.run(server.collectOfflineProgressAs, { activity: "mine" });
  expect(progressOf(fixture, fixture.ctx.sender).damage).toBe(before.damage);
  expect(fixture.db.playerGold.identity.find(fixture.ctx.sender)?.gold ?? 0n).toBe(0n);
  expect(fixture.db.playerMining.identity.find(fixture.ctx.sender).mining).toBe(choice.miningGain);
  const copper = [...fixture.db.playerOre.iter()].find((row: any) => row.oreId === "copper_ore");
  expect(copper?.count).toBe(JSON.parse(choice.mineOres).copper_ore);
  expect(fixture.db.offlineGatherChoice.identity.find(fixture.ctx.sender)).toBeNull();
});

it("splits time away evenly over every vein and stand the skills open, and none still shut", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  fixture.seed("playerMining", { identity: fixture.ctx.sender, mining: 60, pickaxeAt: fixture.ctx.timestamp, lastBreakAt: fixture.ctx.timestamp,
    lastNodeId: 0, lastStarshard: false, rocksBroken: 0 });
  enter(fixture);
  const choice = fixture.db.offlineGatherChoice.identity.find(fixture.ctx.sender);
  const mined = JSON.parse(choice.mineOres), chopped = JSON.parse(choice.chopOres);
  expect(mined.copper_ore).toBeGreaterThan(0);
  expect(mined.iron_ore).toBeGreaterThan(0);
  expect(mined.adamant_ore).toBeUndefined();
  // Mining 60 opens the Copper Hills' crystal rocks (25) but not the iron vein's (75).
  expect(mined.arcane_crystal).toBeGreaterThan(0);
  expect(Object.keys(chopped)).toEqual(["pine_log"]);
});

it("gives a guild member the hall's Hearth on top of the offline window, and the Lanterns' speed to gathering", () => {
  const seconds = OFFLINE_WINDOW_SECONDS + 3_600;
  const plain = away(seconds);
  enter(plain);
  const member = away(seconds);
  member.seed("guildMember", { identity: member.ctx.sender, guildId: 7n, name: "Me", joinedAt: 0n, eligibleAt: 0n, champion: false, fighter: "", power: 0, vicePresident: false });
  member.seed("guildHall", { guildId: 7n, fund: 0, spent: 0, levels: JSON.stringify({ hearth: 2, lights: 2 }) });
  enter(member);
  expect(plain.db.offlineProgress.identity.find(plain.ctx.sender).seconds).toBe(OFFLINE_WINDOW_SECONDS);
  expect(member.db.offlineProgress.identity.find(member.ctx.sender).seconds).toBe(OFFLINE_WINDOW_SECONDS + 3_600);
  expect(member.db.offlineGatherChoice.identity.find(member.ctx.sender).rocks)
    .toBeGreaterThan(plain.db.offlineGatherChoice.identity.find(plain.ctx.sender).rocks);
});

it("caps a long absence at the window", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS * 20);
  enter(fixture);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).seconds).toBe(8 * 60 * 60);
});

it("credits twelve hours to a player with all three offline-time ranks", () => {
  const fixture = away(3 * OFFLINE_WINDOW_SECONDS);
  fixture.seed("playerResearch", { identity: fixture.ctx.sender, offlineWindow: 3 });
  enter(fixture);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).seconds).toBe(12 * 60 * 60);
});

it("pays nothing for a reconnect", () => {
  const fixture = away(OFFLINE_MINIMUM_SECONDS - 1);
  const before = progressOf(fixture, fixture.ctx.sender).damage;

  enter(fixture);

  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  expect(row.pending).toBe(false);
  expect(row.kills).toBe(0);
  expect(progressOf(fixture, fixture.ctx.sender).damage).toBe(before);
});

it("steps down to the map the build can actually survive", () => {
  // Unlocked far past what these stats can hold.
  const fixture = away(OFFLINE_WINDOW_SECONDS, Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true])));

  enter(fixture);

  const mapId = fixture.db.offlineProgress.identity.find(fixture.ctx.sender).mapId;
  expect(MAP_IDS.indexOf(mapId)).toBeLessThan(MAP_IDS.length - 1);
});

it("reports a blocked window instead of paying for a map that would kill them", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS, { damage: 1, maxHp: 1, armor: 0, regen: 0, attackRate: 1 });
  const before = progressOf(fixture, fixture.ctx.sender).damage;

  enter(fixture);

  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  expect(row.blocked).toBe(true);
  expect(row.kills).toBe(0);
  expect(row.pending).toBe(true);
  expect(progressOf(fixture, fixture.ctx.sender).damage).toBe(before);
});

it("only pays once, however many times the player re-enters", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  enter(fixture);
  const paid = progressOf(fixture, fixture.ctx.sender).damage;
  const granted = fixture.db.offlineProgress.identity.find(fixture.ctx.sender).grantedAtMicros;

  enter(fixture);

  expect(progressOf(fixture, fixture.ctx.sender).damage).toBe(paid);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).grantedAtMicros).toBe(granted);
});

it("keeps time away that was never collected for the next absence, up to the window", () => {
  const fixture = away(60 * 60);
  enter(fixture);
  const later = (seconds: number) => {
    // The stamp a disconnect leaves (opens the window, above), without ending the test's session.
    const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
    fixture.db.offlineProgress.identity.update({ ...row, awaySinceMicros: fixture.ctx.timestamp.microsSinceUnixEpoch });
    fixture.ctx.timestamp = new Timestamp(fixture.ctx.timestamp.microsSinceUnixEpoch + BigInt(seconds) * 1_000_000n);
    enter(fixture);
    return fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  };

  expect(later(2 * 60 * 60).seconds).toBe(3 * 60 * 60);
  expect(later(OFFLINE_WINDOW_SECONDS).seconds).toBe(OFFLINE_WINDOW_SECONDS);

  fixture.run(server.collectOfflineProgressAs, { activity: "mine" });
  expect(later(60 * 60).seconds).toBe(60 * 60);
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
  const before = progressOf(fixture, fixture.ctx.sender);

  enter(fixture);

  const after = progressOf(fixture, fixture.ctx.sender);
  expect(after.damage).toBe(before.damage);
  expect(after.maxHp).toBe(before.maxHp);
  const row = fixture.db.offlineProgress.identity.find(fixture.ctx.sender);
  // Nothing to show, and no banked absence waiting to be paid if the setting
  // is switched back on: the window reopens from now, as a login always does.
  expect(row.pending).toBe(false);
  expect(row.awaySinceMicros).toBe(0n);
});

it("pays no offline farming while a Reflect Only challenge runs", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  fixture.seed("playerPrestigeChallenge", { identity: fixture.ctx.sender, active: true, completed: 0 });
  const before = progressOf(fixture, fixture.ctx.sender);
  enter(fixture);
  const after = progressOf(fixture, fixture.ctx.sender);
  expect([after.damage, after.maxHp, after.armor, after.regen]).toEqual([before.damage, before.maxHp, before.armor, before.regen]);
  expect(fixture.db.offlineProgress.identity.find(fixture.ctx.sender).kills).toBe(0);
});

it("pays offline kills gold at half the in-play rate, a gold every 10 kills", () => {
  const fixture = away(OFFLINE_WINDOW_SECONDS);
  enter(fixture);
  fixture.run(server.collectOfflineProgressAs, { activity: "fight" });
  const kills = fixture.db.offlineProgress.identity.find(fixture.ctx.sender).kills;
  expect(kills).toBeGreaterThanOrEqual(10);
  expect(fixture.db.playerGold.identity.find(fixture.ctx.sender)?.gold).toBe(BigInt(Math.floor(kills / 10)));
});
