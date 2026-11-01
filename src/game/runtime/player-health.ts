import { clamp } from "../math";
import { createDpsMeter } from "./dps-meter";

export type PlayerHealthState = {
  hp: number;
  baseMaxHp: number;
  maxHp: number;
};

/** A health card's cost can take the bonus below nothing (card-effects.ts), never to none at all. */
function safeBonus(multiplierBonus: number) {
  return Number.isFinite(multiplierBonus) ? Math.max(-.9, multiplierBonus) : 0;
}

/** Rebuilds effective max health without ever writing equipment bonuses to the save stat. */
export function applyPlayerMaxHealthMultiplierBonus(player: PlayerHealthState, multiplierBonus: number, preserveRatio = true) {
  const previousMaxHp = Math.max(1, player.maxHp);
  const hpRatio = clamp(player.hp / previousMaxHp, 0, 1);
  player.maxHp = Math.max(1, player.baseMaxHp * (1 + safeBonus(multiplierBonus)));
  player.hp = preserveRatio
    ? clamp(player.maxHp * hpRatio, 0, player.maxHp)
    : clamp(player.hp, 0, player.maxHp);
}

export function setPlayerBaseMaxHealth(player: PlayerHealthState, baseMaxHp: number, multiplierBonus: number, fillHealth = false) {
  player.baseMaxHp = Math.max(1, Number.isFinite(baseMaxHp) ? baseMaxHp : player.baseMaxHp);
  applyPlayerMaxHealthMultiplierBonus(player, multiplierBonus, !fillHealth);
  if (fillHealth) player.hp = player.maxHp;
}

export function addPlayerBaseMaxHealth(player: PlayerHealthState, amount: number, multiplierBonus: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const previousMaxHp = player.maxHp;
  player.baseMaxHp += amount;
  applyPlayerMaxHealthMultiplierBonus(player, multiplierBonus, false);
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - previousMaxHp));
}

/** Where a heal came from, and the name a healing breakdown shows for it. */
export const HEAL_SOURCE_NAMES = {
  regen: "Regen", lifesteal: "Lifesteal", "second-wind": "Second Wind", bloodlust: "Bloodlust", "panic-heal": "Panic Heal",
} as const;
export type HealSource = keyof typeof HEAL_SOURCE_NAMES;

/** The local player's healing a second by source, as playerDps counts damage. */
export const playerHealing = createDpsMeter<HealSource>();

/** Heals a living player up to max health; records and returns what it restored, nothing past full. */
export function healPlayer(player: { hp: number; maxHp: number }, amount: number, source: HealSource) {
  if (!(player.hp > 0) || !(amount > 0)) return 0;
  const before = player.hp;
  player.hp = Math.min(player.maxHp, before + amount);
  const healed = Math.max(0, player.hp - before);
  playerHealing.record(healed, source);
  return healed;
}
