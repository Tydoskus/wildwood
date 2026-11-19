import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CROSSING_MAX_POINTS,
  CROSSING_STEPS,
  GUILD_CROSSING_EXIT_PAD,
  GUILD_CROSSING_FEET_OFFSET,
  GUILD_HALL_CROSSING_PORTAL,
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

describe("in-world Glass Crossing click/tap-to-leap runtime", () => {
  it("blocks free-roam running, ignores shattered/future tiles, leaps smoothly onto clicked tiles, and resolves frontier steps", async () => {
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
    const correctMovementPosition = vi.fn();
    let mapId = guildCrossingMapId(7n) as MapId;
    const player: any = { x: 900, y: 2_975, hp: 100, facing: 0, moving: false };
    const camera = { x: 0, y: 0, zoom: 1 };
    const travel = vi.fn(async () => true);

    const runtime = createGuildCrossingRuntime({
      source: () => ({ correctMovementPosition, guild: { loadCrossing, stepCrossing } }),
      player,
      camera,
      currentMapId: () => mapId,
      travel,
    });

    expect(runtime.blocksFreeMove()).toBe(true);

    // Initial tick enters map and loads crossing state.
    runtime.update(0.016);
    await Promise.resolve();
    expect(guildCrossingScene.snapshot?.revealed).toBe(2);

    // Tapping a shattered hole (step 0 right) or future unrevealed tile (step 5 left) does NOT leap.
    const brokenTile = crossingTileRect(0, "right");
    expect(runtime.tap(brokenTile.cx, brokenTile.cy)).toBe(true);
    expect(guildCrossingScene.leap.active).toBe(false);

    const futureTile = crossingTileRect(5, "left");
    expect(runtime.tap(futureTile.cx, futureTile.cy)).toBe(true);
    expect(guildCrossingScene.leap.active).toBe(false);

    // Tapping a solved emerald tile (step 0 left) launches a parabolic leap and syncs position on land.
    const safeTile = crossingTileRect(0, "left");
    expect(runtime.tap(safeTile.cx, safeTile.cy)).toBe(true);
    expect(guildCrossingScene.leap.active).toBe(true);
    runtime.update(0.5);
    expect(guildCrossingScene.leap.active).toBe(false);
    expect(player.x).toBe(safeTile.cx);
    expect(player.y).toBe(safeTile.cy - GUILD_CROSSING_FEET_OFFSET);
    expect(correctMovementPosition).toHaveBeenCalledWith(safeTile.cx, safeTile.cy - GUILD_CROSSING_FEET_OFFSET, true);

    // Tapping the active frontier's Left tile leaps there, then triggers suspense + stepCrossing(2, "left").
    const frontierLeft = crossingTileRect(2, "left");
    expect(runtime.tap(frontierLeft.cx, frontierLeft.cy)).toBe(true);
    expect(guildCrossingScene.leap.active).toBe(true);
    runtime.update(0.5);
    expect(guildCrossingScene.stepping).toMatchObject({ step: 2, side: "left" });
    await vi.advanceTimersByTimeAsync(500);
    expect(stepCrossing).toHaveBeenCalledWith(2, "left");
    expect(guildCrossingScene.snapshot?.revealed).toBe(3);

    // Tapping the south Return Portal leaps there and travels back to Town.
    expect(runtime.tap(GUILD_CROSSING_EXIT_PAD.x, GUILD_CROSSING_EXIT_PAD.y - 40)).toBe(true);
    runtime.update(0.5);
    expect(travel).toHaveBeenCalledWith("town");

    // Walking onto the Guild Hall courtyard portal teleports straight into the guild's crossing map.
    mapId = "guild_hall_7" as MapId;
    expect(runtime.blocksFreeMove()).toBe(false);
    player.x = GUILD_HALL_CROSSING_PORTAL.x;
    player.y = GUILD_HALL_CROSSING_PORTAL.y - GUILD_CROSSING_FEET_OFFSET;
    runtime.update(0.016);
    expect(travel).toHaveBeenCalledWith("guild_crossing_7");
  });

  it("lets players with 0 tries left visit and tap-leap onto solved and frontier tiles without progressing the bridge", async () => {
    const snap = makeSnap({ usedToday: 1, remainingToday: 0 });
    const loadCrossing = vi.fn(async () => snap);
    const stepCrossing = vi.fn(async () => snap);
    const player: any = { x: 900, y: 2_975, hp: 100, facing: 0, moving: false };
    const camera = { x: 0, y: 0, zoom: 1 };

    const runtime = createGuildCrossingRuntime({
      source: () => ({ guild: { loadCrossing, stepCrossing } }),
      player,
      camera,
      currentMapId: () => guildCrossingMapId(7n) as MapId,
      travel: vi.fn(async () => true),
    });

    runtime.update(0.016);
    await Promise.resolve();

    // Can tap to leap onto the active frontier tile (index 2, left) even with 0 tries left.
    const frontierLeft = crossingTileRect(2, "left");
    expect(runtime.tap(frontierLeft.cx, frontierLeft.cy)).toBe(true);
    expect(guildCrossingScene.leap.active).toBe(true);
    runtime.update(0.5);

    expect(player.x).toBe(frontierLeft.cx);
    expect(player.y).toBe(frontierLeft.cy - GUILD_CROSSING_FEET_OFFSET);
    expect(stepCrossing).not.toHaveBeenCalled();
  });
});
