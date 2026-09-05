import { BOSS_BASE_HEAVY_HIT, bossHeavyHitAt } from "../../shared/progression";

type DamageMultipliers = Record<string, number>;

function scaledProfile<const Multipliers extends DamageMultipliers>(
  heavyHit: number,
  multipliers: Multipliers,
) {
  return Object.fromEntries(Object.entries(multipliers).map(([attack, multiplier]) => [
    attack,
    heavyHit * multiplier,
  ])) as { readonly [Attack in keyof Multipliers]: number };
}

/** Fixed tier references account for both earned health and armor.
 * Boss patterns retain their relative ability strengths. */
export const BOSS_DAMAGE_REFERENCE = {
  dragon: BOSS_BASE_HEAVY_HIT,
  spider: bossHeavyHitAt(0),
  frostclaw: bossHeavyHitAt(1),
  magmalisk: bossHeavyHitAt(2),
  gloomroot: bossHeavyHitAt(3),
  tidewyrm: bossHeavyHitAt(4),
  koiShogun: bossHeavyHitAt(5),
  tempestKirin: bossHeavyHitAt(6),
  miremaw: bossHeavyHitAt(7),
  prismshell: bossHeavyHitAt(8), ironhorn: bossHeavyHitAt(9), dreadreaper: bossHeavyHitAt(10),
} as const;

export const BOSS_DAMAGE_PROFILES = {
  dragon: scaledProfile(BOSS_DAMAGE_REFERENCE.dragon, { rain: .2, cone: 1, contact: .4 }),
  spider: scaledProfile(BOSS_DAMAGE_REFERENCE.spider, { web: 5 / 7, venom: 1, contact: 4 / 7 }),
  frostclaw: scaledProfile(BOSS_DAMAGE_REFERENCE.frostclaw, { roar: .5, icefall: .7, rift: 1, contact: .45 }),
  magmalisk: scaledProfile(BOSS_DAMAGE_REFERENCE.magmalisk, { bite: 1, eruption: 2 / 3, contact: .4 }),
  gloomroot: scaledProfile(BOSS_DAMAGE_REFERENCE.gloomroot, { sweep: 1, bloom: .7, contact: .5 }),
  tidewyrm: scaledProfile(BOSS_DAMAGE_REFERENCE.tidewyrm, { surge: 1, whirlpool: .7, contact: .5 }),
  koiShogun: scaledProfile(BOSS_DAMAGE_REFERENCE.koiShogun, { slash: 1, whirlpool: .7, contact: .5 }),
  tempestKirin: scaledProfile(BOSS_DAMAGE_REFERENCE.tempestKirin, { charge: 1, thunder: .7, contact: .5 }),
  miremaw: scaledProfile(BOSS_DAMAGE_REFERENCE.miremaw, { tongue: 1, bogBurst: .7, contact: .5 }),
  prismshell: scaledProfile(BOSS_DAMAGE_REFERENCE.prismshell, { shatter: 1, crystalBurst: .7, contact: .5 }), ironhorn: scaledProfile(BOSS_DAMAGE_REFERENCE.ironhorn, { shatter: 1, crystalBurst: .7, contact: .5 }), dreadreaper: scaledProfile(BOSS_DAMAGE_REFERENCE.dreadreaper, { shatter: 1, crystalBurst: .7, contact: .5 }),
} as const;
