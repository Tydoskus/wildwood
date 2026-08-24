import { describe, expect, it } from "vitest";
import { createRemoteBossAttackState, remoteBossAttackFrame } from "./remote-boss-attack";

describe("remote boss attack visuals", () => {
  const state = createRemoteBossAttackState({
    attackerX: 100,
    attackerY: 100,
    targetX: 300,
    targetY: 100,
    targetRadius: 50,
    hits: 2,
  }, 1_000);

  it("starts only from a confirmed event and follows the server target", () => {
    expect(remoteBossAttackFrame(undefined, 1_000)).toBeNull();
    expect(remoteBossAttackFrame(state, 1_000)).toMatchObject({
      facing: 0,
      throwClock: .42,
      visual: { targetX: 300, targetY: 100, hits: 2, projectileProgress: 0 },
    });
  });

  it("expires without any heartbeat or persistent server animation state", () => {
    expect(remoteBossAttackFrame(state, 1_119)?.visual.projectileProgress).toBe(0);
    expect(remoteBossAttackFrame(state, 1_210)?.visual.projectileProgress).toBeCloseTo(.5);
    expect(remoteBossAttackFrame(state, 1_419)).not.toBeNull();
    expect(remoteBossAttackFrame(state, 1_420)).toBeNull();
  });

  it("bounds malformed hit counts before rendering", () => {
    expect(createRemoteBossAttackState({ ...state, hits: 100 }, 2_000).hits).toBe(20);
  });
});
