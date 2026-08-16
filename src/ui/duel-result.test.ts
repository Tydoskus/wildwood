import { describe, expect, it } from "vitest";
import { duelResultStatLines } from "./duel-result";

describe("duel result stats", () => {
  it("uses compact game-number formatting for every overview value", () => {
    expect(duelResultStatLines({
      attacks: 12_500,
      damage: 3_150_000_000,
      regen: 2_280_000_000,
      blocked: 14_000,
    })).toEqual([
      "ATTACKED 12.5k TIMES",
      "DID 3.15b DMG",
      "REGENERATED 2.28b HP",
      "BLOCKED 14.0k DMG",
    ]);
  });
});
