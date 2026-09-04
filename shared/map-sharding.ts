/** Shared admission policy. Call inside the directory's transaction; in-flight
 * reservations count as occupants so simultaneous joins cannot overbook. */
export const MAP_SHARD_CAPACITY = 10;
export const MAP_SHARD_WARM_AT = 9;
export type MapShardCandidate = {
  id: string;
  mapId: string;
  state: "starting" | "ready" | "draining" | "failed";
  occupants: number;
};

export function selectMapShard(shards: readonly MapShardCandidate[], mapId: string, currentShardId?: string) {
  const candidates = shards.filter(shard => shard.mapId === mapId);
  const current = candidates.find(shard => shard.id === currentShardId && shard.state === "ready");
  // The caller may supply currentShardId only for an existing, valid membership.
  if (current) return current;
  return candidates.filter(shard => shard.state === "ready" && shard.occupants < MAP_SHARD_CAPACITY)
    .sort((a, b) => b.occupants - a.occupants || a.id.localeCompare(b.id))[0] ?? null;
}

/** Keep a single standby when the last available instance reaches nine.
 * Starting instances count as standby, never as an admission destination. */
export function shouldWarmMapShard(shards: readonly MapShardCandidate[], mapId: string) {
  const candidates = shards.filter(shard => shard.mapId === mapId);
  if (candidates.some(shard => shard.state === "starting")) return false;
  return !candidates.some(shard => shard.state === "ready" && shard.occupants < MAP_SHARD_WARM_AT);
}
