import { describe, expect, it } from "vitest";
import {
  bossAbilityTimelineAt,
  bossPlayerAttackCycle,
  bossSeededUnit,
  seededBossHazardPolar,
} from "./boss-simulation";

describe("deterministic boss simulation", () => {
  it("returns the same addressable sample for the same encounter", () => {
    expect(bossSeededUnit("gloomroot", 12n, "bloom", 3, 7)).toBe(
      bossSeededUnit("gloomroot", 12n, "bloom", 3, 7),
    );
    expect(bossSeededUnit("gloomroot", 12n, "bloom", 3, 7)).not.toBe(
      bossSeededUnit("gloomroot", 13n, "bloom", 3, 7),
    );
  });

  it("keeps centered hazards centered and seeds the surrounding layout", () => {
    const options = {
      kind: "tidewyrm" as const,
      encounter: 21n,
      pattern: "whirlpool",
      patternIndex: 2,
      hazardCount: 11,
      angleJitter: .25,
      minimumRadius: 70,
      maximumRadius: 290,
      centerFirst: true,
    };
    const center = seededBossHazardPolar({ ...options, hazardIndex: 0 });
    const outer = seededBossHazardPolar({ ...options, hazardIndex: 6 });

    expect(center.radius).toBe(0);
    expect(outer.radius).toBeGreaterThanOrEqual(70);
    expect(outer.radius).toBeLessThanOrEqual(290);
    expect(outer).toEqual(seededBossHazardPolar({ ...options, hazardIndex: 6 }));
  });

  it("recovers the same boss ability and phase without a local timer", () => {
    const options = {
      kind: "frostclaw" as const,
      serverNowMs: 1_800_000_000_000,
    };
    const first = bossAbilityTimelineAt(options);
    const joinedLater = bossAbilityTimelineAt({
      ...options,
      serverNowMs: first.startedAtMs + 725,
    });

    expect(joinedLater).toMatchObject({
      ability: first.ability,
      attackIndex: first.attackIndex,
      elapsedMs: 725,
    });
    expect(bossAbilityTimelineAt(options)).toEqual(first);
  });

  it("uses one hidden metronome for every client", () => {
    const serverNowMs = 1_800_000_000_000;
    const first = bossAbilityTimelineAt({ kind: "tidewyrm", serverNowMs });
    const next = bossAbilityTimelineAt({ kind: "tidewyrm", serverNowMs });

    expect(next).toMatchObject({
      ability: first.ability,
      attackIndex: first.attackIndex,
      startedAtMs: first.startedAtMs,
      elapsedMs: first.elapsedMs,
    });
  });

  it("cycles the Koi Shogun between slash and whirlpool", () => {
    const first = bossAbilityTimelineAt({ kind: "koiShogun", serverNowMs: 0 });
    const second = bossAbilityTimelineAt({ kind: "koiShogun", serverNowMs: first.slotDurationMs });

    expect(first.ability).toBe("slash");
    expect(second.ability).toBe("whirlpool");
  });

  it("shares a player's exact boss attack slot across clients", () => {
    const options = {
      kind: "magmalisk" as const,
      encounter: 14n,
      playerId: "player-a",
      attackInterval: .8,
      serverNowMs: 1_800_000_000_000,
    };
    const first = bossPlayerAttackCycle(options);
    const sameSlot = bossPlayerAttackCycle({
      ...options,
      serverNowMs: first.startedAtMs + 300,
    });
    const nextSlot = bossPlayerAttackCycle({
      ...options,
      serverNowMs: first.startedAtMs + first.intervalMs + 1,
    });

    expect(sameSlot.attackIndex).toBe(first.attackIndex);
    expect(sameSlot.startedAtMs).toBeCloseTo(first.startedAtMs);
    expect(nextSlot.attackIndex).toBe(first.attackIndex + 1);
  });
});
