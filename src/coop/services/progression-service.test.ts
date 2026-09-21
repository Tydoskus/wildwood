import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameBootstrap } from "../../game/runtime/game-bootstrap";
import type { ReducerPort } from "../ports";
import type { PlayerProgress, ProgressSave } from "./progress";
import { createProgressionService, PROGRESS_SAVE_INTERVAL_MS } from "./progression-service";

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
    crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false, duskfallOrchardUnlocked: false, neonBastionUnlocked: false, verdantCatacombsUnlocked: false, ionCitadelUnlocked: false,
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
    duskfallOrchardUnlocked: _duskfallOrchardUnlocked, neonBastionUnlocked: _neonBastionUnlocked, verdantCatacombsUnlocked: _verdantCatacombsUnlocked, ionCitadelUnlocked: _ionCitadelUnlocked,
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
  const recordEnemyDefeats = vi.fn(async (_request: any): Promise<void> => {});
  const savePlayerProgress = vi.fn(async (): Promise<void> => {});
  const resetPlayerProgress = vi.fn(async (): Promise<void> => {});
  const claimDeveloperItemGift = vi.fn(async (): Promise<void> => {});
  const entry = { ready: true, blocked: false, hydrated: true };
  const destroyEquipment = vi.fn(async () => {});
  const connection = { reducers: { recordEnemyDefeats, savePlayerProgress, resetPlayerProgress, claimDeveloperItemGift, destroyEquipment } };
  const reducers = {
    connection: () => connection,
    protocolBlocked: () => false,
    worldEntryBlocked: () => entry.blocked,
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
    worldEntryReady: () => entry.ready,
    hydrationReady: () => entry.hydrated,
    activeProfileIdentity: () => identity,
    completeAccountReturn: vi.fn(),
    reserveStoppedMotion: () => ({ sequence: 1, simulationTick: 1, motionEpoch: 1 }),
    commitStoppedPosition: vi.fn(),
    storage: new MemoryStorage(),
    pendingProgressKey: "pending-progress",
    prepareResetRoute,
  });
  return { recordEnemyDefeats, notify, savePlayerProgress, resetPlayerProgress, service, entry, claimDeveloperItemGift, destroyEquipment };
}

describe("local progression profile snapshots", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes confirmed destruction from cached and pending inventory without losing earned stats", async () => {
    const h = setup();
    const saved = { ...progress(), inventoryJson: '["samurai_hat"]', equippedHead: "samurai_hat", cosmeticHead: "samurai_hat" };
    h.service.tables.upsertProgress({ ...saved, identity: { toHexString: () => identity } } as any);
    h.service.api.saveProgress(saveFrom(saved, { damage: 123 }), false);
    expect((await h.service.api.destroyEquipment("samurai_hat")).ok).toBe(true);
    const current = h.service.api.savedProgress()!;
    expect(current.damage).toBe(123);
    expect(JSON.parse(current.inventoryJson)).not.toContain("samurai_hat");
    expect(current.equippedHead).toBe(""); expect(current.cosmeticHead).toBe("");
  });

  it("preserves inventory after rejected destruction", async () => {
    const h = setup();
    const saved = { ...progress(), inventoryJson: '["samurai_hat"]', equippedHead: "samurai_hat" };
    h.service.tables.upsertProgress({ ...saved, identity: { toHexString: () => identity } } as any);
    h.destroyEquipment.mockRejectedValueOnce(new Error("Finish your duel first."));
    expect((await h.service.api.destroyEquipment("samurai_hat")).ok).toBe(false);
    expect(h.service.api.savedProgress()!.equippedHead).toBe("samurai_hat");
  });

  it("keeps gifts pending until world entry is ready and never submits claims from a blocked session", async () => {
    const h = setup();
    h.service.tables.upsertItemGift({ identity: { toHexString: () => identity } as never, key: "gift", itemId: "superior_golden_helmet" });
    h.entry.ready = false;
    expect(h.service.api.pendingItemGift()).toBeNull();
    expect((await h.service.api.claimItemGift("gift")).ok).toBe(false);
    h.entry.ready = true; h.entry.blocked = true;
    expect(h.service.api.pendingItemGift()).toBeNull();
    expect((await h.service.api.claimItemGift("gift")).ok).toBe(false);
    expect(h.claimDeveloperItemGift).not.toHaveBeenCalled();
    h.entry.blocked = false;
    expect(h.service.api.pendingItemGift()?.key).toBe("gift");
    expect((await h.service.api.claimItemGift("gift")).ok).toBe(true);
    expect(h.claimDeveloperItemGift).toHaveBeenCalledExactlyOnceWith({ key: "gift" });
  });

  it("rechecks gift claim readiness after draining progress", async () => {
    const h = setup();
    const result = h.service.api.claimItemGift("gift");
    h.entry.blocked = true;
    expect((await result).ok).toBe(false);
    expect(h.claimDeveloperItemGift).not.toHaveBeenCalled();
  });

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

  it("predicts stats immediately but only confirms server-provided rewards", async () => {
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

    expect(savePlayerProgress).not.toHaveBeenCalled();
    expect(service.progressFor(identity)).toMatchObject({ attackRate: server.attackRate, regen: server.regen });
    service.dispose();
  });
});

describe("server-calculated defeat batches", () => {
  it("retains boss rewards until the reconnect snapshot has hydrated", async () => {
    const h = setup(); h.entry.hydrated = false;
    h.service.api.recordRegularEnemyDefeat("tutorial_forest", "boss");
    expect(await h.service.drainEnemyLoot()).toBe(false);
    expect(h.recordEnemyDefeats).not.toHaveBeenCalled();
    h.entry.hydrated = true;
    expect(await h.service.drainEnemyLoot()).toBe(true);
    expect(h.recordEnemyDefeats).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ mapId: "tutorial_forest", enemies: [{ enemy: "boss", count: 1 }] }));
    h.service.dispose();
  });
  it("acknowledges an equipped weapon before boss validation without clearing predicted rewards", async () => {
    const h = setup(); const base = { ...progress(), equippedRightHand: "" };
    const order: string[] = [];
    h.savePlayerProgress.mockImplementation(async () => { order.push("equipment"); });
    h.recordEnemyDefeats.mockImplementation(async () => { order.push("boss"); });
    h.service.tables.upsertProgress({ ...base, identity: { toHexString: () => identity } } as never);
    h.service.api.saveProgress(saveFrom(base, { equippedRightHand: "starter_stone", damage: 50 }));
    h.service.api.recordRegularEnemyDefeat("tutorial_forest", "boss");
    expect(await h.service.drainEnemyLoot()).toBe(true);
    expect(order).toEqual(["equipment", "boss"]);
    expect(h.service.progressFor(identity)?.damage).toBe(50);
    h.service.dispose();
  });

  it("retains the boss report when its equipment save fails", async () => {
    const h = setup(); const base = { ...progress(), equippedRightHand: "" };
    h.service.tables.upsertProgress({ ...base, identity: { toHexString: () => identity } } as never);
    h.savePlayerProgress.mockRejectedValueOnce(new Error("Connection lost"));
    h.service.api.saveProgress(saveFrom(base, { equippedRightHand: "starter_stone" }));
    h.service.api.recordRegularEnemyDefeat("tutorial_forest", "boss");
    expect(await h.service.drainEnemyLoot()).toBe(false);
    expect(h.recordEnemyDefeats).not.toHaveBeenCalled();
    expect(await h.service.drainEnemyLoot()).toBe(true);
    expect(h.recordEnemyDefeats).toHaveBeenCalledOnce();
    h.service.dispose();
  });

  it("sends only enemy counts and avoids a redundant stat save", async () => {
    const h = setup(); const base = progress();
    h.service.tables.upsertProgress({ ...base, identity: { toHexString: () => identity } } as never);
    h.service.api.saveProgress(saveFrom(base, { damage: 20, enemyKills: 10 }));
    h.service.api.recordRegularEnemyDefeat("water_reach", "Tide Raider");
    expect(await h.service.drainPendingProgress()).toBe(true);
    expect(h.recordEnemyDefeats).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      enemies: [{ enemy: "Tide Raider", count: 1 }],
    }));
    expect(h.savePlayerProgress).not.toHaveBeenCalled();
    expect(h.service.progressFor(identity)?.damage).toBe(base.damage);
    expect(h.recordEnemyDefeats.mock.calls[0][0]).not.toHaveProperty("progress");
    h.service.dispose();
  });

  it("keeps equipment changes on the normal validated save path", async () => {
    const h = setup(); const base = progress();
    h.service.tables.upsertProgress({ ...base, identity: { toHexString: () => identity } } as never);
    h.service.api.saveProgress(saveFrom(base, { equippedHead: "samurai_hat", damage: 20 }));
    h.service.api.recordRegularEnemyDefeat("water_reach", "Tide Raider");
    expect(await h.service.drainPendingProgress()).toBe(true);
    expect(h.recordEnemyDefeats.mock.calls[0][0].progress).toBeUndefined();
    expect(h.savePlayerProgress).toHaveBeenCalledTimes(1);
    h.service.dispose();
  });

  it("does not clear newer progress when an older batch is acknowledged", async () => {
    const h = setup(); const base = progress(); let finish!: () => void;
    h.service.tables.upsertProgress({ ...base, identity: { toHexString: () => identity } } as never);
    h.recordEnemyDefeats.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    h.service.api.saveProgress(saveFrom(base, { damage: 20 }));
    h.service.api.recordRegularEnemyDefeat("water_reach", "Tide Raider");
    const first = h.service.drainEnemyLoot();
    h.service.api.saveProgress(saveFrom(base, { damage: 30, enemyKills: 2 }));
    finish(); await first;
    expect(h.service.progressFor(identity)?.damage).toBe(30);
    await h.service.drainPendingProgress();
    expect(h.savePlayerProgress).not.toHaveBeenCalled();
    h.service.dispose();
  });

  it("lets a Home reward drain finish through a 12-second acknowledgement delay without resending", async () => {
    vi.useFakeTimers();
    try {
      const h = setup();
      let finish!: () => void;
      h.recordEnemyDefeats.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      h.service.api.recordRegularEnemyDefeat("advanced_lava_wastes", "Lava Raider");
      let settled = false;
      const drain = h.service.drainEnemyLoot().then(ok => { settled = true; return ok; });
      await vi.advanceTimersByTimeAsync(12_000);
      expect(settled).toBe(false);
      const secondTap = h.service.drainEnemyLoot();
      expect(h.recordEnemyDefeats).toHaveBeenCalledOnce();
      finish();
      expect(await drain).toBe(true);
      expect(await secondTap).toBe(true);
      expect(h.recordEnemyDefeats).toHaveBeenCalledOnce();
      h.service.dispose();
    } finally { vi.useRealTimers(); }
  });

  it("times out a stuck checkpoint and retries instead of blocking all subsequent saves", async () => {
    vi.useFakeTimers();
    try {
      const h = setup(); const base = progress();
      h.service.tables.upsertProgress({ ...base, identity: { toHexString: () => identity } } as never);
      h.recordEnemyDefeats.mockImplementationOnce(() => new Promise(() => {}));
      h.service.api.saveProgress(saveFrom(base, { damage: 20 }));
      h.service.api.recordRegularEnemyDefeat("water_reach", "Tide Raider");
      const first = h.service.drainEnemyLoot();
      await vi.advanceTimersByTimeAsync(15_001);
      expect(await first).toBe(false);
      expect(await h.service.drainPendingProgress()).toBe(true);
      expect(h.recordEnemyDefeats.mock.calls[1][0]).toEqual(h.recordEnemyDefeats.mock.calls[0][0]);
      expect(h.savePlayerProgress).not.toHaveBeenCalled();
      h.service.dispose();
    } finally { vi.useRealTimers(); }
  });

  it("schedules ordinary progress and loot batches every thirty seconds", () => {
    const h = setup();
    expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), PROGRESS_SAVE_INTERVAL_MS);
    expect(PROGRESS_SAVE_INTERVAL_MS).toBe(30_000);
    h.service.dispose();
  });
});

it("does not acknowledge a newer session with an old checkpoint response", async () => {
  const h = setup(); const base = progress(); let finish!: () => void;
  h.service.tables.upsertProgress({ ...base, identity: { toHexString: () => identity } } as never);
  h.recordEnemyDefeats.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  h.service.api.saveProgress(saveFrom(base, { damage: 20 }));
  h.service.api.recordRegularEnemyDefeat("water_reach", "Tide Raider");
  const first = h.service.drainEnemyLoot();
  h.service.beginSession(false);
  h.service.api.saveProgress(saveFrom(base, { damage: 30, enemyKills: 2 }));
  finish(); expect(await first).toBe(false);
  expect(await h.service.drainPendingProgress()).toBe(true);
  expect(h.savePlayerProgress).not.toHaveBeenCalled();
  h.service.dispose();
});

it("keeps every player's prestige level for the badge, and the full record only for the local player", () => {
  const h = setup();
  const row = (id: string, level: number) => ({ identity: { toHexString: () => id }, level, perkPoints: 1, peakPower: 5, prestigedAt: { microsSinceUnixEpoch: 1_000n } }) as never;
  h.service.tables.upsertPrestige(row("someone-else", 3));
  expect(h.service.api.prestigeLevelFor("someone-else")).toBe(3);
  expect(h.service.api.prestige()).toBeNull();
  h.service.tables.upsertPrestige(row(identity, 1));
  expect(h.service.api.prestigeLevelFor(identity)).toBe(1);
  expect(h.service.api.prestige()?.level).toBe(1);
  h.service.tables.removePrestige({ identity: { toHexString: () => "someone-else" } } as never);
  expect(h.service.api.prestigeLevelFor("someone-else")).toBe(0);
  h.service.dispose();
});
