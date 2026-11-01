import { tables, type DbConnection } from "../../module_bindings";
import { REFINE_ORES, normalizeRefineLevel, type OreId } from "../../../shared/refine";
import type { ItemLevel } from "../../../shared/items";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";

/** What the last refine try did, as the server recorded it (player_refine_result). */
export type RefineResult = {
  itemId: string; copyId: bigint; fromLevel: number; toLevel: number; succeeded: boolean; attempt: number; triedAtMs: number;
};
export type RefineTryResult = { ok: boolean; error?: string };

type Target = { connection: DbConnection; isCurrent: () => boolean };
const copyKey = (itemId: string, copyId: bigint) => `${itemId}:${copyId}`;
const isOreId = (value: string): value is OreId => Object.prototype.hasOwnProperty.call(REFINE_ORES, value);

/**
 * This account's refines, looks' kept refines, ores, last refine try and fails in a row, from the caller-scoped my_item_refines,
 * my_copy_refines, my_cosmetic_refines, my_ores, my_refine_result and my_refine_pity views, and the refine_item / destroy_ore reducers. The server rolls every try
 * and owns every level; this only carries rows and requests.
 */
export function createItemRefineRows(notify: () => void, slotTierFor: (itemId: string) => number = () => 0) {
  let target: Target | null = null;
  let levels = new Map<string, number>();
  let cosmeticLevels = new Map<string, number>();
  let ores: Partial<Record<OreId, number>> = {};
  let pity = new Map<string, { level: number; fails: number }>();
  let result: RefineResult | null = null;
  let resultListener: ((result: RefineResult) => void) | null = null;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    levels = new Map();
    cosmeticLevels = new Map();
    ores = {};
    pity = new Map();
    result = null;
    // The standing row on connect is an old try, not one to announce.
    let hydrated = false;
    const readLevels = () => {
      if (!isCurrent()) return;
      const next = new Map<string, number>();
      for (const row of connection.db.myItemRefines.iter()) next.set(copyKey(row.itemId, 0n), normalizeRefineLevel(row.level));
      for (const row of connection.db.myCopyRefines.iter()) next.set(copyKey(row.itemId, row.copyId), normalizeRefineLevel(row.level));
      levels = next;
      notify();
    };
    const readCosmeticLevels = () => {
      if (!isCurrent()) return;
      cosmeticLevels = new Map([...connection.db.myCosmeticRefines.iter()].map(row => [row.itemId, normalizeRefineLevel(row.level)]));
      notify();
    };
    const readOres = () => {
      if (!isCurrent()) return;
      const next: Partial<Record<OreId, number>> = {};
      for (const row of connection.db.myOres.iter()) if (isOreId(row.oreId)) next[row.oreId] = row.count;
      ores = next;
      notify();
    };
    const readPity = () => {
      if (!isCurrent()) return;
      pity = new Map([...connection.db.myRefinePity.iter()].map(row => [copyKey(row.itemId, row.copyId), { level: row.level, fails: row.fails }]));
      notify();
    };
    const readResult = () => {
      if (!isCurrent()) return;
      const [row] = [...connection.db.myRefineResult.iter()];
      const previous = result;
      result = row ? {
        itemId: row.itemId, copyId: row.copyId, fromLevel: row.fromLevel, toLevel: row.toLevel, succeeded: row.succeeded,
        attempt: row.attempt, triedAtMs: Number(row.triedAt.microsSinceUnixEpoch / 1000n),
      } : null;
      notify();
      if (hydrated && result && result.attempt !== previous?.attempt) resultListener?.(result);
    };
    for (const view of [connection.db.myItemRefines, connection.db.myCopyRefines]) {
      view.onInsert(readLevels); view.onUpdate(readLevels); view.onDelete(readLevels);
    }
    const looks = connection.db.myCosmeticRefines;
    looks.onInsert(readCosmeticLevels); looks.onUpdate(readCosmeticLevels); looks.onDelete(readCosmeticLevels);
    connection.db.myOres.onInsert(readOres); connection.db.myOres.onUpdate(readOres); connection.db.myOres.onDelete(readOres);
    connection.db.myRefinePity.onInsert(readPity); connection.db.myRefinePity.onUpdate(readPity); connection.db.myRefinePity.onDelete(readPity);
    connection.db.myRefineResult.onInsert(readResult); connection.db.myRefineResult.onUpdate(readResult); connection.db.myRefineResult.onDelete(readResult);
    connection.subscriptionBuilder()
      .onApplied(() => { readLevels(); readCosmeticLevels(); readOres(); readPity(); readResult(); hydrated = true; })
      .subscribe([tables.myItemRefines, tables.myCopyRefines, tables.myCosmeticRefines, tables.myOres, tables.myRefineResult, tables.myRefinePity]);
  }

  return {
    watch,
    api: {
      /** One copy's refine level: copy id 0 is the first copy, the one a slot holds. */
      itemRefine: (itemId: string, copyId = 0n) => levels.get(copyKey(itemId, copyId)) ?? 0,
      /** The best refine an unlocked cosmetic's item was kept at: the look keeps its ★10/★20 art. Never stats. */
      cosmeticRefine: (itemId: string) => cosmeticLevels.get(itemId) ?? 0,
      /**
       * What one of our items' stats stand on (items.ts ItemLevel): its slot's tier and the first copy's refine, the
       * copy a slot holds. Everything that works stats out reads this; the +N label still reads the tier alone.
       */
      itemLevel: (itemId: string): ItemLevel => ({ tier: slotTierFor(itemId), refine: levels.get(copyKey(itemId, 0n)) ?? 0 }),
      /** Ores held, by kind; a kind not held is missing. */
      ores: (): Readonly<Partial<Record<OreId, number>>> => ores,
      /** Discard the ore stack the player confirmed; a changed count is rejected by the server. */
      async destroyOre(oreId: OreId, expectedCount: number): Promise<RefineTryResult> {
        const current = target;
        if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
        try {
          await withRequestDeadline(current.connection.reducers.destroyOre({ oreId, expectedCount }));
          return { ok: true };
        } catch (error) {
          return { ok: false, error: reducerErrorMessage(error) };
        }
      },
      /** Fails in a row on one copy at `level`, which raise its next try's chance. */
      refineFails: (itemId: string, copyId: bigint, level: number) => {
        const row = pity.get(copyKey(itemId, copyId));
        return row && row.level === level ? row.fails : 0;
      },
      lastRefineResult: (): RefineResult | null => result,
      /** Called with each new try's result, once the window has asked for it (not for the standing row on connect). */
      setOnRefineResult(callback: ((result: RefineResult) => void) | null) { resultListener = callback; },
      /** One try. `expectedLevel` is the level the player saw, so a double tap cannot spend a second ore. */
      async refineItem(itemId: string, copyId: bigint, expectedLevel: number): Promise<RefineTryResult> {
        const current = target;
        if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
        try {
          // A try cut off by a dropped connection never settles; the deadline frees the window (expectedLevel guards a retry).
          await withRequestDeadline(current.connection.reducers.refineItem({ itemId, copyId, expectedLevel }));
          return { ok: true };
        } catch (error) {
          return { ok: false, error: reducerErrorMessage(error) };
        }
      },
    },
  };
}
