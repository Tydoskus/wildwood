import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { isSkillWeapon } from "../../shared/weapon-skills";
import { weaponSkillRollFor } from "./weapon-skills";
import { readPlayerProgress } from "./wide-stats";
import { isSkillStaff } from "../../shared/staff-skills";
import { syncWornStaffSkill } from "./staff-skills";

/**
 * The skill roll of the weapon each player has equipped, public so another player's profile can show it. The rolls
 * themselves stay private; this copies the one in hand whenever the weapon or its roll changes.
 */
export const playerWornSkill = table({ name: "player_worn_skill", public: true }, {
  identity: t.identity().primaryKey(),
  itemId: t.string(),
  arrowStorm: t.f32(), ricochet: t.f32(), piercingShot: t.f32(),
  whirlwind: t.f32(), deflect: t.f32(), shockwave: t.f32(),
});

type Ctx = any;
const SKILLS = ["arrowStorm", "ricochet", "piercingShot", "whirlwind", "deflect", "shockwave", "backstab", "poison", "dodge"] as const;

/** Copies the equipped weapon's roll into player_worn_skill, writing only when something changed. */
export function syncWornSkill(ctx: Ctx, identity: Identity, progress = readPlayerProgress(ctx, identity)) {
  if (!ctx.db.playerWornSkill) return;
  const itemId = progress?.equippedRightHand || progress?.equippedLeftHand || "";
  // A staff's roll has its own public table (staff-skills.ts).
  if (ctx.db.playerWornStaffSkill) syncWornStaffSkill(ctx, identity, itemId);
  const current = ctx.db.playerWornSkill.identity.find(identity);
  if (!itemId || !isSkillWeapon(itemId) || isSkillStaff(itemId)) { if (current) ctx.db.playerWornSkill.identity.delete(identity); return; }
  const roll = weaponSkillRollFor(ctx, identity, itemId) as Record<string, number> | null;
  const next: Record<string, unknown> & Record<(typeof SKILLS)[number], number> = { identity, itemId, ...Object.fromEntries(SKILLS.map(skill => [skill, Number(roll?.[skill] ?? 0) || 0])) } as any;
  if (current && current.itemId === itemId && SKILLS.every(skill => Math.abs(current[skill] - next[skill]) < 1e-6)) return;
  if (current) ctx.db.playerWornSkill.identity.update(next);
  else ctx.db.playerWornSkill.insert(next);
}
