import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../shared/rules";
import {
  virtualPlayerLoadSpawnPoint,
  virtualPlayerLoadWorkerCount,
  virtualPlayerWorkerIndices,
} from "./virtual-player-load-test-config";

describe("Node virtual-player load configuration", () => {
  it("shards 3,000 sockets below common per-process descriptor ceilings", () => {
    const workers = virtualPlayerLoadWorkerCount(3_000);
    const shards = Array.from({ length: workers }, (_, worker) => virtualPlayerWorkerIndices(3_000, worker, workers));
    expect(workers).toBe(15);
    expect(virtualPlayerLoadWorkerCount(3_000, 1)).toBe(15);
    expect(shards.flat()).toHaveLength(3_000);
    expect(Math.max(...shards.map((indices) => indices.length))).toBeLessThanOrEqual(200);
    expect(new Set(shards.flat()).size).toBe(3_000);
  });

  it("distributes normal load without edge clamping", () => {
    const points = Array.from({ length: 3_000 }, (_, index) => virtualPlayerLoadSpawnPoint("movement", index, 3_000));
    expect(points.every(({ x, y }) => x > PLAYER_RADIUS && x < WORLD_WIDTH - PLAYER_RADIUS && y > PLAYER_RADIUS && y < WORLD_HEIGHT - PLAYER_RADIUS)).toBe(true);
    const zones = new Set(points.map(({ x, y }) => `${Math.floor(x / 1_000)}:${Math.floor(y / 1_000)}`));
    expect(zones.size).toBeGreaterThanOrEqual(25);
  });

  it("keeps dense load inside one subscription zone", () => {
    const points = Array.from({ length: 3_000 }, (_, index) => virtualPlayerLoadSpawnPoint("dense", index, 3_000));
    const zones = new Set(points.map(({ x, y }) => `${Math.floor(x / 1_000)}:${Math.floor(y / 1_000)}`));
    expect(zones.size).toBe(1);
  });
});
