import { afterEach, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { createPlayerProfileService } from "./player-profile-service";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function fixture() {
  vi.stubGlobal("window", globalThis);
  const subscriptions: Array<{ apply: () => void; unsubscribe: ReturnType<typeof vi.fn> }> = [];
  const presenceEvents = { insert: new Set<Function>(), update: new Set<Function>(), remove: new Set<Function>() };
  const connection = {
    isActive: true,
    procedures: { getPrestigeLeaderboardPage: vi.fn() },
    db: Object.fromEntries(["playerChatHearts", "playerProgress", "playerLifetime", "playerResearch", "playerItemUpgrade", "playerProfile", "playerAccountStatus", "player"].map(name => [name, { iter: () => [] }])),
    subscriptionBuilder() {
      let applied = () => {}, ready = false;
      const unsubscribe = vi.fn(() => { if (!ready) throw new Error("Cannot unsubscribe pending"); });
      const builder = {
        onApplied(callback: () => void) { applied = callback; return builder; },
        onError() { return builder; },
        subscribe() {
          subscriptions.push({ apply() { ready = true; applied(); }, unsubscribe });
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
  const service = createPlayerProfileService({ connection: () => connection, localIdentity: () => "me", notify: vi.fn(),
    localMapId: () => "tutorial_forest", nearbyMapFor: () => undefined, developerIdentityFor: () => undefined,
    directory: { identityFor: () => new Identity("1".repeat(64)), tables: {}, rememberPresentation: vi.fn() },
    progression: { progressFor: () => null, lifetimeFor: () => null, clearProfile: vi.fn(), tables: {} },
  } as never);
  return { service, subscriptions, connection, presenceEvents };
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
  f.connection.procedures.getPrestigeLeaderboardPage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = f.service.api.loadLeaderboardPage("power", 2, 250, 100);
  const duplicate = f.service.api.loadLeaderboardPage("power", 2, 250, 100);
  expect(first).toBe(duplicate);
  expect(f.connection.procedures.getPrestigeLeaderboardPage).toHaveBeenCalledOnce();
  expect(f.connection.procedures.getPrestigeLeaderboardPage).toHaveBeenCalledWith({ stat: "power", prestige: 2, startRank: 250, count: 100 });
  f.service.clearSession();
  const rejected = expect(first).rejects.toThrow("Session changed");
  finish({ entries: [], startRank: 250, endRank: 349, localRank: 300, total: 1000, prestige: 2, levels: [0, 2] });
  await rejected;
});

it("keeps each prestige level's page apart", async () => {
  const f = fixture();
  f.connection.procedures.getPrestigeLeaderboardPage.mockImplementation(({ prestige }: { prestige: number }) =>
    Promise.resolve({ entries: [], startRank: 1, endRank: 0, localRank: 0, total: 0, prestige, levels: [0, 1, 2] }));
  const none = f.service.api.loadLeaderboardPage("power", 0);
  const second = f.service.api.loadLeaderboardPage("power", 2);
  expect(none).not.toBe(second);
  expect((await none).prestige).toBe(0);
  expect(await second).toMatchObject({ prestige: 2, levels: [0, 1, 2] });
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
  for (const fn of f.presenceEvents.remove) fn({}, row);
  expect(f.service.api.activePlayerMap(id)).toBe("");
  f.service.api.releasePlayerProfile();
  expect([...f.presenceEvents.insert, ...f.presenceEvents.update, ...f.presenceEvents.remove]).toHaveLength(0);
});
