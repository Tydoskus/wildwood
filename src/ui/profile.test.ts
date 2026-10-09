import { challengeMinimumInterval } from "../../shared/prestige-challenge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyResearchRanks } from "../../shared/research";
import { FIRE_METAL_HELMET, FROST_ARMOR, FROST_BOW, STARTER_BOW, WOOD_FULL_HELM, WOODEN_ARMOR } from "../../shared/items";
import { MIN_ATTACK_INTERVAL } from "../../shared/rules";
import type { PlayerProgress } from "../wildstat-coop";
import { effectiveProfileStats, profilePower, profilePresenceText, profileSoulInPlay, profileStatDisplayRows } from "./profile";

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

  it("shows the flat Utility movement bonus in the profile speed", () => {
    const research = { ...createEmptyResearchRanks(), moveSpeed: 5, utilityMoveSpeed: 5 };
    expect(effectiveProfileStats(progress(), research).speed).toBeCloseTo(progress().speed * 1.1 + 15);
    const profile = { progress: progress(), research, itemUpgradeLevels: {} } as Parameters<typeof profileStatDisplayRows>[0];
    const speed = profileStatDisplayRows(profile, () => "0%", .25).find(row => row.kind === "speed");
    expect(speed?.total).toBe(Math.round(progress().speed * 1.1 + 15).toLocaleString());
    expect(speed?.sources).toContainEqual({ label: "Tech", value: "+15 speed" });
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

  it("includes completed slot upgrade levels in profile stats", () => {
    // Keyed by slot, the way the coop session hands them over. Keyed by item
    // the lookup missed every time and the panel showed bare gear.
    const bow = effectiveProfileStats(progress(FROST_BOW), createEmptyResearchRanks(), { HAND: 1 });
    expect(bow.damage).toBeCloseTo(22.378);
    expect(bow.attackRate).toBeCloseTo(1);
    const armor = effectiveProfileStats(progress("", FROST_ARMOR), createEmptyResearchRanks(), { CHEST: 1 });
    expect(armor.maxHp).toBeCloseTo(111.89);
    expect(armor.regen).toBeCloseTo(2);
  });

  it("reads nothing from a map still keyed by item id", () => {
    const stale = effectiveProfileStats(progress(FROST_BOW), createEmptyResearchRanks(), { [FROST_BOW]: 1 });
    const bare = effectiveProfileStats(progress(FROST_BOW), createEmptyResearchRanks(), {});
    expect(stale.damage).toBeCloseTo(bare.damage);
  });
});

describe("profile stat display", () => {
  it("shows the Utility attack range bonus in the range breakdown", () => {
    const profile = {
      progress: { ...progress(), attackRange: 230 },
      research: { ...createEmptyResearchRanks(), utilityAttackRange: 3 },
      itemUpgradeLevels: {},
    } as Parameters<typeof profileStatDisplayRows>[0];
    const range = profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL).find((row) => row.kind === "range");
    expect(range).toMatchObject({
      base: "200", multiplier: "1.15", total: "230",
      sources: [{ label: "Tech", value: "+30 range" }],
    });
  });

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

  it("names the Attack Speed rating behind the rate on a curve map, with no max marker", async () => {
    const { useSpeedRating } = await import("../game/combat");
    const { attacksPerSecondFromSpeed } = await import("../../shared/attack-speed-rating");
    const profile = {
      progress: { ...progress(FROST_BOW), attackRate: 1 / attacksPerSecondFromSpeed(50) },
      research: createEmptyResearchRanks(),
      itemUpgradeLevels: {},
    } as Parameters<typeof profileStatDisplayRows>[0];
    useSpeedRating(true);
    try {
      expect(profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL).find((row) => row.kind === "attack"))
        .toMatchObject({ base: `${attacksPerSecondFromSpeed(50).toFixed(2)}/s`, expandedDetail: "(50 Attack Speed)" });
    } finally { useSpeedRating(false); }
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
      base: "100",
      equationOperator: "×",
      multiplier: "1.23",
      total: "123",
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
    itemUpgradeLevels: { HEAD: 1 } } as unknown as Parameters<typeof profileStatDisplayRows>[0];
  const row = profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL).find(row => row.kind === "regen");
  // Equipment is the gear alone and the bench's share is listed beside it, so
  // a slot upgrade is visible rather than buried in one number. 8.04 + 0.32
  // is the 8.36 the two used to be shown as together.
  expect(row).toMatchObject({ base: "10.0/s", multiplier: "1.30", total: "13.0/s",
    sources: [
      { label: "Tech", value: "+20%" },
      { label: "Equipment", value: "+8.04%" },
      { label: "Slot Upgrade", value: "+0.32%" },
    ] });
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
      total: "29%", equationOperator: "+", multiplier: "29%",
      sources: [{ label: "Tech", value: "+4%" }, { label: "Prestige", value: "+25%" }],
    });
    expect(rows.find((row) => row.kind === "critical-damage")).toMatchObject({
      total: "1.80×", equationOperator: "+", multiplier: "0.75×",
      sources: [{ label: "Tech", value: "+0.15×" }, { label: "Prestige", value: "+0.60×" }],
    });
  });

  it("gives every spent perk its own line and leaves unspent ones out", () => {
    const rows = profileStatDisplayRows(perkProfile(), () => "0%", MIN_ATTACK_INTERVAL, undefined, 1,
      { doubleStrike: 2, splitShot: 5 });

    expect(rows.map((row) => row.kind)).toContain("double-strike");
    expect(rows.find((row) => row.kind === "double-strike")).toMatchObject({
      label: "Double Strike:", total: "8%", equationOperator: "+", multiplier: "8%", sources: [{ label: "Prestige", value: "+8%" }],
    });
    expect(rows.find((row) => row.kind === "split-shot")).toMatchObject({ label: "Split Shot:", total: "40%" });
    expect(rows.find((row) => row.kind === "riposte")).toBeUndefined();
  });

  it("says what a Riposte rank is worth rather than the chance alone", () => {
    const rows = profileStatDisplayRows(perkProfile(), () => "0%", MIN_ATTACK_INTERVAL, undefined, 1, { riposte: 3 });
    expect(rows.find((row) => row.kind === "riposte"))
      .toMatchObject({ total: "18%", expandedDetail: "(Reflects 100% of each hit before armor, up to your max health; no cap in Reflect Only; half in duels)" });
  });

  it("leaves a profile with no perks exactly as it was", () => {
    const research = { ...createEmptyResearchRanks(), criticalChance: 4 };
    const withoutPerks = profileStatDisplayRows(perkProfile(), () => "0%", MIN_ATTACK_INTERVAL, research);
    expect(withoutPerks.find((row) => row.kind === "critical"))
      .toMatchObject({ total: "4%", sources: [{ label: "Tech", value: "+4%" }] });
    expect(withoutPerks.some((row) => row.kind.startsWith("double"))).toBe(false);
  });
});

describe("stat gain multiplication", () => {
  const gain = (foraging: number, prestige: number) => profileStatDisplayRows({
    progress: progress(), research: { ...createEmptyResearchRanks(), foraging, prosperity: foraging }, itemUpgradeLevels: {},
  } as Parameters<typeof profileStatDisplayRows>[0], () => "0%", MIN_ATTACK_INTERVAL, undefined, prestige).find(r => r.kind === "stat-gain")!;
  it("shows multiplied factors and one consistently rounded result", () => {
    expect(gain(15, 1)).toMatchObject({ base: "1.45", equationOperator: "×", multiplier: "1.10", equationTotal: "1.60×", total: "+60%", hideEquation: false,
      sources: [{ label: "Tech", value: "1.45×" }, { label: "Prestige", value: "1.10×" }] });
    expect(gain(5, 1)).toMatchObject({ equationTotal: "1.27×", total: "+27%" });
  });
  it("omits the equation for one or zero bonuses", () => {
    expect(gain(0, 1)).toMatchObject({ hideEquation: true, sources: [{ label: "Prestige", value: "1.10×" }] });
    expect(gain(0, 0)).toMatchObject({ hideEquation: true, sources: [], total: "+0%" });
  });
});

it("uses a remote profile's prestige bonuses without local-only arguments", () => {
  const remote = { identity: "friend", progress: progress(), research: createEmptyResearchRanks(), itemUpgradeLevels: {},
    prestigeLevel: 3, prestigePerks: { keenEdge: 2 } } as unknown as Parameters<typeof profileStatDisplayRows>[0];
  const implicit = profileStatDisplayRows(remote, () => "0%", MIN_ATTACK_INTERVAL);
  const explicit = profileStatDisplayRows(remote, () => "0%", MIN_ATTACK_INTERVAL, remote.research, 3, { keenEdge: 2 });
  expect(implicit).toEqual(explicit);
  expect(implicit.find(row => row.kind === "stat-gain")?.sources).toContainEqual({ label: "Prestige", value: "1.30×" });
});

it("adds the soul stats in play to each row's base, before the multipliers, and names them as a source", () => {
  const profile = {
    progress: { ...progress(), damage: 100, maxHp: 500, armor: 10, regen: 2 },
    research: { ...createEmptyResearchRanks(), warcraft: 5 },
    itemUpgradeLevels: {},
  } as Parameters<typeof profileStatDisplayRows>[0];
  const plain = profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL);
  const soul = profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL, undefined, 0, null, 1, { damage: 50, maxHp: 200, critDamage: .1 });
  const row = (rows: typeof plain, kind: string) => rows.find(entry => entry.kind === kind)!;
  expect(row(plain, "damage")).toMatchObject({ base: "100", multiplier: "1.10", total: "110" });
  expect(row(soul, "damage")).toMatchObject({ base: "150", multiplier: "1.10", total: "165" });
  expect(row(soul, "damage").sources).toEqual([{ label: "Soul", value: "+50" }, { label: "Tech", value: "+10%" }]);
  expect(row(soul, "health")).toMatchObject({ base: "700", total: "700" });
  expect(row(soul, "critical-damage")).toMatchObject({ total: "1.15×" });
  expect(row(soul, "critical-damage").sources).toContainEqual({ label: "Soul", value: "+0.10×" });
  // None to add: the rows are as they were.
  expect(profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL, undefined, 0, null, 1, null)).toEqual(plain);
});

it("counts soul attack speed up to a Reflect winner's raised cap, and lists only what it adds", () => {
  const profile = {
    progress: { ...progress(), attackRate: MIN_ATTACK_INTERVAL },
    research: createEmptyResearchRanks(), itemUpgradeLevels: {},
  } as Parameters<typeof profileStatDisplayRows>[0];
  const twoWins = challengeMinimumInterval({ active: false, completed: 2 });
  const attack = (cap: number, attackSpeed: number) => profileStatDisplayRows(profile, () => "0%", cap, undefined, 0, null, 1, { attackSpeed })
    .find(row => row.kind === "attack")!;
  // At the base cap already: two wins leave room for the whole half attack a second.
  expect(attack(twoWins, .5)).toMatchObject({ total: `${(1 / MIN_ATTACK_INTERVAL + .5).toFixed(2)}/s` });
  expect(attack(twoWins, .5).sources).toEqual([{ label: "Soul", value: "+0.500/s" }]);
  // More than fits: only what fits, marked Max.
  expect(attack(twoWins, 5).sources).toEqual([{ label: "Soul", value: "+1.000/s (Max)" }]);
  // No room at all under the base cap: said plainly, not as +0.000/s.
  expect(attack(MIN_ATTACK_INTERVAL, .5).sources).toEqual([{ label: "Soul", value: "Already At Max" }]);
});

describe("another player's soul stats", () => {
  // Rendered as main.ts renders someone else's profile: their own row, through profileSoulInPlay.
  const remote = (challenge: { prestige?: boolean; aggro?: boolean } = {}) => ({
    identity: "friend", progress: { ...progress(), damage: 100, maxHp: 500, armor: 10, regen: 2 },
    research: { ...createEmptyResearchRanks(), warcraft: 5 }, itemUpgradeLevels: {},
    prestigeChallenge: { active: challenge.prestige ?? false, completed: 0 }, aggroChallenge: { active: challenge.aggro ?? false, completed: 0 },
    soulStats: { damage: 50, maxHp: 200, armor: 0, regen: 0, attackSpeed: 0, critDamage: .1 },
  }) as unknown as Parameters<typeof profileStatDisplayRows>[0];
  const rows = (profile: ReturnType<typeof remote>) => profileStatDisplayRows(profile, () => "0%", MIN_ATTACK_INTERVAL, profile.research,
    profile.prestigeLevel ?? 0, profile.prestigePerks, 1, profileSoulInPlay(profile));
  const row = (list: ReturnType<typeof rows>, kind: string) => list.find(entry => entry.kind === kind)!;
  const withoutSoul = (profile: ReturnType<typeof remote>) => ({ ...profile, soulStats: null });

  it("counts in each row's base, its Soul source line, crit damage and power", () => {
    const profile = remote(), list = rows(profile);
    expect(row(list, "damage")).toMatchObject({ base: "150", total: "165" });
    expect(row(list, "damage").sources).toContainEqual({ label: "Soul", value: "+50" });
    expect(row(list, "health")).toMatchObject({ base: "700" });
    expect(row(list, "critical-damage").sources).toContainEqual({ label: "Soul", value: "+0.10×" });
    expect(profilePower(profile, profileSoulInPlay(profile))).toBeGreaterThan(profilePower(withoutSoul(profile), profileSoulInPlay(withoutSoul(profile))));
  });

  it.each([["Reflect Only", { prestige: true }], ["Aggro", { aggro: true }]])("counts for nothing while their %s challenge is active, as in combat", (_name, challenge) => {
    const profile = remote(challenge);
    expect(profileSoulInPlay(profile)).toBeNull();
    expect(rows(profile)).toEqual(rows(withoutSoul(profile)));
    expect(row(rows(profile), "damage").sources.some(source => source.label === "Soul")).toBe(false);
    expect(profilePower(profile, profileSoulInPlay(profile))).toBe(profilePower(withoutSoul(profile)));
  });
});
