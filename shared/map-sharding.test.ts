import { describe, expect, it } from "vitest";
import { selectMapShard, shouldWarmMapShard, type MapShardCandidate } from "./map-sharding";
const shard = (id: string, occupants: number, state: MapShardCandidate["state"] = "ready", mapId = "forest"): MapShardCandidate => ({ id, occupants, state, mapId });
describe("ten-player map shard admission", () => {
  it("fills occupied instances before the standby and never admits an eleventh player", () => {
    expect(selectMapShard([shard("a", 9), shard("b", 0)], "forest")?.id).toBe("a");
    expect(selectMapShard([shard("a", 10), shard("b", 0)], "forest")?.id).toBe("b");
    expect(selectMapShard([shard("a", 10)], "forest")).toBeNull();
  });
  it("warms at nine and suppresses duplicate provisioning while a standby starts", () => {
    expect(shouldWarmMapShard([], "forest")).toBe(true);
    expect(shouldWarmMapShard([shard("a", 8)], "forest")).toBe(false);
    expect(shouldWarmMapShard([shard("a", 9)], "forest")).toBe(true);
    expect(shouldWarmMapShard([shard("a", 10), shard("b", 0, "starting")], "forest")).toBe(false);
    expect(selectMapShard([shard("b", 0, "starting")], "forest")).toBeNull();
  });
  it("keeps an existing seat on reconnect and excludes failed, draining, and other maps", () => {
    const candidates = [shard("a", 10), shard("b", 0, "failed"), shard("c", 0, "draining"), shard("d", 0, "ready", "desert")];
    expect(selectMapShard(candidates, "forest", "a")?.id).toBe("a");
    expect(selectMapShard(candidates, "forest")).toBeNull();
    expect(shouldWarmMapShard(candidates, "forest")).toBe(true);
  });
});
