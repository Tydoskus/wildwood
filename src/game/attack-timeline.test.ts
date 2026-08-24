import { describe, expect, it } from "vitest";
import {
  absoluteAttackTimestamps,
  ATTACK_ANIMATION_SECONDS,
  attackAnimationClockAt,
  attackAnimationFinished,
  attackReleaseReached,
} from "./attack-timeline";

describe("absolute attack timestamps", () => {
  it("gives normal attacks one shared windup, animation, release, and cadence timeline", () => {
    const attack = absoluteAttackTimestamps(10, 1.56);

    expect(attack).toEqual({
      startedAtSeconds: 10,
      releaseAtSeconds: 10.12,
      animationEndsAtSeconds: 10.42,
      nextAttackAtSeconds: 11.56,
    });
    expect(attackAnimationClockAt(attack, 10)).toBe(ATTACK_ANIMATION_SECONDS);
    expect(attackReleaseReached(attack, 10.119)).toBe(false);
    expect(attackReleaseReached(attack, 10.12)).toBe(true);
    expect(attackAnimationFinished(attack, 10.419)).toBe(false);
    expect(attackAnimationFinished(attack, 10.42)).toBe(true);
  });

  it("compresses every phase together when the attack interval is faster than the base animation", () => {
    const attack = absoluteAttackTimestamps(4, .32);

    expect(attack.releaseAtSeconds).toBeCloseTo(4 + .32 * (.12 / .42));
    expect(attack.animationEndsAtSeconds).toBeCloseTo(4.32);
    expect(attack.nextAttackAtSeconds).toBeCloseTo(4.32);
    expect(attackAnimationClockAt(attack, 4.16)).toBeCloseTo(.21);
  });
});
