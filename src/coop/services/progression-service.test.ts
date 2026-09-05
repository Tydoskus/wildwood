import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameBootstrap } from "../../game/runtime/game-bootstrap";
import type { ReducerPort } from "../ports";
import type { PlayerProgress, ProgressSave } from "./progress";
import { createProgressionService } from "./progression-service";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const identity = "guest-identity";

function progress(): PlayerProgress {
  const { inventory } = createGameBootstrap();
  return {
    maxHp: 100,
    damage: 4,
    attackRate: 1.56,
    projectileSpeed: 390,
    projectileCount: 1,
    attackRange: 200,
    armor: 0,
    regen: 0,
    speed: 190,
    speedOverride: 0,
    bootsCollected: false,
    inventoryJson: JSON.stringify(inventory.itemIds),
    equippedHead: inventory.equippedHead,
    equippedChest: inventory.equippedChest,
    equippedFeet: inventory.equippedFeet,
    equippedRightHand: inventory.equippedRightHand,
    equippedLeftHand: inventory.equippedLeftHand,
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
    introComplete: true,
    desertUnlocked: false,
    snowlandsUnlocked: false,
    lavaUnlocked: false,
    infernalUnlocked: false,
    waterUnlocked: false,
    samuraiUnlocked: false,
    cloudspireUnlocked: false,
    moonfenUnlocked: false,
    crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false, duskfallOrchardUnlocked: false,
    bowCount: 0,
    woodenArmorCount: 0,
  };
}

function saveFrom(current: PlayerProgress, changes: Partial<ProgressSave> = {}): ProgressSave {
  const {
    speedOverride: _speedOverride,
    introComplete: _introComplete,
    desertUnlocked: _desertUnlocked,
    snowlandsUnlocked: _snowlandsUnlocked,
    lavaUnlocked: _lavaUnlocked,
    infernalUnlocked: _infernalUnlocked,
    waterUnlocked: _waterUnlocked,
    samuraiUnlocked: _samuraiUnlocked,
    cloudspireUnlocked: _cloudspireUnlocked,
    moonfenUnlocked: _moonfenUnlocked,
    crystalHollowsUnlocked: _crystalHollowsUnlocked,
    clockworkRuinsUnlocked: _clockworkRuinsUnlocked,
    duskfallOrchardUnlocked: _duskfallOrchardUnlocked,
    bowCount: _bowCount,
    woodenArmorCount: _woodenArmorCount,
    ...saved
  } = current;
  return { ...saved, enemyKills: 1, ...changes };
}

function setup(prepareResetRoute?: () => () => Promise<void>) {
  vi.stubGlobal("window", {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const savePlayerProgress = vi.fn(async (): Promise<void> => {});
  const resetPlayerProgress = vi.fn(async (): Promise<void> => {});
  const connection = { reducers: { savePlayerProgress, resetPlayerProgress } };
  const reducers = {
    connection: () => connection,
    protocolBlocked: () => false,
    worldEntryBlocked: () => false,
    runWorldReducer: async <T>(reducer: () => T | PromiseLike<T>) => await reducer(),
    sendReducer: vi.fn(),
    errorMessage: (error: unknown) => String(error),
    handleFailure: vi.fn(),
  } as unknown as ReducerPort;
  const notify = vi.fn();
  const service = createProgressionService({
    reducers,
    notify,
    localIdentity: () => identity,
    worldEntryReady: () => true,
    hydrationReady: () => true,
    activeProfileIdentity: () => identity,
    completeAccountReturn: vi.fn(),
    reserveStoppedMotion: () => ({ sequence: 1, simulationTick: 1, motionEpoch: 1 }),
    commitStoppedPosition: vi.fn(),
    storage: new MemoryStorage(),
    pendingProgressKey: "pending-progress",
    prepareResetRoute,
  });
  return { notify, savePlayerProgress, resetPlayerProgress, service };
}

describe("local progression profile snapshots", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([true, false])("clears cutscene history only after an acknowledged character reset: success=%s", async (success) => {
    const { resetPlayerProgress, service } = setup();
    const cutscene = "wildwood-dragon-portal-cutscene-v2";
    service.tables.upsertCutsceneHistory({ identity: { toHexString: () => identity }, seenMask: 1, generation: 0 } as never);
    if (!success) resetPlayerProgress.mockRejectedValueOnce(new Error("offline"));
    await service.api.resetProgress();
    expect(service.api.hasSeenPortalCutscene(cutscene)).toBe(!success);
    service.dispose();
  });

  it("returns reset failure while preserving unsent progress for retry", async () => {
    const { resetPlayerProgress, service } = setup();
    const server = progress();
    service.tables.upsertProgress({ ...server, identity: { toHexString: () => identity } } as never);
    const pending = saveFrom(server, { damage: server.damage + 10 });
    service.api.saveProgress(pending);
    resetPlayerProgress.mockRejectedValueOnce(new Error("offline"));
    expect(await service.api.resetProgress()).toMatchObject({ ok: false });
    expect(service.progressFor(identity)?.damage).toBe(pending.damage);
    service.dispose();
  });

  it("waits for an existing save and prevents stale autosaves crossing the reset", async () => {
    const { resetPlayerProgress, savePlayerProgress, service } = setup();
    const server = progress();
    let finishSave!: () => void;
    let finishReset!: () => void;
    savePlayerProgress.mockImplementationOnce(() => new Promise<void>(done => { finishSave = done; }));
    resetPlayerProgress.mockImplementationOnce(() => new Promise<void>(done => { finishReset = done; }));
    service.api.saveProgress(saveFrom(server, { damage: 50 }), true);
    const reset = service.api.resetProgress();
    service.api.saveProgress(saveFrom(server, { damage: 100 }), true);
    expect(resetPlayerProgress).not.toHaveBeenCalled();
    finishSave();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(resetPlayerProgress).toHaveBeenCalledTimes(1);
    expect(savePlayerProgress).toHaveBeenCalledTimes(1);
    expect(await service.api.resetProgress()).toMatchObject({ ok: false });
    finishReset();
    expect(await reset).toEqual({ ok: true });
    expect(await service.drainPendingProgress()).toBe(true);
    expect(savePlayerProgress).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it("discards old saves after a committed reset even if tutorial admission fails", async () => {
    const { service, savePlayerProgress } = setup(() => async () => { throw new Error("Tutorial connection timed out"); });
    service.api.saveProgress(saveFrom(progress(), { damage: 100 }));
    expect(await service.api.resetProgress()).toMatchObject({ ok: true, restartError: expect.stringContaining("timed out") });
    expect(await service.drainPendingProgress()).toBe(true);
    expect(savePlayerProgress).not.toHaveBeenCalled();
    service.dispose();
  });

  it("publishes attack speed and regeneration immediately and keeps them after save acknowledgement", async () => {
    const { notify, savePlayerProgress, service } = setup();
    const server = progress();
    service.tables.upsertProgress({
      ...server,
      identity: { toHexString: () => identity },
    } as never);
    notify.mockClear();

    const pending = saveFrom(server, { attackRate: 1.2, regen: 0.6 });
    service.api.saveProgress(pending);

    expect(notify).toHaveBeenCalledOnce();
    expect(service.progressFor(identity)).toMatchObject({ attackRate: 1.2, regen: 0.6 });

    await service.drainPendingProgress();

    expect(savePlayerProgress).toHaveBeenCalledWith(pending);
    expect(service.progressFor(identity)).toMatchObject({ attackRate: 1.2, regen: 0.6 });
    service.dispose();
  });
});
