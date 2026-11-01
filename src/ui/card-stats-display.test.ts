import { describe, expect, it } from "vitest";
import { createEmptyResearchRanks } from "../../shared/research";
import { MIN_ATTACK_INTERVAL, MAX_PLAYER_STAT } from "../../shared/rules";
import { STARTER_BOW, WOODEN_ARMOR } from "../../shared/items";
import { NO_CARDS, cardStatFactors, cardTotals } from "../../shared/card-effects";
import { computePlayerStats } from "../../shared/player-stats";
import { createResearchController } from "../game/runtime/research-controller";
import { profilePower, profileStatDisplayRows } from "./profile";

const WORN = ["ember_raider_card", "mossback_card", "brood_card", "striker_card", "dune_striker_card", "tempest_kirin_card"];

function research(cards?: ReturnType<typeof cardStatFactors>) {
  return createResearchController({
    player: { damage: 1, maxHp: 100, armor: 40, regen: 1, attackRate: 1, speed: 200, critRating: 0 } as any,
    getRanks: () => ({ ...createEmptyResearchRanks(), warcraft: 5, precision: 5, regeneration: 5, criticalChance: 10 }),
    isDueling: () => false, maxPlayerStat: MAX_PLAYER_STAT, saveProgress: () => {}, cards: () => cards,
  });
}

describe("cards in the client's stats", () => {
  it("adds worn cards to damage, armor, regen, crit and move speed, and nothing without them", () => {
    const plain = research(), carded = research(cardStatFactors(cardTotals(WORN)));
    expect(carded.damageMultiplier()).toBeCloseTo(plain.damageMultiplier() * 1.049, 9);
    expect(carded.effectiveArmor()).toBeCloseTo(plain.effectiveArmor() * 1.03, 9);
    expect(carded.criticalChance()).toBeCloseTo(plain.criticalChance() + .01, 9);
    expect(carded.criticalDamageMultiplier(0, 40)).toBeCloseTo(plain.criticalDamageMultiplier(0, 40) * 1.06, 9);
  });

  it("adds worn cards to regen and move speed in the player's final stats", () => {
    const stats = (cards = NO_CARDS) => computePlayerStats({
      base: { maxHp: 100, damage: 1, armor: 40, regen: 1, attackInterval: 1, attackRange: 200, moveSpeed: 200 },
      loadout: { head: "", chest: "", feet: "", rightHand: "", leftHand: "" }, research: { ...createEmptyResearchRanks(), regeneration: 5 }, cards,
    });
    const plain = stats(), carded = stats(cardTotals(WORN));
    expect(carded.regenPerSecond).toBeCloseTo(plain.regenPerSecond * 1.04, 9);
    expect(carded.moveSpeed).toBeCloseTo(plain.moveSpeed * 1.1, 9);
  });
});

describe("cards on the profile", () => {
  const profile = (cards = true) => ({
    progress: { maxHp: 100, damage: 20, attackRate: 1, armor: 10, regen: 2, speed: 190, speedOverride: 0, attackRange: 260, critRating: 0,
      equippedRightHand: STARTER_BOW, equippedChest: WOODEN_ARMOR, equippedHead: "", equippedLeftHand: "" },
    research: createEmptyResearchRanks(), itemUpgradeLevels: {}, itemRefines: {},
    activeCards: cards ? { HAND: ["ember_raider_card"], HEAD: [], CHEST: ["mossback_card"] } : undefined,
  }) as unknown as Parameters<typeof profileStatDisplayRows>[0];

  it("lists what the active cards add, a cost included, and counts them in each total", () => {
    const rows = (withCards: boolean) => profileStatDisplayRows(profile(withCards), () => "0%", MIN_ATTACK_INTERVAL);
    const row = (withCards: boolean, kind: string) => rows(withCards).find(entry => entry.kind === kind)!;
    expect(row(true, "damage").sources).toContainEqual({ label: "Cards", value: "×1.05" });
    expect(row(true, "health").sources).toContainEqual({ label: "Cards", value: "×0.96" });
    expect(row(true, "armor").sources).toContainEqual({ label: "Cards", value: "×1.03" });
    expect(row(false, "damage").sources.some(source => source.label === "Cards")).toBe(false);
    expect(Number(row(true, "armor").multiplier)).toBeCloseTo(1.03, 2);
    expect(profilePower(profile(true))).not.toBe(profilePower(profile(false)));
  });
});
