import { damageAfterArmor } from "./combat";

export type DuelFighter = { maxHp: number; damage: number; armor: number; regen: number; attackRate: number };
export const DUEL_COMBAT_VERSION = 1;
export function duelHitMultiplier(seconds: number, version = 0) {
  return version >= 1 ? 1 + Math.min(4, Math.max(0, seconds - 10) / 5) : 1;
}

export type DuelCombat = {
  combatVersion?: number;
  challengerMaxHp: number; challengerDamage: number; challengerArmor: number; challengerRegen: number; challengerAttackRate: number;
  opponentMaxHp: number; opponentDamage: number; opponentArmor: number; opponentRegen: number; opponentAttackRate: number;
};
export type DuelCombatState = {
  challengerHp: number; opponentHp: number; challengerAttacks: number; opponentAttacks: number;
  challengerDamageDealt: number; opponentDamageDealt: number; challengerRegened: number; opponentRegened: number;
  challengerBlocked: number; opponentBlocked: number;
};
export function initialDuelCombatState(duel: DuelCombat): DuelCombatState {
  return { challengerHp: duel.challengerMaxHp, opponentHp: duel.opponentMaxHp,
    challengerAttacks: 0, opponentAttacks: 0, challengerDamageDealt: 0, opponentDamageDealt: 0,
    challengerRegened: 0, opponentRegened: 0, challengerBlocked: 0, opponentBlocked: 0 };
}

/** Raw earned stats, with simultaneous hits and identical microsecond rounding
 * on server, live presentation, and replay. No matchmaking stat normalization. */
export function advanceDuelCombat(
  duel: DuelCombat, previous: DuelCombatState, fromMicros: number, toMicros: number,
  limits: { challengerAttacks?: number; opponentAttacks?: number } = {},
) {
  const state = { ...previous };
  let resolvedMicros = Math.max(0, Math.round(fromMicros));
  const end = Math.max(resolvedMicros, Math.round(toMicros));
  const challengerInterval = Math.max(1, Math.round(duel.challengerAttackRate * 1_000_000));
  const opponentInterval = Math.max(1, Math.round(duel.opponentAttackRate * 1_000_000));

  while (resolvedMicros < end && state.challengerHp > 0 && state.opponentHp > 0) {
    const challengerNext = state.challengerAttacks < (limits.challengerAttacks ?? Infinity)
      ? (state.challengerAttacks + 1) * challengerInterval : Infinity;
    const opponentNext = state.opponentAttacks < (limits.opponentAttacks ?? Infinity)
      ? (state.opponentAttacks + 1) * opponentInterval : Infinity;
    const next = Math.min(end, challengerNext, opponentNext);
    const delta = Math.max(0, next - resolvedMicros) / 1_000_000;
    const challengerRegen = Math.min(duel.challengerMaxHp - state.challengerHp, Math.max(0, duel.challengerRegen) * delta);
    const opponentRegen = Math.min(duel.opponentMaxHp - state.opponentHp, Math.max(0, duel.opponentRegen) * delta);
    state.challengerHp += challengerRegen; state.challengerRegened += challengerRegen;
    state.opponentHp += opponentRegen; state.opponentRegened += opponentRegen;
    resolvedMicros = next;
    const multiplier = duelHitMultiplier(next / 1_000_000, duel.combatVersion);
    // Resolve both scheduled attacks even if the first is lethal. Calculate
    // mitigation only for actual hits, not regeneration-only server pulses.
    if (challengerNext === next) {
      const challengerDamage = duel.challengerDamage * multiplier;
      const challengerHit = damageAfterArmor(challengerDamage, duel.opponentArmor);
      state.challengerAttacks++;
      const taken = Math.min(state.opponentHp, challengerHit);
      state.opponentHp -= taken; state.challengerDamageDealt += taken;
      state.opponentBlocked += Math.max(0, challengerDamage - challengerHit);
    }
    if (opponentNext === next) {
      const opponentDamage = duel.opponentDamage * multiplier;
      const opponentHit = damageAfterArmor(opponentDamage, duel.challengerArmor);
      state.opponentAttacks++;
      const taken = Math.min(state.challengerHp, opponentHit);
      state.challengerHp -= taken; state.opponentDamageDealt += taken;
      state.challengerBlocked += Math.max(0, opponentDamage - opponentHit);
    }
  }
  return { ...state, resolvedMicros };
}

/** Knockout wins; at the time limit compare health remaining as a fraction.
 * Absolute remaining HP would award a passive high-HP build a free timeout win. */
export function duelOutcome(duel: Pick<DuelCombat, "challengerMaxHp" | "opponentMaxHp">,
  state: Pick<DuelCombatState, "challengerHp" | "opponentHp">): "CHALLENGER_WIN" | "OPPONENT_WIN" | "DRAW" {
  if (state.challengerHp <= 0 || state.opponentHp <= 0) {
    if (state.challengerHp <= 0 && state.opponentHp <= 0) return "DRAW";
    return state.challengerHp > 0 ? "CHALLENGER_WIN" : "OPPONENT_WIN";
  }
  const difference = state.challengerHp / Math.max(1, duel.challengerMaxHp) - state.opponentHp / Math.max(1, duel.opponentMaxHp);
  return Math.abs(difference) <= 1e-9 ? "DRAW" : difference > 0 ? "CHALLENGER_WIN" : "OPPONENT_WIN";
}
