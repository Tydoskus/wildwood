import { tables, type DbConnection } from "../../module_bindings";
import type { AdGemRewardRecord } from "../../../shared/ad-gem-reward";
import { reducerErrorMessage } from "./reducer-errors";
import { watchTables } from "./table-watch";

export type AdGemClaimResult = { ok: boolean; error?: string };

type Target = { connection: DbConnection; isCurrent: () => boolean };

const millis = (timestamp: { microsSinceUnixEpoch: bigint }) => Number(timestamp.microsSinceUnixEpoch / 1000n);

/**
 * This account's rewarded-ad Gem claims, from the caller-scoped
 * my_ad_gem_reward view, and the claim_ad_gems reducer. The server decides
 * whether a claim is paid; the client only reads the last claim and today's
 * count to show when the next ad is ready.
 */
export function createAdGemReward(notify: () => void) {
  let target: Target | null = null;
  let record: AdGemRewardRecord | null = null;

  /** Follows the view's row on a new connection, from its own small subscription. */
  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    record = null;
    const read = () => {
      const [row] = [...connection.db.myAdGemReward.iter()];
      record = row ? { lastClaimAtMs: millis(row.lastClaimAt), dayKey: row.dayKey, claimsToday: row.claimsToday } : null;
      notify();
    };
    watchTables(connection, { what: "ad gem reward", isCurrent, listen: [connection.db.myAdGemReward], queries: [tables.myAdGemReward], read });
  }

  async function claimAdGems(): Promise<AdGemClaimResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await current.connection.reducers.claimAdGems({});
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  /** Tells the server an ad is starting; the claim after it pays only once it has run. */
  async function startAdGems(): Promise<AdGemClaimResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await current.connection.reducers.startAdGems({});
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    api: {
      /** The last claim and today's count as the server has them, or null before the first. */
      adGemReward: (): AdGemRewardRecord | null => record,
      claimAdGems,
      startAdGems,
    },
  };
}
