import { tables, type DbConnection } from "../../module_bindings";
import type { BowSkillRoll } from "../../../shared/bow-skills";

/**
 * This account's bow skill rolls, keyed by bow id, from the caller-scoped
 * my_bow_skills view. The server owns every roll; the client only reads them
 * to fire the skills and to show them on the bow.
 */
export function createBowSkills(notify: () => void) {
  let rolls = new Map<string, BowSkillRoll>();

  function watch(connection: DbConnection, isCurrent: () => boolean) {
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

  return {
    watch,
    /** The roll on one of this account's bows, or null when it has none yet. */
    bowSkills: (itemId: string | null | undefined): BowSkillRoll | null => (itemId && rolls.get(itemId)) || null,
  };
}
