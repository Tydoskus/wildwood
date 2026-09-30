import { describe, expect, it } from "vitest";
import { PLAYER_SPEED } from "../../shared/rules";
import { regularMapLoot } from "../../shared/regular-map-loot";
import { enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { createMapDefinitions } from "./simulator";
import { simulationTravelSeconds } from "./gameplay-model";

describe("simulator parity with gameplay", () => {
  it("models every current campaign drop and the server's elite eligibility", () => {
    for (const map of createMapDefinitions()) {
      expect(map.regularDrops.map(d => [d.itemId, d.numerator, d.denominator]), map.id)
        .toEqual(regularMapLoot(map.id).map(d => [d.itemId, d.wins, d.outcomes]));
      for (const enemy of Object.keys(ENEMY_TYPES) as (keyof typeof ENEMY_TYPES)[]) {
        const actual = enemyDefeatDefinition(map.id, enemy);
        for (const drop of map.regularDrops) expect(drop.eligible?.(enemy)).toBe(actual?.loot === true);
      }
    }
  });

  it("includes late-map gear and keeps fractional bow odds exact", () => {
    const maps = createMapDefinitions();
    expect(maps.find(m => m.id === "ion_citadel")!.regularDrops.map(d => d.itemId))
      .toEqual(["ion_bow", "ion_armor", "ion_helmet"]);
    const bow = maps.find(m => m.id === "samurai_garden")!.regularDrops.find(d => d.itemId === "samurai_bow")!;
    expect(bow.numerator! / bow.denominator).toBe(.0065);
  });

  it("only gives Black Boots' flat speed bonus after five seconds without combat", () => {
    // Black Boots are flat now: 25/s on top of the base speed.
    const shod = PLAYER_SPEED + 25;
    expect(simulationTravelSeconds(shod, 0, true)).toBeCloseTo(1);
    expect(simulationTravelSeconds(900, 0, true)).toBeCloseTo(900 / shod);
    expect(simulationTravelSeconds(shod, 0, false)).toBeCloseTo(shod / PLAYER_SPEED);
    expect(simulationTravelSeconds(241, 10, true)).toBeCloseTo(241 / (PLAYER_SPEED * 1.2 + 25));
  });
});
