/**
 * A chance drawn from a bag of marbles instead of a fresh coin each time.
 *
 * Each bag of MARBLE_BAG_SIZE draws holds a fixed number of hits in a shuffled
 * order, and draws take them in turn. The running total of hits rounds down
 * from chance × draws, so bags hold the exact share over time (at 6%: bags of
 * 1, 1, 1, 1 and 2 hits in 20) and a rate cannot drift: a drought is followed
 * by the hits it owes within a bag, and a streak by the misses. The long-run
 * average is the chance itself, which is all the server's claim bound assumes.
 *
 * `marbleBagHit` is a pure function of the draw number, so a duel that is
 * advanced in steps on the server and replayed from the start on a client
 * rolls the same. `createMarbleBag` is the stateful form for the field.
 */
export const MARBLE_BAG_SIZE = 20;

/** Hits in the first `bags` bags. The epsilon absorbs a chance stored as f32 (0.06 reads back as 0.0599999…). */
function hitsThrough(chance: number, size: number, bags: number) {
  return Math.floor(chance * size * bags + 1e-6);
}

/**
 * Whether draw number `draw` (from 0) is a hit. `unit(bag, slot)` orders a
 * bag's marbles: any values in [0, 1), distinct in practice; the slots with
 * the lowest values are the hits.
 */
export function marbleBagHit(chance: number, draw: number, unit: (bag: number, slot: number) => number, size = MARBLE_BAG_SIZE) {
  if (!(chance > 0) || !Number.isFinite(draw) || draw < 0) return false;
  if (chance >= 1) return true;
  const index = Math.floor(draw);
  const bag = Math.floor(index / size), slot = index % size;
  const hits = hitsThrough(chance, size, bag + 1) - hitsThrough(chance, size, bag);
  if (hits <= 0) return false;
  if (hits >= size) return true;
  const mine = unit(bag, slot);
  let lower = 0;
  for (let other = 0; other < size; other++) {
    if (other === slot) continue;
    const value = unit(bag, other);
    if (value < mine || (value === mine && other < slot)) lower++;
  }
  return lower < hits;
}

/**
 * The field's bag: draws in order, each bag shuffled from `random` as it
 * starts. A different chance (a perk point spent or refunded) starts a fresh
 * bag, since the old one was filled for the old rate.
 */
export function createMarbleBag(random: () => number = Math.random, size = MARBLE_BAG_SIZE) {
  let chance = Number.NaN, draw = 0, bag = -1;
  const order: number[] = [];
  return {
    draw(next: number) {
      if (next !== chance) { chance = next; draw = 0; bag = -1; }
      const current = Math.floor(draw / size);
      if (current !== bag) {
        bag = current;
        for (let slot = 0; slot < size; slot++) order[slot] = random();
      }
      return marbleBagHit(chance, draw++, (_bag, slot) => order[slot], size);
    },
  };
}
