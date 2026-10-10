import { SOUL_STAT_DETAILS, soulStatsUnlocked, type SoulCamp, type SoulStatId } from "../../shared/soul-dimension";
import type { EnemyKind } from "./enemies";

/** Which forest creature wears each soul stat. */
export const SOUL_ENEMY_SPECIES: Readonly<Record<SoulStatId, EnemyKind>> = {
  damage: "Spitter", health: "Bramble", armor: "Mossback", regen: "Brood", attackSpeed: "Needle", critDamage: "Dread Warden",
};
export const SOUL_ENEMY_KINDS: readonly EnemyKind[] = [...new Set(Object.values(SOUL_ENEMY_SPECIES))];
/** The Soul Defense Force (runtime/soul-defense-force.ts): an Angry Evilmass, the Endless monster with its brain showing (Ryan's pick). */
export const SOUL_DEFENSE_FORCE_KIND: EnemyKind = "Angry Evilmass";

/** The soul stat a camp is for a player at this tier, or null before the first tier. */
export function soulCampStat(camp: Pick<SoulCamp, "roll">, tier: number): SoulStatId | null {
  const unlocked = soulStatsUnlocked(tier);
  return unlocked.length ? unlocked[Math.min(unlocked.length - 1, Math.floor(camp.roll * unlocked.length))] : null;
}

/** A soul enemy's camp name carries its stat and camp, so a kill knows what it paid. */
export const soulCampName = (stat: SoulStatId, camp: Pick<SoulCamp, "key">) => `soul:${stat}:${camp.key}`;
export function soulStatOfCampName(campName: string | undefined): SoulStatId | null {
  if (!campName?.startsWith("soul:")) return null;
  const stat = campName.split(":")[1] as SoulStatId;
  return stat in SOUL_ENEMY_SPECIES ? stat : null;
}

/** What one soul kill pays, as its popup and the autofarm window show it: "+1", "+0.1" (rating points for attack speed and crit). */
export function soulRewardText(stat: SoulStatId) {
  const reward = SOUL_STAT_DETAILS[stat].reward;
  return `+${reward}`;
}
