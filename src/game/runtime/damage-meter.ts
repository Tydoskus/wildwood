/**
 * The damage per second the player actually deals, from the hits that land.
 * Autofarm's estimate counts damage, crits and attack speed; multishot,
 * Double Strike, bow skills and challenge attack speed it could not see, so
 * it called a strong prestige build too weak for a boss it killed in five
 * seconds and a weak one ready for a map it could not farm. This is the
 * measured rate it calibrates against.
 */
export const DAMAGE_METER_WINDOW_MS = 60_000;
/** A pause longer than this between hits is walking, not fighting, and counts only this much. */
export const DAMAGE_METER_GAP_MS = 2_500;
/** Fewer hits than this, or less fighting than this, is too little to judge by. */
export const DAMAGE_METER_MIN_HITS = 6;
export const DAMAGE_METER_MIN_FIGHTING_MS = 5_000;

export function createDamageMeter(now: () => number) {
  const hits: { at: number; damage: number }[] = [];
  const trim = (at: number) => { while (hits.length && at - hits[0].at > DAMAGE_METER_WINDOW_MS) hits.shift(); };
  return {
    /** A hit the player's weapon landed (not Reflect), before any boss-only bonus. */
    record(damage: number) {
      if (!(damage > 0) || !Number.isFinite(damage)) return;
      const at = now();
      trim(at);
      hits.push({ at, damage });
    },
    /** Damage per second while fighting in the last minute, or null with too little to go on. */
    dps() {
      trim(now());
      if (hits.length < DAMAGE_METER_MIN_HITS) return null;
      // Each hit after the first is paid for by the time since the one before it.
      let fighting = 0, damage = 0;
      for (let index = 1; index < hits.length; index += 1) {
        fighting += Math.min(DAMAGE_METER_GAP_MS, hits[index].at - hits[index - 1].at);
        damage += hits[index].damage;
      }
      return fighting >= DAMAGE_METER_MIN_FIGHTING_MS ? damage / (fighting / 1000) : null;
    },
    clear() { hits.length = 0; },
  };
}
