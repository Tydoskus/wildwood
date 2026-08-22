import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyResearchRanks } from "../../shared/research";
import { FROST_ARMOR, FROST_BOW, STARTER_BOW, WOODEN_ARMOR } from "../../shared/items";
import type { PlayerProgress } from "../wildwood-coop";
import { effectiveProfileStats, profilePresenceText } from "./profile";

const progress = (equippedRightHand = "", equippedChest = ""): PlayerProgress => ({
  maxHp: 100,
  damage: 20,
  attackRate: 1,
  projectileSpeed: 390,
  projectileCount: 1,
  attackRange: 260,
  armor: 10,
  regen: 2,
  speed: 190,
  bootsCollected: false,
  inventoryJson: "[]",
  equippedHead: "",
  equippedChest,
  equippedFeet: "",
  equippedRightHand,
  equippedLeftHand: "",
  cosmeticHead: "",
  cosmeticChest: "",
  cosmeticFeet: "",
  cosmeticRightHand: "",
  cosmeticLeftHand: "",
  introComplete: true,
  desertUnlocked: false,
  snowlandsUnlocked: false,
  lavaUnlocked: false,
  bowCount: 0,
  woodenArmorCount: 0,
});

describe("profile presence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps online status ahead of any stored timestamp", () => {
    expect(profilePresenceText(true, 0)).toBe("ONLINE");
  });

  it("renders a valid offline last-seen timestamp", () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("Aug 18, 7:30 PM");
    expect(profilePresenceText(false, Date.now())).toBe("LAST SEEN AUG 18, 7:30 PM");
  });

  it("uses a placeholder when no timestamp exists", () => {
    expect(profilePresenceText(false, 0)).toBe("LAST SEEN —");
  });
});

describe("effective profile equipment stats", () => {
  it("ignores cosmetic overrides when calculating stats", () => {
    const cosmeticOnly = { ...progress(), cosmeticRightHand: FROST_BOW, cosmeticChest: FROST_ARMOR };
    const stats = effectiveProfileStats(cosmeticOnly);
    expect(stats.maxHp).toBe(100);
    expect(stats.damage).toBe(20);
    expect(stats.attackRate).toBe(1);
    expect(stats.regen).toBe(2);
  });

  it("includes equipped Bow damage and attack-speed bonuses after tech multipliers", () => {
    const research = { ...createEmptyResearchRanks(), warcraft: 10 };
    const stats = effectiveProfileStats(progress(STARTER_BOW), research);
    expect(stats.damage).toBeCloseTo(25);
    expect(stats.attackRate).toBeCloseTo(1 / 1.05);
  });

  it("includes equipped Wooden Armor max-health bonus", () => {
    expect(effectiveProfileStats(progress("", WOODEN_ARMOR)).maxHp).toBeCloseTo(105);
  });

  it("shows Frost Bow's additive equipment and tech multipliers", () => {
    const research = { ...createEmptyResearchRanks(), warcraft: 10 };
    const stats = effectiveProfileStats(progress(FROST_BOW), research);
    expect(stats.damage).toBeCloseTo(64);
    expect(stats.attackRate).toBeCloseTo(1 / 1.2);
  });

  it("shows Frost Armor's health and additive regeneration multipliers", () => {
    const research = { ...createEmptyResearchRanks(), regeneration: 10 };
    const stats = effectiveProfileStats(progress("", FROST_ARMOR), research);
    expect(stats.maxHp).toBeCloseTo(200);
    expect(stats.regen).toBeCloseTo(4.4);
    expect(stats.multipliers.regenEquipment).toBeCloseTo(2);
    expect(stats.multipliers.regenTotal).toBeCloseTo(2.2);
  });

  it("includes completed item upgrade levels in profile stats", () => {
    const bow = effectiveProfileStats(progress(FROST_BOW), createEmptyResearchRanks(), { [FROST_BOW]: 1 });
    expect(bow.damage).toBeCloseTo(64);
    expect(bow.attackRate).toBeCloseTo(1 / 1.4);
    const armor = effectiveProfileStats(progress("", FROST_ARMOR), createEmptyResearchRanks(), { [FROST_ARMOR]: 1 });
    expect(armor.maxHp).toBeCloseTo(220);
    expect(armor.regen).toBeCloseTo(4.4);
  });
});
