import { describe, expect, it } from "vitest";
import {
  generateMap,
  generatedBossStats,
  generatedEnemyStats,
  isProceduralMap,
  proceduralMapId,
  proceduralMapNumber,
  PROCEDURAL_ENTRY_MAP,
  PROCEDURAL_WORLD,
} from "./procedural-maps";

describe("procedural campaign definitions", () => {
  it("accepts canonical IDs only and rejects unsafe numbers", () => {
    for (const id of [
      "endless_0",
      "endless_-1",
      "endless_01",
      "endless_1.5",
      "endless_1e3",
      "endless_9007199254740992",
      "endless_1/../../",
    ])
      expect(isProceduralMap(id)).toBe(false);
    expect(proceduralMapNumber("endless_1000")).toBe(1000);
    expect(() => proceduralMapId(NaN)).toThrow();
  });
  it("creates the same world everywhere and different worlds for different seeds", () => {
    expect(generateMap("endless_17")).toEqual(generateMap("endless_17"));
    expect(generateMap("endless_17").camps).not.toEqual(
      generateMap("endless_18").camps,
    );
    expect(generateMap("endless_1").portals[0].destination).toBe(
      PROCEDURAL_ENTRY_MAP,
  PROCEDURAL_WORLD,
    );
  });
  it("connects every camp and boss with paths and links both directions", () => {
    for (let n = 1; n <= 200; n++) {
      const map = generateMap(proceduralMapId(n));
      expect((map.portals[0].x + map.portals[1].x) / 2).toBe(PROCEDURAL_WORLD.width / 2);
      for (const portal of map.portals) {
        expect(portal.y).toBe(PROCEDURAL_WORLD.height / 2);
        expect(portal.depth).toBe(portal.y);
        expect(Math.hypot(map.arrival.x - portal.x, map.arrival.y - (portal.y - portal.height * .32))).toBeGreaterThan(125);
      }
      expect(map.camps.map(c => c.stat).sort()).toEqual(["armor", "damage", "health", "regen"]);
      expect(
        generateMap(map.portals[1].destination as `endless_${number}`)
          .portals[0].destination,
      ).toBe(map.id);
      const contains = (
        p: { x: number; y: number; w: number; h: number },
        point: { x: number; y: number },
      ) =>
        point.x >= p.x &&
        point.x <= p.x + p.w &&
        point.y >= p.y &&
        point.y <= p.y + p.h;
      for (const point of [map.arrival, map.boss, ...map.camps])
        expect(map.paths.some((path) => contains(path, point))).toBe(true);
      const reached = new Set([0]);
      for (let pass = 0; pass < map.paths.length; pass++)
        map.paths.forEach((p, i) => {
          if (
            map.paths.some(
              (q, j) =>
                reached.has(j) &&
                p.x <= q.x + q.w &&
                q.x <= p.x + p.w &&
                p.y <= q.y + q.h &&
                q.y <= p.y + p.h,
            )
          )
            reached.add(i);
        });
      expect(reached.size).toBe(map.paths.length);
      for (const p of map.paths)
        expect(
          p.x >= 0 && p.y >= 0 && p.x + p.w <= 4800 && p.y + p.h <= 4800,
        ).toBe(true);
    }
  });
  it("starts forest green, moves gradually through the spectrum, and keeps combat finite far into the sequence", () => {
    const first = generateMap("endless_1"),
      second = generateMap("endless_2");
    expect(first.palette.ground).toBe("#79a668");
    expect(second.palette.ground).toMatch(/^#[a-f0-9]{6}$/);
    expect(second.palette.ground).not.toBe(first.palette.ground);
    expect(
      generatedEnemyStats(second, "Cindermaw").hp /
        generatedEnemyStats(first, "Cindermaw").hp,
    ).toBeCloseTo(1.2 * 1.1 ** 6);
    for (const n of [1, 10, 1000, Number.MAX_SAFE_INTEGER]) {
      const map = generateMap(proceduralMapId(n));

      const stats = generatedBossStats(map);
      expect(
        Number.isFinite(stats.hp) &&
          Number.isFinite(stats.damage) &&
          stats.hp < 1e36,
      ).toBe(true);
    }
  });
});
