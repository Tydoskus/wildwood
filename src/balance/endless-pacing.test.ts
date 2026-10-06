import { describe, expect, it } from "vitest";
import { bossHitsToDefeat } from "../../shared/boss-regeneration";
import { generatedBossStats } from "../../shared/procedural-maps";
import { BOSS_TARGET_SECONDS } from "../../shared/progression";
import { MIN_ATTACK_INTERVAL } from "../../shared/rules";
import { endlessPacing } from "./endless-pacing";

describe("Endless advancement effort", () => {
  it("requires more damage farming at every depth after the campaign handoff", () => {
    let previous = endlessPacing(2);
    for (let number = 3; number <= 1000; number++) {
      const next = endlessPacing(number);
      expect(next.extraDamage, `Endless ${number}`).toBeGreaterThan(previous.extraDamage);
      expect(next.damageKills, `Endless ${number}`).toBeGreaterThan(previous.damageKills);
      previous = next;
    }
  });
  it("slows dramatically even for a fixed max-speed damage farming build", () => {
    expect(endlessPacing(10).damageKills).toBeGreaterThan(endlessPacing(2).damageKills * 5);
    expect(endlessPacing(20).damageKills).toBeGreaterThan(endlessPacing(10).damageKills * 3);
    expect(endlessPacing(40).damageKills).toBeGreaterThan(endlessPacing(20).damageKills * 4);
  });
  it("uses the actual boss regeneration and carries forward the previous build without a boss payout", () => {
    for (const number of [1, 2, 10, 40]) {
      const row = endlessPacing(number);
      expect(row.extraDamage).toBeGreaterThan(0);
      const seconds = (bossHitsToDefeat(generatedBossStats({ number }).hp, row.targetDamage * (1 + 1e-12), MIN_ATTACK_INTERVAL) - 1) * MIN_ATTACK_INTERVAL;
      expect(seconds).toBeLessThanOrEqual(BOSS_TARGET_SECONDS);
      expect(seconds).toBeGreaterThan(BOSS_TARGET_SECONDS - MIN_ATTACK_INTERVAL * 2);
    }
  });
});
