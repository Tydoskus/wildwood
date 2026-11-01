import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import {
  isWeaponSchool, masteryInPlay, masteryLevel, masteryPointsForReport, weaponSchool, type MasteryInPlay, type WeaponSchool,
} from "../../shared/weapon-mastery";
import { challengeActive } from "./prestige-challenge";
import { guildHallBonusFor, withBonusShare } from "./guild-hall-bonus";
import { TAILWIND_SPEED_BONUS, hasTechnique } from "../../shared/mastery-techniques";
import { canonicalSavedHand } from "./loadout";
import { armorMoveSpeedAllowance } from "../../shared/armor-class-perks";
import { bootMoveSpeedFactor, canonicalItemId, hasBootStat } from "../../shared/items";
import { normalizeRefineLevel } from "../../shared/refine-multiplier";

/** A school's Mastery points, one row per player and school, so a new school needs no new column. */
export const playerWeaponMastery = table({ name: "player_weapon_mastery", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  school: t.string(),
  points: t.u64(),
});

/**
 * Each school's level, public, for profiles (player_weapon_mastery stays private). One row per player and school,
 * so a new school needs no new column; writeMasteryLevel keeps it in step.
 */
export const playerMasteryLevel = table({ name: "player_mastery_level", public: true }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  school: t.string(),
  level: t.u8(),
});

type Ctx = any;
export const masteryKey = (identity: Identity, school: WeaponSchool) => `${identity.toHexString()}:${school}`;
const rowsOf = (ctx: Ctx, identity: Identity): any[] => [...ctx.db.playerWeaponMastery.identity.filter(identity)];

/** Each school's points, 0 for a school never trained. */
export function weaponMasteryPoints(ctx: Ctx, identity: Identity): Record<WeaponSchool, bigint> {
  const points = { archery: 0n, swordplay: 0n, sorcery: 0n } as Record<WeaponSchool, bigint>;
  for (const row of rowsOf(ctx, identity)) {
    const school: unknown = row.school;
    if (isWeaponSchool(school)) points[school] = row.points;
  }
  return points;
}

/** The Mastery a player fights with (shared masteryInPlay): none during Reflect Only or an Aggro run (challengeActive covers both). */
export function masteryInPlayFor(ctx: Ctx, identity: Identity, rightHand: string | undefined, weaponInUse = rightHand): MasteryInPlay {
  if (challengeActive(ctx, identity)) return { school: weaponSchool(rightHand), level: 0 };
  return masteryInPlay(weaponMasteryPoints(ctx, identity), rightHand, weaponInUse);
}

/**
 * The move speed factor the movement checks allow on top of the saved speed: Tailwind whenever the technique is
 * learned and a bow is in hand, as Black Boots' bonus is allowed (a kill is the client's claim, and a 6% walk pays
 * nothing by itself), Light armor's speed and Ranger Boots' at their refine. Heavy's slowdown is not enforced. The
 * saved gear is read without the bag, which can only loosen an allowance.
 */
export function bonusMoveSpeedFactor(ctx: Ctx, identity: Identity, progress: any) {
  const right = canonicalSavedHand(progress, "equippedRightHand");
  const mastery = masteryInPlayFor(ctx, identity, right, right || canonicalSavedHand(progress, "equippedLeftHand"));
  const feet = canonicalItemId(progress?.equippedFeet);
  // The pair's refine, read as item-refine.ts keys it; importing that module here would make a cycle through door-reach.ts.
  const refine = feet && hasBootStat(feet) ? normalizeRefineLevel(ctx.db.playerItemRefine.key.find(`${identity.toHexString()}:${feet}`)?.level) : 0;
  const boots = feet ? bootMoveSpeedFactor(feet, { refine }) : 1;
  return (hasTechnique(mastery, "tailwind") ? 1 + TAILWIND_SPEED_BONUS : 1)
    * armorMoveSpeedAllowance(canonicalItemId(progress?.equippedHead), canonicalItemId(progress?.equippedChest)) * boots;
}

/** Copies a school's level to player_mastery_level, writing only when it changed; none below level 1. */
function writeMasteryLevel(ctx: Ctx, identity: Identity, school: WeaponSchool, points: bigint) {
  const key = masteryKey(identity, school), level = masteryLevel(points), row = ctx.db.playerMasteryLevel.key.find(key);
  if (level < 1) { if (row) ctx.db.playerMasteryLevel.key.delete(key); return; }
  if (!row) ctx.db.playerMasteryLevel.insert({ key, identity, school, level });
  else if (row.level !== level) ctx.db.playerMasteryLevel.key.update({ ...row, level });
}

/** Points granted outside a kill report (the old gear's refines, paid once at the graded-gear release). */
export function grantMasteryPoints(ctx: Ctx, identity: Identity, school: WeaponSchool, points: number) {
  addPoints(ctx, identity, school, Math.floor(points));
}

function addPoints(ctx: Ctx, identity: Identity, school: WeaponSchool, points: number) {
  if (!(points > 0)) return;
  const key = masteryKey(identity, school), row = ctx.db.playerWeaponMastery.key.find(key);
  const next = (row?.points ?? 0n) + BigInt(points);
  if (row) ctx.db.playerWeaponMastery.key.update({ ...row, points: next });
  else ctx.db.playerWeaponMastery.insert({ key, identity, school, points: next });
  writeMasteryLevel(ctx, identity, school, next);
}

/**
 * An accepted kill report trains the school of the weapon in hand, from the save the report already read. A boss pays only on its first clear in a run:
 * a boss clear is the client's claim, unbounded, so a repeat must not pay. Reflect Only kills are Reflect's, not
 * the weapon's, so they train nothing.
 */
export function awardWeaponMastery(ctx: Ctx, identity: Identity, weapon: string | undefined, kills: number, firstBossClear: boolean,
  inChallenge = () => challengeActive(ctx, identity)) {
  if (inChallenge()) return;
  const points = masteryPointsForReport(kills, firstBossClear);
  if (!points) return;
  // The guild hall's Crest Banners add their share.
  addPoints(ctx, identity, weaponSchool(weapon), withBonusShare(points, guildHallBonusFor(ctx, identity, "banners"), () => ctx.random()));
}

/** Reset Save clears every school. Prestige keeps them. */
export function removeWeaponMastery(ctx: Ctx, identity: Identity) {
  for (const row of rowsOf(ctx, identity)) ctx.db.playerWeaponMastery.key.delete(row.key);
  for (const row of [...ctx.db.playerMasteryLevel.identity.filter(identity)]) ctx.db.playerMasteryLevel.key.delete(row.key);
}

/** A guest's save replaces the account's on link, as Mining does, its Mastery with it. */
export function mergeWeaponMastery(ctx: Ctx, guest: Identity, account: Identity) {
  removeWeaponMastery(ctx, account);
  for (const row of rowsOf(ctx, guest)) {
    ctx.db.playerWeaponMastery.key.delete(row.key);
    const school: unknown = row.school;
    if (!isWeaponSchool(school)) continue;
    ctx.db.playerWeaponMastery.insert({ ...row, key: masteryKey(account, school), identity: account });
    writeMasteryLevel(ctx, account, school, row.points);
  }
  for (const row of [...ctx.db.playerMasteryLevel.identity.filter(guest)]) ctx.db.playerMasteryLevel.key.delete(row.key);
}

/** Fills player_mastery_level from the points earned before it existed (module migration 61). */
export function backfillMasteryLevels(ctx: Ctx) {
  for (const row of [...ctx.db.playerWeaponMastery.iter()] as any[]) {
    const school: unknown = row.school;
    if (isWeaponSchool(school)) writeMasteryLevel(ctx, row.identity, school, row.points);
  }
}

/** The player's own points, for the Schools tab. */
export function registerWeaponMastery(spacetimedb: typeof spacetimedbType) {
  const myWeaponMastery = spacetimedb.view({ name: "my_weapon_mastery", public: true }, t.array(playerWeaponMastery.rowType),
    (ctx: any) => [...ctx.db.playerWeaponMastery.identity.filter(ctx.sender)]);
  return { myWeaponMastery };
}
