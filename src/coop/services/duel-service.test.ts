import { afterEach, expect, it, vi } from "vitest";
import { createDuelService } from "./duel-service";
afterEach(() => vi.unstubAllGlobals());

it("carries the exact frozen seed and skills into live duels and loaded replays", async () => {
  vi.stubGlobal("window", globalThis);
  const snapshot = { duelId: 1n, riposteSeed: 99999999999999999n, challengerRiposte: .2, opponentRiposte: .1,
    challengerArrowStorm: 13, challengerRicochet: 7, challengerPiercingShot: 4,
    opponentArrowStorm: 2, opponentRicochet: 3, opponentPiercingShot: 9 };
  const identity = { toHexString: () => "me" };
  const row = { id: 1n, challenger: identity, opponent: identity, combatVersion: 4,
    createdAt: { microsSinceUnixEpoch: 0n }, startedAt: { microsSinceUnixEpoch: 0n }, startsAtMicros: 0n, endsAtMicros: 30000000n };
  const unsubscribe = vi.fn();
  const connection = {
    db: { duelCombatSnapshot: { duelId: { find: () => snapshot } }, duelReplay: { iter: () => [row] } },
    subscriptionBuilder() {
      let applied = () => {};
      const builder = { onApplied(callback: () => void) { applied = callback; return builder; }, onError() { return builder; },
        subscribe() { queueMicrotask(applied); return { unsubscribe }; } };
      return builder;
    },
  };
  const service = createDuelService({ reducers: { connection: () => connection } as any, notify: vi.fn(), localIdentity: () => "me",
    identityFor: () => undefined, drainPendingProgress: async () => true, storage: { getItem: () => null, setItem: () => {} } as any });
  service.tables.upsert(row as any);
  await Promise.resolve();
  expect(service.api.localDuel()).toMatchObject(snapshot);
  expect(await service.api.loadDuelReplay(1n)).toMatchObject(snapshot);
  service.resetSession();
  expect(service.api.localDuel()).toBeNull();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});
