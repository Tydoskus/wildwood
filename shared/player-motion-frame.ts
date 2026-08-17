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

function boundedInteger(value: number, maximum: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.round(value)));
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
