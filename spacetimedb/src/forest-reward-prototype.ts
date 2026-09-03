import { FOREST_REWARD_PROTOTYPE as rules, type ForestPrototypeAttack, type ForestPrototypeState } from "../../shared/forest-reward-prototype";

/** No clocks, RNG, caller totals, or real-save access: all inputs except actions come from server state. */
export function beginForestPrototype(previous: ForestPrototypeState | null, now: bigint): ForestPrototypeState {
  if (previous?.enemyHp && previous.enemyHp > 0) return previous;
  if (previous && now < previous.respawnAt) throw new Error("Prototype slime is still respawning.");
  return {
    encounter: (previous?.encounter ?? 0n) + 1n,
    enemyHp: rules.enemyHp,
    damage: previous?.damage ?? rules.initialDamage,
    kills: previous?.kills ?? 0n,
    lastAttack: previous?.lastAttack ?? 0n,
    nextAttackAt: now + rules.windupMicros,
    respawnAt: 0n,
  };
}

export function attackForestPrototype(state: ForestPrototypeState, action: ForestPrototypeAttack, now: bigint): ForestPrototypeState {
  if (!Number.isInteger(action.count) || action.count < 1 || action.count > rules.maxBatch) {
    throw new Error(`Prototype batches must contain 1–${rules.maxBatch} attacks.`);
  }
  if (action.encounter !== state.encounter) throw new Error("Stale prototype encounter. Refresh the test.");
  if (action.firstAttack < 1n) throw new Error("Invalid prototype attack sequence.");
  const lastAttack = action.firstAttack + BigInt(action.count) - 1n;
  // A retry is a successful no-op, including after the killing hit.
  if (lastAttack <= state.lastAttack) return state;
  if (action.firstAttack !== state.lastAttack + 1n) throw new Error("Out-of-order or overlapping prototype attacks.");
  if (state.enemyHp <= 0) throw new Error("Prototype slime is already defeated.");
  if (now < state.nextAttackAt) throw new Error("Prototype attack cooldown is active.");
  const due = (now - state.nextAttackAt) / rules.attackIntervalMicros + 1n;
  if (BigInt(action.count) > due) throw new Error("Prototype attack batch exceeds the server-time budget.");
  // Only three attack slots can be retained. Long idle periods cannot bank unlimited damage.
  const oldestAllowed = now - BigInt(rules.maxBatch - 1) * rules.attackIntervalMicros;
  const attackAnchor = state.nextAttackAt > oldestAllowed ? state.nextAttackAt : oldestAllowed;
  const enemyHp = Math.max(0, state.enemyHp - state.damage * action.count);
  const defeated = enemyHp === 0;
  return {
    ...state, enemyHp, lastAttack,
    nextAttackAt: attackAnchor + BigInt(action.count) * rules.attackIntervalMicros,
    damage: state.damage + (defeated ? rules.damageReward : 0),
    kills: state.kills + (defeated ? 1n : 0n),
    respawnAt: defeated ? now + rules.respawnMicros : 0n,
  };
}
