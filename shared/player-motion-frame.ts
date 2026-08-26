/**
 * Compact wire format shared by SpacetimeDB and browser clients.
 *
 * Nearby motion samples are 16 bytes:
 *   network id u32 | x deci-units u16 | y deci-units u16 |
 *   vx deci-units/second i16 | vy deci-units/second i16 |
 *   simulation tick u16 | motion epoch u16
 *
 * The independent all-map minimap snapshot stays position-only at 8 bytes:
 *   network id u32 | x deci-units u16 | y deci-units u16
 *
 * Identity/profile data travels in a cold presence table. Keeping strings out
 * of movement frames makes one zone update cheap even with hundreds of actors.
 */
export const PLAYER_MOTION_FRAME_HZ = 10;
export const PLAYER_MAP_FRAME_HZ = 1;
export const PLAYER_MOTION_SAMPLE_BYTES = 16;
export const PLAYER_MAP_SAMPLE_BYTES = 8;
export const PLAYER_POSITION_SCALE = 10;
export const PLAYER_VELOCITY_SCALE = 10;
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
  vx: number;
  vy: number;
  simulationTick: number;
  motionEpoch: number;
};

export type PlayerMapSample = Pick<PlayerMotionSample, "networkId" | "x" | "y">;

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

function boundedSignedInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function wrappedUint16(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value) & UINT16_MAX;
}

/**
 * Keeps exact minimap markers at normal populations and spatially aggregates
 * large maps into a bounded grid. Runtime movement frames remain exact.
 */
export function compactPlayerMapSamples(
  samples: readonly PlayerMapSample[],
  worldWidth: number,
  worldHeight: number,
  maximum = PLAYER_MAP_FRAME_MAX_SAMPLES,
): readonly PlayerMapSample[] {
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
    }));
}

export function encodePlayerMapFrame(samples: readonly PlayerMapSample[]) {
  const bytes = new Uint8Array(samples.length * PLAYER_MAP_SAMPLE_BYTES);
  let offset = 0;
  for (const sample of samples) {
    const networkId = boundedInteger(sample.networkId, UINT32_MAX) >>> 0;
    const x = boundedInteger(sample.x * PLAYER_POSITION_SCALE, UINT16_MAX);
    const y = boundedInteger(sample.y * PLAYER_POSITION_SCALE, UINT16_MAX);
    bytes[offset] = networkId & 0xff;
    bytes[offset + 1] = networkId >>> 8 & 0xff;
    bytes[offset + 2] = networkId >>> 16 & 0xff;
    bytes[offset + 3] = networkId >>> 24 & 0xff;
    bytes[offset + 4] = x & 0xff;
    bytes[offset + 5] = x >>> 8;
    bytes[offset + 6] = y & 0xff;
    bytes[offset + 7] = y >>> 8;
    offset += PLAYER_MAP_SAMPLE_BYTES;
  }
  return bytes;
}

export function decodePlayerMapFrame(payload: Uint8Array, playerCount: number): PlayerMapSample[] {
  if (!Number.isSafeInteger(playerCount) || playerCount < 0) throw new RangeError("Invalid player map frame count");
  const expectedBytes = playerCount * PLAYER_MAP_SAMPLE_BYTES;
  if (payload.byteLength !== expectedBytes) {
    throw new RangeError(`Invalid player map frame length: expected ${expectedBytes}, received ${payload.byteLength}`);
  }
  const samples: PlayerMapSample[] = [];
  for (let offset = 0; offset < payload.length; offset += PLAYER_MAP_SAMPLE_BYTES) {
    samples.push({
      networkId: (
        payload[offset] |
        payload[offset + 1] << 8 |
        payload[offset + 2] << 16 |
        payload[offset + 3] << 24
      ) >>> 0,
      x: (payload[offset + 4] | payload[offset + 5] << 8) / PLAYER_POSITION_SCALE,
      y: (payload[offset + 6] | payload[offset + 7] << 8) / PLAYER_POSITION_SCALE,
    });
  }
  return samples;
}

export function encodePlayerMotionFrame(samples: readonly PlayerMotionSample[]) {
  const bytes = new Uint8Array(samples.length * PLAYER_MOTION_SAMPLE_BYTES);
  let offset = 0;
  for (const sample of samples) {
    const networkId = boundedInteger(sample.networkId, UINT32_MAX) >>> 0;
    const x = boundedInteger(sample.x * PLAYER_POSITION_SCALE, UINT16_MAX);
    const y = boundedInteger(sample.y * PLAYER_POSITION_SCALE, UINT16_MAX);
    const vx = boundedSignedInteger(sample.vx * PLAYER_VELOCITY_SCALE, -0x8000, 0x7fff);
    const vy = boundedSignedInteger(sample.vy * PLAYER_VELOCITY_SCALE, -0x8000, 0x7fff);
    const simulationTick = wrappedUint16(sample.simulationTick);
    const motionEpoch = wrappedUint16(sample.motionEpoch);

    bytes[offset] = networkId & 0xff;
    bytes[offset + 1] = networkId >>> 8 & 0xff;
    bytes[offset + 2] = networkId >>> 16 & 0xff;
    bytes[offset + 3] = networkId >>> 24 & 0xff;
    bytes[offset + 4] = x & 0xff;
    bytes[offset + 5] = x >>> 8;
    bytes[offset + 6] = y & 0xff;
    bytes[offset + 7] = y >>> 8;
    bytes[offset + 8] = vx & 0xff;
    bytes[offset + 9] = vx >>> 8 & 0xff;
    bytes[offset + 10] = vy & 0xff;
    bytes[offset + 11] = vy >>> 8 & 0xff;
    bytes[offset + 12] = simulationTick & 0xff;
    bytes[offset + 13] = simulationTick >>> 8;
    bytes[offset + 14] = motionEpoch & 0xff;
    bytes[offset + 15] = motionEpoch >>> 8;
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
    const vx = (payload[offset + 8] | payload[offset + 9] << 8) << 16 >> 16;
    const vy = (payload[offset + 10] | payload[offset + 11] << 8) << 16 >> 16;
    const simulationTick = payload[offset + 12] | payload[offset + 13] << 8;
    const motionEpoch = payload[offset + 14] | payload[offset + 15] << 8;
    samples.push({
      networkId,
      x: x / PLAYER_POSITION_SCALE,
      y: y / PLAYER_POSITION_SCALE,
      vx: vx / PLAYER_VELOCITY_SCALE,
      vy: vy / PLAYER_VELOCITY_SCALE,
      simulationTick,
      motionEpoch,
    });
  }
  return samples;
}
