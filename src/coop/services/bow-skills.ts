import { tables, type DbConnection } from "../../module_bindings";
import { bowSkillScore, type BowSkillRoll } from "../../../shared/bow-skills";
import { createEquipmentCopies } from "./equipment-copies";

/** A first copy's roll that Auto keep best replaced with a better one, and the two scores. */
export type BetterRollKept = { itemId: string; before: number; after: number };

/**
 * The first-copy rolls that got better between two readings of my_bow_skills.
 * Auto keep best is the only thing that improves a roll this tab did not ask
 * for, so no schema change is needed to announce it. A bow that only now has
 * a roll is a first copy, not a better one, and `skip` leaves out the bows
 * this tab just equipped, destroyed or kept a copy of.
 */
export function betterRollsKept(
  previous: ReadonlyMap<string, BowSkillRoll>,
  next: ReadonlyMap<string, BowSkillRoll>,
  skip: (itemId: string) => boolean = () => false,
): BetterRollKept[] {
  const kept: BetterRollKept[] = [];
  for (const [itemId, roll] of next) {
    const old = previous.get(itemId);
    if (!old || skip(itemId)) continue;
    const before = bowSkillScore(old);
    const after = bowSkillScore(roll);
    if (after > before) kept.push({ itemId, before, after });
  }
  return kept;
}

/**
 * This account's bow skill rolls, keyed by bow id, from the caller-scoped
 * my_bow_skills view: the roll of each item's first copy, the one a slot
 * equips. Further copies kept from duplicate drops, with their own rolls, and
 * the duplicate offers waiting for an answer ride along on the same
 * connection. The server owns every roll; the client only reads them to fire
 * the skills, to show them on the bow, and to say when Auto keep best kept a
 * better one.
 */
export function createBowSkills(notify: () => void) {
  let rolls = new Map<string, BowSkillRoll>();
  const copies = createEquipmentCopies(notify);
  let betterRollListener: ((kept: BetterRollKept) => void) | null = null;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    copies.watch(connection, isCurrent);
    rolls = new Map();
    // A new connection's first reading is the standing rows, not a change.
    let hydrated = false;
    // Every roll seen on this connection. A view may deliver a changed row as
    // a delete and an insert; comparing with this rather than the last
    // reading means a reading taken between the two cannot hide the change.
    const seen = new Map<string, BowSkillRoll>();
    const read = () => {
      if (!isCurrent()) return;
      const next = new Map<string, BowSkillRoll>();
      for (const row of connection.db.myBowSkills.iter()) {
        next.set(row.itemId, { arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot });
      }
      const kept = hydrated ? betterRollsKept(seen, next, copies.changedLocally) : [];
      for (const [itemId, roll] of next) seen.set(itemId, roll);
      rolls = next;
      notify();
      for (const entry of kept) betterRollListener?.(entry);
    };
    connection.db.myBowSkills.onInsert(read);
    connection.db.myBowSkills.onUpdate(read);
    connection.db.myBowSkills.onDelete(read);
    connection.subscriptionBuilder().onApplied(() => { read(); hydrated = true; }).subscribe([tables.myBowSkills]);
  }

  /** The roll on the first copy of one of this account's bows, or null when it has none yet. */
  const bowSkills = (itemId: string | null | undefined): BowSkillRoll | null => (itemId && rolls.get(itemId)) || null;
  return {
    watch,
    bowSkills,
    api: {
      bowSkills,
      ...copies.api,
      /** Called when Auto keep best replaces a bow's roll with a better one. */
      setOnBetterRollKept(callback: ((kept: BetterRollKept) => void) | null) {
        betterRollListener = callback;
      },
    },
  };
}
