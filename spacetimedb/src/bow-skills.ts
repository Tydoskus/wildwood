import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { NO_BOW_SKILLS, isSkillBow, rollBowSkills, type BowSkillRoll } from "../../shared/bow-skills";

/**
 * Each player's bow skill rolls, one row per bow id they have ever held.
 *
 * Inventory stores item ids, so a roll belongs to (player, bow id) and every
 * copy of that bow shares it. Rows are written once and never re-rolled: a bow
 * that is destroyed, converted or taken by a prestige keeps its roll for when
 * it drops again, so throwing a bow away is never a way to roll it afresh.
 *
 * Its own private table, read through the caller-scoped my_bow_skills view,
 * rather than columns on player_progress: a column on a table every session
 * reads would strand every open tab on publish. Chances are percentages
 * (2.4 = 2.4%); 0 means the skill did not appear on that bow.
 */
export const playerBowSkill = table({ name: "player_bow_skill", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  itemId: t.string(),
  arrowStorm: t.f32(),
  ricochet: t.f32(),
  piercingShot: t.f32(),
});

type Ctx = any;

export const bowSkillKey = (identity: { toHexString(): string }, itemId: string) => `${identity.toHexString()}:${itemId}`;

function rollOf(row: any): BowSkillRoll {
  return { arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot };
}

/** The roll on a player's bow, or no skills when it is not a skill bow or has not been rolled. */
export function bowSkillRollFor(ctx: Ctx, identity: Identity, itemId: string): BowSkillRoll {
  if (!itemId || !isSkillBow(itemId)) return NO_BOW_SKILLS;
  const row = ctx.db.playerBowSkill.key.find(bowSkillKey(identity, itemId));
  return row ? rollOf(row) : NO_BOW_SKILLS;
}

/**
 * Rolls a bow for a player the first time they hold it. Safe to call on every
 * path that hands out an item: anything that is not a skill bow costs no read,
 * and a bow already rolled keeps its roll.
 */
export function ensureBowSkillRoll(ctx: Ctx, identity: Identity, itemId: string) {
  if (!isSkillBow(itemId)) return;
  const key = bowSkillKey(identity, itemId);
  if (ctx.db.playerBowSkill.key.find(key)) return;
  const roll = rollBowSkills(itemId, () => ctx.random())!;
  ctx.db.playerBowSkill.insert({ key, identity, itemId, ...roll });
}

export function ensureBowSkillRolls(ctx: Ctx, identity: Identity, itemIds: Iterable<string>) {
  for (const itemId of new Set(itemIds)) ensureBowSkillRoll(ctx, identity, itemId);
}

export function removeBowSkills(ctx: Ctx, identity: Identity) {
  for (const row of [...ctx.db.playerBowSkill.identity.filter(identity)] as any[]) ctx.db.playerBowSkill.key.delete(row.key);
}

/**
 * A guest's rolls follow its save onto the signed-in account. Where the
 * account already rolled the same bow, the account's roll stands; everything
 * else the guest rolled moves over as it was.
 */
export function mergeBowSkills(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerBowSkill.identity.filter(guest)] as any[]) {
    ctx.db.playerBowSkill.key.delete(row.key);
    const key = bowSkillKey(account, row.itemId);
    if (!ctx.db.playerBowSkill.key.find(key)) ctx.db.playerBowSkill.insert({ ...row, key, identity: account });
  }
}

/**
 * Both duellists' bow skills, in the fields the duel simulation reads. Rolls
 * never change once written, so reading them at every resolution gives the
 * same fight each time; startDuel rolls any bow that had not been yet.
 */
export function duelBowSkillFields(ctx: Ctx, duel: { challenger: Identity; opponent: Identity; challengerWeaponItem?: string; opponentWeaponItem?: string }) {
  const challenger = bowSkillRollFor(ctx, duel.challenger, duel.challengerWeaponItem ?? "");
  const opponent = bowSkillRollFor(ctx, duel.opponent, duel.opponentWeaponItem ?? "");
  return {
    challengerArrowStorm: challenger.arrowStorm, challengerRicochet: challenger.ricochet, challengerPiercingShot: challenger.piercingShot,
    opponentArrowStorm: opponent.arrowStorm, opponentRicochet: opponent.ricochet, opponentPiercingShot: opponent.piercingShot,
  };
}
