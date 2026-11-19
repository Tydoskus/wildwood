import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CROSSING_MAX_POINTS,
  CROSSING_STEPS,
  GUILD_CROSSING_FEET_OFFSET,
  GUILD_HALL_CROSSING_PORTAL,
  crossingStepY,
  crossingTileRect,
  guildCrossingMapId,
  type GuildCrossingSnapshot,
} from "../../../../shared/guild-crossing";
import type { MapId } from "../../world";
import { createGuildCrossingRuntime } from "./guild-crossing-runtime";
import { guildCrossingScene, resetGuildCrossingScene } from "./guild-crossing-scene";

afterEach(() => {
  vi.useRealTimers();
  resetGuildCrossingScene();
});

function makeSnap(overrides: Partial<GuildCrossingSnapshot> = {}): GuildCrossingSnapshot {
  return {
    week: 2928,
    day: 20500,
    resetsAtMs: Date.now() + 86_400_000 * 3,
    nextDayAtMs: Date.now() + 3_600_000 * 6,
    guildId: "7",
    guildName: "OAKS",
    guildEmblem: 2,
    memberCount: 16,
    steps: CROSSING_STEPS,
    revealed: 2,
    completed: false,
    pointsAwarded: 4,
    maxPoints: CROSSING_MAX_POINTS,
    fallsCount: 1,
    dailyLimit: 1,
    usedToday: 0,
    remainingToday: 1,
    winnerName: null,
    revealedSides: ["left", "right"],
    falls: [{ step: 0, side: "right", name: "Rymel", identity: "0xrymel", profileIcon: 1, atMs: 1_000 }],
    pioneers: [{ step: 1, side: "right", name: "Aria", identity: "0xaria", profileIcon: 3 }],
    winner: null,
    currentStreak: 0,
    bestStreak: 2,
    ...overrides,
  };
}

describe("in-world Glass Crossing runtime", () => {
  it("clamps movement past the frontier, deflects away from shattered holes, and resolves frontier tile steps", async () => {
    vi.useFakeTimers();
    let current = makeSnap();
    const loadCrossing = vi.fn(async () => current);
    const stepCrossing = vi.fn(async (expectedStep: number, side: "left" | "right" | "finish") => {
      current = makeSnap({
        revealed: expectedStep + 1,
        revealedSides: [...current.revealedSides, side === "right" ? "right" : "left"],
        pointsAwarded: current.pointsAwarded + 2,
        currentStreak: 1,
      });
      return current;
    });
    let mapId = guildCrossingMapId(7n) as MapId;
    const player: any = { x: 900, y: 3_000, hp: 100 };
    const travel = vi.fn(async () => true);

    const runtime = createGuildCrossingRuntime({
      source: () => ({ guild: { loadCrossing, stepCrossing } }),
      player,
      currentMapId: () => mapId,
      travel,
    });

    // Initial tick enters map and loads crossing state.
    runtime.update(0.016);
    await Promise.resolve();
    expect(guildCrossingScene.snapshot?.revealed).toBe(2);

    // Walking into the broken right tile on Step 1 (index 0, safe = left) deflects player toward the safe left side.
    const brokenTile = crossingTileRect(0, "right");
    player.x = brokenTile.cx;
    player.y = brokenTile.cy - GUILD_CROSSING_FEET_OFFSET;
    runtime.update(0.016);
    expect(player.x).toBeLessThanOrEqual(brokenTile.left);

    // Trying to walk far north past Step 3 (frontier index 2) is clamped at the active frontier's north rim.
    player.x = 900;
    player.y = crossingStepY(10) - GUILD_CROSSING_FEET_OFFSET;
    runtime.update(0.016);
    expect(player.y + GUILD_CROSSING_FEET_OFFSET).toBeGreaterThanOrEqual(crossingStepY(2) - 44);

    // Stepping onto the active frontier's Left glass tile triggers suspense + stepCrossing(2, "left").
    const frontierLeft = crossingTileRect(2, "left");
    player.x = frontierLeft.cx;
    player.y = frontierLeft.cy - GUILD_CROSSING_FEET_OFFSET;
    runtime.update(0.016);
    expect(guildCrossingScene.stepping).toMatchObject({ step: 2, side: "left" });
    await vi.advanceTimersByTimeAsync(500);
    expect(stepCrossing).toHaveBeenCalledWith(2, "left");
    expect(guildCrossingScene.snapshot?.revealed).toBe(3);

    // Walking onto the Guild Hall courtyard portal teleports straight into the guild's crossing map.
    mapId = "guild_hall_7" as MapId;
    player.x = GUILD_HALL_CROSSING_PORTAL.x;
    player.y = GUILD_HALL_CROSSING_PORTAL.y - GUILD_CROSSING_FEET_OFFSET;
    runtime.update(0.016);
    expect(travel).toHaveBeenCalledWith("guild_crossing_7");
  });

  it("lets players with 0 tries left visit and hop onto solved and frontier tiles without progressing the bridge", async () => {
    const snap = makeSnap({ usedToday: 1, remainingToday: 0 });
    const loadCrossing = vi.fn(async () => snap);
    const stepCrossing = vi.fn(async () => snap);
    const player: any = { x: 900, y: 3_000, hp: 100 };

    const runtime = createGuildCrossingRuntime({
      source: () => ({ guild: { loadCrossing, stepCrossing } }),
      player,
      currentMapId: () => guildCrossingMapId(7n) as MapId,
      travel: vi.fn(async () => true),
    });

    runtime.update(0.016);
    await Promise.resolve();

    // Can walk and hop onto the active frontier tile (index 2, left) even with 0 tries left.
    const frontierLeft = crossingTileRect(2, "left");
    player.x = frontierLeft.cx;
    player.y = frontierLeft.cy - GUILD_CROSSING_FEET_OFFSET;
    runtime.update(0.016);

    expect(player.y + GUILD_CROSSING_FEET_OFFSET).toBeCloseTo(frontierLeft.cy, 1);
    expect(guildCrossingScene.hop.left).toBeGreaterThan(0);
    expect(stepCrossing).not.toHaveBeenCalled();
  });
});
