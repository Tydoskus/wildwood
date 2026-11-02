import { touchCombatProfile } from "./combat-profile";
import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { NO_STAFF_SKILLS, isSkillStaff, rollStaffSkills, type StaffSkillRoll } from "../../shared/staff-skills";

/**
 * Every staff roll a player holds, in one private table: the first copy's (keyed by player and item, like
 * player_sword_skill), each kept copy's ("copy:<id>") and each waiting offer's ("offer:<id>"). Bow and sword
 * rolls are columns on the copy and offer rows; staffs came later and a new column there would strand every open
 * tab, so their rolls sit here beside those rows and go wherever the rows go.
 */
export const playerStaffSkill = table({ name: "player_staff_skill", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), itemId: t.string(),
  copyId: t.u64(), offerId: t.u64(),
  meteor: t.f32(), chain: t.f32(), frostNova: t.f32(),
});

/** The roll of the staff each player has in hand, public for profiles, as player_worn_skill is for bows and swords. */
export const playerWornStaffSkill = table({ name: "player_worn_staff_skill", public: true }, {
  identity: t.identity().primaryKey(), itemId: t.string(),
  meteor: t.f32(), chain: t.f32(), frostNova: t.f32(),
});

/** Both duellists' staff rolls, frozen beside duel_combat_snapshot when the duel starts. */
export const duelStaffSkill = table({ name: "duel_staff_skill", public: true }, {
  duelId: t.u64().primaryKey(),
  challengerMeteor: t.f64(), challengerChain: t.f64(), challengerFrostNova: t.f64(),
  opponentMeteor: t.f64(), opponentChain: t.f64(), opponentFrostNova: t.f64(),
});

type Ctx = any;
export const staffSkillKey = (identity: Identity, itemId: string) => `${identity.toHexString()}:${itemId}`;
export const staffCopyKey = (copyId: bigint) => `copy:${copyId}`;
export const staffOfferKey = (offerId: bigint) => `offer:${offerId}`;
const rollOf = (row: any): StaffSkillRoll => row ? { meteor: row.meteor, chain: row.chain, frostNova: row.frostNova } : NO_STAFF_SKILLS;
const columns = (roll: Partial<StaffSkillRoll>) => ({ meteor: roll.meteor ?? 0, chain: roll.chain ?? 0, frostNova: roll.frostNova ?? 0 });

function writeRow(ctx: Ctx, key: string, identity: Identity, itemId: string, copyId: bigint, offerId: bigint, roll: Partial<StaffSkillRoll>) {
  const row = { key, identity, itemId, copyId, offerId, ...columns(roll) };
  if (ctx.db.playerStaffSkill.key.find(key)) ctx.db.playerStaffSkill.key.update(row);
  else ctx.db.playerStaffSkill.insert(row);
}

/** The first copy's roll; no skills for anything else. */
export function staffSkillRollFor(ctx: Ctx, identity: Identity, itemId: string): StaffSkillRoll {
  if (!isSkillStaff(itemId)) return NO_STAFF_SKILLS;
  return rollOf(ctx.db.playerStaffSkill.key.find(staffSkillKey(identity, itemId)));
}
export function setStaffSkillRoll(ctx: Ctx, identity: Identity, itemId: string, roll: Partial<StaffSkillRoll>) {
  if (!isSkillStaff(itemId)) return;
  writeRow(ctx, staffSkillKey(identity, itemId), identity, itemId, 0n, 0n, roll);
  // Loot merges duplicates here inside a kill report, which keeps its combat profile otherwise.
  touchCombatProfile(ctx, identity);
}
/** Destruction and prestige retain a roll, so neither can be used to reroll the last copy. */
export function ensureStaffSkillRoll(ctx: Ctx, identity: Identity, itemId: string, skillLuck = 0) {
  if (!isSkillStaff(itemId) || ctx.db.playerStaffSkill.key.find(staffSkillKey(identity, itemId))) return;
  setStaffSkillRoll(ctx, identity, itemId, rollStaffSkills(itemId, () => ctx.random(), skillLuck)!);
}
export function forgetStaffSkillRoll(ctx: Ctx, identity: Identity, itemId: string) {
  ctx.db.playerStaffSkill.key.delete(staffSkillKey(identity, itemId));
}

/** A kept copy's or an offer's roll, read and written beside its row. */
export const staffCopyRoll = (ctx: Ctx, copyId: bigint) => rollOf(ctx.db.playerStaffSkill.key.find(staffCopyKey(copyId)));
export const staffOfferRoll = (ctx: Ctx, offerId: bigint) => rollOf(ctx.db.playerStaffSkill.key.find(staffOfferKey(offerId)));
export function setStaffCopyRoll(ctx: Ctx, identity: Identity, itemId: string, copyId: bigint, roll: Partial<StaffSkillRoll>) {
  if (isSkillStaff(itemId)) writeRow(ctx, staffCopyKey(copyId), identity, itemId, copyId, 0n, roll);
}
export function setStaffOfferRoll(ctx: Ctx, identity: Identity, itemId: string, offerId: bigint, roll: Partial<StaffSkillRoll>) {
  if (isSkillStaff(itemId)) writeRow(ctx, staffOfferKey(offerId), identity, itemId, 0n, offerId, roll);
}
export const forgetStaffCopyRoll = (ctx: Ctx, copyId: bigint) => ctx.db.playerStaffSkill.key.delete(staffCopyKey(copyId));
export const forgetStaffOfferRoll = (ctx: Ctx, offerId: bigint) => ctx.db.playerStaffSkill.key.delete(staffOfferKey(offerId));

/** Reset and deletion: every roll, the public worn one included. */
export function removeStaffSkills(ctx: Ctx, identity: Identity) {
  for (const row of [...ctx.db.playerStaffSkill.identity.filter(identity)] as any[]) ctx.db.playerStaffSkill.key.delete(row.key);
  if (ctx.db.playerWornStaffSkill.identity.find(identity)) ctx.db.playerWornStaffSkill.identity.delete(identity);
}

/** A guest's first-copy rolls join the account's where it has none; copies and offers move with their rows. */
export function mergeStaffSkills(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerStaffSkill.identity.filter(guest)] as any[]) {
    if (row.copyId !== 0n || row.offerId !== 0n) continue;
    ctx.db.playerStaffSkill.key.delete(row.key);
    if (!ctx.db.playerStaffSkill.key.find(staffSkillKey(account, row.itemId))) setStaffSkillRoll(ctx, account, row.itemId, row);
  }
  if (ctx.db.playerWornStaffSkill.identity.find(guest)) ctx.db.playerWornStaffSkill.identity.delete(guest);
}
/** A kept copy or offer that changed hands takes its roll with it. */
export function moveStaffRowRoll(ctx: Ctx, key: string, identity: Identity) {
  const row = ctx.db.playerStaffSkill.key.find(key);
  if (row) ctx.db.playerStaffSkill.key.update({ ...row, identity });
}

/** Copies the staff in hand's roll into player_worn_staff_skill, writing only on a change. */
export function syncWornStaffSkill(ctx: Ctx, identity: Identity, itemId: string) {
  const current = ctx.db.playerWornStaffSkill.identity.find(identity);
  if (!itemId || !isSkillStaff(itemId)) { if (current) ctx.db.playerWornStaffSkill.identity.delete(identity); return; }
  const next = { identity, itemId, ...staffSkillRollFor(ctx, identity, itemId) };
  if (current && current.itemId === itemId && (["meteor", "chain", "frostNova"] as const).every(skill => Math.abs(current[skill] - next[skill]) < 1e-6)) return;
  if (current) ctx.db.playerWornStaffSkill.identity.update(next);
  else ctx.db.playerWornStaffSkill.insert(next);
}

export function duelStaffSkillFields(ctx: Ctx, duel: { challenger: Identity; opponent: Identity; challengerWeaponItem?: string; opponentWeaponItem?: string }) {
  const a = staffSkillRollFor(ctx, duel.challenger, duel.challengerWeaponItem ?? "");
  const b = staffSkillRollFor(ctx, duel.opponent, duel.opponentWeaponItem ?? "");
  return { challengerMeteor: a.meteor, challengerChain: a.chain, challengerFrostNova: a.frostNova,
    opponentMeteor: b.meteor, opponentChain: b.chain, opponentFrostNova: b.frostNova };
}
/** Written once when a duel starts; a duel without a staff needs no row. */
export function insertDuelStaffSkills(ctx: Ctx, duelId: bigint, fields: ReturnType<typeof duelStaffSkillFields>) {
  if (Object.values(fields).some(value => value > 0)) ctx.db.duelStaffSkill.insert({ duelId, ...fields });
}
export const duelStaffSkillRow = (ctx: Ctx, duelId: bigint) => ctx.db.duelStaffSkill.duelId.find(duelId) ?? {};
export const deleteDuelStaffSkills = (ctx: Ctx, duelId: bigint) => ctx.db.duelStaffSkill.duelId.delete(duelId);
