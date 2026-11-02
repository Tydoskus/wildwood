/** The stats kills raise: everything else in power (gear, cards, research, levels) is an upgrade. */
export type PowerBase = { maxHp: number; damage: number; attackRate: number; armor: number; regen: number };
export type PowerJump = { from: number; to: number; gain: number };

/** Gains smaller than this are a refine step or rounding, not a moment. */
const MIN_JUMP = .01;
/** Gear and cards arrive from the server after a load: nothing before this counts as an upgrade. */
const SETTLE_MS = 5_000;

/**
 * Notices a rise in power that kills did not make: the previous stats are priced again with the gear, cards and
 * research in play now, and what that adds is the upgrade's own share.
 */
export function createPowerJumpWatch(price: (base: PowerBase) => number, base: () => PowerBase, now = () => performance.now()) {
  let last: { base: PowerBase; power: number } | null = null;
  const armedAt = now() + SETTLE_MS;
  return function check(): PowerJump | null {
    const current = { ...base() }, power = price(current);
    const previous = last;
    last = { base: current, power };
    if (!previous || power <= previous.power || previous.power <= 0 || now() < armedAt) return null;
    const gain = price(previous.base) / previous.power - 1;
    return gain >= MIN_JUMP ? { from: previous.power, to: power, gain } : null;
  };
}
