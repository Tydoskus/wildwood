import { describe, expect, it, vi } from "vitest";
import type { ReducerPort } from "../ports";
import { createBossService } from "./boss-service";

describe("co-op boss service", () => {
  it("hydrates state and sends positioned damage through the generated reducer", () => {
    const damageTidewyrmFromPosition = vi.fn();
    const connection = { reducers: { damageTidewyrmFromPosition } };
    const reducers = {
      connection: () => connection,
      protocolBlocked: () => false,
      sendReducer: (_action: string, reducer: (current: typeof connection) => unknown) => reducer(connection),
    } as unknown as ReducerPort;
    const notify = vi.fn();
    const service = createBossService({
      reducers,
      notify,
      localPosition: () => ({ x: 4050, y: 4050 }),
    });

    service.tables.upsertTidewyrm({
      encounter: 7n,
      hp: 125_000_000_000_000_000,
      maxHp: 250_000_000_000_000_000,
      alive: true,
      respawnAtMicros: 0n,
    });
    service.tables.upsertTidewyrmResult({
      encounter: 6n,
      totalDamage: 250_000_000_000_000_000,
      contributorsJson: JSON.stringify([{ identity: "player", name: "RIVER", gender: 0, damage: 10, percentage: 100 }]),
      createdAt: { microsSinceUnixEpoch: 123_000n },
    });
    service.api.damageTidewyrm(3);

    expect(service.api.tidewyrmBoss()).toMatchObject({ encounter: 7n, alive: true });
    expect(service.api.tidewyrmResult()).toMatchObject({ encounter: 6n, createdAtMs: 123 });
    expect(damageTidewyrmFromPosition).toHaveBeenCalledWith({ hits: 3, x: 4050, y: 4050 });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("hydrates Koi Shogun state and submits positioned damage", () => {
    const damageKoiShogunFromPosition = vi.fn();
    const connection = { reducers: { damageKoiShogunFromPosition } };
    const reducers = {
      connection: () => connection,
      protocolBlocked: () => false,
      sendReducer: (_action: string, reducer: (current: typeof connection) => unknown) => reducer(connection),
    } as unknown as ReducerPort;
    const service = createBossService({
      reducers,
      notify: () => undefined,
      localPosition: () => ({ x: 4050, y: 4050 }),
    });

    service.tables.upsertKoiShogun({
      encounter: 3n,
      hp: 50,
      maxHp: 100,
      alive: true,
      respawnAtMicros: 0n,
    });
    service.api.damageKoiShogun(2);

    expect(service.api.koiShogunBoss()).toMatchObject({ encounter: 3n, hp: 50, maxHp: 100, alive: true });
    expect(damageKoiShogunFromPosition).toHaveBeenCalledWith({ hits: 2, x: 4050, y: 4050 });
  });
});
