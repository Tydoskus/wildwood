import { damageAfterArmor } from "./combat";
import { duelAttackDelays, type DuelWeapons } from "./duel-approach";
import { regularEnemySeededUnit } from "./regular-enemy-simulation";
import { RIPOSTE_REFLECT_SHARE } from "./prestige-perks";
import { ARROW_STORM_ARROWS, ARROW_STORM_DAMAGE_SHARE, DUEL_RICOCHET_REHITS, RICOCHET_DAMAGE_SHARE, type BowSkillId } from "./bow-skills";

export type DuelFighter = { maxHp: number; damage: number; armor: number; regen: number; attackRate: number };
/** 4: bow skills (Arrow Storm, Ricochet, Piercing Shot) roll in the fight. */
export const DUEL_COMBAT_VERSION = 4;
export const DUEL_BOW_SKILLS_VERSION = 4;
export function duelHitMultiplier(seconds: number, version = 0) {
  return version >= 1 ? 1 + Math.min(4, Math.max(0, seconds - 10) / 5) : 1;
}

export type DuelCombat = DuelWeapons & {
  combatVersion?: number;
  challengerMaxHp: number; challengerDamage: number; challengerArmor: number; challengerRegen: number; challengerAttackRate: number;
  opponentMaxHp: number; opponentDamage: number; opponentArmor: number; opponentRegen: number; opponentAttackRate: number;
  // Riposte chances and the seed their rolls come from. The seed is stored with
  // the duel so a replay rolls exactly what the server rolled.
  challengerRiposte?: number; opponentRiposte?: number; riposteSeed?: number;
  // Each duellist's equipped bow skills, as stored percentages (0 = none).
  // They roll from the same stored seed as Riposte, under their own salt.
  challengerArrowStorm?: number; challengerRicochet?: number; challengerPiercingShot?: number;
  opponentArrowStorm?: number; opponentRicochet?: number; opponentPiercingShot?: number;
};

const DUEL_SKILL_FIELDS = {
  challenger: { arrowStorm: "challengerArrowStorm", ricochet: "challengerRicochet", piercingShot: "challengerPiercingShot" },
  opponent: { arrowStorm: "opponentArrowStorm", ricochet: "opponentRicochet", piercingShot: "opponentPiercingShot" },
} as const;

/**
 * Whether a duellist's bow skill fires on one of their attacks. Deterministic
 * like Riposte: the same duel, side, attack and skill always answer the same.
 * Fights recorded before bow skills existed never roll them.
 */
export function duelBowSkillProc(duel: DuelCombat, side: "challenger" | "opponent", attack: number, skill: BowSkillId) {
  if ((duel.combatVersion ?? 0) < DUEL_BOW_SKILLS_VERSION) return false;
  const percent = Number(duel[DUEL_SKILL_FIELDS[side][skill]] ?? 0);
  const chance = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) / 100 : 0;
  if (chance <= 0) return false;
  return regularEnemySeededUnit("duel-bow-skill", String(duel.riposteSeed ?? 0), side, attack, skill) < chance;
}

/**
 * One attack's damage against the defender's armor, with the attacker's bow
 * skills. One opponent means: Arrow Storm's extra arrows all hit them, each
 * through armor; Ricochet comes back off them for one more hit at its share;
 * Piercing Shot passes through their armor, so the arrow itself ignores it.
 */
function duelAttackDamage(duel: DuelCombat, side: "challenger" | "opponent", attack: number, raw: number, armor: number) {
  const arrowArmor = duelBowSkillProc(duel, side, attack, "piercingShot") ? 0 : armor;
  let dealt = damageAfterArmor(raw, arrowArmor), incoming = raw;
  if (duelBowSkillProc(duel, side, attack, "arrowStorm")) {
    const storm = raw * ARROW_STORM_DAMAGE_SHARE;
    dealt += ARROW_STORM_ARROWS * damageAfterArmor(storm, armor);
    incoming += ARROW_STORM_ARROWS * storm;
  }
  if (duelBowSkillProc(duel, side, attack, "ricochet")) {
    const bounce = raw * RICOCHET_DAMAGE_SHARE;
    dealt += DUEL_RICOCHET_REHITS * damageAfterArmor(bounce, arrowArmor);
    incoming += DUEL_RICOCHET_REHITS * bounce;
  }
  return { dealt, blocked: Math.max(0, incoming - dealt) };
}

/**
 * Whether a hit is thrown back. Deterministic: the same duel, side and attack
 * always answer the same, so the server and every replay agree without either
 * carrying a list of rolls.
 */
export function duelRiposted(duel: DuelCombat, side: "challenger" | "opponent", attack: number) {
  const chance = Math.max(0, Math.min(1, (side === "challenger" ? duel.challengerRiposte : duel.opponentRiposte) ?? 0));
  if (chance <= 0) return false;
  return regularEnemySeededUnit("duel-riposte", duel.riposteSeed ?? 0, side, attack) < chance;
}
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
  const delays = duelAttackDelays(duel);
  const challengerDelay = Math.round(delays.challenger * 1_000_000);
  const opponentDelay = Math.round(delays.opponent * 1_000_000);

  while (resolvedMicros < end && state.challengerHp > 0 && state.opponentHp > 0) {
    const challengerNext = state.challengerAttacks < (limits.challengerAttacks ?? Infinity)
      ? challengerDelay + (state.challengerAttacks + 1) * challengerInterval : Infinity;
    const opponentNext = state.opponentAttacks < (limits.opponentAttacks ?? Infinity)
      ? opponentDelay + (state.opponentAttacks + 1) * opponentInterval : Infinity;
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
      state.challengerAttacks++;
      const challengerHit = duelAttackDamage(duel, "challenger", state.challengerAttacks, challengerDamage, duel.opponentArmor);
      const taken = Math.min(state.opponentHp, challengerHit.dealt);
      state.opponentHp -= taken; state.challengerDamageDealt += taken;
      state.opponentBlocked += challengerHit.blocked;
      if (taken > 0 && duelRiposted(duel, "opponent", state.challengerAttacks)) {
        const thrown = Math.min(state.challengerHp, taken * RIPOSTE_REFLECT_SHARE);
        state.challengerHp -= thrown; state.opponentDamageDealt += thrown;
      }
    }
    if (opponentNext === next) {
      const opponentDamage = duel.opponentDamage * multiplier;
      state.opponentAttacks++;
      const opponentHit = duelAttackDamage(duel, "opponent", state.opponentAttacks, opponentDamage, duel.challengerArmor);
      const taken = Math.min(state.challengerHp, opponentHit.dealt);
      state.challengerHp -= taken; state.opponentDamageDealt += taken;
      state.challengerBlocked += opponentHit.blocked;
      if (taken > 0 && duelRiposted(duel, "challenger", state.opponentAttacks)) {
        const thrown = Math.min(state.opponentHp, taken * RIPOSTE_REFLECT_SHARE);
        state.opponentHp -= thrown; state.challengerDamageDealt += thrown;
      }
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

/** Deterministic saved-lineup combat used by asynchronous guild battles. */
export function simulateDuelBattle(challenger: DuelFighter, opponent: DuelFighter) {
  const combat = { combatVersion: DUEL_COMBAT_VERSION,
    challengerMaxHp: challenger.maxHp, challengerDamage: challenger.damage, challengerArmor: challenger.armor, challengerRegen: challenger.regen, challengerAttackRate: challenger.attackRate,
    opponentMaxHp: opponent.maxHp, opponentDamage: opponent.damage, opponentArmor: opponent.armor, opponentRegen: opponent.regen, opponentAttackRate: opponent.attackRate };
  const result = advanceDuelCombat(combat, initialDuelCombatState(combat), 0, 30_000_000);
  return { combat, result, outcome: duelOutcome(combat, result), durationMicros: Math.max(3_000_000, result.resolvedMicros) };
}
