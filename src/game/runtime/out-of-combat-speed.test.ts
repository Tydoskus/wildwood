import { expect, it } from "vitest";
import { BLACK_BOOTS, STARTER_STONE } from "../../../shared/items";
import { createOutOfCombatSpeed } from "./out-of-combat-speed";

it("adds exactly 25 for Black Boots, in combat or out of it", () => {
  const speed = createOutOfCombatSpeed();
  expect(speed.bonus(BLACK_BOOTS)).toBe(25);
  expect(speed.bonus(STARTER_STONE)).toBe(0);
  expect(speed.bonus("")).toBe(0);
});

it("leaves duels at the researched speed", () => {
  const speed = createOutOfCombatSpeed();
  expect(speed.bonus(BLACK_BOOTS, true)).toBe(0);
});
