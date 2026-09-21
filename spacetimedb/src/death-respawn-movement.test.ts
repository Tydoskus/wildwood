import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const move = (f: ReturnType<typeof crystalFixture>, x: number, y: number, sequence: number, vx = 0) =>
  f.run(server.updateMovementState, { x, y, vx, vy: 0, simulationTick: sequence, motionEpoch: 1, sequence });
const later = (f: ReturnType<typeof crystalFixture>, seconds: number) => {
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(Math.round(seconds * 1_000_000)));
};

it("refuses a position the player could not have walked to", () => {
  const f = crystalFixture();
  move(f, 4050, 4050, 1);
  move(f, 4060, 4050, 2);
  later(f, 3.85);
  expect(() => move(f, 600, 600, 3, 180)).toThrow("Unsupported movement position");
});

it("lets a player who died move again from wherever they respawn, then checks them as before", () => {
  const f = crystalFixture();
  move(f, 4050, 4050, 1);
  move(f, 4060, 4050, 2);
  f.run(server.recordPlayerDeath, {});
  expect(f.db.player.identity.find(f.ctx.sender).lastInputSequence).toBe(0);
  later(f, 3.85);                                           // the respawn delay
  expect(() => move(f, 600, 600, 3, 180)).not.toThrow();    // the map's spawn, a map away from the death
  expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ x: 600, y: 600, lastInputSequence: 3 });
  later(f, 0.5);
  expect(() => move(f, 4000, 4000, 4, 180)).toThrow("Unsupported movement position");   // the check is armed again
});
