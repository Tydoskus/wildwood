import { vi } from "vitest";
import type { Identity } from "spacetimedb";
import { encodePlayerMapFrame, encodePlayerMotionFrame, type PlayerMapSample } from "../../shared/player-motion-frame";
import { createPresenceService } from "../../src/coop/services/presence-service";

/**
 * The client's presence service against a fake SpacetimeDB connection: it
 * counts every subscribe and unsubscribe (split by which subscription it is)
 * and every motion-interest reducer, so a test can play a session (enter a
 * map, others arrive, the server's frames come in once a second) and see what
 * the server would have been asked to do.
 *
 * The test owns the clock: it mocks src/app/trusted-clock to read `clock.now`
 * (see presence-resubscribe.test.ts), uses fake timers, and passes the same
 * clock here.
 */
export type PresenceClock = { now: number };

const identity = (hex: string) => ({ toHexString: () => hex, isEqual: (other: { toHexString(): string }) => other.toHexString() === hex }) as unknown as Identity;

/** Which subscription a query set is, by its size: the map's players (3 queries) or its markers and detail frames (2). */
function subscriptionKind(queries: readonly unknown[]) {
  return queries.length === 3 ? "mapPlayers" : queries.length === 2 ? "markers" : "other";
}

export function createPresenceHarness(clock: PresenceClock, options: { self?: string; mapId?: string } = {}) {
  const self = options.self ?? "self";
  const mapId = options.mapId ?? "samurai_garden";
  const flags = { protocolBlocked: false, worldEntryBlocked: false, sessionConflict: false };
  /** Return true to make a subscription of that kind fail, as a server error would. */
  let failing: (kind: string) => boolean = () => false;
  const counts = { subscribe: { mapPlayers: 0, markers: 0, other: 0 } as Record<string, number>, unsubscribe: 0, interest: [] as number[][] };
  const motionIdentityRows: unknown[] = [];

  const connection = {
    isActive: true,
    db: {
      playerMotionIdentity: { iter: () => motionIdentityRows.values() },
      playerAutoFarmPuppet: { iter: () => [].values(), onInsert() {}, onUpdate() {}, onDelete() {} },
    },
    reducers: new Proxy({}, {
      get: (_target, name) => (args: { networkIds?: number[] }) => {
        if (name === "setPlayerMotionInterest") counts.interest.push([...(args.networkIds ?? [])]);
      },
    }),
    subscriptionBuilder() {
      let applied: (ctx: unknown) => void = () => {};
      let failed: (ctx: unknown) => void = () => {};
      const builder = {
        onApplied(callback: (ctx: unknown) => void) { applied = callback; return builder; },
        onError(callback: (ctx: unknown) => void) { failed = callback; return builder; },
        subscribe(queries: readonly unknown[]) {
          const kind = subscriptionKind(queries);
          counts.subscribe[kind] = (counts.subscribe[kind] ?? 0) + 1;
          let active = true;
          const handle = {
            isActive: () => active,
            isEnded: () => !active,
            unsubscribe() { if (active) { active = false; counts.unsubscribe += 1; } },
            unsubscribeThen(after: () => void) { handle.unsubscribe(); queueMicrotask(after); },
          };
          const fail = failing(kind);
          queueMicrotask(() => {
            if (fail) { active = false; failed({ event: new Error("subscription failed") }); } else applied({});
          });
          return handle;
        },
      };
      return builder;
    },
  };

  const service = createPresenceService({
    reducers: {
      connection: () => connection as never,
      protocolBlocked: () => flags.protocolBlocked,
      worldEntryBlocked: () => flags.worldEntryBlocked,
      runWorldReducer: async reducer => reducer(),
      sendReducer: (_action, reducer, _onRejected, onAccepted) => { reducer(connection as never); onAccepted?.(); },
      errorMessage: error => String(error),
      handleFailure: () => {},
    },
    changes: { notify: () => {}, batch: action => action() },
    localIdentity: () => self,
    localDbIdentity: () => identity(self),
    hydrationReady: () => true,
    worldEntryReady: () => true,
    sessionConflict: () => flags.sessionConflict,
    authTabId: () => "tab",
    onControllerConflict: () => {},
    directory: { tables: { upsertProfile() {}, upsertAccountStatus() {}, removeProfile() {}, removeAccountStatus() {} }, api: { playerDisplayName: () => "" } } as never,
    developer: { api: { developerPresenceVisible: () => true }, observePresence() {} } as never,
    latencyMs: () => null,
  });

  const presentation = (hex: string, networkId: number, visible = true) => ({
    networkId, identity: identity(hex), mapId, isVisible: visible, zoneX: 0, zoneY: 0, displayName: hex, profileIcon: 0,
    playerSprite: 0, skinTone: 0, isGuest: false, gender: 0, speed: 230, powerLevel: 1,
    headItem: "", chestItem: "", feetItem: "", rightHandItem: "", leftHandItem: "",
  });
  const emittedAt = () => ({ microsSinceUnixEpoch: BigInt(Math.round((1.7e12 + clock.now) * 1_000)) });
  /** Lets every subscription the service started apply (or fail). */
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  return {
    service,
    counts,
    flags,
    failSubscriptions(predicate: (kind: string) => boolean) { failing = predicate; },
    /** Our own player arrives on the map, shown to others or not, with the eye on. */
    async enter(visible = true) {
      service.tables.upsertPlayer({ identity: identity(self), x: 2_000, y: 2_000, facing: 0, motionEpoch: 0, moving: false, speed: 230,
        isVisible: visible, lastInputSequence: 0, controllerTabId: "tab", mapId } as never);
      service.tables.upsertMotionIdentity(presentation(self, 1, visible) as never);
      service.api.setRemotePlayersVisible(true);
      await settle();
    },
    /** Another player on the map, whose row the map subscription now holds. */
    async arrive(hex: string, networkId: number) {
      const row = presentation(hex, networkId);
      motionIdentityRows.push(row);
      service.tables.upsertMotionIdentity(row as never);
      await settle();
    },
    /** One second of the server's frames: the map's dots, and movement detail for these players (none by default). */
    async second(dots: readonly PlayerMapSample[], detailFor: readonly number[] = []) {
      service.tables.upsertPlayerMapFrame({ mapId, emittedAt: emittedAt(), playerCount: dots.length, payload: encodePlayerMapFrame(dots) });
      if (detailFor.length) {
        const samples = detailFor.map(networkId => ({ networkId, x: 2_050, y: 2_000, vx: 0, vy: 0, simulationTick: 0, motionEpoch: 0 }));
        service.tables.upsertPlayerMotionFrame({ emittedAt: emittedAt(), playerCount: samples.length, payload: encodePlayerMotionFrame(samples) });
      }
      clock.now += 1_000;
      vi.advanceTimersByTime(1_000);
      await settle();
    },
    settle,
  };
}
