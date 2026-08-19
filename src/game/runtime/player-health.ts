import { clamp } from "../math";

export type PlayerHealthState = {
  hp: number;
  baseMaxHp: number;
  maxHp: number;
};

function safeMultiplier(multiplier: number) {
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}

/** Rebuilds effective max health without ever writing equipment bonuses to the save stat. */
export function applyPlayerMaxHealthMultiplier(player: PlayerHealthState, multiplier: number, preserveRatio = true) {
  const previousMaxHp = Math.max(1, player.maxHp);
  const hpRatio = clamp(player.hp / previousMaxHp, 0, 1);
  player.maxHp = Math.max(1, player.baseMaxHp * safeMultiplier(multiplier));
  player.hp = preserveRatio
    ? clamp(player.maxHp * hpRatio, 0, player.maxHp)
    : clamp(player.hp, 0, player.maxHp);
}

export function setPlayerBaseMaxHealth(player: PlayerHealthState, baseMaxHp: number, multiplier: number, fillHealth = false) {
  player.baseMaxHp = Math.max(1, Number.isFinite(baseMaxHp) ? baseMaxHp : player.baseMaxHp);
  applyPlayerMaxHealthMultiplier(player, multiplier, !fillHealth);
  if (fillHealth) player.hp = player.maxHp;
}

export function addPlayerBaseMaxHealth(player: PlayerHealthState, amount: number, multiplier: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const previousMaxHp = player.maxHp;
  player.baseMaxHp += amount;
  applyPlayerMaxHealthMultiplier(player, multiplier, false);
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - previousMaxHp));
}
