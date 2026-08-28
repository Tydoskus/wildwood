import { describe, expect, it } from "vitest";
import {
  deterministicRemoteCritical,
  REGULAR_ENEMY_AGGRO_EDGE_TOLERANCE,
  regularEnemyAmbientPose,
  selectRegularEnemyAggroTarget,
} from "./regular-enemy-simulation";

describe("regular enemy deterministic contract", () => {
  it("returns one addressable ambient pose for a map, site, and server time", () => {
    const first = regularEnemyAmbientPose("tutorial_forest", 7, 1_200, 900, 1_800_000_000_000);
    const repeated = regularEnemyAmbientPose("tutorial_forest", 7, 1_200, 900, 1_800_000_000_000);
    const otherSite = regularEnemyAmbientPose("tutorial_forest", 8, 1_200, 900, 1_800_000_000_000);

    expect(repeated).toEqual(first);
    expect(otherSite).not.toEqual(first);
    expect(Math.hypot(first.x - 1_200, first.y - 900)).toBeLessThanOrEqual(72);
  });

  it("selects the same closest target independent of input order", () => {
    const candidates = [
      { id: "player-b", x: 110, y: 100, radius: 17, local: false },
      { id: "player-a", x: 90, y: 100, radius: 17, local: true },
    ];
    const options = { enemyX: 100, enemyY: 100, acquireRadius: 50, retainRadius: 100 };

    expect(selectRegularEnemyAggroTarget({ ...options, candidates })?.id).toBe("player-a");
    expect(selectRegularEnemyAggroTarget({ ...options, candidates: [...candidates].reverse() })?.id).toBe("player-a");
  });

  it("keeps a current target through small interpolation differences", () => {
    const candidates = [
      { id: "current", x: 130, y: 100, radius: 17, local: false },
      { id: "challenger", x: 120, y: 100, radius: 17, local: true },
    ];
    expect(selectRegularEnemyAggroTarget({
      enemyX: 100,
      enemyY: 100,
      acquireRadius: 80,
      retainRadius: 140,
      currentTargetId: "current",
      candidates,
    })?.id).toBe("current");
  });

  it("honors a player's attack edge without losing an in-range pose to quantization", () => {
    const enemyX = 1.9;
    const playerX = 156.8;
    expect(playerX - enemyX).toBeLessThan(155);
    expect(selectRegularEnemyAggroTarget({
      enemyX,
      enemyY: 100,
      acquireRadius: 140,
      retainRadius: 420,
      candidates: [{
        id: "ranged-player",
        x: playerX,
        y: 100,
        radius: 17,
        local: false,
        acquireRadius: 155 + REGULAR_ENEMY_AGGRO_EDGE_TOLERANCE,
      }],
    })?.id).toBe("ranged-player");
  });

  it("seeds remote critical hits from engagement and attack identity", () => {
    const first = deterministicRemoteCritical("water_reach", 4, "player", 12345, 7);
    expect(deterministicRemoteCritical("water_reach", 4, "player", 12345, 7)).toBe(first);
  });
});
