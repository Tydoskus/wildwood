import type { Identity } from "spacetimedb";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type spacetimedb from "./index";
import { isSkillSword } from "../../shared/sword-skills";
import { isSkillStaff } from "../../shared/staff-skills";
import { bowSkillRollFor, ensureBowSkillRoll } from "./bow-skills";
import { ensureSwordSkillRoll, swordSkillRollFor } from "./sword-skills";
import { ensureStaffSkillRoll, staffSkillRollFor } from "./staff-skills";
import { isSkillDagger } from "../../shared/dagger-skills";
import { daggerSkillRollFor, ensureDaggerSkillRoll } from "./dagger-skills";

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
export const weaponSkillRollFor = (ctx: Ctx, identity: Identity, itemId: string) =>
  isSkillSword(itemId) ? swordSkillRollFor(ctx, identity, itemId)
    : isSkillStaff(itemId) ? staffSkillRollFor(ctx, identity, itemId) : isSkillDagger(itemId) ? daggerSkillRollFor(ctx, identity, itemId) : bowSkillRollFor(ctx, identity, itemId);
export function ensureWeaponSkillRoll(ctx: Ctx, identity: Identity, itemId: string, skillLuck = 0) {
  if (isSkillSword(itemId)) ensureSwordSkillRoll(ctx, identity, itemId, skillLuck);
  else if (isSkillStaff(itemId)) ensureStaffSkillRoll(ctx, identity, itemId, skillLuck);
  else if (isSkillDagger(itemId)) ensureDaggerSkillRoll(ctx, identity, itemId, skillLuck);
  else ensureBowSkillRoll(ctx, identity, itemId, skillLuck);
}
export function ensureWeaponSkillRolls(ctx: Ctx, identity: Identity, itemIds: Iterable<string>) {
  for (const itemId of new Set(itemIds)) ensureWeaponSkillRoll(ctx, identity, itemId);
}
