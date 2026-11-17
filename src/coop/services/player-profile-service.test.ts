import { afterEach, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { createPlayerProfileService } from "./player-profile-service";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function fixture() {
  vi.stubGlobal("window", globalThis);
  const subscriptions: Array<{ apply: () => void; unsubscribe: ReturnType<typeof vi.fn>; queries: unknown[] }> = [];
  const presenceEvents = { insert: new Set<Function>(), update: new Set<Function>(), remove: new Set<Function>() };
  const connection = {
    isActive: true,
    procedures: { getLeaderboardRanks: vi.fn() },
    db: Object.fromEntries(["playerPrestige", "playerPrestigePerk", "playerPrestigeExpansionPerk", "playerPrestigeChallenge", "playerChatHearts", "playerProgress", "playerLifetime", "playerResearch", "playerLuckResearch", "playerItemUpgrade", "playerItemRefine", "myItemRefines", "playerGearSlots", "playerActiveCard", "myActiveCards", "playerPrestigeCardPerk", "myGearSlots", "playerProfile", "playerAccountStatus", "player", "profileSoulStats"].map(name => [name, { iter: () => [] }])),
    subscriptionBuilder() {
      let applied = () => {}, ready = false;
      const unsubscribe = vi.fn(() => { if (!ready) throw new Error("Cannot unsubscribe pending"); });
      const builder = {
        onApplied(callback: () => void) { applied = callback; return builder; },
        onError() { return builder; },
        subscribe(queries: unknown[]) {
          subscriptions.push({ apply() { ready = true; applied(); }, unsubscribe, queries });
          return { unsubscribe, isActive: () => ready, isEnded: () => false };
        },
      };
      return builder;
    },
  };
  Object.assign(connection.db.player, {
    onInsert: (fn: Function) => presenceEvents.insert.add(fn), removeOnInsert: (fn: Function) => presenceEvents.insert.delete(fn),
    onUpdate: (fn: Function) => presenceEvents.update.add(fn), removeOnUpdate: (fn: Function) => presenceEvents.update.delete(fn),
    onDelete: (fn: Function) => presenceEvents.remove.add(fn), removeOnDelete: (fn: Function) => presenceEvents.remove.delete(fn),
  });
  const progression = { progressFor: vi.fn((): any => null), lifetimeFor: vi.fn((): any => null), researchFor: () => null, upgradeLevelsFor: vi.fn(() => ({})), clearProfile: vi.fn(), tables: { upsertItemUpgrade: vi.fn() } };
  const service = createPlayerProfileService({ connection: () => connection, localIdentity: () => "me", notify: vi.fn(),
    localMapId: () => "tutorial_forest", nearbyMapFor: () => undefined, developerIdentityFor: () => undefined,
    directory: { identityFor: () => new Identity("1".repeat(64)), nameFor: () => "Friend", genderFor: () => 0, tables: {}, rememberPresentation: vi.fn() },
    progression,
  } as never);
  return { service, subscriptions, connection, presenceEvents, progression };
}
it("closes a pending profile without throwing and disposes it when it finally applies", async () => {
  const f = fixture();
  const pending = f.service.api.loadPlayerProfile("friend");
  expect(() => f.service.api.releasePlayerProfile()).not.toThrow();
  expect(await pending).toBeNull();
  expect(f.subscriptions[0].unsubscribe).not.toHaveBeenCalled();
  f.subscriptions[0].apply();
  expect(f.subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
});
it("an old response cannot replace a reopened profile for the same player", async () => {
  const f = fixture();
  const first = f.service.api.loadPlayerProfile("friend");
  f.service.api.releasePlayerProfile();
  const second = f.service.api.loadPlayerProfile("friend");
  f.subscriptions[0].apply();
  expect(f.subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
  expect(f.subscriptions[1].unsubscribe).not.toHaveBeenCalled();
  f.subscriptions[1].apply();
  expect(await first).toBeNull(); expect(await second).toBeNull();
});
it("asks the server whether an eye-off player is on, since their row is withheld", async () => {
  const f = fixture();
  Object.assign(f.connection.procedures, { getPlayerPresence: vi.fn(async () => JSON.stringify({ online: true, mapId: "water_reach", lastSeenAtMs: 1 })) });
  const pending = f.service.api.loadPlayerProfile("friend");
  f.subscriptions[0].apply();
  await pending;
  await vi.waitFor(() => expect(f.service.api.activePlayerMap("friend")).toBe("water_reach"));
});
it("a stalled profile request times out safely and still disposes a late subscription", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const pending = f.service.api.loadPlayerProfile("friend");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await pending).toBeNull();
  f.subscriptions[0].apply();
  expect(f.subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
});

it("deduplicates leaderboard pages and rejects a late page after the session is cleared", async () => {
  const f = fixture();
  let finish!: (page: unknown) => void;
  f.connection.procedures.getLeaderboardRanks.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = f.service.api.loadLeaderboardPage("created", 250, 100);
  const duplicate = f.service.api.loadLeaderboardPage("created", 250, 100);
  expect(first).toBe(duplicate);
  expect(f.connection.procedures.getLeaderboardRanks).toHaveBeenCalledOnce();
  expect(f.connection.procedures.getLeaderboardRanks).toHaveBeenCalledWith({ board: "created", startRank: 250, count: 100 });
  f.service.clearSession();
  const rejected = expect(first).rejects.toThrow("Session changed");
  finish({ entries: [], startRank: 250, endRank: 349, localRank: 300, total: 1000 });
  await rejected;
});

it("keeps each board's pages apart", async () => {
  const f = fixture();
  f.connection.procedures.getLeaderboardRanks.mockImplementation(({ board }: { board: string }) =>
    Promise.resolve({ entries: [], startRank: 1, endRank: 0, localRank: 0, total: board === "time" ? 9 : 2, prestige: 0 }));
  const all = f.service.api.loadLeaderboardPage("time");
  const week = f.service.api.loadLeaderboardPage("created");
  expect(all).not.toBe(week);
  expect((await all).total).toBe(9);
  expect((await week).total).toBe(2);
});

it("tracks an autofarming hidden player's presence and departure without polling", async () => {
  const f = fixture();
  const row = { identity: new Identity("1".repeat(64)), mapId: "beginner_desert", isVisible: false };
  const id = row.identity.toHexString();
  f.connection.db.player.iter = () => [row] as never;
  const pending = f.service.api.loadPlayerProfile(id);
  f.subscriptions[0].apply(); await pending;
  expect(f.service.api.activePlayerMap(id)).toBe("beginner_desert");
  for (const fn of f.presenceEvents.update) fn({}, row, { ...row, mapId: "home_exterior" });
  expect(f.service.api.activePlayerMap(id)).toBe("home_exterior");
  // The row going is asked about, not taken as leaving: here the server says they have gone.
  Object.assign(f.connection.procedures, { getPlayerPresence: vi.fn(async () => JSON.stringify({ online: false })) });
  Object.assign(f.connection.db.player, { identity: { find: () => undefined } });
  for (const fn of f.presenceEvents.remove) fn({}, row);
  expect(f.service.api.activePlayerMap(id)).toBe("home_exterior");
  await vi.waitFor(() => expect(f.service.api.activePlayerMap(id)).toBe(""));
  f.service.api.releasePlayerProfile();
  expect([...f.presenceEvents.insert, ...f.presenceEvents.update, ...f.presenceEvents.remove]).toHaveLength(0);
});

it("keeps an eye-off player online while their row comes and goes, instead of flashing Last seen", async () => {
  const f = fixture();
  const row = { identity: new Identity("1".repeat(64)), mapId: "beginner_desert", isVisible: true };
  const id = row.identity.toHexString();
  f.connection.db.player.iter = () => [row] as never;
  Object.assign(f.connection.db.player, { identity: { find: () => undefined } });
  const presence = vi.fn(async () => JSON.stringify({ online: true, mapId: "beginner_desert" }));
  Object.assign(f.connection.procedures, { getPlayerPresence: presence });
  const pending = f.service.api.loadPlayerProfile(id);
  f.subscriptions[0].apply(); await pending;
  // Hidden as they start playing by hand: still on the map, then and once the server answers.
  for (const fn of f.presenceEvents.remove) fn({}, row);
  expect(f.service.api.activePlayerMap(id)).toBe("beginner_desert");
  await vi.waitFor(() => expect(presence).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(f.service.api.activePlayerMap(id)).toBe("beginner_desert");
});

it("loads remote prestige, perks and slot tiers despite already cached base stats", async () => {
  const f = fixture(), identity = new Identity("1".repeat(64)), hex = identity.toHexString();
  f.progression.progressFor.mockReturnValue({ damage: 10 });
  f.progression.lifetimeFor.mockReturnValue({ enemyKills: 5 });
  const request = f.service.api.loadPlayerProfile(hex);
  expect(f.subscriptions).toHaveLength(1);
  f.connection.db.playerPrestige.iter = () => [{ identity, level: 3 }] as any;
  f.connection.db.playerPrestigePerk.iter = () => [{ identity, keenEdge: 2, doubleStrike: 1, splitShot: 0, riposte: 0 }] as any;
  f.connection.db.playerPrestigeExpansionPerk.iter = () => [{ identity, fleetFoot: 3, longShot: 2, bossSlayer: 1, secondWind: 0 }] as any;
  f.connection.db.playerItemUpgrade.iter = () => [{ identity, itemId: "HAND", level: 7 }] as any;
  f.progression.tables.upsertItemUpgrade.mockImplementation(() => { f.progression.upgradeLevelsFor.mockReturnValue({ HAND: 7 }); });
  f.subscriptions[0].apply();
  expect(await request).toMatchObject({ prestigeLevel: 3, prestigePerks: { keenEdge: 2, fleetFoot: 3, longShot: 2 }, itemUpgradeLevels: { HAND: 7 } });
});

it("attaches the inspected player's soul stats, read from their row of profile_soul_stats", async () => {
  const f = fixture(), identity = new Identity("1".repeat(64)), hex = identity.toHexString();
  f.progression.progressFor.mockReturnValue({ damage: 10 });
  f.progression.lifetimeFor.mockReturnValue({ enemyKills: 5 });
  const request = f.service.api.loadPlayerProfile(hex);
  const sql = f.subscriptions[0].queries.map(query => (query as { toSql(): string }).toSql());
  expect(sql.find(text => text.includes("profile_soul_stats"))).toMatch(/WHERE .*identity.* = 0x1{64}/);
  f.connection.db.profileSoulStats.iter = () => [
    { identity: new Identity("2".repeat(64)), damage: 99, maxHp: 99, armor: 99, regen: 99, attackSpeed: 9, critDamage: 9, kills: 999n },
    { identity, damage: 4, maxHp: 12, armor: 2, regen: .5, attackSpeed: .25, critDamage: .1, kills: 40n },
  ] as never;
  f.subscriptions[0].apply();
  expect((await request)?.soulStats).toEqual({ damage: 4, maxHp: 12, armor: 2, regen: .5, attackSpeed: .25, critDamage: .1 });
});

it("gives a player with no soul stats none", async () => {
  const f = fixture(), hex = new Identity("1".repeat(64)).toHexString();
  f.progression.progressFor.mockReturnValue({ damage: 10 });
  f.progression.lifetimeFor.mockReturnValue({ enemyKills: 5 });
  const request = f.service.api.loadPlayerProfile(hex);
  f.subscriptions[0].apply();
  expect((await request)?.soulStats).toBeNull();
});

it("loads the inspected player's refines, and only theirs, with the profile", async () => {
  const f = fixture(), identity = new Identity("1".repeat(64)), other = new Identity("2".repeat(64)), hex = identity.toHexString();
  f.progression.progressFor.mockReturnValue({ damage: 10 });
  f.progression.lifetimeFor.mockReturnValue({ enemyKills: 5 });
  const request = f.service.api.loadPlayerProfile(hex);
  const sql = f.subscriptions[0].queries.map(query => (query as { toSql(): string }).toSql());
  expect(sql.some(query => query.includes("player_item_refine"))).toBe(true);
  f.connection.db.playerItemRefine.iter = () => [{ identity, itemId: "ion_bow", level: 7 }, { identity: other, itemId: "ion_bow", level: 2 }] as any;
  f.subscriptions[0].apply();
  expect(await request).toMatchObject({ itemRefines: { ion_bow: 7 } });
});

it("loads the inspected player's active cards and card slot perks, and only theirs, with the profile", async () => {
  const f = fixture(), identity = new Identity("1".repeat(64)), other = new Identity("2".repeat(64)), hex = identity.toHexString();
  f.progression.progressFor.mockReturnValue({ damage: 10 });
  f.progression.lifetimeFor.mockReturnValue({ enemyKills: 5 });
  const request = f.service.api.loadPlayerProfile(hex);
  const sql = f.subscriptions[0].queries.map(query => (query as { toSql(): string }).toSql());
  expect(sql.some(query => query.includes("player_active_card"))).toBe(true);
  expect(sql.some(query => query.includes("player_prestige_card_perk"))).toBe(true);
  f.connection.db.playerActiveCard.iter = () => [{ identity, hand: ["needle_card", "not_a_card"], head: [], chest: ["bramble_card"] },
    { identity: other, hand: ["spitter_card"], head: [], chest: [] }] as any;
  f.connection.db.playerPrestigeCardPerk.iter = () => [{ identity, weaponCards: 2, helmetCards: 0, armorCards: 1 }] as any;
  f.subscriptions[0].apply();
  const profile = await request;
  expect(profile?.activeCards).toEqual({ HAND: ["needle_card"], HEAD: [], CHEST: ["bramble_card"] });
  expect(profile?.prestigePerks).toMatchObject({ weaponCards: 2, helmetCards: 0, armorCards: 1 });
});

it("loads the inspected player's mastery levels, and only theirs, with the profile", async () => {
  const f = fixture(), identity = new Identity("1".repeat(64)), other = new Identity("2".repeat(64)), hex = identity.toHexString();
  f.progression.progressFor.mockReturnValue({ damage: 10 });
  f.progression.lifetimeFor.mockReturnValue({ enemyKills: 5 });
  const request = f.service.api.loadPlayerProfile(hex);
  const sql = f.subscriptions[0].queries.map(query => (query as { toSql(): string }).toSql());
  expect(sql.find(text => text.includes("player_mastery_level"))).toMatch(/WHERE .*identity.* = 0x1{64}/);
  (f.connection.db as any).playerMasteryLevel = { iter: () => [
    { identity, school: "archery", level: 23 }, { identity, school: "wrestling", level: 9 }, { identity: other, school: "sorcery", level: 4 },
  ] };
  f.subscriptions[0].apply();
  expect((await request)?.mastery).toEqual({ archery: 23 });
});

it("loads the inspected player's craft levels, and only theirs, with the profile", async () => {
  const f = fixture(), identity = new Identity("1".repeat(64)), other = new Identity("2".repeat(64)), hex = identity.toHexString();
  f.progression.progressFor.mockReturnValue({ damage: 10 });
  f.progression.lifetimeFor.mockReturnValue({ enemyKills: 5 });
  const request = f.service.api.loadPlayerProfile(hex);
  const sql = f.subscriptions[0].queries.map(query => (query as { toSql(): string }).toSql());
  expect(sql.find(text => text.includes("player_craft_level"))).toMatch(/WHERE .*identity.* = 0x1{64}/);
  (f.connection.db as any).playerCraftLevel = { iter: () => [
    { identity, skill: "fletching", level: 12 }, { identity, skill: "cooking", level: 9 }, { identity, skill: "unknown", level: 3 }, { identity: other, skill: "smithing", level: 4 },
  ] };
  f.subscriptions[0].apply();
  expect((await request)?.crafts).toEqual({ fletching: 12, cooking: 9 });
});
