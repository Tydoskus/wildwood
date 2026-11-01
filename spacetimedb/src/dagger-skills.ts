import { table, t, type ReducerCtx, type InferSchema } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { NO_DAGGER_SKILLS, isSkillDagger, rollDaggerSkills, type DaggerSkillRoll } from "../../shared/dagger-skills";
import spacetimedb from ".";

export const playerDaggerSkill = table({ name: "player_dagger_skill", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  itemId: t.string(),
  backstab: t.f32(),
  poison: t.f32(),
  dodge: t.f32(),
});

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export const daggerSkillKey = (identity: { toHexString(): string }, itemId: string) => `${identity.toHexString()}:${itemId}`;

function rollOf(row: any): DaggerSkillRoll {
  return { backstab: row.backstab, poison: row.poison, dodge: row.dodge };
}

export function daggerSkillRollFor(ctx: Ctx, identity: Identity, itemId: string): DaggerSkillRoll {
  if (!itemId || !isSkillDagger(itemId)) return NO_DAGGER_SKILLS;
  const row = ctx.db.playerDaggerSkill.key.find(daggerSkillKey(identity, itemId));
  return row ? rollOf(row) : NO_DAGGER_SKILLS;
}

export function setDaggerSkillRoll(ctx: Ctx, identity: Identity, itemId: string, roll: Partial<DaggerSkillRoll>) {
  if (!isSkillDagger(itemId)) return;
  const row = { key: daggerSkillKey(identity, itemId), identity, itemId,
    backstab: roll.backstab ?? 0, poison: roll.poison ?? 0, dodge: roll.dodge ?? 0 };
  if (ctx.db.playerDaggerSkill.key.find(row.key)) ctx.db.playerDaggerSkill.key.update(row);
  else ctx.db.playerDaggerSkill.insert(row);
}

export function ensureDaggerSkillRoll(ctx: Ctx, identity: Identity, itemId: string, skillLuck = 0) {
  if (!isSkillDagger(itemId)) return;
  const key = daggerSkillKey(identity, itemId);
  if (ctx.db.playerDaggerSkill.key.find(key)) return;
  const roll = rollDaggerSkills(itemId, () => ctx.random(), skillLuck)!;
  ctx.db.playerDaggerSkill.insert({ key, identity, itemId, ...roll });
}

export function removeDaggerSkills(ctx: Ctx, identity: Identity) {
  for (const row of [...ctx.db.playerDaggerSkill.identity.filter(identity)] as any[]) ctx.db.playerDaggerSkill.key.delete(row.key);
  if (ctx.db.playerWornSkill?.identity.find(identity)) ctx.db.playerWornSkill.identity.delete(identity);
}

export function mergeDaggerSkills(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerDaggerSkill.identity.filter(guest)] as any[]) {
    ctx.db.playerDaggerSkill.key.delete(row.key);
    const key = daggerSkillKey(account, row.itemId);
    if (!ctx.db.playerDaggerSkill.key.find(key)) ctx.db.playerDaggerSkill.insert({ ...row, key, identity: account });
  }
}
