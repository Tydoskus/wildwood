import { describe, expect, it } from "vitest";
import { MARBLE_BAG_SIZE, createMarbleBag, marbleBagHit } from "./marble-bag";

/** A small seeded generator, so the tests read the same every run. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

describe("marble bag", () => {
  it("holds the exact share in every run of bags, for each Reflect rank", () => {
    for (const chance of [.06, .12, .18, .24, .3]) {
      const bag = createMarbleBag(seeded(7));
      const draws = MARBLE_BAG_SIZE * 50;
      let hits = 0;
      for (let i = 0; i < draws; i++) if (bag.draw(chance)) hits++;
      expect(hits).toBe(Math.round(chance * draws));
    }
  });

  it("never lets a drought run past two bags, where coin flips at 6% go a hundred hits dry", () => {
    const bag = createMarbleBag(seeded(11));
    let dry = 0, longest = 0;
    for (let i = 0; i < 20_000; i++) {
      if (bag.draw(.06)) dry = 0; else longest = Math.max(longest, ++dry);
    }
    // A hit may open one bag and close the next, but no bag at 6% is empty.
    expect(longest).toBeLessThan(2 * MARBLE_BAG_SIZE);
  });

  it("reads a chance stored as f32 as the rate it was meant to be", () => {
    const f32 = Math.fround(.06);
    expect(f32).toBeLessThan(.06);
    let hits = 0;
    for (let draw = 0; draw < MARBLE_BAG_SIZE * 5; draw++) if (marbleBagHit(f32, draw, (bag, slot) => ((bag * 31 + slot * 17) % 97) / 97)) hits++;
    expect(hits).toBe(6);
  });

  it("answers the same draw the same way, so a duel replayed from the start agrees with the server", () => {
    const unit = (bag: number, slot: number) => seeded(bag * 1000 + slot + 1)();
    const once = Array.from({ length: 60 }, (_, draw) => marbleBagHit(.24, draw, unit));
    const again = Array.from({ length: 60 }, (_, draw) => marbleBagHit(.24, draw, unit));
    expect(again).toEqual(once);
    expect(once.filter(Boolean)).toHaveLength(14);   // floor(.24 × 60): the share rounds down until it is owed
  });

  it("starts a fresh bag when the chance changes, and handles none and certain", () => {
    const bag = createMarbleBag(seeded(3));
    expect(Array.from({ length: 40 }, () => bag.draw(0)).some(Boolean)).toBe(false);
    expect(Array.from({ length: 40 }, () => bag.draw(1)).every(Boolean)).toBe(true);
    let hits = 0;
    for (let i = 0; i < MARBLE_BAG_SIZE; i++) if (bag.draw(.3)) hits++;
    expect(hits).toBe(6);
  });
});
