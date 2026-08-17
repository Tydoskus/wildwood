/**
 * Compact wire format shared by SpacetimeDB and browser clients.
 *
 * Each sample is 11 bytes:
 *   network id u32 | x deci-units u16 | y deci-units u16 |
 *   normalized dx i8 | normalized dy i8 | moving flags u8
 *
 * Identity/profile data travels in a cold presence table. Keeping strings out
 * of movement frames makes one zone update cheap even with hundreds of actors.
 */
export const PLAYER_MOTION_FRAME_HZ = 10;
export const PLAYER_MAP_FRAME_HZ = 1;
export const PLAYER_MOTION_SAMPLE_BYTES = 11;
export const PLAYER_POSITION_SCALE = 10;
// The minimap is roughly 120 CSS pixels wide and draws five-pixel player dots.
// More than a 16x16 grid of exact markers is visually redundant, so large maps
// transmit one centroid per occupied cell instead of one sample per player.
export const PLAYER_MAP_FRAME_MAX_SAMPLES = 256;

const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

export type PlayerMotionSample = {
  networkId: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  moving: boolean;
};

type MapSampleBucket = {
  key: number;
  networkId: number;
  x: number;
  y: number;
  count: number;
};

function boundedInteger(value: number, maximum: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.round(value)));
}

/**
 * Keeps exact minimap markers at normal populations and spatially aggregates
 * large maps into a bounded grid. Runtime movement frames remain exact.
 */
export function compactPlayerMapSamples(
  samples: readonly PlayerMotionSample[],
  worldWidth: number,
  worldHeight: number,
  maximum = PLAYER_MAP_FRAME_MAX_SAMPLES,
): readonly PlayerMotionSample[] {
  const limit = Number.isFinite(maximum) ? Math.max(1, Math.floor(maximum)) : PLAYER_MAP_FRAME_MAX_SAMPLES;
  if (samples.length <= limit) return samples;
  if (!(worldWidth > 0) || !(worldHeight > 0)) return samples.slice(0, limit);

  const aspect = worldWidth / worldHeight;
  const columns = Math.max(1, Math.min(limit, Math.floor(Math.sqrt(limit * aspect))));
  const rows = Math.max(1, Math.floor(limit / columns));
  const buckets = new Map<number, MapSampleBucket>();

  for (const sample of samples) {
    const column = Math.max(0, Math.min(columns - 1, Math.floor(sample.x / worldWidth * columns)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(sample.y / worldHeight * rows)));
    const key = row * columns + column;
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, {
        key,
        networkId: sample.networkId,
        x: sample.x,
        y: sample.y,
        count: 1,
      });
      continue;
    }
    bucket.networkId = Math.min(bucket.networkId, sample.networkId);
    bucket.x += sample.x;
    bucket.y += sample.y;
    bucket.count += 1;
  }

  return [...buckets.values()]
    .sort((a, b) => a.key - b.key)
    .map((bucket) => ({
      networkId: bucket.networkId,
      x: bucket.x / bucket.count,
      y: bucket.y / bucket.count,
      dx: 0,
      dy: 0,
      moving: false,
    }));
}

export function encodePlayerMotionFrame(samples: readonly PlayerMotionSample[]) {
  const bytes = new Uint8Array(samples.length * PLAYER_MOTION_SAMPLE_BYTES);
  let offset = 0;
  for (const sample of samples) {
    const networkId = boundedInteger(sample.networkId, UINT32_MAX) >>> 0;
    const x = boundedInteger(sample.x * PLAYER_POSITION_SCALE, UINT16_MAX);
    const y = boundedInteger(sample.y * PLAYER_POSITION_SCALE, UINT16_MAX);
    const dx = Number.isFinite(sample.dx) ? Math.round(Math.max(-1, Math.min(1, sample.dx)) * 127) : 0;
    const dy = Number.isFinite(sample.dy) ? Math.round(Math.max(-1, Math.min(1, sample.dy)) * 127) : 0;

    bytes[offset] = networkId & 0xff;
    bytes[offset + 1] = networkId >>> 8 & 0xff;
    bytes[offset + 2] = networkId >>> 16 & 0xff;
    bytes[offset + 3] = networkId >>> 24 & 0xff;
    bytes[offset + 4] = x & 0xff;
    bytes[offset + 5] = x >>> 8;
    bytes[offset + 6] = y & 0xff;
    bytes[offset + 7] = y >>> 8;
    bytes[offset + 8] = dx & 0xff;
    bytes[offset + 9] = dy & 0xff;
    bytes[offset + 10] = sample.moving ? 1 : 0;
    offset += PLAYER_MOTION_SAMPLE_BYTES;
  }
  return bytes;
}

export function decodePlayerMotionFrame(payload: Uint8Array, playerCount: number): PlayerMotionSample[] {
  if (!Number.isSafeInteger(playerCount) || playerCount < 0) {
    throw new RangeError("Invalid player motion frame count");
  }
  const expectedBytes = playerCount * PLAYER_MOTION_SAMPLE_BYTES;
  if (payload.byteLength !== expectedBytes) {
    throw new RangeError(`Invalid player motion frame length: expected ${expectedBytes}, received ${payload.byteLength}`);
  }

  const samples: PlayerMotionSample[] = [];
  for (let offset = 0; offset < payload.length; offset += PLAYER_MOTION_SAMPLE_BYTES) {
    const networkId = (
      payload[offset] |
      payload[offset + 1] << 8 |
      payload[offset + 2] << 16 |
      payload[offset + 3] << 24
    ) >>> 0;
    const x = payload[offset + 4] | payload[offset + 5] << 8;
    const y = payload[offset + 6] | payload[offset + 7] << 8;
    const dx = payload[offset + 8] << 24 >> 24;
    const dy = payload[offset + 9] << 24 >> 24;
    samples.push({
      networkId,
      x: x / PLAYER_POSITION_SCALE,
      y: y / PLAYER_POSITION_SCALE,
      dx: dx / 127,
      dy: dy / 127,
      moving: (payload[offset + 10] & 1) !== 0,
    });
  }
  return samples;
}
