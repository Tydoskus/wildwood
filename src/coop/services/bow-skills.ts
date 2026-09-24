import { tables, type DbConnection } from "../../module_bindings";
import type { BowSkillRoll } from "../../../shared/bow-skills";
import { createEquipmentCopies } from "./equipment-copies";

/**
 * This account's bow skill rolls, keyed by bow id, from the caller-scoped
 * my_bow_skills view: the roll of each item's first copy, the one a slot
 * equips. Further copies kept from duplicate drops, with their own rolls, and
 * the duplicate offers waiting for an answer ride along on the same
 * connection. The server owns every roll; the client only reads them to fire
 * the skills and to show them on the bow.
 */
export function createBowSkills(notify: () => void) {
  let rolls = new Map<string, BowSkillRoll>();
  const copies = createEquipmentCopies(notify);

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    copies.watch(connection, isCurrent);
    rolls = new Map();
    const read = () => {
      if (!isCurrent()) return;
      const next = new Map<string, BowSkillRoll>();
      for (const row of connection.db.myBowSkills.iter()) {
        next.set(row.itemId, { arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot });
      }
      rolls = next;
      notify();
    };
    connection.db.myBowSkills.onInsert(read);
    connection.db.myBowSkills.onUpdate(read);
    connection.db.myBowSkills.onDelete(read);
    connection.subscriptionBuilder().onApplied(read).subscribe([tables.myBowSkills]);
  }

  /** The roll on the first copy of one of this account's bows, or null when it has none yet. */
  const bowSkills = (itemId: string | null | undefined): BowSkillRoll | null => (itemId && rolls.get(itemId)) || null;
  return { watch, bowSkills, api: { bowSkills, ...copies.api } };
}
