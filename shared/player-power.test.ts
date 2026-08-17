import { describe, expect, it } from "vitest";
import { legacyU32Power, playerPowerForStats } from "./player-power";

describe("player power", () => {
  it("continues above the legacy u32 ceiling", () => {
    const power = playerPowerForStats({
      maxHp: 5_000_000_000,
      damage: 2_000_000_000,
      attackRate: 1,
      armor: 1_000_000_000,
      regen: 100_000_000,
    });
    expect(power).toBeGreaterThan(0xffffffff);
    expect(legacyU32Power(power)).toBe(0xffffffff);
  });

  it("bounds malformed totals", () => {
    expect(playerPowerForStats({ maxHp: Number.NaN, damage: 0, attackRate: 1, armor: 0, regen: 0 })).toBe(0);
  });
});
