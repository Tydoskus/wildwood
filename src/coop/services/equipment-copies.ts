import { tables, type DbConnection } from "../../module_bindings";
import type { BowSkillRoll } from "../../../shared/bow-skills";
import { reducerErrorMessage } from "./reducer-errors";
import { createIgnoredDrops } from "./ignored-drops";

/** A copy of an item beyond the first, kept from a duplicate drop. */
export type EquipmentCopy = { id: bigint; itemId: string; roll: BowSkillRoll };
/** A duplicate drop waiting for Keep or Ignore, with the new copy's roll. */
export type EquipmentOffer = { id: bigint; itemId: string; roll: BowSkillRoll; createdAtMs: number; expiresAtMs: number };
export type EquipmentCopyResult = { ok: boolean; error?: string };

type Target = { connection: DbConnection; isCurrent: () => boolean };
type Row = { id: bigint; itemId: string; arrowStorm: number; ricochet: number; piercingShot: number };

const rollOf = (row: Row): BowSkillRoll => ({ arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot });
const byId = (a: { id: bigint }, b: { id: bigint }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const millis = (timestamp: { microsSinceUnixEpoch: bigint }) => Number(timestamp.microsSinceUnixEpoch / 1000n);

/**
 * This account's kept extra copies and waiting duplicate offers, from the
 * caller-scoped my_equipment_copies and my_equipment_offers views, and the
 * three reducers that change them. The account's loot filter, which decides
 * what drops at all, rides along. The server decides everything; this only
 * carries rows and requests.
 */
export function createEquipmentCopies(notify: () => void) {
  let target: Target | null = null;
  let copies: readonly EquipmentCopy[] = [];
  let offers: readonly EquipmentOffer[] = [];
  const ignoredDrops = createIgnoredDrops(notify);

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    const readIgnoredDrops = ignoredDrops.watch(connection, isCurrent);
    target = { connection, isCurrent };
    copies = [];
    offers = [];
    const readCopies = () => {
      if (!isCurrent()) return;
      copies = [...connection.db.myEquipmentCopies.iter()].sort(byId).map(row => ({ id: row.id, itemId: row.itemId, roll: rollOf(row) }));
      notify();
    };
    const readOffers = () => {
      if (!isCurrent()) return;
      offers = [...connection.db.myEquipmentOffers.iter()].sort(byId).map(row => ({
        id: row.id, itemId: row.itemId, roll: rollOf(row), createdAtMs: millis(row.createdAt), expiresAtMs: millis(row.expiresAt),
      }));
      notify();
    };
    connection.db.myEquipmentCopies.onInsert(readCopies);
    connection.db.myEquipmentCopies.onUpdate(readCopies);
    connection.db.myEquipmentCopies.onDelete(readCopies);
    connection.db.myEquipmentOffers.onInsert(readOffers);
    connection.db.myEquipmentOffers.onUpdate(readOffers);
    connection.db.myEquipmentOffers.onDelete(readOffers);
    connection.subscriptionBuilder().onApplied(() => { readCopies(); readOffers(); readIgnoredDrops(); })
      .subscribe([tables.myEquipmentCopies, tables.myEquipmentOffers, ignoredDrops.table]);
  }

  async function call(send: (connection: DbConnection) => Promise<unknown>): Promise<EquipmentCopyResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await send(current.connection);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    api: {
      /** Kept copies beyond the first, oldest first. */
      equipmentCopies: (): readonly EquipmentCopy[] => copies,
      /** Duplicate drops waiting for an answer, oldest first. */
      equipmentOffers: (): readonly EquipmentOffer[] => offers,
      resolveEquipmentOffer: (id: bigint, keep: boolean) =>
        call(connection => connection.reducers.resolveEquipmentOffer({ id, keep })),
      /** Copy id 0 is the first copy, the one in the bag's item list. */
      destroyEquipmentCopy: (itemId: string, copyId: bigint) =>
        call(connection => connection.reducers.destroyEquipmentCopy({ itemId, copyId })),
      selectEquipmentCopy: (copyId: bigint) =>
        call(connection => connection.reducers.selectEquipmentCopy({ copyId })),
      ...ignoredDrops.api,
    },
  };
}
