import { expect, it } from "vitest";
import { roadOutline } from "./forest-road";

it("outlines roads together: no edge where two meet or cross, outer corners only where a road stops", () => {
  // A crossroads: a long road and a short one through its middle.
  const edges = roadOutline([{ x: 0, y: 100, w: 1000, h: 100 }, { x: 450, y: 0, w: 100, h: 300 }]);
  const tops = edges.filter(edge => edge.side === "top").map(({ at, from, to, cornerFrom, cornerTo }) => ({ at, from, to, cornerFrom, cornerTo }));
  expect(tops).toEqual([
    { at: 0, from: 450, to: 550, cornerFrom: true, cornerTo: true },
    { at: 100, from: 0, to: 450, cornerFrom: true, cornerTo: false },
    { at: 100, from: 550, to: 1000, cornerFrom: false, cornerTo: true },
  ]);
  // Twelve stretches round a plus sign, and none inside it.
  expect(edges).toHaveLength(12);
});

it("gives two plazas side by side one outline, with no edge between them", () => {
  const edges = roadOutline([{ x: 0, y: 0, w: 300, h: 150 }, { x: 0, y: 150, w: 300, h: 150 }]);
  expect(edges.map(edge => [edge.side, edge.at, edge.from, edge.to])).toEqual([
    ["top", 0, 0, 300], ["bottom", 300, 0, 300], ["left", 0, 0, 300], ["right", 300, 0, 300],
  ]);
});
