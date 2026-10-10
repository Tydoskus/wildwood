import { expect, it } from "vitest";
import { withPackForest } from "./pack-forest";
import { SOUL_ATLAS } from "./soul-village";
import { TUTORIAL_FOREST_MAP_ID, type WorldDecor } from "./world";

const decor: WorldDecor[] = [
  { type: "tree", x: 100, y: 200, s: .9, variant: 3 },
  { type: "grass", x: 300, y: 400, variant: 1 },
  { type: "petal", x: 50, y: 60, variant: 0 } as WorldDecor,
];

it("draws the tutorial forest's trees and grass with the pack's sprites, each tree on its own shadow", () => {
  const [shadow, tree, grass, petal] = withPackForest(decor, TUTORIAL_FOREST_MAP_ID);
  expect(shadow).toMatchObject({ type: "soulProp", x: 100, y: 200, s: .9, shadow: true, frame: expect.stringMatching(/__shadow$/) });
  expect(tree).toMatchObject({ type: "soulProp", x: 100, y: 200, s: .9, frame: (shadow as { frame: string }).frame.replace("__shadow", "") });
  expect(grass).toMatchObject({ type: "soulProp", x: 300, y: 400, frame: expect.stringMatching(/^Grass_/) });
  const frame = SOUL_ATLAS.frames[(grass as { frame: keyof typeof SOUL_ATLAS.frames }).frame];
  expect((grass as { ground?: boolean }).ground).toBe(frame.ay <= 30);
  expect(petal).toBe(decor[2]);
  // The same point always draws the same tuft.
  expect(withPackForest(decor, TUTORIAL_FOREST_MAP_ID)[2]).toEqual(grass);
});

it("leaves every other map's decor alone, the Soul Dimension's night trees included", () => {
  expect(withPackForest(decor, "soul_dimension")).toEqual(decor);
  expect(withPackForest(decor, "beginner_desert")).toEqual(decor);
});
