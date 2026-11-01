import { tables, type DbConnection } from "../../module_bindings";
import type { BowSkillRoll } from "../../../shared/bow-skills";
import { isSkillSword, type SwordSkillRoll } from "../../../shared/sword-skills";
import { isSkillStaff, type StaffSkillRoll } from "../../../shared/staff-skills";
import { weaponSkillScore, type WeaponSkillRoll } from "../../../shared/weapon-skills";
import { createEquipmentCopies } from "./equipment-copies";

/** A first copy's roll that a duplicate drop upgraded, and the two scores. */
export type BetterRollKept = { itemId: string; before: number; after: number };

/**
 * The first-copy rolls that got better between two readings of the account weapon views.
 * A duplicate drop is the only thing that improves a roll this tab did not ask
 * for, so no schema change is needed to announce it. A weapon that only now has
 * a roll is a first copy, not a better one, and `skip` leaves out the weapons
 * this tab just equipped, destroyed or kept a copy of.
 */
export function betterRollsKept(
  previous: ReadonlyMap<string, WeaponSkillRoll>,
  next: ReadonlyMap<string, WeaponSkillRoll>,
  skip: (itemId: string) => boolean = () => false,
): BetterRollKept[] {
  const kept: BetterRollKept[] = [];
  for (const [itemId, roll] of next) {
    const old = previous.get(itemId);
    if (!old || skip(itemId)) continue;
    const before = weaponSkillScore(itemId, old);
    const after = weaponSkillScore(itemId, roll);
    if (after > before) kept.push({ itemId, before, after });
  }
  return kept;
}

/**
 * This account's weapon skill rolls, keyed by item id, from caller-scoped
 * bow, sword and staff views: the roll of each item's first copy, the one a slot
 * equips. Further copies kept from duplicate drops, with their own rolls, and
 * the duplicate offers waiting for an answer ride along on the same
 * connection. The server owns every roll; the client only reads them to fire
 * the skills, to show them on the weapon, and to say when a duplicate upgraded
 * one.
 */
export function createBowSkills(notify: () => void) {
  let rolls = new Map<string, WeaponSkillRoll>();
  const copies = createEquipmentCopies(notify);
  let betterRollListener: ((kept: BetterRollKept) => void) | null = null;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    const copyRows = copies.watch(connection, isCurrent);
    rolls = new Map();
    // A new connection's first reading is the standing rows, not a change.
    let hydrated = false;
    // Every roll seen on this connection. A view may deliver a changed row as
    // a delete and an insert; comparing with this rather than the last
    // reading means a reading taken between the two cannot hide the change.
    const seen = new Map<string, WeaponSkillRoll>();
    const read = () => {
      if (!isCurrent()) return;
      const next = new Map<string, WeaponSkillRoll>();
      for (const row of connection.db.myBowSkills.iter()) {
        next.set(row.itemId, { arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot });
      }
      for (const row of connection.db.mySwordSkills.iter()) {
        next.set(row.itemId, { whirlwind: row.whirlwind, deflect: row.deflect, shockwave: row.shockwave });
      }
      // Only first copies here; kept copies' and offers' staff rolls ride with them (equipment-copies.ts).
      for (const row of connection.db.myStaffSkills.iter()) {
        if (row.copyId === 0n && row.offerId === 0n) next.set(row.itemId, { meteor: row.meteor, chain: row.chain, frostNova: row.frostNova });
      }
      const kept = hydrated ? betterRollsKept(seen, next, copies.changedLocally) : [];
      for (const [itemId, roll] of next) seen.set(itemId, roll);
      rolls = next;
      notify();
      for (const entry of kept) betterRollListener?.(entry);
    };
    for (const view of [connection.db.myBowSkills, connection.db.mySwordSkills]) {
      view.onInsert(read); view.onUpdate(read); view.onDelete(read);
    }
    connection.db.myStaffSkills.onInsert(read); connection.db.myStaffSkills.onUpdate(read); connection.db.myStaffSkills.onDelete(read);
    // One subscription for both: my_staff_skills carries first copies' rolls here and kept copies' and offers' there.
    connection.subscriptionBuilder().onApplied(() => { copyRows.applied(); read(); hydrated = true; })
      .subscribe([...copyRows.tables, tables.myBowSkills, tables.mySwordSkills, tables.myStaffSkills]);
  }

  /** The roll on the first copy of one of this account's weapons, or null when it has none yet. */
  const weaponSkills = (itemId: string | null | undefined): WeaponSkillRoll | null => (itemId && rolls.get(itemId)) || null;
  const bowSkills = (itemId: string | null | undefined): BowSkillRoll | null =>
    isSkillSword(itemId) || isSkillStaff(itemId) ? null : weaponSkills(itemId) as BowSkillRoll | null;
  const swordSkills = (itemId: string | null | undefined): SwordSkillRoll | null =>
    isSkillSword(itemId) ? weaponSkills(itemId) as SwordSkillRoll | null : null;
  const staffSkills = (itemId: string | null | undefined): StaffSkillRoll | null =>
    isSkillStaff(itemId) ? weaponSkills(itemId) as StaffSkillRoll | null : null;
  return {
    watch,
    bowSkills,
    api: {
      bowSkills,
      swordSkills,
      staffSkills,
      weaponSkills,
      ...copies.api,
      /** Called when Auto keep best replaces a weapon's roll with a better one. */
      setOnBetterRollKept(callback: ((kept: BetterRollKept) => void) | null) {
        betterRollListener = callback;
      },
    },
  };
}
