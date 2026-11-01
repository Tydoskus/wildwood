import { tables, type DbConnection } from "../../module_bindings";
import { weaponSkillRollOf, type WeaponSkillRoll } from "../../../shared/weapon-skills";
import { isSkillStaff } from "../../../shared/staff-skills";
import { reducerErrorMessage } from "./reducer-errors";
import { createIgnoredDrops } from "./ignored-drops";
import { createLootSettings } from "./loot-settings";

/** A copy of an item beyond the first, kept from a duplicate drop. */
export type EquipmentCopy = { id: bigint; itemId: string; roll: WeaponSkillRoll };
/** A duplicate drop waiting for Keep or Ignore, with the new copy's roll. */
export type EquipmentOffer = { id: bigint; itemId: string; roll: WeaponSkillRoll; createdAtMs: number; expiresAtMs: number };
export type EquipmentCopyResult = { ok: boolean; error?: string };

type Target = { connection: DbConnection; isCurrent: () => boolean };
/** Staff rolls of kept copies and offers, by "copy:<id>" or "offer:<id>" (my_staff_skills). */
type StaffRolls = ReadonlyMap<string, WeaponSkillRoll>;
const rollOf = (row: WeaponSkillRoll & { id: bigint; itemId: string }, staff: StaffRolls, kind: "copy" | "offer") =>
  isSkillStaff(row.itemId) ? staff.get(`${kind}:${row.id}`) ?? { meteor: 0, chain: 0, frostNova: 0 } : weaponSkillRollOf(row);
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

  /** Listens, and returns what to subscribe and what to read once applied; the caller's one subscription adds my_staff_skills. */
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
    let staff: StaffRolls = new Map();
    const readCopies = () => {
      if (!isCurrent()) return;
      copies = [...connection.db.myEquipmentCopies.iter()].sort(byId).map(row => ({ id: row.id, itemId: row.itemId, roll: rollOf(row, staff, "copy") }));
      notify();
    };
    const readOffers = () => {
      if (!isCurrent()) return;
      offers = [...connection.db.myEquipmentOffers.iter()].sort(byId).map(row => ({
        id: row.id, itemId: row.itemId, roll: rollOf(row, staff, "offer"), createdAtMs: millis(row.createdAt), expiresAtMs: millis(row.expiresAt),
      }));
      notify();
    };
    const readStaff = () => {
      if (!isCurrent()) return;
      const next = new Map<string, WeaponSkillRoll>();
      for (const row of connection.db.myStaffSkills.iter()) {
        if (row.copyId === 0n && row.offerId === 0n) continue;
        next.set(row.copyId ? `copy:${row.copyId}` : `offer:${row.offerId}`, { meteor: row.meteor, chain: row.chain, frostNova: row.frostNova });
      }
      staff = next;
      readCopies(); readOffers();
    };
    connection.db.myStaffSkills.onInsert(readStaff);
    connection.db.myStaffSkills.onUpdate(readStaff);
    connection.db.myStaffSkills.onDelete(readStaff);
    connection.db.myEquipmentCopies.onInsert(readCopies);
    connection.db.myEquipmentCopies.onUpdate(readCopies);
    connection.db.myEquipmentCopies.onDelete(readCopies);
    connection.db.myEquipmentOffers.onInsert(readOffers);
    connection.db.myEquipmentOffers.onUpdate(readOffers);
    connection.db.myEquipmentOffers.onDelete(readOffers);
    return {
      tables: [tables.myEquipmentLocks, tables.myEquipmentCopies, tables.myEquipmentOffers, ignoredDrops.table, lootSettings.table],
      applied() { readStaff(); readIgnoredDrops(); readLootSettings(); readLocks(); },
    };
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
      /** Sells one copy of a graded piece to the Smith for gold; copy id 0 as above. */
      sellGradedItem: (itemId: string, copyId: bigint) =>
        call(connection => connection.reducers.sellGradedItem({ itemId, copyId }), itemId),
      selectEquipmentCopy: (copyId: bigint) =>
        call(connection => connection.reducers.selectEquipmentCopy({ copyId }), copies.find(copy => copy.id === copyId)?.itemId),
      ...ignoredDrops.api,
      ...lootSettings.api,
    },
  };
}
