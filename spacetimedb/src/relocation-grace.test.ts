import { expect, it, vi } from "vitest";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
import { Timestamp } from "spacetimedb";
import { RELOCATION_GRACE_MICROS, relocatedInputClock } from "./map-sharding";
import { MOVEMENT_POSITION_PACKET_TOLERANCE } from "./presence-runtime";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../shared/rules";

it("backdates the motion clock far enough that one packet from anywhere on the map is accepted", () => {
  const now = 1_700_000_000_000_000n;
  const clock = relocatedInputClock({ timestamp: new Timestamp(now) });
  const elapsedSeconds = Number(now - clock.microsSinceUnixEpoch) / 1_000_000;
  expect(elapsedSeconds).toBe(Number(RELOCATION_GRACE_MICROS) / 1_000_000);
  // The slowest plausible player speed the validator would use, in px/s.
  const slowestSpeed = 100;
  expect(slowestSpeed * elapsedSeconds + MOVEMENT_POSITION_PACKET_TOLERANCE).toBeGreaterThan(Math.hypot(WORLD_WIDTH, WORLD_HEIGHT));
});
