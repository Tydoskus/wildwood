import { describe, expect, it } from "vitest";
import { createSpatialGrid } from "./spatial-grid";

describe("spatial grid", () => {
  it("returns only entities from intersected cells and reuses the output", () => {
    const grid = createSpatialGrid<{ id: string; x: number; y: number }>(100, 500, 500);
    grid.rebuild([
      { id: "near", x: 25, y: 25 },
      { id: "edge", x: 105, y: 25 },
      { id: "far", x: 420, y: 420 },
    ]);
    const output: { id: string; x: number; y: number }[] = [];
    expect(grid.queryBounds(0, 0, 150, 80, output).map((item) => item.id)).toEqual(["near", "edge"]);
    expect(grid.queryBounds(400, 400, 499, 499, output).map((item) => item.id)).toEqual(["far"]);
  });

  it("visits same-cell and adjacent-cell pairs once", () => {
    const grid = createSpatialGrid<{ id: string; x: number; y: number }>(100, 500, 500);
    grid.rebuild([
      { id: "a", x: 10, y: 10 },
      { id: "b", x: 20, y: 20 },
      { id: "c", x: 110, y: 20 },
      { id: "far", x: 410, y: 410 },
    ]);
    const pairs: string[] = [];
    grid.forEachNeighborPair((left, right) => pairs.push([left.id, right.id].sort().join("-")));
    expect(pairs.sort()).toEqual(["a-b", "a-c", "b-c"]);
  });
});
