import { expect, it } from "vitest";
import { fightLine, fightReadoutEnabled } from "./fight-readout";

it("reads a fight as hits dealt, seconds, hits taken and health lost", () => {
  expect(fightLine("Spitter", { startedAt: 1_000, hitsDealt: 3, hitsTaken: 4, damageTaken: 38, maxHp: 100 }, 5_100))
    .toBe("Spitter: 3 hits, 4.1s · took 4 hits, 38% hp");
});

it("shows only on a local build", () => {
  expect(fightReadoutEnabled({ hostname: "127.0.0.1" })).toBe(true);
  expect(fightReadoutEnabled({ hostname: "localhost" })).toBe(true);
  expect(fightReadoutEnabled({ hostname: "tydoskus.github.io" })).toBe(false);
  expect(fightReadoutEnabled(undefined)).toBe(false);
});
