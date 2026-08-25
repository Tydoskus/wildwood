import { describe, expect, it } from "vitest";
import {
  PLAYER_DEATH_FALL_DURATION_MS,
  PLAYER_DEATH_REMOTE_HOLD_MS,
  playerDeathPose,
} from "./player-death-animation";

describe("player death animation", () => {
  it("starts upright with attached equipment positions", () => {
    const pose = playerDeathPose(1_000, 1_000, "player-a");
    expect(pose.active).toBe(true);
    expect(pose.bodyRotation).toBe(0);
    expect(pose.helmetOffsetX).toBe(0);
    expect(pose.weaponOffsetX).toBe(0);
  });

  it("finishes flat with the helmet and weapon resting on opposite sides", () => {
    const pose = playerDeathPose(0, PLAYER_DEATH_FALL_DURATION_MS, "player-a");
    expect(Math.abs(pose.bodyRotation)).toBeCloseTo(Math.PI / 2);
    expect(Math.sign(pose.helmetOffsetX)).toBe(-Math.sign(pose.weaponOffsetX));
    expect(Math.abs(pose.helmetOffsetX)).toBeGreaterThan(30);
    expect(Math.abs(pose.weaponOffsetX)).toBeGreaterThan(40);
  });

  it("expires after the remote respawn window", () => {
    expect(playerDeathPose(0, PLAYER_DEATH_REMOTE_HOLD_MS, "player-a").active).toBe(true);
    expect(playerDeathPose(0, PLAYER_DEATH_REMOTE_HOLD_MS + 1, "player-a").active).toBe(false);
  });
});
