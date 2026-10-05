import { expect, it, vi } from "vitest";
import { Identity, Timestamp } from "spacetimedb";

let clock = 1_000_000;
vi.mock("../../app/trusted-clock", () => ({ monotonicNowMs: () => clock, wallClockNowMs: () => clock }));
const { createPresenceService } = await import("./presence-service");

const me = new Identity("1".repeat(64)), farmer = new Identity("2".repeat(64)), walker = new Identity("3".repeat(64));
const sites = [500, 900, 1300].map(x => ({ x, y: 600, type: "Bramble", campName: "Damage Camp", definition: { reward: { type: "damage" } } }));

function harness() {
  const sent: { label: string; args?: unknown }[] = [];
  const handlers: Record<string, (ctx: unknown, ...rows: any[]) => void> = {};
  const connection: any = {
    isActive: true,
    reducers: {
      setPlayerMotionInterest: (args: unknown) => sent.push({ label: "interest", args }),
      updateMovementState: (args: unknown) => sent.push({ label: "movement", args }),
      setAutoFarmPuppet: (args: unknown) => sent.push({ label: "puppet", args }),
      setSpeed() {},
    },
    db: {
      playerMotionIdentity: { iter: () => [] },
      playerAutoFarmPuppet: { iter: () => [], onInsert: (fn: any) => { handlers.insert = fn; }, onUpdate: (fn: any) => { handlers.update = fn; }, onDelete: (fn: any) => { handlers.delete = fn; } },
    },
    subscriptionBuilder() {
      const handle: any = { isActive: () => true, isEnded: () => false, unsubscribe() {}, unsubscribeThen(next: () => void) { next(); },
        onApplied(fn: () => void) { handle.applied = fn; return handle; }, onError() { return handle; }, subscribe() { return handle; } };
      return handle;
    },
  };
  const presence = createPresenceService({
    localIdentity: () => me.toHexString(), localDbIdentity: () => me, multiplayerEnabled: () => true,
    hydrationReady: () => true, worldEntryReady: () => true, sessionConflict: () => false, authTabId: () => "tab", latencyMs: () => 0,
    developer: { api: { developerPresenceVisible: () => true }, observePresence() {} },
    directory: { api: { playerDisplayName: () => "" }, tables: { upsertProfile() {}, removeProfile() {}, upsertAccountStatus() {}, removeAccountStatus() {} } },
    reducers: { connection: () => connection, protocolBlocked: () => false, worldEntryBlocked: () => false,
      sendReducer: (_label: string, run: (c: unknown) => void, _reject: unknown, accept?: () => void) => { run(connection); accept?.(); } },
    changes: { notify() {}, batch: (run: () => void) => run() },
  } as any);
  presence.tables.upsertPlayer({ identity: me, mapId: "tutorial_forest", x: 100, y: 600, speed: 200, facing: 0, moving: false,
    motionEpoch: 1, lastInputSequence: 1, isVisible: true, controllerTabId: "tab" });
  return { presence, sent, handlers };
}

it("sends one plan while farming, and only checkpoints and halts of movement", () => {
  const { presence, sent } = harness();
  const farm = { group: "stat:damage", camp: null, sites };
  presence.api.syncMovementState(100, 600, 200, 0, "steer", false, undefined, farm);
  expect(sent.filter(s => s.label === "puppet")).toEqual([{ label: "puppet", args: { group: "stat:damage", camp: "" } }]);
  const moves = () => sent.filter(s => s.label === "movement").length;
  const before = moves();
  // Steering around a route for ten seconds: drift and turns no longer send.
  for (let frame = 1; frame <= 600; frame += 1) {
    clock += 1_000 / 60;
    presence.api.syncMovementState(100 + frame, 600 + (frame % 120), frame % 200 < 100 ? 200 : -200, 50, "steer", false, undefined, farm);
  }
  expect(moves()).toBe(before);
  // A halt still sends, so a reload starts where they stood.
  presence.api.syncMovementState(700, 600, 0, 0, "steer", false, undefined, farm);
  expect(moves()).toBe(before + 1);
  // Stopping autofarm ends the plan, from a fresh position.
  presence.api.syncMovementState(700, 600, 0, 0, "keyboard", false, undefined, { group: null, camp: null, sites });
  expect(sent.filter(s => s.label === "puppet").at(-1)).toEqual({ label: "puppet", args: { group: "", camp: "" } });
  expect(moves()).toBe(before + 2);
});

it("plays another farmer from their row, outside the movement stream", () => {
  const { presence, handlers } = harness();
  presence.api.setRemotePlayersVisible(true);
  presence.tables.upsertMotionIdentity({ networkId: 9, identity: farmer, mapId: "tutorial_forest", isVisible: true, zoneX: 0, zoneY: 0,
    displayName: "Farmer", profileIcon: 0, playerSprite: 0, skinTone: 0, isGuest: false, gender: 0, speed: 200, powerLevel: 1,
    feetItem: "", headItem: "", chestItem: "", rightHandItem: "", leftHandItem: "" });
  presence.tables.upsertMotionIdentity({ networkId: 10, identity: walker, mapId: "tutorial_forest", isVisible: true, zoneX: 0, zoneY: 0,
    displayName: "Walker", profileIcon: 0, playerSprite: 0, skinTone: 0, isGuest: false, gender: 0, speed: 200, powerLevel: 1,
    feetItem: "", headItem: "", chestItem: "", rightHandItem: "", leftHandItem: "" });
  // Our own movement frame carries the map's sites.
  presence.api.syncMovementState(100, 600, 0, 0, "keyboard", false, undefined, { group: null, camp: null, sites });
  handlers.insert(null, { identity: farmer, mapId: "tutorial_forest", group: "stat:damage", camp: "", x: 200, y: 600,
    startedAt: new Timestamp(BigInt(Math.round(clock)) * 1_000n) });
  const first = presence.api.remotePlayers().find(p => p.id === farmer.toHexString())!;
  expect(first).toMatchObject({ name: "Farmer", x: 200, y: 600 });
  clock += 1_000;
  const later = presence.api.remotePlayers().find(p => p.id === farmer.toHexString())!;
  expect(Math.hypot(later.x - 200, later.y - 600)).toBeGreaterThan(50);
  expect(presence.api.remotePlayerCount()).toBe(1);
  // A deleted row hands them back to the stream.
  handlers.delete(null, { identity: farmer });
  expect(presence.api.remotePlayers().some(p => p.id === farmer.toHexString())).toBe(false);
});

it("never jumps a puppet: re-anchors and group changes are walked, at no more than their own speed", () => {
  const { presence, handlers } = harness();
  presence.api.setRemotePlayersVisible(true);
  presence.tables.upsertMotionIdentity({ networkId: 9, identity: farmer, mapId: "tutorial_forest", isVisible: true, zoneX: 0, zoneY: 0,
    displayName: "Farmer", profileIcon: 0, playerSprite: 0, skinTone: 0, isGuest: false, gender: 0, speed: 200, powerLevel: 1,
    feetItem: "", headItem: "", chestItem: "", rightHandItem: "", leftHandItem: "" });
  const healthSites = [300, 2500].map(x => ({ x, y: 900, type: "Bramble", campName: "Health Camp", definition: { reward: { type: "health" } } }));
  presence.api.syncMovementState(100, 600, 0, 0, "keyboard", false, undefined, { group: null, camp: null, sites: [...sites, ...healthSites] });
  const row = (x: number, group: string) => ({ identity: farmer, mapId: "tutorial_forest", group, camp: "", x, y: 600,
    startedAt: new Timestamp(BigInt(Math.round(clock)) * 1_000n) });
  handlers.insert(null, row(200, "stat:damage"));
  const where = () => presence.api.remotePlayers().find(p => p.id === farmer.toHexString())!;
  let last = { x: where().x, y: where().y }, fastest = 0;
  const frames = (count: number) => { for (let i = 0; i < count; i++) {
    clock += 1_000 / 30;
    const now = where();
    fastest = Math.max(fastest, Math.hypot(now.x - last.x, now.y - last.y));
    last = { x: now.x, y: now.y };
  } };
  frames(60);
  // The farmer's 30-second re-anchor, far from where the puppet walks: nothing moves it.
  handlers.update(null, null, row(2400, "stat:damage"));
  frames(60);
  // A new group re-plans from where it stands.
  handlers.update(null, null, row(2400, "stat:health"));
  frames(300);
  expect(fastest).toBeLessThanOrEqual(200 / 30 + 1.01);
  // Long after its first route would have ended, it is still farming.
  const before = { ...last };
  clock += 30 * 60_000;
  frames(90);
  expect(Math.hypot(last.x - before.x, last.y - before.y)).toBeGreaterThan(0);
});
