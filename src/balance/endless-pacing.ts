import { BOSS_REGEN_FRACTION_PER_SECOND } from "../../shared/boss-regeneration";
import { generatedBossStats, generatedEnemyStats } from "../../shared/procedural-maps";
import { BOSS_TARGET_SECONDS } from "../../shared/progression";
import { AEGIS_PRIME_MAX_HP, MIN_ATTACK_INTERVAL } from "../../shared/rules";

/** Transparent progression diagnostic, not a prediction of a player's playtime.
 * Carry the prior 90-second boss build into the next map; gates pay no stats.
 * Hold attack speed fixed and omit gear/research so changes in map requirements
 * cannot be hidden by a simultaneous change in the assumed player build. */
export function endlessPacing(number: number) {
  const boss = generatedBossStats({ number });
  const previous = number === 1 ? { hp: AEGIS_PRIME_MAX_HP }
    : generatedBossStats({ number: number - 1 });
  const hits = Math.floor(BOSS_TARGET_SECONDS / MIN_ATTACK_INTERVAL) + 1;
  const requiredDamage = (hp: number) => hp * (1 + (hits - 1) * BOSS_REGEN_FRACTION_PER_SECOND * MIN_ATTACK_INTERVAL) / hits;
  const entryDamage = requiredDamage(previous.hp);
  const targetDamage = requiredDamage(boss.hp);
  const extraDamage = Math.max(0, targetDamage - entryDamage);
  const reaper = generatedEnemyStats({ number }, "Dread Warden");
  return { number, entryDamage, targetDamage, extraDamage,
    damageReward: reaper.reward.amount,
    damageKills: Math.ceil(extraDamage / reaper.reward.amount),
    // Fight time at entry, before the new map's damage gains. Excludes travel,
    // respawns, critical hits, survival, and additional defensive farming.
    entryEnemyFightSeconds: Math.ceil(reaper.hp / entryDamage) * MIN_ATTACK_INTERVAL,
  };
}
