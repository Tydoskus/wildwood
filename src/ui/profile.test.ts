import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyResearchRanks } from "../../shared/research";
import { FIRE_METAL_HELMET, FROST_ARMOR, FROST_BOW, STARTER_BOW, WOOD_FULL_HELM, WOODEN_ARMOR } from "../../shared/items";
import { MIN_ATTACK_INTERVAL } from "../../shared/rules";
import type { PlayerProgress } from "../wildstat-coop";
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
  cloudspireUnlocked: false,
  moonfenUnlocked: false,
  crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false, duskfallOrchardUnlocked: false, neonBastionUnlocked: false, verdantCatacombsUnlocked: false, ionCitadelUnlocked: false,
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
    expect(stats.damage).toBeCloseTo(25.2);
    expect(stats.attackRate).toBeCloseTo(1);
  });

  it("includes equipped Wooden Armor max-health bonus", () => {
    expect(effectiveProfileStats(progress("", WOODEN_ARMOR)).maxHp).toBeCloseTo(105);
  });

  it("adds helmet regeneration alongside chest health", () => {
    const stats = effectiveProfileStats({ ...progress("", FROST_ARMOR), equippedHead: WOOD_FULL_HELM });
    expect(stats.maxHp).toBeCloseTo(111.43);
    expect(stats.equipment.health).toBeCloseTo(.1143);
  });

  it("shows Frost Bow's percentage scaling with tech", () => {
    const research = { ...createEmptyResearchRanks(), warcraft: 10 };
    const stats = effectiveProfileStats(progress(FROST_BOW), research);
    expect(stats.damage).toBeCloseTo(26.7432);
    expect(stats.attackRate).toBeCloseTo(1);
  });

  it("shows Frost Armor health without adding regeneration", () => {
    const research = { ...createEmptyResearchRanks(), regeneration: 10 };
    const stats = effectiveProfileStats(progress("", FROST_ARMOR), research);
    expect(stats.maxHp).toBeCloseTo(111.43);
    expect(stats.regen).toBeCloseTo(2.4);
    expect(stats.equipment.regen).toBeCloseTo(0);
    expect(stats.multipliers.regenResearch).toBeCloseTo(1.2);
  });

  it("includes Fire Metal Helmet regeneration without adding health or damage", () => {
    const stats = effectiveProfileStats({ ...progress(FROST_BOW, FROST_ARMOR), equippedHead: FIRE_METAL_HELMET });
    expect(stats.damage).toBeCloseTo(22.286);
    expect(stats.maxHp).toBeCloseTo(111.43);
    expect(stats.regen).toBeCloseTo(2.3036);
  });

  it("includes completed item upgrade levels in profile stats", () => {
    const bow = effectiveProfileStats(progress(FROST_BOW), createEmptyResearchRanks(), { [FROST_BOW]: 1 });
    expect(bow.damage).toBeCloseTo(22.378);
    expect(bow.attackRate).toBeCloseTo(1);
    const armor = effectiveProfileStats(progress("", FROST_ARMOR), createEmptyResearchRanks(), { [FROST_ARMOR]: 1 });
    expect(armor.maxHp).toBeCloseTo(111.89);
    expect(armor.regen).toBeCloseTo(2);
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
      multiplier: "1.23",
      total: "111",
      sources: [
        { label: "Tech", value: "+10%" },
        { label: "Equipment", value: "+11.43%" },
      ],
    });
    expect(rows[1]).toEqual({
      kind: "damage",
      label: "Damage:",
      base: "20",
      equationOperator: "×",
      multiplier: "1.20",
      total: "24",
      sources: [
        { label: "Tech", value: "+8%" },
        { label: "Equipment", value: "+11.43%" },
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


it("displays helmet percentages and research as the same calculation used for combat", () => {
  const profile = { progress: { ...progress(), regen: 10, equippedHead: WOOD_FULL_HELM },
    research: { ...createEmptyResearchRanks(), regeneration: 10 },
    itemUpgradeLevels: { [WOOD_FULL_HELM]: 1 } } as unknown as Parameters<typeof profileStatDisplayRows>[0];
  const row = profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL).find(row => row.kind === "regen");
  expect(row).toMatchObject({ base: "10.0/s", multiplier: "1.30", total: "13.0/s",
    sources: [{label: "Tech", value: "+20%"}, {label: "Equipment", value: "+8.36%"}] });
  expect(effectiveProfileStats(profile.progress, profile.research, profile.itemUpgradeLevels).regen).toBeCloseTo(13.0032);
});

describe("prestige perks in the stat panel", () => {
  const perkProfile = () => {
    const profile = { progress: progress(), research: createEmptyResearchRanks(), itemUpgradeLevels: {} };
    return profile as unknown as Parameters<typeof profileStatDisplayRows>[0];
  };

  it("pays Keen Edge into the critical rows beside research, as combat rolls it", () => {
    const research = { ...createEmptyResearchRanks(), criticalChance: 4, criticalDamage: 3 };
    const rows = profileStatDisplayRows(perkProfile(), () => "0%", MIN_ATTACK_INTERVAL, research, 1, { keenEdge: 5 });

    expect(rows.find((row) => row.kind === "critical")).toMatchObject({
      total: "29%",
      sources: [{ label: "Tech", value: "+4%" }, { label: "Prestige", value: "+25%" }],
    });
    expect(rows.find((row) => row.kind === "critical-damage")).toMatchObject({
      total: "1.80×",
      sources: [{ label: "Tech", value: "+0.15×" }, { label: "Prestige", value: "+0.60×" }],
    });
  });

  it("gives every spent perk its own line and leaves unspent ones out", () => {
    const rows = profileStatDisplayRows(perkProfile(), () => "0%", MIN_ATTACK_INTERVAL, undefined, 1,
      { doubleStrike: 2, splitShot: 5 });

    expect(rows.map((row) => row.kind)).toContain("double-strike");
    expect(rows.find((row) => row.kind === "double-strike")).toMatchObject({
      label: "Double Strike:", total: "8%", sources: [{ label: "Prestige", value: "+8%" }],
    });
    expect(rows.find((row) => row.kind === "split-shot")).toMatchObject({ label: "Split Shot:", total: "25%" });
    expect(rows.find((row) => row.kind === "riposte")).toBeUndefined();
  });

  it("says what a Riposte rank is worth rather than the chance alone", () => {
    const rows = profileStatDisplayRows(perkProfile(), () => "0%", MIN_ATTACK_INTERVAL, undefined, 1, { riposte: 3 });
    expect(rows.find((row) => row.kind === "riposte"))
      .toMatchObject({ total: "18%", expandedDetail: "(Reflects 50% of the hit taken)" });
  });

  it("leaves a profile with no perks exactly as it was", () => {
    const research = { ...createEmptyResearchRanks(), criticalChance: 4 };
    const withoutPerks = profileStatDisplayRows(perkProfile(), () => "0%", MIN_ATTACK_INTERVAL, research);
    expect(withoutPerks.find((row) => row.kind === "critical"))
      .toMatchObject({ total: "4%", sources: [{ label: "Tech", value: "+4%" }] });
    expect(withoutPerks.some((row) => row.kind.startsWith("double"))).toBe(false);
  });
});
