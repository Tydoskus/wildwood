import { tables, type DbConnection } from "../../module_bindings";
import { BUILD_SLOTS, cleanBuildName, parseBuildCards, parseBuildGear, type SavedBuild } from "../../../shared/builds";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { watchTables } from "./table-watch";

type Result = { ok: boolean; error?: string };
type Target = { connection: DbConnection; isCurrent: () => boolean };

/** This account's saved Builds and their names (my_builds, my_build_names), and the save, apply and rename calls. */
export function createBuildRows(notify: () => void) {
  let target: Target | null = null;
  let builds: (SavedBuild | null)[] = Array.from({ length: BUILD_SLOTS }, () => null);
  let names: string[] = Array.from({ length: BUILD_SLOTS }, () => "");

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    builds = Array.from({ length: BUILD_SLOTS }, () => null);
    names = Array.from({ length: BUILD_SLOTS }, () => "");
    const readNames = () => {
      const next = Array.from({ length: BUILD_SLOTS }, () => "");
      for (const row of connection.db.myBuildNames.iter()) if (row.slot < BUILD_SLOTS) next[row.slot] = row.name;
      names = next;
      notify();
    };
    const read = () => {
      const next: (SavedBuild | null)[] = Array.from({ length: BUILD_SLOTS }, () => null);
      for (const row of connection.db.myBuilds.iter()) {
        if (row.slot < BUILD_SLOTS) next[row.slot] = { slot: row.slot, gear: parseBuildGear(row.gearJson), cards: parseBuildCards(row.cardsJson) };
      }
      builds = next;
      notify();
    };
    watchTables(connection, { what: "builds", isCurrent, listen: [connection.db.myBuilds], queries: [tables.myBuilds], read });
    watchTables(connection, { what: "build names", isCurrent, listen: [connection.db.myBuildNames], queries: [tables.myBuildNames], read: readNames });
  }

  async function call(send: (connection: DbConnection) => Promise<unknown>): Promise<Result> {
    const current = target;
    if (!current?.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await withRequestDeadline(send(current.connection));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    api: {
      builds: (): readonly (SavedBuild | null)[] => builds,
      saveBuild: (slot: number) => call(connection => connection.reducers.saveBuild({ slot })),
      applyBuildCards: (slot: number) => call(connection => connection.reducers.applyBuildCards({ slot })),
      buildNames: (): readonly string[] => names,
      renameBuild: (slot: number, name: string) => call(connection => connection.reducers.renameBuild({ slot, name: cleanBuildName(name) })),
    },
  };
}
