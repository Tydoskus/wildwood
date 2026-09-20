import { expect, it } from "vitest";
import {
  PRESTIGE_PERK_IDS, PRESTIGE_PERK_MAX_RANK, PRESTIGE_PERKS, isPrestigePerkId,
  prestigePerkRank, prestigePerkValue, prestigeReachMultiplier, prestigeSwingMultiplier,
} from "../../shared/prestige-perks";

it("names four perks and rejects anything else", () => {
  expect(PRESTIGE_PERK_IDS).toEqual(["keenEdge", "doubleStrike", "splitShot", "riposte"]);
  expect(isPrestigePerkId("keenEdge")).toBe(true);
  expect(isPrestigePerkId("constructor")).toBe(false);
  expect(isPrestigePerkId("nope")).toBe(false);
});

it("clamps ranks to the band and ignores nonsense", () => {
  expect(prestigePerkRank({ keenEdge: 9 }, "keenEdge")).toBe(PRESTIGE_PERK_MAX_RANK);
  expect(prestigePerkRank({ keenEdge: -4 }, "keenEdge")).toBe(0);
  expect(prestigePerkRank({ keenEdge: NaN }, "keenEdge")).toBe(0);
  expect(prestigePerkRank(null, "riposte")).toBe(0);
});

it("scales each perk by its own rate", () => {
  for (const id of PRESTIGE_PERK_IDS) {
    expect(prestigePerkValue({ [id]: 5 }, id)).toBeCloseTo(PRESTIGE_PERKS[id].perRank * 5);
    expect(prestigePerkValue({}, id)).toBe(0);
  }
});

it("separates extra damage on a swing from extra enemies reached", () => {
  expect(prestigeSwingMultiplier({ doubleStrike: 5 })).toBeCloseTo(1.2);
  expect(prestigeSwingMultiplier({ splitShot: 5, riposte: 5 })).toBe(1);
  // Riposte only reflects half a hit, and only sometimes, so it widens the
  // claim bound by its average worth rather than its full chance.
  expect(prestigeReachMultiplier({ splitShot: 5, riposte: 5 })).toBeCloseTo(1.25 + .3 * .5);
  expect(prestigeReachMultiplier({ doubleStrike: 5 })).toBe(1);
  expect(prestigeReachMultiplier(null)).toBe(1);
});
