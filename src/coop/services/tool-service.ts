import { tables, type DbConnection } from "../../module_bindings";
import { TOOL_IDS, isToolId, normalizeToolLevel, type ToolId } from "../../../shared/tools";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { watchTables } from "./table-watch";

export type ToolResult = { ok: boolean; error?: string };
type Target = { connection: DbConnection; isCurrent: () => boolean };

const worn = (): Record<ToolId, number> => Object.fromEntries(TOOL_IDS.map(tool => [tool, 0])) as Record<ToolId, number>;

/** This account's tool levels (my_tools), and upgrades through upgrade_tool; the server judges each. */
export function createToolRows(notify: () => void) {
  let target: Target | null = null;
  let levels = worn();

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    levels = worn();
    const read = () => {
      const next = worn();
      for (const row of connection.db.myTools.iter()) if (isToolId(row.tool)) next[row.tool] = normalizeToolLevel(row.level);
      levels = next;
      notify();
    };
    watchTables(connection, { what: "tools", isCurrent, listen: [connection.db.myTools], queries: [tables.myTools], read });
  }

  async function upgradeTool(tool: ToolId, expectedLevel: number): Promise<ToolResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      // The level this client shows goes with the upgrade, so a changed one is refused rather than charged.
      await withRequestDeadline(current.connection.reducers.upgradeTool({ tool, expectedLevel }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    api: {
      /** Each tool's level, 0 (Worn) for one never upgraded. */
      toolLevels: (): Readonly<Record<ToolId, number>> => levels,
      toolLevel: (tool: ToolId): number => levels[tool] ?? 0,
      upgradeTool,
    },
  };
}
