import { BOW_SKILL_IDS, BOW_SKILL_LABELS, bowSkillChance, bowSkillChanceRangeTenths, bowSkillTier } from "../../shared/bow-skills";
import { SWORD_SKILL_IDS, SWORD_SKILL_LABELS, swordSkillChance, swordSkillTier } from "../../shared/sword-skills";
import { STAFF_SKILL_IDS, STAFF_SKILL_LABELS, staffSkillChance, staffSkillTier } from "../../shared/staff-skills";
import { DAGGER_SKILL_IDS, DAGGER_SKILL_LABELS, daggerSkillChance, daggerSkillTier } from "../../shared/dagger-skills";
import type { WeaponSkillRoll } from "../../shared/weapon-skills";

export type ItemSkillDetail = {
  label: string;
  /** The trigger chance, in percent. */
  percent: number;
  /** The range this weapon's tier rolls in, in percent. */
  min: number;
  max: number;
  /** Where the roll sits in that range: 0 the worst it could be, 1 the best. */
  quality: number;
};

/** A weapon's skills for the item window: each one's chance and how good a roll it is for that weapon. */
export function itemSkillDetails(itemId: string, roll: WeaponSkillRoll | null | undefined): ItemSkillDetail[] {
  const sword = swordSkillTier(itemId), staff = staffSkillTier(itemId), dagger = daggerSkillTier(itemId);
  const bow = sword === null && staff === null && dagger === null ? bowSkillTier(itemId) : null;
  const tier = sword ?? staff ?? dagger ?? bow;
  if (tier === null) return [];
  const range = bowSkillChanceRangeTenths(tier), min = range.min / 10, max = range.max / 10;
  const skills = sword !== null
    ? SWORD_SKILL_IDS.map(skill => ({ label: SWORD_SKILL_LABELS[skill], chance: swordSkillChance(roll, skill) }))
    : staff !== null ? STAFF_SKILL_IDS.map(skill => ({ label: STAFF_SKILL_LABELS[skill], chance: staffSkillChance(roll, skill) }))
    : dagger !== null ? DAGGER_SKILL_IDS.map(skill => ({ label: DAGGER_SKILL_LABELS[skill], chance: daggerSkillChance(roll, skill) }))
    : BOW_SKILL_IDS.map(skill => ({ label: BOW_SKILL_LABELS[skill], chance: bowSkillChance(roll, skill) }));
  return skills.filter(skill => skill.chance > 0).map(({ label, chance }) => {
    const percent = Math.round(chance * 1000) / 10;
    return { label, percent, min, max, quality: max > min ? Math.max(0, Math.min(1, (percent - min) / (max - min))) : 1 };
  });
}
