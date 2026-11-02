import { tables, type DbConnection } from "../../module_bindings";
import { serverBoostCooldownMs, serverBoostGatherMultiplier, serverBoostMultiplier, serverBoostRemainingMs, type ServerBoostState } from "../../../shared/server-boost";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { watchTables } from "./table-watch";

type Target = { connection: DbConnection; isCurrent: () => boolean };

/**
 * The Server Boost row everyone shares, this account's last start (for the
 * cooldown), and the start_server_boost reducer. `nowMs` is the server clock.
 */
export function createServerBoostRows(notify: () => void, nowMs: () => number) {
  let target: Target | null = null;
  let boost: ServerBoostState | null = null;
  let lastTriggeredAtMs: number | undefined;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    boost = null; lastTriggeredAtMs = undefined;
    const read = () => {
      const [row] = [...connection.db.serverBoost.iter()];
      boost = row ? { endsAtMs: row.endsAtMs, startedAtMs: row.startedAtMs, supporterName: row.supporterName } : null;
      lastTriggeredAtMs = [...connection.db.myServerBoostTrigger.iter()][0]?.lastTriggeredAtMs;
      notify();
    };
    watchTables(connection, {
      what: "server boost", isCurrent, listen: [connection.db.serverBoost, connection.db.myServerBoostTrigger],
      queries: [tables.serverBoost, tables.myServerBoostTrigger], read,
    });
  }

  async function triggerServerBoost(): Promise<{ ok: boolean; error?: string }> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "Not connected." };
    try {
      // A connection that stalls without closing never answers: time out so the Shop says so instead of waiting forever.
      await withRequestDeadline(current.connection.reducers.startServerBoost({}));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    /** What a rock or tree broken at this server time gives times, as the server judges it. */
    gatherMultiplierAt: (atMs: number) => serverBoostGatherMultiplier(boost, atMs),
    api: {
      /** Time the boost has left (0 when none runs), who started it, and this account's wait for its next one. */
      serverBoost: () => {
        const now = nowMs(), remainingMs = boost ? serverBoostRemainingMs(boost.endsAtMs, now) : 0;
        return { remainingMs, supporterName: remainingMs > 0 ? boost!.supporterName : "", cooldownMs: serverBoostCooldownMs(lastTriggeredAtMs, now) };
      },
      /** What kill stat rewards are multiplied by now, as the server pays them. */
      serverBoostMultiplier: () => serverBoostMultiplier(boost?.endsAtMs, nowMs()),
      triggerServerBoost,
    },
  };
}
