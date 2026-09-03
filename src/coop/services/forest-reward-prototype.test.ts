import { describe, expect, it, vi } from "vitest";
import type { ReducerPort } from "../ports";
import { DEVELOPER_IDENTITY } from "../../app/developer";
import { createDeveloperService } from "./developer-service";

function fixture() {
  let local = DEVELOPER_IDENTITY;
  let blocked = false;
  const reducers = { beginForestRewardPrototype: vi.fn(async () => {}), attackForestRewardPrototype: vi.fn(async (_action: unknown) => {}) };
  const connection = { reducers };
  const port = {
    protocolBlocked: () => blocked, connection: () => connection,
    runWorldReducer: (run: () => Promise<void>) => run(),
    errorMessage: (error: Error) => error.message, handleFailure: vi.fn(),
  } as unknown as ReducerPort;
  const notify = vi.fn();
  const service = createDeveloperService({
    reducers: port, notify, localIdentity: () => local, localDbIdentity: () => null, profileIdentityFor: () => undefined,
  });
  return { service, reducers, notify, switchAccount: () => { local = "guest"; service.clearSession(); }, block: () => { blocked = true; } };
}

describe("forest prototype client boundary", () => {
  it("only publishes confirmed view state, not a speculative damage reward", async () => {
    const { service, reducers } = fixture();
    expect(await service.api.devForestRewardPrototype()).toEqual({ ok: true });
    expect(reducers.beginForestRewardPrototype).toHaveBeenCalledWith({});
    expect(service.api.forestRewardPrototypeState()).toBeNull();
    const state = { encounter: 1n, enemyHp: 24, damage: 10, kills: 0n, lastAttack: 0n, nextAttackAt: 10n, respawnAt: 0n };
    service.tables.upsertForestPrototype(state);
    const action = { encounter: 1n, firstAttack: 1n, count: 1 };
    await service.api.devForestRewardPrototype(action);
    expect(reducers.attackForestRewardPrototype).toHaveBeenCalledWith(action);
    expect(service.api.forestRewardPrototypeState()).toEqual(state);
    service.api.forestRewardPrototypeState()!.damage = 99999;
    expect(service.api.forestRewardPrototypeState()!.damage).toBe(10);
  });

  it("rejects nondevelopers and blocked protocols without network calls", async () => {
    const f = fixture();
    f.block();
    expect((await f.service.api.devForestRewardPrototype()).ok).toBe(false);
    f.switchAccount();
    expect((await f.service.api.devForestRewardPrototype()).ok).toBe(false);
    expect(f.reducers.beginForestRewardPrototype).not.toHaveBeenCalled();
  });

  it("surfaces validation errors and clears stale state on account switch", async () => {
    const f = fixture();
    f.reducers.attackForestRewardPrototype.mockRejectedValueOnce(new Error("Cooldown active"));
    expect(await f.service.api.devForestRewardPrototype({ encounter: 1n, firstAttack: 1n, count: 3 })).toEqual({ ok: false, error: "Cooldown active" });
    f.service.tables.upsertForestPrototype({ encounter: 1n, enemyHp: 0, damage: 11, kills: 1n, lastAttack: 3n, nextAttackAt: 0n, respawnAt: 20n });
    f.switchAccount();
    expect(f.service.api.forestRewardPrototypeState()).toBeNull();
  });

  it("does not present a late success as belonging to a new account", async () => {
    const f = fixture();
    let resolve!: () => void;
    f.reducers.beginForestRewardPrototype.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const pending = f.service.api.devForestRewardPrototype();
    f.switchAccount();
    resolve();
    expect((await pending).ok).toBe(false);
  });
});
