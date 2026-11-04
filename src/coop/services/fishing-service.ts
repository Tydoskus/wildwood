import { tables, type DbConnection } from "../../module_bindings";
import { fishById, normalizeFishingExperience, type Fish } from "../../../shared/fishing";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { onTableChange, subscribeTables } from "./table-watch";

export type FishingResult = { ok: boolean; error?: string };
type Target = { connection: DbConnection; isCurrent: () => boolean };

/**
 * This account's fishing, from the caller-scoped my_fishing view: its Fishing experience and the last catch. Each catch
 * is its own call (catch_fish) and the server rolls the fish; the row's count going up says what bit.
 */
export function createFishingRows(notify: () => void) {
  let target: Target | null = null;
  let experience = 0;
  /** The catch count last read; null until the first read, so the row found on connect is not a new catch. */
  let seen: number | null = null;
  let caughtListener: ((fish: Fish) => void) | null = null;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    experience = 0; seen = null;
    const read = () => {
      const [row] = [...connection.db.myFishing.iter()];
      experience = normalizeFishingExperience(row?.experience);
      const count = row?.fishCaught ?? 0, fish = fishById(row?.lastFish);
      if (seen !== null && count !== seen && fish) caughtListener?.(fish);
      seen = count;
      notify();
    };
    onTableChange([connection.db.myFishing], isCurrent, read);
    subscribeTables(connection, "fishing", isCurrent, [tables.myFishing], read);
  }

  async function catchFish(spot: number, site: number): Promise<FishingResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await withRequestDeadline(current.connection.reducers.catchFish({ spot, site }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    api: {
      /** Fishing experience (shared/fishing.ts fishingLevel): 0 before the first catch. */
      fishingExperience: () => experience,
      /** One catch at a spot's site, judged and rolled by the server. */
      catchFish,
      /** Told what bit, as each catch's row arrives. */
      setOnFishCaught(callback: ((fish: Fish) => void) | null) { caughtListener = callback; },
    },
  };
}
