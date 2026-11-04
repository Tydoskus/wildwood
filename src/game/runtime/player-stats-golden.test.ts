import { describe, expect, it } from "vitest";
import { cardTotals } from "../../../shared/card-effects";
import { equipmentDamage, itemDefinition } from "../../../shared/items";
import { effectivePlayerPowerStats, type PlayerPowerStats } from "../../../shared/player-power";
import { prestigePerkValue } from "../../../shared/prestige-perks";
import { playerBaseMovementSpeed } from "../../../shared/rules";
import { withSoulStats } from "../../../shared/soul-dimension";
import { weaponAttackInterval } from "../../../shared/staff-skills";
import type { Identity } from "spacetimedb";
import { masteryAttackRange, masteryInPlay, masteryLevel, type WeaponSchool } from "../../../shared/weapon-mastery";
import { weaponHitFactor } from "../../../shared/staff-skills";
import { remoteCombatStatsFromRows } from "../../coop/services/remote-combat-stats-service";
import type { PlayerProfileData, PlayerProgress } from "../../coop/contracts";
import { profilePower, profileStatDisplayRows } from "../../ui/profile";
import { formatArmorReduction } from "../combat";
import { procChance, skillChanceFactor, weaponAttackRange } from "../../../shared/player-stats";
import { createFarmEvaluator } from "./auto-farm/auto-farm-build";
import { applyPlayerMaxHealthMultiplierBonus } from "./player-health";
import { createResearchController } from "./research-controller";
import { createRewardDisplay } from "./reward-display";
import { createPlayerStatsRuntime, type PlayerStatsSource } from "./player-stats-runtime";
import { fixtureAttackCap, fixtureCardIds, fixtureCardStats, fixtureItemLevel, STAT_FIXTURES, type StatFixture } from "../../../tests/helpers/player-stats-fixture";
import type { PlayerState } from "./types";
import { attackIntervalWithGear } from "../../../shared/stat-rating";

// Golden numbers for every client path that works out the player's final stats.
// They pin today's results, so moving a path onto shared/player-stats.ts cannot change one silently.

/** Ten significant digits: real changes show, last-bit float order does not. */
const pin = (value: number) => Number(value.toPrecision(10));
const pinAll = <T extends Record<string, number>>(values: T) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, pin(value)])) as T;

const inventoryOf = (fixture: StatFixture) => ({
  equippedHead: fixture.loadout.head, equippedChest: fixture.loadout.chest, equippedFeet: fixture.loadout.feet,
  equippedRightHand: fixture.loadout.rightHand, equippedLeftHand: fixture.loadout.leftHand,
});

/** The live player as the progress controller loads it: the saved run with the soul's share added. */
function worldPlayer(fixture: StatFixture) {
  const cap = fixtureAttackCap(fixture);
  const run = withSoulStats(fixture.saved, fixture.soul, cap);
  const masteryRange = masteryAttackRange(masteryInPlay(fixture.mastery, fixture.loadout.rightHand, fixture.loadout.rightHand || fixture.loadout.leftHand));
  return {
    hp: 1, baseMaxHp: run.maxHp, maxHp: run.maxHp, damage: run.damage, armor: run.armor, regen: run.regen, attackRate: run.attackRate,
    critRating: fixture.saved.critRating, speed: playerBaseMovementSpeed(false, fixture.saved.speedOverride),
    // progress-controller.ts addedRange: Long Shot cards and Archery on top of the saved range.
    attackRange: fixture.saved.attackRange + fixtureCardStats(fixture).range + masteryRange,
  } as PlayerState;
}

/** The coop session's bonuses in play, as player-stats-runtime.ts reads them. */
const sourceOf = (fixture: StatFixture): PlayerStatsSource => ({
  itemLevel: fixtureItemLevel(fixture), researchInPlay: () => fixture.research, prestigePerks: () => fixture.perks,
  activeCardTotals: () => cardTotals(fixtureCardIds(fixture)), attackCapInPlay: () => fixtureAttackCap(fixture),
  prestige: () => ({ level: fixture.prestigeLevel }), weeklyQuests: () => ({ bonus: fixture.guildBonus }),
});

/** The world's numbers, wired as main.ts and player-combat-controller.ts wire them. */
function worldStats(fixture: StatFixture) {
  const player = worldPlayer(fixture), itemLevel = fixtureItemLevel(fixture);
  const worn = cardTotals(fixtureCardIds(fixture));
  const { head, chest, feet, rightHand } = fixture.loadout;
  const live = createPlayerStatsRuntime({ player, inventory: inventoryOf(fixture), source: () => sourceOf(fixture), soul: () => fixture.soul });
  const research = createResearchController({
    player, getRanks: () => fixture.research, isDueling: () => false, maxPlayerStat: 1e300, saveProgress: () => {},
    healthMultiplierBonus: live.healthMultiplierBonus, prestigeLevel: () => fixture.prestigeLevel, guildQuestBonus: () => fixture.guildBonus,
    prestigePerks: () => fixture.perks, cards: () => fixtureCardStats(fixture), equippedFeet: () => feet, equippedWeapon: () => rightHand, itemLevel,
  });
  applyPlayerMaxHealthMultiplierBonus(player, live.healthMultiplierBonus());
  return pinAll({
    maxHp: player.maxHp,
    damage: equipmentDamage(player.damage, rightHand, head, chest, research.damageMultiplier(), itemLevel(rightHand), itemLevel(head), itemLevel(chest)),
    armor: research.effectiveArmor(),
    regen: live.regenerationPerSecond(),
    moveSpeed: live.moveSpeed(),
    // As player-combat-controller.ts fires: the run's interval with the weapon's rating.
    attackInterval: attackIntervalWithGear(player.attackRate, research.weaponRatings().speed, fixtureAttackCap(fixture)),
    weaponInterval: weaponAttackInterval(rightHand, attackIntervalWithGear(player.attackRate, research.weaponRatings().speed, fixtureAttackCap(fixture))),
    range: weaponAttackRange(rightHand, player.attackRange),
    critChance: research.criticalChance(),
    critMultiplier: research.criticalDamageMultiplier(fixture.soul?.critDamage ?? 0),
    reflectChance: procChance(prestigePerkValue(fixture.perks, "riposte"), worn, "reflect"),
    doubleStrikeChance: procChance(prestigePerkValue(fixture.perks, "doubleStrike"), worn, "doubleStrike"),
    splitShotChance: procChance(prestigePerkValue(fixture.perks, "splitShot"), worn, "splitShot"),
    skillChanceFactor: skillChanceFactor(head, chest, feet, itemLevel(feet)),
    statGain: research.rewardMultiplier(),
  });
}

/** Mastery levels by school, as profiles and player_mastery_level hold them. */
const masteryLevels = (fixture: StatFixture) => Object.fromEntries(Object.entries(fixture.mastery)
  .map(([school, points]) => [school, masteryLevel(points ?? 0)])) as Partial<Record<WeaponSchool, number>>;

/** The fixture as the server sends the player's own profile. */
function profileOf(fixture: StatFixture): PlayerProfileData {
  const { head, chest, feet, rightHand, leftHand } = fixture.loadout;
  return {
    identity: "golden", name: "Golden", gender: 0, research: fixture.research, itemUpgradeLevels: { ...fixture.slotTiers }, itemRefines: fixture.refines,
    activeCards: fixture.cards, prestigePerks: fixture.perks, prestigeLevel: fixture.prestigeLevel, soulStats: fixture.soul,
    mastery: masteryLevels(fixture), bonusOff: [],
    progress: { ...fixture.saved, equippedHead: head, equippedChest: chest, equippedFeet: feet, equippedRightHand: rightHand, equippedLeftHand: leftHand } as unknown as PlayerProgress,
  } satisfies Partial<PlayerProfileData> as unknown as PlayerProfileData;
}

/** The profile Stats tab's rows for one's own profile, as main.ts renderStats passes them. */
function profileRows(fixture: StatFixture) {
  return profileStatDisplayRows(profileOf(fixture), formatArmorReduction, fixtureAttackCap(fixture), fixture.research, fixture.prestigeLevel,
    fixture.perks, fixture.guildBonus, fixture.soul).map(({ kind, base, multiplier, total, equationTotal, expandedDetail, sources }) =>
    [kind, `${base} ${multiplier} = ${total}${equationTotal ? ` (${equationTotal})` : ""}${expandedDetail ? ` ${expandedDetail}` : ""}`,
      sources.map(source => `${source.label} ${source.value}`).join(", ")].join(" | "));
}

/** Auto-farm's evaluator, fed as main.ts feeds it (createAutoFarmProgress). */
function autoFarmStats(fixture: StatFixture) {
  const player = worldPlayer(fixture), itemLevel = fixtureItemLevel(fixture);
  const research = createResearchController({ player, getRanks: () => fixture.research, isDueling: () => false, maxPlayerStat: 1e300, saveProgress: () => {},
    prestigePerks: () => fixture.perks, cards: () => fixtureCardStats(fixture), equippedWeapon: () => fixture.loadout.rightHand, itemLevel });
  const evaluator = createFarmEvaluator({
    base: () => ({ maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen }),
    equipment: () => inventoryOf(fixture), research: () => fixture.research, upgradeLevel: itemLevel, rewardMultiplier: () => 1,
    cards: () => cardTotals(fixtureCardIds(fixture)),
    minAttackInterval: () => fixtureAttackCap(fixture), criticalChance: research.criticalChance,
    criticalMultiplier: (extra = 0) => research.criticalDamageMultiplier(fixture.soul?.critDamage ?? 0, (player.critRating ?? 0) + extra),
  });
  const { stats, power } = evaluator.evaluate() as { stats: PlayerPowerStats; power: number };
  return pinAll({ maxHp: stats.maxHp, damage: stats.damage, armor: stats.armor, regen: stats.regen, attackRate: stats.attackRate, power, dps: evaluator.dps() });
}

/** Another player fighting on your screen, from their public rows (remote-combat-stats-service.ts). */
function remoteStats(fixture: StatFixture) {
  const who = {} as Identity, { head, chest, feet, rightHand, leftHand } = fixture.loadout;
  const progress = { ...fixture.saved, identity: who, projectileSpeed: 390, projectileCount: 1, equippedHead: head, equippedChest: chest,
    equippedFeet: feet, equippedRightHand: rightHand, equippedLeftHand: leftHand };
  const upgrades = Object.entries(fixture.slotTiers).map(([itemId, level]) => ({ identity: who, itemId, level: level ?? 0 }));
  return remoteCombatStatsFromRows(progress, { identity: who, ...fixture.research }, upgrades, {
    refines: Object.entries(fixture.refines).map(([itemId, level]) => ({ itemId, level })), activeCards: fixture.cards, perks: fixture.perks,
    soul: fixture.soul, mastery: masteryLevels(fixture), bonusOff: [],
  });
}

/** The HUD stat tracker and shown power (stat-tracker-source.ts): the core with the cards in play. */
function trackerStats(fixture: StatFixture) {
  const player = worldPlayer(fixture);
  const stats = effectivePlayerPowerStats({ maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen,
    ...inventoryOf(fixture), activeCards: fixtureCardIds(fixture) }, fixture.research, fixtureItemLevel(fixture));
  return pinAll({ maxHp: stats.maxHp, damage: stats.damage, armor: stats.armor, regen: stats.regen });
}

/** The popup a base reward of 1 shows for each stat (reward-display.ts). */
function rewardPopups(fixture: StatFixture) {
  const player = worldPlayer(fixture);
  const research = createResearchController({ player, getRanks: () => fixture.research, isDueling: () => false, maxPlayerStat: 1e300, saveProgress: () => {},
    prestigeLevel: () => fixture.prestigeLevel, guildQuestBonus: () => fixture.guildBonus });
  const display = createRewardDisplay(research.rewardMultiplier, () => fixture.research, () => false, () => inventoryOf(fixture), fixtureItemLevel(fixture),
    () => fixtureCardIds(fixture));
  return pinAll({ damage: display.totalAmount("damage", 1), health: display.totalAmount("health", 1), armor: display.totalAmount("armor", 1),
    regen: display.totalAmount("regen", 1), speed: display.totalAmount("speed", 1) });
}

describe("player stat golden fixtures", () => {
  it("wear real items", () => {
    for (const fixture of STAT_FIXTURES) for (const item of Object.values(fixture.loadout)) if (item) expect(itemDefinition(item), item).toBeDefined();
  });

  it("fresh player", () => {
    const [fixture] = STAT_FIXTURES;
    expect(worldStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 0,
        "attackInterval": 1.56,
        "critChance": 0.1,
        "critMultiplier": 1.05,
        "damage": 3.15,
        "doubleStrikeChance": 0,
        "maxHp": 100,
        "moveSpeed": 250,
        "range": 250,
        "reflectChance": 0,
        "regen": 0.2,
        "skillChanceFactor": 1,
        "splitShotChance": 0,
        "statGain": 1,
        "weaponInterval": 1.356521739,
      }
    `);
    expect(profileRows(fixture)).toMatchInlineSnapshot(`
      [
        "health | 100 1.00 = 100 | ",
        "damage | 3 1.05 = 3 | Equipment ×1.05",
        "armor | 0 1.00 = 0 (0% Block) | ",
        "attack | 0.64/s 1.15 = 0.74/s (0.74/s) 3.00/s Cap | Equipment +15% (Bow)",
        "range | 250 1.00 = 250 | ",
        "regen | 0.20/s 1.00 = 0.20/s | ",
        "speed | 250 1.00 = 250 | ",
        "stat-gain | 1.00 1.00 = ×1 | ",
        "critical | 0% 10% = 10% | Equipment +10% (Bow)",
        "critical-damage | 1.05× 0.00× = 1.05× (1.05×) 5× Cap | ",
      ]
    `);
    expect(profilePower(profileOf(fixture), fixture.soul)).toMatchInlineSnapshot(`105`);
    expect(autoFarmStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 0,
        "attackRate": 1.56,
        "damage": 3.15,
        "dps": 2.029326923,
        "maxHp": 100,
        "power": 105.16575,
        "regen": 0.2,
      }
    `);
    expect(trackerStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 0,
        "damage": 3.15,
        "maxHp": 100,
        "regen": 0.2,
      }
    `);
    expect(rewardPopups(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 1,
        "damage": 1.05,
        "health": 1,
        "regen": 1,
        "speed": 1,
      }
    `);
  });

  it("mid-campaign: graded gear, slot tiers, refines, research, cards, Warrior Boots", () => {
    const fixture = STAT_FIXTURES[1];
    expect(worldStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 300.2486256,
        "attackInterval": 0.3333333333,
        "critChance": 0.14,
        "critMultiplier": 5,
        "damage": 4084.337326,
        "doubleStrikeChance": 0,
        "maxHp": 25754.3664,
        "moveSpeed": 301.04,
        "range": 274,
        "reflectChance": 0.015,
        "regen": 55.91025,
        "skillChanceFactor": 1,
        "splitShotChance": 0,
        "statGain": 1.1,
        "weaponInterval": 0.2898550725,
      }
    `);
    expect(profileRows(fixture)).toMatchInlineSnapshot(`
      [
        "health | 4,200 6.13 = 25,754 | Tech ×1.16, Equipment ×4.06, Slot Upgrade ×1.3",
        "damage | 380 10.75 = 4,084 | Tech ×1.2, Equipment ×4.83, Slot Upgrade ×1.38, Refine ×1.25, Class Set ×1.05, Cards ×1.02",
        "armor | 45 6.67 = 300 (36.9% Block) | Tech ×1.12, Boots ×5.78, Cards ×1.03",
        "attack | 3.00/s (Max) 1.15 = 3.45/s (3.45/s) 3.00/s Cap | Equipment +1.57/s, Equipment +15% (Bow)",
        "range | 250 1.10 = 274 | Tech +20 range, Mastery +4 range",
        "regen | 9.00/s 6.21 = 55.9/s | Tech ×1.1, Equipment ×4.06, Slot Upgrade ×1.24, Refine ×1.12",
        "speed | 250 1.20 = 301 | Tech +10%, Tech +9 speed, Armor +6%",
        "stat-gain | 1.10 1.00 = ×1.1 | Tech ×1.1",
        "critical | 0% 14% = 14% | Tech +4%, Equipment +10% (Bow)",
        "critical-damage | 1.05× 3.95× = 5.00× (Max) (5.00×) 5× Cap | Tech +0.07×, Equipment +4.89×",
        "riposte | 0% 1.5% = 1.5% (Reflects 100% of each hit before armor, up to half your max health; no cap in Reflect Only; half in duels) | Cards +1.5%",
      ]
    `);
    expect(profilePower(profileOf(fixture), fixture.soul)).toMatchInlineSnapshot(`57033`);
    expect(autoFarmStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 300.2486256,
        "attackRate": 0.3333333333,
        "damage": 4084.337326,
        "dps": 19114.69868,
        "maxHp": 25754.3664,
        "power": 57033.14472,
        "regen": 55.91025,
      }
    `);
    expect(trackerStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 300.2486256,
        "damage": 4084.337326,
        "maxHp": 25754.3664,
        "regen": 55.91025,
      }
    `);
    expect(rewardPopups(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 7.339410848,
        "damage": 11.82308173,
        "health": 6.7451912,
        "regen": 6.833475,
        "speed": 1.1,
      }
    `);
  });

  it("endgame prestige: soul stats, perks, mastery, class set, Black Boots, guild bonus", () => {
    const fixture = STAT_FIXTURES[2];
    expect(worldStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 5259.48,
        "attackInterval": 0.2941176471,
        "critChance": 0.47,
        "critMultiplier": 8,
        "damage": 296176787.3,
        "doubleStrikeChance": 0.08,
        "maxHp": 1945705662,
        "moveSpeed": 441.91,
        "range": 138,
        "reflectChance": 0.24,
        "regen": 530376.9489,
        "skillChanceFactor": 1,
        "splitShotChance": 0.08,
        "statGain": 2.576,
        "weaponInterval": 0.2941176471,
      }
    `);
    expect(profileRows(fixture)).toMatchInlineSnapshot(`
      [
        "health | 2.50m 777.82 = 1.95b | Soul +1,500, Tech ×2.1, Equipment ×51.19, Slot Upgrade ×3.27, Refine ×2.29, Cards ×0.96",
        "damage | 180,400 1641.78 = 296m | Soul +400, Tech ×2.2, Equipment ×76.28, Slot Upgrade ×3.37, Refine ×2.49, Class Set ×1.05, Cards ×1.11",
        "armor | 2,460 2.14 = 5,259 (57.7% Block) | Soul +60, Tech ×2, Cards ×1.07",
        "attack | 3.40/s (Max) 1.00 = 3.40/s (Max) (3.40/s) 3.40/s Cap | Soul +0.000/s, Equipment +1.18/s",
        "range | 75 1.84 = 138 | Tech +50 range, Prestige +10 range, Cards +3 range",
        "regen | 912/s 581.55 = 530k/s | Soul +12.0/s, Tech ×1.9, Equipment ×51.19, Slot Upgrade ×3.16, Refine ×1.99, Cards ×0.95",
        "speed | 250 1.77 = 442 | Tech +50%, Tech +15 speed, Prestige +6%, Cards +0.9%, Boots +25 speed",
        "stat-gain | 1.40 1.84 = ×2.58 | Tech ×1.4, Prestige ×1.6, Guild ×1.15",
        "critical | 0% 47% = 47% | Tech +20%, Prestige +25%, Cards +2%",
        "critical-damage | 1.05× 6.95× = 8.00× (Max) (8.00×) 8× Cap | Tech +0.00×, Prestige +0.00×, Soul +0.09×, Equipment +8.95×",
        "double-strike | 0% 8% = 8% (Chance a hit lands twice) | Prestige +8%",
        "split-shot | 0% 8% = 8% (Chance to strike a second enemy) | Prestige +8%",
        "riposte | 0% 24% = 24% (Reflects 100% of each hit before armor, up to half your max health; no cap in Reflect Only; half in duels) | Prestige +24%",
      ]
    `);
    expect(profilePower(profileOf(fixture), fixture.soul)).toMatchInlineSnapshot(`8690279216`);
    expect(autoFarmStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 5259.48,
        "attackRate": 0.2941176471,
        "damage": 296176787.3,
        "dps": 4320034619,
        "maxHp": 1945705662,
        "power": 8690279216,
        "regen": 530376.9489,
      }
    `);
    expect(trackerStats(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 5259.48,
        "damage": 296176787.3,
        "maxHp": 1945705662,
        "regen": 530376.9489,
      }
    `);
    expect(rewardPopups(fixture)).toMatchInlineSnapshot(`
      {
        "armor": 5.507488,
        "damage": 4229.220643,
        "health": 2003.652922,
        "regen": 1498.082259,
        "speed": 2.576,
      }
    `);
  });
});

describe("shared/player-stats.ts against the golden numbers", () => {
  it("gives the world's numbers for every fixture", () => {
    for (const fixture of STAT_FIXTURES) {
      const live = createPlayerStatsRuntime({ player: worldPlayer(fixture), inventory: inventoryOf(fixture), source: () => sourceOf(fixture), soul: () => fixture.soul });
      const stats = live.stats();
      expect(pinAll({
        maxHp: stats.maxHp, damage: stats.damage, armor: stats.armor, regen: stats.regenPerSecond, moveSpeed: stats.moveSpeed,
        attackInterval: stats.attackInterval, weaponInterval: stats.weaponInterval, range: stats.range, critChance: stats.critChance,
        critMultiplier: stats.critMultiplier, reflectChance: stats.reflectChance, doubleStrikeChance: stats.doubleStrikeChance,
        splitShotChance: stats.splitShotChance, skillChanceFactor: stats.skillChanceFactor, statGain: stats.statGain,
      }), fixture.name).toEqual(worldStats(fixture));
      expect(pin(stats.multipliers.maxHp - 1), fixture.name).toBe(pin(live.healthMultiplierBonus()));
    }
  });
});

// Every stat path agrees with the world.
describe("every path agrees with the world", () => {
  const [, mid, endgame] = STAT_FIXTURES;
  const rowsOf = (fixture: StatFixture) => profileStatDisplayRows(profileOf(fixture), formatArmorReduction, fixtureAttackCap(fixture), fixture.research,
    fixture.prestigeLevel, fixture.perks, fixture.guildBonus, fixture.soul);
  const rowTotal = (fixture: StatFixture, kind: string) => Number(rowsOf(fixture).find(row => row.kind === kind)!.total.replace(/,/g, ""));

  it("1: Auto Farm prices kills with the active cards, as the shown power does", () => {
    for (const fixture of STAT_FIXTURES) {
      const farm = autoFarmStats(fixture), tracker = trackerStats(fixture);
      expect({ maxHp: farm.maxHp, damage: farm.damage, armor: farm.armor, regen: farm.regen }, fixture.name).toEqual(tracker);
      expect(farm.armor, fixture.name).toBe(worldStats(fixture).armor);
    }
  });

  it("2: profile power is the power Auto Farm and the server count", () => {
    for (const fixture of STAT_FIXTURES) expect(profilePower(profileOf(fixture), fixture.soul), fixture.name).toBe(Math.round(autoFarmStats(fixture).power));
  });

  it("2: another player's profile counts their research and perks in play", () => {
    const profile = { ...profileOf(endgame), bonusOff: ["research.warcraft", "prestige.keenEdge"] };
    const off = { ...profileOf(endgame), research: { ...endgame.research, warcraft: 0 }, prestigePerks: { ...endgame.perks, keenEdge: 0 } };
    expect(profilePower(profile, endgame.soul)).toBe(profilePower(off, endgame.soul));
    expect(profilePower(profile, endgame.soul)).toBeLessThan(profilePower(profileOf(endgame), endgame.soul));
  });

  it("3: other players fight on your screen with the world's numbers", () => {
    for (const fixture of STAT_FIXTURES) {
      const world = worldStats(fixture), remote = remoteStats(fixture);
      expect(pinAll({ damage: remote.damage, maxHp: remote.maxHp, armor: remote.armor, regen: remote.regen, attackInterval: remote.attackInterval,
        attackRange: remote.attackRange, criticalChance: remote.criticalChance, criticalDamageMultiplier: remote.criticalDamageMultiplier }), fixture.name).toEqual({
        damage: pin(world.damage * weaponHitFactor(fixture.loadout.rightHand)), maxHp: world.maxHp, armor: world.armor, regen: world.regen,
        attackInterval: world.weaponInterval, attackRange: world.range, criticalChance: world.critChance, criticalDamageMultiplier: world.critMultiplier,
      });
    }
  });

  it("5: armor reward popups count Warrior Boots", () => {
    const world = worldStats(mid);
    // What one base armor adds in the world, against what the popup says it adds.
    expect(rewardPopups(mid).armor / world.statGain).toBeCloseTo(world.armor / worldPlayer(mid).armor, 9);
  });

  it("6: the profile's Move Speed counts Black Boots, and its Range Long Shot cards and Archery", () => {
    for (const fixture of STAT_FIXTURES) {
      expect(rowTotal(fixture, "speed"), fixture.name).toBe(Math.round(worldStats(fixture).moveSpeed));
      expect(rowTotal(fixture, "range"), fixture.name).toBe(Math.round(worldStats(fixture).range));
    }
  });
});
