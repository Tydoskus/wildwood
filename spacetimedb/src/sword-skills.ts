import { touchCombatProfile } from "./combat-profile";
import { table, t, type InferSchema, type ReducerCtx } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedb from "./index";
import { NO_SWORD_SKILLS, isSkillSword, rollSwordSkills, type SwordSkillRoll } from "../../shared/sword-skills";

/** First-copy rolls. Kept copies and pending offers carry the same fields on their own rows. */
export const playerSwordSkill = table({ name: "player_sword_skill", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), itemId: t.string(),
  whirlwind: t.f32(), deflect: t.f32(), shockwave: t.f32(),
});
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
export const swordSkillKey = (identity: Identity, itemId: string) => `${identity.toHexString()}:${itemId}`;

export function swordSkillRollFor(ctx: Ctx, identity: Identity, itemId: string): SwordSkillRoll {
  if (!isSkillSword(itemId)) return NO_SWORD_SKILLS;
  const row = ctx.db.playerSwordSkill.key.find(swordSkillKey(identity, itemId));
  return row ? { whirlwind: row.whirlwind, deflect: row.deflect, shockwave: row.shockwave } : NO_SWORD_SKILLS;
}
export function setSwordSkillRoll(ctx: Ctx, identity: Identity, itemId: string, roll: Partial<SwordSkillRoll>) {
  if (!isSkillSword(itemId)) return;
  const row = { key: swordSkillKey(identity, itemId), identity, itemId,
    whirlwind: roll.whirlwind ?? 0, deflect: roll.deflect ?? 0, shockwave: roll.shockwave ?? 0 };
  if (ctx.db.playerSwordSkill.key.find(row.key)) ctx.db.playerSwordSkill.key.update(row);
  else ctx.db.playerSwordSkill.insert(row);
  // Loot merges duplicates here inside a kill report, which keeps its combat profile otherwise.
  touchCombatProfile(ctx, identity);
}
/** Destruction and prestige retain a roll, so neither can be used to reroll the last copy. */
export function ensureSwordSkillRoll(ctx: Ctx, identity: Identity, itemId: string, skillLuck = 0) {
  if (!isSkillSword(itemId) || ctx.db.playerSwordSkill.key.find(swordSkillKey(identity, itemId))) return;
  setSwordSkillRoll(ctx, identity, itemId, rollSwordSkills(itemId, () => ctx.random(), skillLuck)!);
}
export function removeSwordSkills(ctx: Ctx, identity: Identity) {
  for (const row of [...ctx.db.playerSwordSkill.identity.filter(identity)]) ctx.db.playerSwordSkill.key.delete(row.key);
}
export function mergeSwordSkills(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerSwordSkill.identity.filter(guest)]) {
    ctx.db.playerSwordSkill.key.delete(row.key);
    if (!ctx.db.playerSwordSkill.key.find(swordSkillKey(account, row.itemId))) setSwordSkillRoll(ctx, account, row.itemId, row);
  }
}
export function duelSwordSkillFields(ctx: Ctx, duel: { challenger: Identity; opponent: Identity; challengerWeaponItem?: string; opponentWeaponItem?: string }) {
  const a = swordSkillRollFor(ctx, duel.challenger, duel.challengerWeaponItem ?? "");
  const b = swordSkillRollFor(ctx, duel.opponent, duel.opponentWeaponItem ?? "");
  return { challengerWhirlwind: a.whirlwind, challengerDeflect: a.deflect, challengerShockwave: a.shockwave,
    opponentWhirlwind: b.whirlwind, opponentDeflect: b.deflect, opponentShockwave: b.shockwave };
}
