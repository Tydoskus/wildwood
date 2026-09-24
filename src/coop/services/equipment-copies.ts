import { tables, type DbConnection } from "../../module_bindings";
import type { BowSkillRoll } from "../../../shared/bow-skills";
import { reducerErrorMessage } from "./reducer-errors";
import { createIgnoredDrops } from "./ignored-drops";
import { createLootSettings } from "./loot-settings";

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
/** How long after this tab equips, destroys or keeps a copy a change to that bow's roll is taken as its doing. */
export const LOCAL_COPY_ACTION_WINDOW_MS = 10_000;

/**
 * This account's kept extra copies and waiting duplicate offers, from the
 * caller-scoped my_equipment_copies and my_equipment_offers views, and the
 * three reducers that change them. The account's loot filter, which decides
 * what drops at all, and its loot settings (Auto keep best, Auto equip) ride
 * along. The server decides everything; this only carries rows and requests.
 */
export function createEquipmentCopies(notify: () => void, now: () => number = Date.now) {
  let target: Target | null = null;
  let copies: readonly EquipmentCopy[] = [];
  let offers: readonly EquipmentOffer[] = [];
  let locks = new Set<string>();
  const ignoredDrops = createIgnoredDrops(notify);
  const lootSettings = createLootSettings(notify);
  /** When this tab last asked for a change to each item's copies. */
  const localActions = new Map<string, number>();

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    const readIgnoredDrops = ignoredDrops.watch(connection, isCurrent);
    const readLootSettings = lootSettings.watch(connection, isCurrent);
    target = { connection, isCurrent };
    copies = [];
    locks = new Set();
    const readLocks = () => {
      if (!isCurrent()) return;
      locks = new Set([...connection.db.myEquipmentLocks.iter()].map(row => `${row.itemId}:${row.copyId}`));
      notify();
    };
    connection.db.myEquipmentLocks.onInsert(readLocks);
    connection.db.myEquipmentLocks.onDelete(readLocks);
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
    connection.subscriptionBuilder().onApplied(() => { readCopies(); readOffers(); readIgnoredDrops(); readLootSettings(); readLocks(); })
      .subscribe([tables.myEquipmentLocks, tables.myEquipmentCopies, tables.myEquipmentOffers, ignoredDrops.table, lootSettings.table]);
  }

  async function call(send: (connection: DbConnection) => Promise<unknown>, itemId?: string): Promise<EquipmentCopyResult> {
    if (itemId) localActions.set(itemId, now());
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await send(current.connection);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  /**
   * Whether this tab changed an item's copies a moment ago. Equipping or
   * destroying a copy moves a roll onto the first copy, which must not read
   * as Auto keep best having found a better one.
   */
  function changedLocally(itemId: string) {
    const at = localActions.get(itemId);
    return at !== undefined && now() - at < LOCAL_COPY_ACTION_WINDOW_MS;
  }

  return {
    watch,
    changedLocally,
    api: {
      equipmentLocked: (itemId: string, copyId = 0n) => locks.has(`${itemId}:${copyId}`),
      setEquipmentLocked: (itemId: string, locked: boolean, copyId = 0n) => call(connection => connection.reducers.setEquipmentLocked({ itemId, locked, copyId })),
      /** Kept copies beyond the first, oldest first. */
      equipmentCopies: (): readonly EquipmentCopy[] => copies,
      /** Duplicate drops waiting for an answer, oldest first. */
      equipmentOffers: (): readonly EquipmentOffer[] => offers,
      resolveEquipmentOffer: (id: bigint, keep: boolean) =>
        call(connection => connection.reducers.resolveEquipmentOffer({ id, keep }), offers.find(offer => offer.id === id)?.itemId),
      /** Copy id 0 is the first copy, the one in the bag's item list. */
      destroyEquipmentCopy: (itemId: string, copyId: bigint) =>
        call(connection => connection.reducers.destroyEquipmentCopy({ itemId, copyId }), itemId),
      selectEquipmentCopy: (copyId: bigint) =>
        call(connection => connection.reducers.selectEquipmentCopy({ copyId }), copies.find(copy => copy.id === copyId)?.itemId),
      ...ignoredDrops.api,
      ...lootSettings.api,
    },
  };
}
