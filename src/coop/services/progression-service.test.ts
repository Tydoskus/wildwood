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
    bowCount: _bowCount,
    woodenArmorCount: _woodenArmorCount,
    ...saved
  } = current;
  return { ...saved, enemyKills: 1, ...changes };
}

function setup() {
  vi.stubGlobal("window", {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const savePlayerProgress = vi.fn(async () => undefined);
  const connection = { reducers: { savePlayerProgress } };
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
  });
  return { notify, savePlayerProgress, service };
}

describe("local progression profile snapshots", () => {
  afterEach(() => vi.unstubAllGlobals());

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
