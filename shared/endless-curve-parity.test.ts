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

});
