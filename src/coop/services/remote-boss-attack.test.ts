import { describe, expect, it } from "vitest";
import {
  remoteBossAttackFrame,
  remoteBossAttackStartedAtMs,
  type RemoteBossAttackFrameOptions,
} from "./remote-boss-attack";

describe("seeded remote boss attack visuals", () => {
  const base: RemoteBossAttackFrameOptions = {
    boss: {
      kind: "frostclaw",
      encounter: 17n,
      alive: true,
      x: 300,
      y: 100,
      radius: 50,
    },
    playerId: "remote-player",
    playerX: 100,
    playerY: 100,
    attackInterval: 1,
    attackRange: 180,
    projectileCount: 2,
    serverNowMs: 20_000,
  };

  it("reconstructs the same absolute attack phase on every client", () => {
    const startedAtMs = remoteBossAttackStartedAtMs(base);
    const duringWindup = { ...base, serverNowMs: startedAtMs + 50 };

    expect(remoteBossAttackFrame(duringWindup)).toMatchObject({
      facing: 0,
      visual: { targetX: 300, targetY: 100, hits: 2, projectileProgress: 0 },
    });
    expect(remoteBossAttackFrame(duringWindup)).toEqual(remoteBossAttackFrame(duringWindup));
  });

  it("shows projectiles after release and goes idle between seeded attacks", () => {
    const startedAtMs = remoteBossAttackStartedAtMs(base);
    expect(remoteBossAttackFrame({ ...base, serverNowMs: startedAtMs + 210 })?.visual.projectileProgress).toBeCloseTo(.5);
    expect(remoteBossAttackFrame({ ...base, serverNowMs: startedAtMs + 500 })).toBeNull();
  });

  it("requires a live boss and a player in validated hit range", () => {
    const startedAtMs = remoteBossAttackStartedAtMs(base);
    const active = { ...base, serverNowMs: startedAtMs + 50 };
    expect(remoteBossAttackFrame({ ...active, boss: { ...base.boss, alive: false } })).toBeNull();
    expect(remoteBossAttackFrame({ ...active, playerX: 1_000 })).toBeNull();
  });
});
