import { compressLegacyMapPower } from "../../../shared/map-power-rescale";
import { describe, expect, it } from "vitest";
import { ATTACK_BALANCE_VERSION, DEFAULT_ATTACK_RANGE, MAX_PLAYER_STAT, MIN_ATTACK_INTERVAL } from "../../../shared/rules";
import { correctLegacyTopFiveV5Progression, MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO } from "../../../shared/progression-balance";
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
  cosmeticHead: "",
  cosmeticChest: "",
  cosmeticFeet: "",
  cosmeticRightHand: "",
  cosmeticLeftHand: "",
  enemyKills: 10,
};

const saved: PlayerProgress = { ...pending, speedOverride: 0, introComplete: true, desertUnlocked: false, snowlandsUnlocked: false, lavaUnlocked: false, infernalUnlocked: false, waterUnlocked: false, samuraiUnlocked: false, cloudspireUnlocked: false, moonfenUnlocked: false, crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false, duskfallOrchardUnlocked: false, bowCount: 0, woodenArmorCount: 0 };

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

  it("preserves undecillion combat stats while retaining speed caps", () => {
    expect(copyProgress({
      ...pending,
      maxHp: 1e36,
      damage: 1e36,
      armor: 1e36,
      regen: 1e36,
      attackRate: 0,
      speed: 20_000,
    })).toMatchObject({
      maxHp: MAX_PLAYER_STAT,
      damage: MAX_PLAYER_STAT,
      armor: MAX_PLAYER_STAT,
      regen: MAX_PLAYER_STAT,
      attackRate: MIN_ATTACK_INTERVAL,
      speed: 2_000,
    });
  });

  it("migrates both attack-rate balance passes exactly once", () => {
    expect(migrateProgressSave({ ...pending, attackRate: .5 }, 0).attackRate).toBe(1);
    expect(migrateProgressSave({ ...pending, attackRate: .32 }, ATTACK_BALANCE_VERSION - 1).attackRate).toBe(MIN_ATTACK_INTERVAL);
    expect(migrateProgressSave({ ...pending, attackRate: .5 }, ATTACK_BALANCE_VERSION).attackRate).toBe(.5);
  });

  it("compresses an outlier pending save only when crossing into balance version 3", () => {
    const outlier = { ...pending, damage: 16_738_716_000_000, maxHp: 52_417_517_000_000, armor: 4_453_277_000, regen: 224_256_900_000 };
    const migrated = migrateProgressSave(outlier, 2);
    expect(migrated.damage).toBeLessThan(outlier.damage);
    expect(migrated.maxHp).toBeLessThan(outlier.maxHp);
    expect(migrateProgressSave(outlier, ATTACK_BALANCE_VERSION)).toMatchObject(outlier);
  });

  it("rebalances a damage-heavy pending save only when crossing into balance version 4", () => {
    const damageHeavy = { ...pending, damage: 20_000_000, maxHp: 1_000_000, attackRate: .3809524 };
    const migrated = migrateProgressSave(damageHeavy, 3);
    expect(migrated.damage / migrated.maxHp).toBeCloseTo(MAX_PROGRESSION_DAMAGE_TO_HEALTH_RATIO, 6);
    expect(migrated.damage).toBeLessThan(damageHeavy.damage);
    expect(migrated.maxHp).toBeLessThan(damageHeavy.maxHp);
    expect(migrateProgressSave(damageHeavy, ATTACK_BALANCE_VERSION)).toMatchObject(damageHeavy);
  });

  it("compresses only a legacy top-five pending save when crossing into balance version 5", () => {
    const topFiveSave = {
      ...pending,
      maxHp: 5.123745e15,
      damage: 2.3269255e15,
      attackRate: .3809524,
      armor: 268_711_870_000,
      regen: 5.6346007e13,
    };
    const migrated = migrateProgressSave(topFiveSave, 4);
    expect(migrated.damage).toBeLessThan(topFiveSave.damage);
    expect(migrated.maxHp / topFiveSave.maxHp).toBeCloseTo(migrated.damage / topFiveSave.damage, 10);
    expect(migrateProgressSave(topFiveSave, ATTACK_BALANCE_VERSION)).toMatchObject(topFiveSave);
    expect(migrateProgressSave({ ...pending, damage: 1_000_000 }, 4)).toEqual(copyProgress(compressLegacyMapPower({ ...pending, damage: 1_000_000 })));
  });

  it("corrects a version-5 pending save to the current-equipment Water anchor", () => {
    const v5Save = {
      ...pending,
      maxHp: 3_238_349.2,
      damage: 1_470_681.5,
      attackRate: .3809524,
      armor: 169.83337,
      regen: 35_612.242,
    };
    const migrated = migrateProgressSave(v5Save, 5);
    expect(migrated).toEqual(copyProgress(compressLegacyMapPower(correctLegacyTopFiveV5Progression(v5Save))));
    expect(migrated.maxHp / v5Save.maxHp).toBeCloseTo(migrated.damage / v5Save.damage, 6);
    expect(migrateProgressSave(v5Save, ATTACK_BALANCE_VERSION)).toMatchObject(v5Save);
  });

  it("converts a version-6 queued save once and keeps new earnings on subsequent reads", () => {
    const storage = memoryStorage();
    const old = { ...pending, damage: 1e10, maxHp: 2e10, armor: 1e7, regen: 1e8 };
    storage.setItem("pending/player-1", JSON.stringify({ identity: "player-1", balanceVersion: 6, progress: old }));
    const store = createProgressStore(storage, "pending");
    const migrated = store.read("player-1")!;
    expect(migrated).toEqual(copyProgress(compressLegacyMapPower(old)));
    expect(migrated.damage).toBeLessThan(old.damage / 100);
    expect(store.read("player-1")).toEqual(migrated);
    const earned = { ...migrated, damage: migrated.damage + 1000 };
    store.write("player-1", earned);
    expect(store.read("player-1")).toEqual(earned);
  });

  it("moves a legacy identity-scoped save into current storage", () => {
    const storage = memoryStorage();
    storage.setItem("pending", JSON.stringify({ identity: "player-1", balanceVersion: ATTACK_BALANCE_VERSION, progress: pending }));
    const store = createProgressStore(storage, "pending");
    expect(store.read("player-1")).toEqual(pending);
    expect(storage.getItem("pending")).toBeNull();
    expect(storage.getItem("pending/player-1")).not.toBeNull();
  });

  it("migrates pending saves created before cosmetic slots existed", () => {
    const storage = memoryStorage();
    const legacy = { ...pending } as Partial<ProgressSave>;
    delete legacy.cosmeticHead;
    delete legacy.cosmeticChest;
    delete legacy.cosmeticFeet;
    delete legacy.cosmeticRightHand;
    delete legacy.cosmeticLeftHand;
    storage.setItem("pending/player-1", JSON.stringify({ identity: "player-1", balanceVersion: ATTACK_BALANCE_VERSION, progress: legacy }));
    expect(createProgressStore(storage, "pending").read("player-1")).toMatchObject({
      cosmeticHead: "",
      cosmeticChest: "",
      cosmeticFeet: "",
      cosmeticRightHand: "",
      cosmeticLeftHand: "",
    });
  });

  it("merges only monotonic gains and verifies save acknowledgement", () => {
    const merged = mergeProgress({ ...saved, damage: 10, bootsCollected: false }, pending);
    expect(merged.damage).toBe(20);
    expect(merged.bootsCollected).toBe(true);
    expect(progressCovers(merged, pending)).toBe(true);
    expect(progressCovers({ ...merged, inventoryJson: "[]" }, pending)).toBe(false);
    expect(progressCovers({ ...merged, cosmeticHead: "different" }, pending)).toBe(false);
  });

  it("preserves the server-owned Samurai Garden unlock while merging local gains", () => {
    expect(mergeProgress({ ...saved, samuraiUnlocked: true }, pending).samuraiUnlocked).toBe(true);
  });

  it("preserves the server-owned Cloudspire unlock while merging local gains", () => {
    expect(mergeProgress({ ...saved, cloudspireUnlocked: true }, pending).cloudspireUnlocked).toBe(true);
  });

  it("acknowledges a server-owned movement override without resaving forever", () => {
    const customSpeed = { ...pending, speed: 262.5 };
    expect(progressCovers({ ...saved, speed: 205, speedOverride: 262.5 }, customSpeed)).toBe(true);
  });
});
