import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../../../shared/rules";
import {
  BROWSER_VIRTUAL_PLAYER_LIMIT,
  VIRTUAL_PLAYER_MOVEMENT_HZ,
  VIRTUAL_PLAYER_SAVE_INTERVAL_MS,
  VIRTUAL_PLAYER_SAVE_STRESS_INTERVAL_MS,
  VIRTUAL_PLAYER_TICKET_HEX_LENGTH,
  advanceVirtualPlayerSimulationTick,
  isVirtualPlayerTicket,
  normalizeVirtualPlayerCount,
} from "../../../shared/virtual-player-load-test";
import {
  advanceVirtualPlayerMotion,
  isVirtualPlayerProtocolMismatch,
  virtualPlayerRampDelayMs,
  virtualPlayerStartupConcurrency,
  virtualPlayerTicketFromBytes,
} from "./virtual-player-load-test";

describe("virtual-player count", () => {
  it("accepts any whole count from 1 through 3000", () => {
    expect(normalizeVirtualPlayerCount(1)).toBe(1);
    expect(normalizeVirtualPlayerCount(137)).toBe(137);
    expect(normalizeVirtualPlayerCount(3_000)).toBe(3_000);
  });

  it("clamps invalid and out-of-range counts", () => {
    expect(normalizeVirtualPlayerCount(0)).toBe(1);
    expect(normalizeVirtualPlayerCount(3_001)).toBe(3_000);
    expect(normalizeVirtualPlayerCount(12.9)).toBe(12);
    expect(normalizeVirtualPlayerCount(Number.NaN)).toBe(10);
  });

  it("keeps the in-browser harness below Chromium's socket ceiling", () => {
    expect(BROWSER_VIRTUAL_PLAYER_LIMIT).toBe(200);
    expect(BROWSER_VIRTUAL_PLAYER_LIMIT).toBeLessThan(255);
  });
});

describe("virtual-player motion protocol", () => {
  it("models the 2 Hz heartbeat on the real 60 Hz simulation clock", () => {
    expect(VIRTUAL_PLAYER_MOVEMENT_HZ).toBe(2);
    expect(advanceVirtualPlayerSimulationTick(100, .1)).toBe(106);
    expect(advanceVirtualPlayerSimulationTick(100, .5)).toBe(109);
    expect(advanceVirtualPlayerSimulationTick(100, 0)).toBe(100);
    expect(advanceVirtualPlayerSimulationTick(0xffffffff, 1 / 60)).toBe(0);
  });

  it("keeps normal saves sparse while preserving an explicit stress cadence", () => {
    expect(VIRTUAL_PLAYER_SAVE_INTERVAL_MS).toBe(30_000);
    expect(VIRTUAL_PLAYER_SAVE_STRESS_INTERVAL_MS).toBe(2_500);
  });
});

describe("virtual-player startup", () => {
  it("recognizes a server protocol cutover", () => {
    expect(isVirtualPlayerProtocolMismatch(new Error("Wildwood updated. Refresh to continue."))).toBe(true);
    expect(isVirtualPlayerProtocolMismatch("WILDWOOD UPDATED. REFRESH TO CONTINUE.")).toBe(true);
    expect(isVirtualPlayerProtocolMismatch(new Error("Connection timed out"))).toBe(false);
  });

  it("encodes a fixed-size private capability", () => {
    const ticket = virtualPlayerTicketFromBytes(Uint8Array.from({ length: 24 }, (_, index) => index));
    expect(ticket).toHaveLength(VIRTUAL_PLAYER_TICKET_HEX_LENGTH);
    expect(ticket.startsWith("00010203")).toBe(true);
    expect(isVirtualPlayerTicket(ticket)).toBe(true);
    expect(isVirtualPlayerTicket(ticket.toUpperCase())).toBe(false);
    expect(() => virtualPlayerTicketFromBytes(new Uint8Array(23))).toThrow();
  });

  it("slows each startup worker for latency and repeated failures", () => {
    expect(virtualPlayerRampDelayMs(100, 0)).toBe(75);
    expect(virtualPlayerRampDelayMs(2_000, 0)).toBe(700);
    expect(virtualPlayerRampDelayMs(100, 1)).toBe(250);
    expect(virtualPlayerRampDelayMs(100, 2)).toBe(500);
    expect(virtualPlayerRampDelayMs(100, 5)).toBe(2_000);
    expect(virtualPlayerRampDelayMs(Number.NaN, Number.NaN)).toBe(75);
  });

  it("uses a bounded parallel bootstrap pool", () => {
    expect(virtualPlayerStartupConcurrency(1)).toBe(1);
    expect(virtualPlayerStartupConcurrency(8)).toBe(8);
    expect(virtualPlayerStartupConcurrency(100)).toBe(16);
    expect(virtualPlayerStartupConcurrency(3_000)).toBe(16);
    expect(virtualPlayerStartupConcurrency(Number.NaN)).toBe(1);
  });
});

describe("virtual-player random walk", () => {
  it("turns and moves using bounded elapsed time", () => {
    const randomValues = [0, .5, 0];
    const next = advanceVirtualPlayerMotion({
      x: 100,
      y: 100,
      facing: Math.PI,
      moving: false,
      nextTurnAt: 0,
    }, 10, 1_000, () => randomValues.shift() ?? 0);

    expect(next.moving).toBe(true);
    expect(next.x).toBeGreaterThan(100);
    expect(next.x).toBeLessThanOrEqual(127);
    expect(next.nextTurnAt).toBeGreaterThan(1_000);
  });

  it("bounces inside world bounds", () => {
    const next = advanceVirtualPlayerMotion({
      x: WORLD_WIDTH - PLAYER_RADIUS - 1,
      y: WORLD_HEIGHT - PLAYER_RADIUS - 1,
      facing: Math.PI / 4,
      moving: true,
      nextTurnAt: 10_000,
    }, .15, 1_000);

    expect(next.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(next.x).toBeLessThanOrEqual(WORLD_WIDTH - PLAYER_RADIUS);
    expect(next.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(next.y).toBeLessThanOrEqual(WORLD_HEIGHT - PLAYER_RADIUS);
  });
});
