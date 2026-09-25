import { describe, expect, it } from "vitest";
import { defaultBalanceSettings, resolveMapBalance } from "./map-balance";
import {
  ENDLESS_ENDURANCE_EXPONENT, ENDLESS_ENDURANCE_STEP, ENDLESS_REWARD_MULTIPLIER, ENDLESS_STAT_STEP,
} from "./endless-balance";

/** The Endless curve that has been live since long before the balance bake. */
const LIVE_CURVE = { rewardMultiplier: 2, statStep: .6, enduranceStep: .06, enduranceExponent: 1, rewardPerHealth: 1 };

function resolved(endless: typeof LIVE_CURVE) {
  const settings = defaultBalanceSettings();
  settings.endless = { ...endless };
  return [1, 2, 5, 15, 40].map(number => {
    const map = resolveMapBalance(`endless_${number}`, settings, 1, 2);
    const lane = Object.keys(map.lanes)[0];
    return {
      hp: map.lanes[lane].hp, damage: map.lanes[lane].damage, reward: map.lanes[lane].reward.amount,
      bossHp: map.boss?.hp ?? 0, bossReward: Object.values(map.boss?.rewards ?? {})[0] ?? 0,
    };
  });
}

describe("Endless curve", () => {
  it("keeps the authored reference distinct from the live curve", () => {
    // Folding the live curve into these constants reads tidier and is wrong:
    // enemy damage carries an armour compensation that is not linear in the
    // stat step, so the ratio stops cancelling and Endless damage moves with
    // depth. Module migration 36 reset the curve to these by mistake and 37
    // put it back; this holds them apart so it cannot happen again.
    expect({
      rewardMultiplier: ENDLESS_REWARD_MULTIPLIER, statStep: ENDLESS_STAT_STEP,
      enduranceStep: ENDLESS_ENDURANCE_STEP, enduranceExponent: ENDLESS_ENDURANCE_EXPONENT,
    }).not.toEqual({
      rewardMultiplier: LIVE_CURVE.rewardMultiplier, statStep: LIVE_CURVE.statStep,
      enduranceStep: LIVE_CURVE.enduranceStep, enduranceExponent: LIVE_CURVE.enduranceExponent,
    });
  });

  it("resolves the live curve to different stats than the authored reference", () => {
    const live = resolved(LIVE_CURVE);
    const authored = resolved({
      rewardMultiplier: ENDLESS_REWARD_MULTIPLIER, statStep: ENDLESS_STAT_STEP,
      enduranceStep: ENDLESS_ENDURANCE_STEP, enduranceExponent: ENDLESS_ENDURANCE_EXPONENT,
      rewardPerHealth: 1,
    });
    // Endless 1 sits at depth zero, where every curve agrees. The gap opens
    // with depth, which is what makes a silent reset hard to notice.
    expect(live[0].hp).toBeCloseTo(authored[0].hp, 0);
    expect(live.at(-1)!.reward / authored.at(-1)!.reward).toBeGreaterThan(5);
    expect(live.at(-1)!.hp / authored.at(-1)!.hp).toBeLessThan(.5);
  });

  it("holds the live curve's resolved stats, so a reset cannot move them unnoticed", () => {
    const [first, , , , deepest] = resolved(LIVE_CURVE);
    expect(first.hp).toBeCloseTo(298457265600.00006, 3);
    expect(first.reward).toBeCloseTo(5791700.988475202 * 3 * 4, 6);
    expect(deepest.hp).toBeCloseTo(12161536658668.803, 3);
    expect(deepest.damage).toBeCloseTo(381982783274.0623, 3);
    expect(deepest.bossHp).toBeCloseTo(656722979568115.2, 1);
    expect(deepest.bossReward).toBeCloseTo(36203543.420153916, 6);
  });
});
