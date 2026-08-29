import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyResearchRanks } from "../../shared/research";
import { FIRE_METAL_HELMET, FROST_ARMOR, FROST_BOW, STARTER_BOW, WOOD_FULL_HELM, WOODEN_ARMOR } from "../../shared/items";
import { MIN_ATTACK_INTERVAL } from "../../shared/rules";
import type { PlayerProgress } from "../wildwood-coop";
import { effectiveProfileStats, profilePresenceText, profileStatDisplayRows } from "./profile";

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
  speedOverride: 0,
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
  infernalUnlocked: false,
  waterUnlocked: false,
  samuraiUnlocked: false,
  bowCount: 0,
  woodenArmorCount: 0,
});

describe("profile presence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps online status ahead of any stored timestamp", () => {
    expect(profilePresenceText(true, 0)).toBe("Online");
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
  it("applies Move Speed research to a developer base-speed override", () => {
    const research = { ...createEmptyResearchRanks(), moveSpeed: 15 };
    expect(effectiveProfileStats({ ...progress(), speedOverride: 262.5 }, research).speed).toBeCloseTo(341.25);
  });

  it("ignores cosmetic overrides when calculating stats", () => {
    const cosmeticOnly = { ...progress(), cosmeticRightHand: FROST_BOW, cosmeticChest: FROST_ARMOR };
    const stats = effectiveProfileStats(cosmeticOnly);
    expect(stats.maxHp).toBe(100);
    expect(stats.damage).toBe(20);
    expect(stats.attackRate).toBe(1);
    expect(stats.regen).toBe(2);
  });

  it("adds equipped Bow damage to tech without changing attack speed", () => {
    const research = { ...createEmptyResearchRanks(), warcraft: 10 };
    const stats = effectiveProfileStats(progress(STARTER_BOW), research);
    expect(stats.damage).toBeCloseTo(25);
    expect(stats.attackRate).toBeCloseTo(1);
  });

  it("includes equipped Wooden Armor max-health bonus", () => {
    expect(effectiveProfileStats(progress("", WOODEN_ARMOR)).maxHp).toBeCloseTo(105);
  });

  it("adds the Wood Full Helm health bonus to chest armor", () => {
    const stats = effectiveProfileStats({ ...progress("", FROST_ARMOR), equippedHead: WOOD_FULL_HELM });
    expect(stats.maxHp).toBeCloseTo(152);
    expect(stats.multipliers.healthEquipment).toBeCloseTo(1.52);
  });

  it("shows Frost Bow's additive equipment and tech bonuses", () => {
    const research = { ...createEmptyResearchRanks(), warcraft: 10 };
    const stats = effectiveProfileStats(progress(FROST_BOW), research);
    expect(stats.damage).toBeCloseTo(32);
    expect(stats.attackRate).toBeCloseTo(1);
  });

  it("shows Frost Armor's additive health and regeneration bonuses", () => {
    const research = { ...createEmptyResearchRanks(), regeneration: 10 };
    const stats = effectiveProfileStats(progress("", FROST_ARMOR), research);
    expect(stats.maxHp).toBeCloseTo(140);
    expect(stats.regen).toBeCloseTo(3.2);
    expect(stats.multipliers.regenEquipment).toBeCloseTo(1.4);
    expect(stats.multipliers.regenTotal).toBeCloseTo(1.6);
  });

  it("includes Fire Metal Helmet health and regeneration without adding damage", () => {
    const stats = effectiveProfileStats({ ...progress(FROST_BOW, FROST_ARMOR), equippedHead: FIRE_METAL_HELMET });
    expect(stats.damage).toBeCloseTo(28);
    expect(stats.maxHp).toBeCloseTo(152);
    expect(stats.regen).toBeCloseTo(3.2);
  });

  it("includes completed item upgrade levels in profile stats", () => {
    const bow = effectiveProfileStats(progress(FROST_BOW), createEmptyResearchRanks(), { [FROST_BOW]: 1 });
    expect(bow.damage).toBeCloseTo(28.64);
    expect(bow.attackRate).toBeCloseTo(1);
    const armor = effectiveProfileStats(progress("", FROST_ARMOR), createEmptyResearchRanks(), { [FROST_ARMOR]: 1 });
    expect(armor.maxHp).toBeCloseTo(143.2);
    expect(armor.regen).toBeCloseTo(2.864);
  });
});

describe("profile stat display", () => {
  it("clamps a legacy saved attack rate and places the short max marker beside it", () => {
    const profile = {
      progress: { ...progress(FROST_BOW), attackRate: .32 },
      research: createEmptyResearchRanks(),
      itemUpgradeLevels: {},
    } as Parameters<typeof profileStatDisplayRows>[0];
    const attack = profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL).find((row) => row.kind === "attack");

    expect(attack).toMatchObject({
      base: "2.63/s (Max)",
      equationOperator: "×",
      multiplier: "1.00",
      total: "2.63/s",
      sources: [],
    });
  });

  it("combines all active multipliers and keeps their source breakdown", () => {
    const research = { ...createEmptyResearchRanks(), vitality: 5, warcraft: 4 };
    const profile = {
      progress: progress(FROST_BOW, FROST_ARMOR),
      research,
      itemUpgradeLevels: {},
    } as Parameters<typeof profileStatDisplayRows>[0];
    const rows = profileStatDisplayRows(profile, () => "50%", .1);

    expect(rows[0]).toEqual({
      kind: "health",
      label: "Max Hp:",
      base: "91",
      equationOperator: "×",
      multiplier: "1.54",
      total: "140",
      sources: [
        { label: "Tech", value: "+10%" },
        { label: "Equipment", value: "+40%" },
      ],
    });
    expect(rows[1]).toEqual({
      kind: "damage",
      label: "Damage:",
      base: "20",
      equationOperator: "×",
      multiplier: "1.48",
      total: "30",
      sources: [
        { label: "Tech", value: "+8%" },
        { label: "Equipment", value: "+40%" },
      ],
    });
    expect(rows[2]).toEqual({
      kind: "armor",
      label: "Armor:",
      base: "10",
      equationOperator: "×",
      multiplier: "1.00",
      expandedDetail: "(50% Block)",
      total: "10",
      sources: [],
    });
  });
});
