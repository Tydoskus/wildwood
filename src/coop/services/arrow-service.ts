import { tables, type DbConnection } from "../../module_bindings";
import { arrowsSpent, isArrowId, type ArrowId } from "../../../shared/arrows";
import type { OreId } from "../../../shared/refine";

type Ores = Readonly<Partial<Record<OreId, number>>>;
/** Spent arrows go to the server this often, and when the page hides or before a call that reads the bag. */
const FLUSH_MS = 15_000;
/** The bag's arrow count redraws at most this often while the bow fires. */
const NOTIFY_MS = 500;

/**
 * The nocked arrow (my_nocked_arrow) and the arrows the bow has fired that the server has not taken yet. Shots are
 * counted here, a fraction at a time with any chance to keep one, and the stack shown is the server's less them.
 */
export function createArrowRows(connection: () => DbConnection | null, notify: () => void, ores: () => Ores) {
  let nocked: ArrowId | null = null;
  /** Arrows fired and not yet sent, by kind; whole ones go out, the remainder stays. */
  const spent = new Map<ArrowId, number>();
  let pending: Partial<Record<OreId, number>> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let countTimer: ReturnType<typeof setTimeout> | null = null;
  let countShownAt = Number.NEGATIVE_INFINITY;

  function showCount() {
    countShownAt = Date.now();
    countTimer = null;
    notify();
  }
  function countChanged() {
    if (countTimer) return;
    const wait = countShownAt + NOTIFY_MS - Date.now();
    if (wait <= 0) showCount();
    else countTimer = setTimeout(showCount, wait);
  }

  function rebuildPending() {
    pending = {};
    for (const [arrowId, count] of spent) if (count >= 1) pending[arrowId] = -Math.floor(count);
  }
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    const current = connection();
    if (!current?.isActive) return;
    for (const [arrowId, count] of spent) {
      const whole = Math.floor(count);
      if (whole < 1) continue;
      spent.set(arrowId, count - whole);
      void Promise.resolve(current.reducers.spendArrows({ arrowId, count: whole })).catch(() => {});
    }
    rebuildPending();
  }
  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

  function watch(current: DbConnection, isCurrent: () => boolean) {
    nocked = null;
    const read = () => {
      if (!isCurrent()) return;
      const arrowId = [...current.db.myNockedArrow.iter()][0]?.arrowId;
      nocked = isArrowId(arrowId) ? arrowId : null;
      notify();
    };
    current.db.myNockedArrow.onInsert(read);
    current.db.myNockedArrow.onUpdate(read);
    current.db.myNockedArrow.onDelete(read);
    current.subscriptionBuilder().onApplied(read).subscribe([tables.myNockedArrow]);
  }

  /** How many of a kind the bag shows: the server's stack less the arrows fired since. */
  const held = (arrowId: ArrowId) => Math.max(0, (ores()[arrowId] ?? 0) + (pending[arrowId] ?? 0));

  return {
    watch,
    flush,
    /** Fired arrows not yet taken, as negative counts, for the bag's stacks. */
    pendingOres: (): Ores => pending,
    api: {
      nockedArrow: () => nocked,
      /** The arrow the bow shoots now: nocked and still held, else plain arrows. */
      arrowInPlay: (): ArrowId | null => nocked && held(nocked) > 0 ? nocked : null,
      /** One arrow fired: spent, less the chance to keep it. */
      recordArrowShot(arrowId: ArrowId, saveChance = 0) {
        spent.set(arrowId, (spent.get(arrowId) ?? 0) + arrowsSpent(1, saveChance));
        const before = pending[arrowId] ?? 0;
        rebuildPending();
        if ((pending[arrowId] ?? 0) !== before) countChanged();
        timer ??= setTimeout(flush, FLUSH_MS);
      },
      async nockArrow(arrowId: ArrowId | null) {
        const current = connection();
        if (!current?.isActive) return { ok: false, error: "NOT CONNECTED" };
        const previous = nocked;
        nocked = arrowId;
        notify();
        try { await current.reducers.nockArrow({ arrowId: arrowId ?? "" }); return { ok: true }; }
        catch (error) { nocked = previous; notify(); return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
      },
      async craftArrows(arrowId: ArrowId, crafts = 1) {
        const current = connection();
        if (!current?.isActive) return { ok: false, error: "NOT CONNECTED" };
        flush();
        try { await current.reducers.craftArrows({ arrowId, crafts }); return { ok: true }; }
        catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
      },
    },
  };
}
