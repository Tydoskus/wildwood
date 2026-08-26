import type { PlayerMapSample } from "./player-motion-frame";

export const PLAYER_MOTION_INTEREST_LIMIT = 5;
export const PLAYER_MOTION_DETAIL_FRAME_HZ = 2;

// A retained actor must be displaced by a candidate at least 20% closer.
// Squared-distance scoring avoids a square root in the 1 Hz selection path.
const RETAINED_DISTANCE_FACTOR_SQUARED = .8 ** 2;

export function selectPlayerMotionInterest(options: {
  samples: readonly PlayerMapSample[];
  originX: number;
  originY: number;
  localNetworkId: number | null;
  availableNetworkIds: ReadonlySet<number>;
  previousNetworkIds: readonly number[];
  limit?: number;
}) {
  const {
    samples,
    originX,
    originY,
    localNetworkId,
    availableNetworkIds,
    previousNetworkIds,
    limit = PLAYER_MOTION_INTEREST_LIMIT,
  } = options;
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) return [];
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(PLAYER_MOTION_INTEREST_LIMIT, Math.floor(limit)))
    : PLAYER_MOTION_INTEREST_LIMIT;
  if (boundedLimit === 0) return [];

  const retained = new Set(previousNetworkIds);
  const seen = new Set<number>();
  return samples
    .filter((sample) => {
      if (
        !Number.isSafeInteger(sample.networkId) ||
        sample.networkId < 0 ||
        sample.networkId === localNetworkId ||
        !availableNetworkIds.has(sample.networkId) ||
        !Number.isFinite(sample.x) ||
        !Number.isFinite(sample.y) ||
        seen.has(sample.networkId)
      ) return false;
      seen.add(sample.networkId);
      return true;
    })
    .map((sample) => {
      const dx = sample.x - originX;
      const dy = sample.y - originY;
      const distanceSquared = dx * dx + dy * dy;
      return {
        networkId: sample.networkId,
        score: retained.has(sample.networkId)
          ? distanceSquared * RETAINED_DISTANCE_FACTOR_SQUARED
          : distanceSquared,
      };
    })
    .sort((left, right) => left.score - right.score || left.networkId - right.networkId)
    .slice(0, boundedLimit)
    .map(({ networkId }) => networkId)
    .sort((left, right) => left - right);
}

export function samePlayerMotionInterest(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((networkId, index) => networkId === right[index]);
}
