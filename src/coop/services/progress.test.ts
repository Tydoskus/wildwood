import { describe, expect, it } from "vitest";
import { ATTACK_BALANCE_VERSION, DEFAULT_ATTACK_RANGE, MIN_ATTACK_INTERVAL } from "../../../shared/rules";
import { createProgressStore } from "./progress-store";
import { copyProgress, mergeProgress, migrateProgressSave, progressCovers, type PlayerProgress, type ProgressSave } from "./progress";

const pending: ProgressSave = {
  maxHp: 200,
  damage: 20,
  attackRate: .5,
  projectileSpeed: 600,
  projectileCount: 2,
  attackRange: DEFAULT_ATTACK_RANGE,
  armor: 5,
  regen: 1,
  speed: 200,
  bootsCollected: true,
  inventoryJson: '["basic_paper_hat","trailblazer_boots"]',
  equippedHead: "basic_paper_hat",
  equippedChest: "",
  equippedFeet: "trailblazer_boots",
  equippedRightHand: "",
  equippedLeftHand: "",
  enemyKills: 10,
};

const saved: PlayerProgress = { ...pending, introComplete: true, desertUnlocked: false, snowlandsUnlocked: false };

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
}

describe("progress persistence rules", () => {
  it("normalises untrusted save values", () => {
    expect(copyProgress({ ...pending, attackRate: 0, projectileCount: 99, attackRange: 999, enemyKills: -4 })).toMatchObject({
      attackRate: MIN_ATTACK_INTERVAL,
      projectileCount: 20,
      attackRange: DEFAULT_ATTACK_RANGE,
      enemyKills: 0,
    });
  });

  it("migrates the old attack-rate balance exactly once", () => {
    expect(migrateProgressSave({ ...pending, attackRate: .5 }, ATTACK_BALANCE_VERSION - 1).attackRate).toBe(1);
    expect(migrateProgressSave({ ...pending, attackRate: .5 }, ATTACK_BALANCE_VERSION).attackRate).toBe(.5);
  });

  it("moves a legacy identity-scoped save into current storage", () => {
    const storage = memoryStorage();
    storage.setItem("pending", JSON.stringify({ identity: "player-1", balanceVersion: ATTACK_BALANCE_VERSION, progress: pending }));
    const store = createProgressStore(storage, "pending");
    expect(store.read("player-1")).toEqual(pending);
    expect(storage.getItem("pending")).toBeNull();
    expect(storage.getItem("pending/player-1")).not.toBeNull();
  });

  it("merges only monotonic gains and verifies save acknowledgement", () => {
    const merged = mergeProgress({ ...saved, damage: 10, bootsCollected: false }, pending);
    expect(merged.damage).toBe(20);
    expect(merged.bootsCollected).toBe(true);
    expect(progressCovers(merged, pending)).toBe(true);
    expect(progressCovers({ ...merged, inventoryJson: "[]" }, pending)).toBe(false);
  });
});
